/**
 * Visual Bridge - SillyTavern Extension
 * 作者: kencuo
 * 版本: 1.0.0
 * 功能: 智能视觉文件桥接器，提供高效的图像处理和存储解决方案
 * GitHub: https://github.com/kencuo/chajian
 * 
 * 特色功能：
 * - 自适应图像优化
 * - 智能存储管理
 * - 多格式支持
 * - 性能监控
 */

// 导入SillyTavern核心模块
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';
import { getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

// 插件元数据
const PLUGIN_ID = 'visual-bridge-kencuo';
const PLUGIN_VERSION = '1.2.0';
const PLUGIN_AUTHOR = 'kencuo';

// 配置常量
const CONFIG_DEFAULTS = {
  active: true,
  optimizationMode: 'smart', // 'smart', 'quality', 'speed'
  qualityLevel: 85, // 0-100
  maxDimension: 2048,
  fileLimit: 20, // MB
  formatSupport: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  organizationMode: 'hybrid', // 'hybrid', 'chronological', 'character'
  enableMetrics: true,
};

// 全局配置管理
window.extension_settings = window.extension_settings || {};
window.extension_settings[PLUGIN_ID] = window.extension_settings[PLUGIN_ID] || {};
const pluginConfig = window.extension_settings[PLUGIN_ID];

// 初始化默认配置
for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
  if (pluginConfig[key] === undefined) {
    pluginConfig[key] = value;
  }
}

/**
 * 图像优化引擎
 */
class ImageOptimizer {
  constructor() {
    this.canvas = null;
    this.context = null;
    this.metrics = {
      processed: 0,
      totalSaved: 0,
      avgCompressionRatio: 0
    };
  }

  /**
   * 初始化画布
   */
  initCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d');
    }
  }

  /**
   * 智能图像处理
   */
  async optimizeImage(file, options = {}) {
    this.initCanvas();
    
    const mode = options.mode || pluginConfig.optimizationMode;
    const quality = (options.quality || pluginConfig.qualityLevel) / 100;
    const maxSize = options.maxSize || pluginConfig.maxDimension;

    return new Promise((resolve, reject) => {
      const image = new Image();
      
      image.onload = () => {
        try {
          const dimensions = this.calculateOptimalSize(image.width, image.height, maxSize, mode);
          
          this.canvas.width = dimensions.width;
          this.canvas.height = dimensions.height;
          
          // 应用优化算法
          this.applyOptimization(image, dimensions, mode);
          
          // 生成优化后的数据
          const optimizedData = this.canvas.toDataURL(file.type, quality);
          
          // 更新性能指标
          this.updateMetrics(file.size, optimizedData.length);
          
          resolve(optimizedData);
        } catch (error) {
          reject(error);
        }
      };
      
      image.onerror = () => reject(new Error('图像加载失败'));
      image.src = URL.createObjectURL(file);
    });
  }

  /**
   * 计算最优尺寸
   */
  calculateOptimalSize(width, height, maxSize, mode) {
    let newWidth = width;
    let newHeight = height;

    if (mode === 'speed' && (width > maxSize || height > maxSize)) {
      // 快速模式：简单等比缩放
      const ratio = Math.min(maxSize / width, maxSize / height);
      newWidth = Math.floor(width * ratio);
      newHeight = Math.floor(height * ratio);
    } else if (mode === 'quality') {
      // 质量模式：保持更高分辨率
      const ratio = Math.min((maxSize * 1.2) / width, (maxSize * 1.2) / height);
      if (ratio < 1) {
        newWidth = Math.floor(width * ratio);
        newHeight = Math.floor(height * ratio);
      }
    } else {
      // 智能模式：根据图像特征自适应
      const aspectRatio = width / height;
      if (aspectRatio > 2 || aspectRatio < 0.5) {
        // 极端宽高比，使用保守压缩
        const ratio = Math.min(maxSize / width, maxSize / height);
        if (ratio < 1) {
          newWidth = Math.floor(width * ratio);
          newHeight = Math.floor(height * ratio);
        }
      } else {
        // 标准宽高比，可以更激进压缩
        const ratio = Math.min(maxSize / width, maxSize / height);
        newWidth = Math.floor(width * ratio);
        newHeight = Math.floor(height * ratio);
      }
    }

    return { width: newWidth, height: newHeight };
  }

  /**
   * 应用优化算法
   */
  applyOptimization(image, dimensions, mode) {
    if (mode === 'quality') {
      // 质量模式：使用双线性插值
      this.context.imageSmoothingEnabled = true;
      this.context.imageSmoothingQuality = 'high';
    } else if (mode === 'speed') {
      // 速度模式：关闭平滑
      this.context.imageSmoothingEnabled = false;
    } else {
      // 智能模式：自适应平滑
      this.context.imageSmoothingEnabled = true;
      this.context.imageSmoothingQuality = 'medium';
    }

    this.context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  }

  /**
   * 更新性能指标
   */
  updateMetrics(originalSize, optimizedSize) {
    if (!pluginConfig.enableMetrics) return;

    this.metrics.processed++;
    const saved = originalSize - optimizedSize;
    this.metrics.totalSaved += saved;
    
    const compressionRatio = (saved / originalSize) * 100;
    this.metrics.avgCompressionRatio = 
      (this.metrics.avgCompressionRatio * (this.metrics.processed - 1) + compressionRatio) / this.metrics.processed;
  }

  /**
   * 获取性能报告
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * 文件验证器
 */
class FileValidator {
  static validate(file) {
    if (!file || typeof file !== 'object') {
      throw new Error('无效的文件对象');
    }

    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('仅支持图像文件');
    }

    if (!pluginConfig.formatSupport.includes(file.type)) {
      throw new Error(`不支持的格式: ${file.type}`);
    }

    const maxBytes = pluginConfig.fileLimit * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`文件过大，限制: ${pluginConfig.fileLimit}MB`);
    }

    return true;
  }

  static generateUniqueId(filename) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const hash = this.simpleHash(filename);
    return `vb_${timestamp}_${hash}_${random}`;
  }

  static simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }
}

/**
 * 存储路径管理器
 */
class StorageManager {
  static generatePath(characterName, mode = pluginConfig.organizationMode) {
    const now = new Date();
    
    switch (mode) {
      case 'chronological':
        return `visual-assets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      case 'character':
        return `characters/${characterName || 'unknown'}/visuals`;
      
      case 'hybrid':
      default:
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `visual-bridge/${characterName || 'default'}/${now.getFullYear()}-${month}`;
    }
  }
}

/**
 * 上下文获取器
 */
class ContextProvider {
  static async getCurrentContext() {
    try {
      const ctx = getContext();
      const character = ctx.characters[ctx.characterId];
      
      return {
        characterId: ctx.characterId || 'default',
        characterName: character?.name || 'unknown',
        sessionId: ctx.chatId || 'session',
      };
    } catch (error) {
      console.warn('[Visual Bridge] 上下文获取失败:', error);
      return {
        characterId: 'default',
        characterName: 'unknown',
        sessionId: 'fallback',
      };
    }
  }
}

/**
 * 主处理器
 */
class VisualBridge {
  constructor() {
    this.optimizer = new ImageOptimizer();
    this.isReady = false;
  }

  async initialize() {
    this.isReady = true;
    console.log(`[Visual Bridge] v${PLUGIN_VERSION} 初始化完成`);
  }

  async processVisualFile(file, options = {}) {
    if (!this.isReady) {
      throw new Error('Visual Bridge 未初始化');
    }

    if (!pluginConfig.active) {
      throw new Error('Visual Bridge 已禁用');
    }

    // 验证文件
    FileValidator.validate(file);

    // 获取上下文
    const context = await ContextProvider.getCurrentContext();

    // 处理图像
    let imageData;
    if (options.skipOptimization) {
      imageData = await getBase64Async(file);
    } else {
      imageData = await this.optimizer.optimizeImage(file, options);
    }

    // 准备存储
    const base64Content = imageData.split(',')[1];
    const fileExtension = file.type.split('/')[1] || 'png';
    const uniqueId = FileValidator.generateUniqueId(file.name);
    const storagePath = StorageManager.generatePath(context.characterName);

    // 保存文件
    const savedUrl = await saveBase64AsFile(base64Content, storagePath, uniqueId, fileExtension);

    return {
      success: true,
      url: savedUrl,
      metadata: {
        originalName: file.name,
        processedName: `${uniqueId}.${fileExtension}`,
        originalSize: file.size,
        processedSize: imageData.length,
        format: file.type,
        character: context.characterName,
        optimized: !options.skipOptimization,
        timestamp: new Date().toISOString(),
        processingMode: pluginConfig.optimizationMode,
      },
    };
  }
}

// 创建全局实例
const visualBridge = new VisualBridge();

/**
 * 外部接口 - 图像处理入口
 */
window.__uploadImageByPlugin = async function (imageFile, processingOptions = {}) {
  try {
    if (!imageFile) {
      throw new Error('请提供图像文件');
    }

    const result = await visualBridge.processVisualFile(imageFile, processingOptions);

    console.log('[Visual Bridge] 处理完成:', {
      文件: imageFile.name,
      大小变化: `${imageFile.size} → ${result.metadata.processedSize}`,
      存储位置: result.url,
      优化模式: result.metadata.processingMode,
    });

    return {
      url: result.url,
      info: result.metadata,
    };

  } catch (error) {
    console.error('[Visual Bridge] 处理失败:', error.message);
    throw new Error(`图像处理失败: ${error.message}`);
  }
};

/**
 * 配置管理器
 */
class ConfigManager {
  static async loadConfig() {
    try {
      if (Object.keys(pluginConfig).length === 0) {
        Object.assign(pluginConfig, CONFIG_DEFAULTS);
      }
      
      this.updateInterface();
      console.log('[Visual Bridge] 配置加载完成');
    } catch (error) {
      console.error('[Visual Bridge] 配置加载失败:', error);
    }
  }

  static updateInterface() {
    $('#vb-enabled')?.prop('checked', pluginConfig.active);
    $('#vb-optimization-mode')?.val(pluginConfig.optimizationMode);
    $('#vb-quality')?.val(pluginConfig.qualityLevel);
  }

  static saveConfig() {
    saveSettingsDebounced();
    console.log('[Visual Bridge] 配置已保存');
  }
}

/**
 * 事件处理
 */
const EventManager = {
  onToggleActive(event) {
    pluginConfig.active = Boolean($(event.target).prop('checked'));
    ConfigManager.saveConfig();
    
    const status = pluginConfig.active ? '已启用' : '已禁用';
    toastr.info(`Visual Bridge ${status}`, 'kencuo插件');
  },

  onModeChange(event) {
    pluginConfig.optimizationMode = $(event.target).val();
    ConfigManager.saveConfig();
  },

  onQualityChange(event) {
    pluginConfig.qualityLevel = parseInt($(event.target).val());
    ConfigManager.saveConfig();
  },
};

/**
 * 插件启动
 */
jQuery(async () => {
  try {
    console.log(`[Visual Bridge] 启动中... v${PLUGIN_VERSION} by ${PLUGIN_AUTHOR}`);

    // 绑定事件
    $('#vb-enabled').on('change', EventManager.onToggleActive);
    $('#vb-optimization-mode').on('change', EventManager.onModeChange);
    $('#vb-quality').on('input', EventManager.onQualityChange);

    // 初始化
    await ConfigManager.loadConfig();
    await visualBridge.initialize();

    console.log('[Visual Bridge] 启动完成!');
    console.log('[Visual Bridge] GitHub: https://github.com/kencuo/chajian');

  } catch (error) {
    console.error('[Visual Bridge] 启动失败:', error);
  }
});
