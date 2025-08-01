/**
 * FileSync Bridge - 文件同步桥接器
 * 作者: kencuo
 */

// 动态模块加载器
class ModuleLoader {
    static async loadTavernModules() {
        try {
            const utils = await import('../../../utils.js');
            const extensions = await import('../../../extensions.js');
            const script = await import('../../../../script.js');
            return { utils, extensions, script };
        } catch (error) {
            console.error('[FileSync] 模块加载失败:', error);
            return null;
        }
    }
}

// 事件驱动的文件处理器
class FileProcessor {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.handlers = new Map();
        this.metrics = { processed: 0, errors: 0, totalSize: 0 };
    }

    // 注册处理器
    register(type, handler) {
        this.handlers.set(type, handler);
    }

    // 添加文件到处理队列
    async enqueue(file, options = {}) {
        return new Promise((resolve, reject) => {
            const task = {
                id: Date.now() + Math.random(),
                file,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            };
            
            this.queue.push(task);
            this.process();
        });
    }

    // 处理队列
    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                const result = await this.handleTask(task);
                task.resolve(result);
                this.metrics.processed++;
                this.metrics.totalSize += task.file.size;
            } catch (error) {
                task.reject(error);
                this.metrics.errors++;
            }
        }
        
        this.processing = false;
    }

    // 处理单个任务
    async handleTask(task) {
        const fileType = task.file.type.split('/')[0];
        const handler = this.handlers.get(fileType) || this.handlers.get('default');
        
        if (!handler) {
            throw new Error(`不支持的文件类型: ${fileType}`);
        }
        
        return await handler(task.file, task.options);
    }
}

// 存储策略管理器
class StorageStrategy {
    constructor(modules) {
        this.modules = modules;
        this.strategies = new Map();
        this.initStrategies();
    }

    initStrategies() {
        // 按角色存储策略
        this.strategies.set('character', async (file, context) => {
            const char = context.characters[context.characterId];
            const charName = char?.name || 'unknown';
            return this.saveWithPath(file, charName);
        });

        // 按日期存储策略
        this.strategies.set('date', async (file, context) => {
            const date = new Date().toISOString().split('T')[0];
            return this.saveWithPath(file, `uploads/${date}`);
        });

        // 按类型存储策略
        this.strategies.set('type', async (file, context) => {
            const type = file.type.split('/')[0];
            return this.saveWithPath(file, `media/${type}`);
        });
    }

    async saveWithPath(file, folder) {
        const base64 = await this.modules.utils.getBase64Async(file);
        const hash = this.modules.utils.getStringHash(file.name + Date.now());
        const ext = file.name.split('.').pop() || 'bin';
        
        return await this.modules.utils.saveBase64AsFile(
            base64.split(',')[1],
            folder,
            hash,
            ext
        );
    }

    async execute(strategy, file, context) {
        const handler = this.strategies.get(strategy);
        if (!handler) throw new Error(`未知存储策略: ${strategy}`);
        return await handler(file, context);
    }
}

// 主桥接器类
class FileSyncBridge {
    constructor() {
        this.modules = null;
        this.processor = new FileProcessor();
        this.storage = null;
        this.config = {
            strategy: 'character',
            maxSize: 10 * 1024 * 1024,
            allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            compression: { enabled: true, quality: 0.8 }
        };
    }

    async initialize() {
        this.modules = await ModuleLoader.loadTavernModules();
        if (!this.modules) throw new Error('无法加载必要模块');
        
        this.storage = new StorageStrategy(this.modules);
        this.setupProcessors();
        this.exposeAPI();
        
        console.log('[FileSync] 桥接器初始化完成');
    }

    setupProcessors() {
        // 图片处理器
        this.processor.register('image', async (file, options) => {
            this.validateFile(file);
            
            let processedFile = file;
            if (this.config.compression.enabled) {
                processedFile = await this.compressImage(file);
            }
            
            const context = this.modules.extensions.getContext();
            const url = await this.storage.execute(this.config.strategy, processedFile, context);
            
            return {
                success: true,
                url,
                originalSize: file.size,
                processedSize: processedFile.size,
                strategy: this.config.strategy,
                timestamp: Date.now()
            };
        });

        // 默认处理器
        this.processor.register('default', async (file, options) => {
            throw new Error(`不支持的文件类型: ${file.type}`);
        });
    }

    validateFile(file) {
        if (file.size > this.config.maxSize) {
            throw new Error(`文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
        }
        
        if (!this.config.allowedTypes.includes(file.type)) {
            throw new Error(`不支持的文件类型: ${file.type}`);
        }
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const maxDim = 1920;
                let { width, height } = img;
                
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(resolve, file.type, this.config.compression.quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    exposeAPI() {
        // 主要API - 使用不同的命名避免冲突
        window.FileSyncUpload = async (file, options = {}) => {
            try {
                return await this.processor.enqueue(file, options);
            } catch (error) {
                console.error('[FileSync] 上传失败:', error);
                throw error;
            }
        };

        // 配置API
        window.FileSyncConfig = (key, value) => {
            if (value === undefined) return this.config[key];
            this.config[key] = value;
        };

        // 状态API
        window.FileSyncStatus = () => ({
            initialized: !!this.modules,
            queue: this.processor.queue.length,
            metrics: { ...this.processor.metrics }
        });
    }
}

// 插件初始化
const bridge = new FileSyncBridge();

jQuery(async () => {
    try {
        await bridge.initialize();
        toastr.success('FileSync Bridge 已就绪', '文件同步');
    } catch (error) {
        console.error('[FileSync] 初始化失败:', error);
        toastr.error('FileSync Bridge 初始化失败', '文件同步');
    }
});
