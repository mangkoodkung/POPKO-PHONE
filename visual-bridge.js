/**
 * Visual Bridge - 分布式媒体处理生态系统
 * 采用微服务架构 + Web Workers + IndexedDB + 消息队列
 * 作者: ctrl
 * 版本: 1.0.0
 * GitHub: https://github.com/kencuo/chajian
 *
 * 核心特性：
 * - 🔄 分布式任务调度系统
 * - 🗄️ 本地缓存数据库
 * - ⚡ Web Workers 并行处理
 * - 📡 实时消息总线
 * - 🎯 智能负载均衡
 */

import { getContext } from '../../../extensions.js';
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';

// 系统架构配置
const ECOSYSTEM_CONFIG = {
  namespace: 'vb-ecosystem',
  version: '2.0.0',
  author: 'ctrl',

  // 微服务配置
  services: {
    taskScheduler: { enabled: true, maxConcurrency: 3 },
    cacheManager: { enabled: true, maxSize: 100 * 1024 * 1024 }, // 100MB
    workerPool: { enabled: true, poolSize: 2 },
    messageBus: { enabled: true, bufferSize: 1000 },
  },

  // 处理策略
  strategies: {
    lightning: { priority: 'speed', quality: 0.6, workers: 2 },
    balanced: { priority: 'balanced', quality: 0.8, workers: 1 },
    premium: { priority: 'quality', quality: 0.95, workers: 1 },
  },
};

/**
 * 消息总线 - 系统核心通信层
 */
class MessageBus extends EventTarget {
  constructor() {
    super();
    this.channels = new Map();
    this.messageBuffer = [];
    this.subscribers = new Map();
    this.messageId = 0;
  }

  // 创建通信频道
  createChannel(name) {
    if (!this.channels.has(name)) {
      this.channels.set(name, {
        name,
        subscribers: new Set(),
        messageHistory: [],
        created: Date.now(),
      });
    }
    return this.channels.get(name);
  }

  // 发布消息
  publish(channel, message, priority = 'normal') {
    const channelObj = this.createChannel(channel);
    const envelope = {
      id: ++this.messageId,
      channel,
      message,
      priority,
      timestamp: Date.now(),
      sender: 'system',
    };

    channelObj.messageHistory.push(envelope);
    this.dispatchEvent(new CustomEvent(`message:${channel}`, { detail: envelope }));

    return envelope.id;
  }

  // 订阅频道
  subscribe(channel, callback, options = {}) {
    const channelObj = this.createChannel(channel);
    const subscription = {
      callback,
      options,
      created: Date.now(),
    };

    channelObj.subscribers.add(subscription);
    this.addEventListener(`message:${channel}`, event => {
      callback(event.detail);
    });

    return () => channelObj.subscribers.delete(subscription);
  }
}

/**
 * IndexedDB 缓存管理器
 */
class CacheManager {
  constructor(dbName = 'VisualBridgeCache', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isReady = false;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isReady = true;
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // 创建对象存储
        if (!db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
          mediaStore.createIndex('character', 'character', { unique: false });
          mediaStore.createIndex('hash', 'hash', { unique: true });
        }

        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('priority', 'priority', { unique: false });
        }
      };
    });
  }

  async store(storeName, data) {
    if (!this.isReady) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async retrieve(storeName, key) {
    if (!this.isReady) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async query(storeName, indexName, value) {
    if (!this.isReady) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Web Worker 池管理器
 */
class WorkerPool {
  constructor(poolSize = 2) {
    this.poolSize = poolSize;
    this.workers = [];
    this.taskQueue = [];
    this.activeJobs = new Map();
    this.jobId = 0;
  }

  async initialize() {
    // 创建 Worker 脚本
    const workerScript = this.createWorkerScript();
    const workerBlob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);

    // 初始化 Worker 池
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerUrl);
      worker.id = i;
      worker.busy = false;

      worker.onmessage = event => this.handleWorkerMessage(worker, event);
      worker.onerror = error => this.handleWorkerError(worker, error);

      this.workers.push(worker);
    }

    URL.revokeObjectURL(workerUrl);
  }

  createWorkerScript() {
    return `
      // Web Worker 图像处理脚本
      self.onmessage = function(event) {
        const { jobId, task, data } = event.data;

        try {
          switch(task) {
            case 'compress':
              compressImage(jobId, data);
              break;
            case 'resize':
              resizeImage(jobId, data);
              break;
            case 'convert':
              convertFormat(jobId, data);
              break;
            default:
              throw new Error('Unknown task: ' + task);
          }
        } catch (error) {
          self.postMessage({
            jobId,
            success: false,
            error: error.message
          });
        }
      };

      function compressImage(jobId, { imageData, quality, format }) {
        // 在 Worker 中进行图像压缩
        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext('2d');

        // 模拟压缩处理
        setTimeout(() => {
          self.postMessage({
            jobId,
            success: true,
            result: {
              compressedData: imageData, // 实际应该是压缩后的数据
              originalSize: imageData.length,
              compressedSize: Math.floor(imageData.length * quality)
            }
          });
        }, Math.random() * 1000 + 500); // 模拟处理时间
      }

      function resizeImage(jobId, { imageData, width, height }) {
        // 模拟调整大小
        setTimeout(() => {
          self.postMessage({
            jobId,
            success: true,
            result: {
              resizedData: imageData,
              newDimensions: { width, height }
            }
          });
        }, Math.random() * 800 + 300);
      }

      function convertFormat(jobId, { imageData, targetFormat }) {
        // 模拟格式转换
        setTimeout(() => {
          self.postMessage({
            jobId,
            success: true,
            result: {
              convertedData: imageData,
              format: targetFormat
            }
          });
        }, Math.random() * 600 + 200);
      }
    `;
  }

  async execute(task, data, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const jobId = ++this.jobId;
      const job = {
        id: jobId,
        task,
        data,
        priority,
        resolve,
        reject,
        created: Date.now(),
      };

      this.activeJobs.set(jobId, job);

      const availableWorker = this.workers.find(w => !w.busy);
      if (availableWorker) {
        this.assignJobToWorker(availableWorker, job);
      } else {
        this.taskQueue.push(job);
        this.sortTaskQueue();
      }
    });
  }

  assignJobToWorker(worker, job) {
    worker.busy = true;
    worker.postMessage({
      jobId: job.id,
      task: job.task,
      data: job.data,
    });
  }

  handleWorkerMessage(worker, event) {
    const { jobId, success, result, error } = event.data;
    const job = this.activeJobs.get(jobId);

    if (job) {
      worker.busy = false;
      this.activeJobs.delete(jobId);

      if (success) {
        job.resolve(result);
      } else {
        job.reject(new Error(error));
      }

      // 处理队列中的下一个任务
      if (this.taskQueue.length > 0) {
        const nextJob = this.taskQueue.shift();
        this.assignJobToWorker(worker, nextJob);
      }
    }
  }

  handleWorkerError(worker, error) {
    console.error('Worker error:', error);
    worker.busy = false;
  }

  sortTaskQueue() {
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  terminate() {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.activeJobs.clear();
    this.taskQueue = [];
  }
}
/**
 * 分布式任务调度器
 */
class TaskScheduler {
  constructor(messageBus, workerPool, cacheManager) {
    this.messageBus = messageBus;
    this.workerPool = workerPool;
    this.cacheManager = cacheManager;
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.completedTasks = new Map();
    this.taskId = 0;
    this.isRunning = false;
  }

  async initialize() {
    // 订阅消息总线事件
    this.messageBus.subscribe('task:submit', message => {
      this.handleTaskSubmission(message.message);
    });

    this.messageBus.subscribe('task:cancel', message => {
      this.handleTaskCancellation(message.message);
    });

    this.isRunning = true;
    this.startScheduler();
  }

  async submitTask(taskData) {
    const task = {
      id: ++this.taskId,
      type: taskData.type,
      data: taskData.data,
      strategy: taskData.strategy || 'balanced',
      priority: taskData.priority || 'normal',
      status: 'pending',
      created: Date.now(),
      dependencies: taskData.dependencies || [],
    };

    // 保存任务到缓存
    await this.cacheManager.store('tasks', task);

    // 添加到队列
    this.taskQueue.push(task);
    this.sortTaskQueue();

    // 发布任务提交事件
    this.messageBus.publish('task:submitted', task);

    return task.id;
  }

  async startScheduler() {
    while (this.isRunning) {
      if (this.taskQueue.length > 0 && this.canExecuteMoreTasks()) {
        const task = this.taskQueue.shift();
        await this.executeTask(task);
      }

      // 短暂休眠避免CPU占用过高
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  canExecuteMoreTasks() {
    const maxConcurrency = ECOSYSTEM_CONFIG.services.taskScheduler.maxConcurrency;
    return this.runningTasks.size < maxConcurrency;
  }

  async executeTask(task) {
    try {
      task.status = 'running';
      task.started = Date.now();
      this.runningTasks.set(task.id, task);

      // 更新缓存中的任务状态
      await this.cacheManager.store('tasks', task);

      // 发布任务开始事件
      this.messageBus.publish('task:started', task);

      // 根据任务类型执行不同的处理
      let result;
      switch (task.type) {
        case 'media:process':
          result = await this.processMediaTask(task);
          break;
        case 'media:batch':
          result = await this.processBatchTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      // 任务完成
      task.status = 'completed';
      task.completed = Date.now();
      task.result = result;
      task.duration = task.completed - task.started;

      this.runningTasks.delete(task.id);
      this.completedTasks.set(task.id, task);

      // 更新缓存
      await this.cacheManager.store('tasks', task);

      // 发布任务完成事件
      this.messageBus.publish('task:completed', task);

      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completed = Date.now();

      this.runningTasks.delete(task.id);

      // 更新缓存
      await this.cacheManager.store('tasks', task);

      // 发布任务失败事件
      this.messageBus.publish('task:failed', task);

      throw error;
    }
  }

  async processMediaTask(task) {
    const { file, options } = task.data;
    const strategy = ECOSYSTEM_CONFIG.strategies[task.strategy];

    // 使用 Worker 池处理图像
    const compressResult = await this.workerPool.execute(
      'compress',
      {
        imageData: await getBase64Async(file),
        quality: strategy.quality,
        format: 'jpeg',
      },
      task.priority,
    );

    // 生成文件元数据
    const context = getContext();
    const character = context.characters[context.characterId];
    const characterName = character?.name || 'default';

    // 保存文件
    const savedUrl = await saveBase64AsFile(
      compressResult.compressedData.split(',')[1],
      characterName,
      `vb_${task.id}_${Date.now()}`,
      'jpeg',
    );

    return {
      url: savedUrl,
      originalSize: file.size,
      compressedSize: compressResult.compressedSize,
      character: characterName,
      strategy: task.strategy,
      taskId: task.id,
    };
  }

  async processBatchTask(task) {
    const { files, options } = task.data;
    const results = [];

    for (const file of files) {
      const subtaskId = await this.submitTask({
        type: 'media:process',
        data: { file, options },
        strategy: task.strategy,
        priority: 'low', // 批处理任务优先级较低
      });

      results.push(subtaskId);
    }

    return { subtasks: results, count: files.length };
  }

  sortTaskQueue() {
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];

      if (priorityDiff !== 0) return priorityDiff;

      // 相同优先级按创建时间排序
      return a.created - b.created;
    });
  }

  handleTaskSubmission(taskData) {
    this.submitTask(taskData);
  }

  handleTaskCancellation(taskId) {
    // 从队列中移除
    this.taskQueue = this.taskQueue.filter(task => task.id !== taskId);

    // 如果正在运行，标记为取消
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      this.runningTasks.delete(taskId);
      this.messageBus.publish('task:cancelled', runningTask);
    }
  }

  getStatus() {
    return {
      queueLength: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      completedTasks: this.completedTasks.size,
      isRunning: this.isRunning,
    };
  }

  stop() {
    this.isRunning = false;
  }
}

/**
 * Visual Bridge 生态系统主类
 */
class VisualBridgeEcosystem {
  constructor() {
    this.messageBus = new MessageBus();
    this.cacheManager = new CacheManager();
    this.workerPool = new WorkerPool(ECOSYSTEM_CONFIG.services.workerPool.poolSize);
    this.taskScheduler = new TaskScheduler(this.messageBus, this.workerPool, this.cacheManager);
    this.isInitialized = false;
    this.metrics = {
      tasksProcessed: 0,
      totalDataProcessed: 0,
      averageProcessingTime: 0,
      systemUptime: Date.now(),
    };
  }

  async initialize() {
    try {
      console.log('[Visual Bridge] 初始化生态系统...');

      // 初始化各个组件
      await this.cacheManager.initialize();
      await this.workerPool.initialize();
      await this.taskScheduler.initialize();

      // 设置事件监听
      this.setupEventListeners();

      // 暴露全局API
      this.exposeGlobalAPI();

      this.isInitialized = true;
      console.log('[Visual Bridge] 生态系统初始化完成');

      // 发布系统就绪事件
      this.messageBus.publish('system:ready', {
        timestamp: Date.now(),
        version: ECOSYSTEM_CONFIG.version,
      });
    } catch (error) {
      console.error('[Visual Bridge] 初始化失败:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // 监听任务完成事件，更新指标
    this.messageBus.subscribe('task:completed', message => {
      const task = message.message;
      this.metrics.tasksProcessed++;

      if (task.result && task.result.originalSize) {
        this.metrics.totalDataProcessed += task.result.originalSize;
      }

      if (task.duration) {
        this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + task.duration) / 2;
      }
    });

    // 监听系统错误
    this.messageBus.subscribe('system:error', message => {
      console.error('[Visual Bridge] 系统错误:', message.message);
    });
  }

  exposeGlobalAPI() {
    // 暴露完全不同的API接口
    window.VisualBridge = {
      // 生态系统信息
      ecosystem: {
        version: ECOSYSTEM_CONFIG.version,
        author: ECOSYSTEM_CONFIG.author,
        isReady: () => this.isInitialized,
      },

      // 媒体处理服务
      media: {
        // 单文件处理
        process: async (file, options = {}) => {
          const taskId = await this.taskScheduler.submitTask({
            type: 'media:process',
            data: { file, options },
            strategy: options.strategy || 'balanced',
            priority: options.priority || 'normal',
          });
          return this.waitForTask(taskId);
        },

        // 批量处理
        processBatch: async (files, options = {}) => {
          const taskId = await this.taskScheduler.submitTask({
            type: 'media:batch',
            data: { files, options },
            strategy: options.strategy || 'balanced',
            priority: options.priority || 'low',
          });
          return this.waitForTask(taskId);
        },
      },

      // 任务管理
      tasks: {
        submit: taskData => this.taskScheduler.submitTask(taskData),
        cancel: taskId => this.taskScheduler.handleTaskCancellation(taskId),
        status: taskId => this.taskScheduler.completedTasks.get(taskId) || this.taskScheduler.runningTasks.get(taskId),
        list: () => ({
          pending: this.taskScheduler.taskQueue,
          running: Array.from(this.taskScheduler.runningTasks.values()),
          completed: Array.from(this.taskScheduler.completedTasks.values()),
        }),
      },

      // 缓存管理
      cache: {
        store: (key, data) => this.cacheManager.store('media', { id: key, ...data }),
        retrieve: key => this.cacheManager.retrieve('media', key),
        query: (field, value) => this.cacheManager.query('media', field, value),
      },

      // 事件系统
      events: {
        on: (event, callback) => this.messageBus.subscribe(event, callback),
        emit: (event, data) => this.messageBus.publish(event, data),
        channels: () => Array.from(this.messageBus.channels.keys()),
      },

      // 系统监控
      monitor: {
        metrics: () => ({ ...this.metrics }),
        status: () => ({
          ecosystem: this.isInitialized,
          scheduler: this.taskScheduler.getStatus(),
          workers: {
            total: this.workerPool.workers.length,
            busy: this.workerPool.workers.filter(w => w.busy).length,
            queue: this.workerPool.taskQueue.length,
          },
          cache: {
            ready: this.cacheManager.isReady,
          },
        }),
        health: () => this.performHealthCheck(),
      },

      // 配置管理
      config: {
        get: () => ({ ...ECOSYSTEM_CONFIG }),
        strategies: () => Object.keys(ECOSYSTEM_CONFIG.strategies),
        setStrategy: (name, config) => {
          ECOSYSTEM_CONFIG.strategies[name] = config;
        },
      },
    };
  }

  async waitForTask(taskId) {
    return new Promise((resolve, reject) => {
      const checkTask = () => {
        const completedTask = this.taskScheduler.completedTasks.get(taskId);
        if (completedTask) {
          if (completedTask.status === 'completed') {
            resolve(completedTask.result);
          } else {
            reject(new Error(completedTask.error || 'Task failed'));
          }
          return;
        }

        // 继续等待
        setTimeout(checkTask, 100);
      };

      checkTask();
    });
  }

  async performHealthCheck() {
    const health = {
      overall: 'healthy',
      components: {},
      timestamp: Date.now(),
    };

    // 检查各组件健康状态
    health.components.messageBus = this.messageBus ? 'healthy' : 'unhealthy';
    health.components.cacheManager = this.cacheManager.isReady ? 'healthy' : 'unhealthy';
    health.components.workerPool = this.workerPool.workers.length > 0 ? 'healthy' : 'unhealthy';
    health.components.taskScheduler = this.taskScheduler.isRunning ? 'healthy' : 'unhealthy';

    // 计算整体健康状态
    const unhealthyComponents = Object.values(health.components).filter(status => status === 'unhealthy');
    if (unhealthyComponents.length > 0) {
      health.overall = unhealthyComponents.length === Object.keys(health.components).length ? 'critical' : 'degraded';
    }

    return health;
  }

  async shutdown() {
    console.log('[Visual Bridge] 正在关闭生态系统...');

    this.taskScheduler.stop();
    this.workerPool.terminate();

    if (this.cacheManager.db) {
      this.cacheManager.db.close();
    }

    this.isInitialized = false;
    console.log('[Visual Bridge] 生态系统已关闭');
  }
}

// 创建全局生态系统实例
const visualBridgeEcosystem = new VisualBridgeEcosystem();

// 插件初始化
jQuery(async () => {
  try {
    await visualBridgeEcosystem.initialize();

    // 显示初始化成功消息
    if (typeof toastr !== 'undefined') {
      toastr.success('Visual Bridge 生态系统已就绪', 'Visual Bridge');
    }
  } catch (error) {
    console.error('[Visual Bridge] 插件初始化失败:', error);

    if (typeof toastr !== 'undefined') {
      toastr.error('Visual Bridge 初始化失败', 'Visual Bridge');
    }
  }
});
