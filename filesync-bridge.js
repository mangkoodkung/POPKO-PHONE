/**
 * ImageVault - 图片保险库
 * 采用 IndexedDB + WebWorker 架构，完全不同的实现方式
 * 作者: kencuo
 */

// 数据库管理器
class VaultDB {
    constructor() {
        this.dbName = 'ImageVault';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建文件存储表
                if (!db.objectStoreNames.contains('files')) {
                    const store = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('hash', 'hash', { unique: true });
                    store.createIndex('character', 'character', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // 创建配置存储表
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };
        });
    }

    async store(fileData) {
        const transaction = this.db.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        return store.add(fileData);
    }

    async getByHash(hash) {
        const transaction = this.db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const index = store.index('hash');
        return index.get(hash);
    }
}

// 文件处理工作器（模拟WebWorker功能）
class FileWorker {
    constructor() {
        this.tasks = new Map();
        this.processing = false;
    }

    async process(file, options = {}) {
        const taskId = this.generateTaskId();
        
        return new Promise((resolve, reject) => {
            this.tasks.set(taskId, {
                file,
                options,
                resolve,
                reject,
                status: 'pending'
            });
            
            this.processNext();
        });
    }

    async processNext() {
        if (this.processing) return;
        
        const pendingTask = Array.from(this.tasks.values()).find(t => t.status === 'pending');
        if (!pendingTask) return;
        
        this.processing = true;
        pendingTask.status = 'processing';
        
        try {
            const result = await this.handleFile(pendingTask.file, pendingTask.options);
            pendingTask.resolve(result);
        } catch (error) {
            pendingTask.reject(error);
        } finally {
            this.tasks.delete(this.getTaskId(pendingTask));
            this.processing = false;
            this.processNext(); // 处理下一个任务
        }
    }

    async handleFile(file, options) {
        // 生成文件哈希
        const hash = await this.calculateHash(file);
        
        // 检查是否已存在
        const existing = await vault.db.getByHash(hash);
        if (existing) {
            return { url: existing.url, cached: true };
        }
        
        // 处理文件
        const processedData = await this.processFile(file, options);
        
        // 保存到SillyTavern
        const url = await this.saveToTavern(processedData, options);
        
        // 存储到数据库
        await vault.db.store({
            hash,
            url,
            filename: file.name,
            size: file.size,
            type: file.type,
            character: this.getCurrentCharacter(),
            timestamp: Date.now()
        });
        
        return { url, cached: false };
    }

    async calculateHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async processFile(file, options) {
        if (options.compress && file.type.startsWith('image/')) {
            return await this.compressImage(file, options.quality || 0.8);
        }
        return file;
    }

    async compressImage(file, quality) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const maxSize = 1920;
                let { width, height } = img;
                
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(resolve, file.type, quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    async saveToTavern(file, options) {
        // 动态获取SillyTavern工具函数
        const { getBase64Async, getStringHash, saveBase64AsFile } = await this.getTavernUtils();
        
        const base64 = await getBase64Async(file);
        const hash = getStringHash(file.name + Date.now());
        const ext = file.name.split('.').pop() || 'bin';
        
        const character = this.getCurrentCharacter();
        
        return await saveBase64AsFile(
            base64.split(',')[1],
            character,
            hash,
            ext
        );
    }

    async getTavernUtils() {
        // 动态导入，避免硬依赖
        try {
            const utils = await import('../../../utils.js');
            return utils;
        } catch (error) {
            throw new Error('无法访问SillyTavern工具函数');
        }
    }

    getCurrentCharacter() {
        try {
            // 通过全局对象获取当前角色
            const context = window.SillyTavern?.getContext?.();
            const char = context?.characters?.[context?.characterId];
            return char?.name || 'default';
        } catch {
            return 'default';
        }
    }

    generateTaskId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    getTaskId(task) {
        return Array.from(this.tasks.entries()).find(([id, t]) => t === task)?.[0];
    }
}

// 主保险库类
class ImageVault {
    constructor() {
        this.db = new VaultDB();
        this.worker = new FileWorker();
        this.initialized = false;
        this.config = {
            autoCompress: true,
            quality: 0.8,
            maxSize: 10 * 1024 * 1024,
            allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        };
    }

    async init() {
        try {
            await this.db.init();
            this.worker.vault = this; // 循环引用，让worker能访问db
            this.initialized = true;
            this.exposeAPI();
            console.log('[ImageVault] 初始化完成');
        } catch (error) {
            console.error('[ImageVault] 初始化失败:', error);
            throw error;
        }
    }

    async upload(file, options = {}) {
        if (!this.initialized) {
            throw new Error('ImageVault未初始化');
        }

        this.validateFile(file);
        
        const finalOptions = { ...this.config, ...options };
        return await this.worker.process(file, finalOptions);
    }

    validateFile(file) {
        if (!file || !file.type) {
            throw new Error('无效的文件');
        }

        if (file.size > this.config.maxSize) {
            throw new Error(`文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
        }

        if (!this.config.allowedTypes.includes(file.type)) {
            throw new Error(`不支持的文件类型: ${file.type}`);
        }
    }

    exposeAPI() {
        // 主要上传接口
        window.ImageVaultUpload = async (file, options) => {
            try {
                return await this.upload(file, options);
            } catch (error) {
                console.error('[ImageVault] 上传失败:', error);
                throw error;
            }
        };

        // 配置接口
        window.ImageVaultConfig = (key, value) => {
            if (value === undefined) return this.config[key];
            this.config[key] = value;
        };

        // 状态接口
        window.ImageVaultStatus = () => ({
            initialized: this.initialized,
            pendingTasks: this.worker.tasks.size,
            processing: this.worker.processing
        });

        // 清理接口
        window.ImageVaultClear = async () => {
            const transaction = this.db.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            return store.clear();
        };
    }
}

// 全局实例
const vault = new ImageVault();

// 插件初始化
jQuery(async () => {
    try {
        await vault.init();
        toastr.success('ImageVault 已就绪', '图片保险库');
    } catch (error) {
        console.error('[ImageVault] 启动失败:', error);
        toastr.error('ImageVault 启动失败', '图片保险库');
    }
});
