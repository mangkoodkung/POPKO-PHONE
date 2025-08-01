// Core SillyTavern imports
import { saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';

// Extension metadata
const EXT_NAMESPACE = 'mediaflow-processor';
const BUILD_VERSION = '2.1.0';
const DEVELOPER_TAG = 'kencuo';

// Default configuration schema
const DEFAULT_SETTINGS = {
  enabled: true,
  processingStrategy: 'adaptive', // 'adaptive', 'preserve', 'compress'
  compressionRate: 85, // 0-100 scale
  maxResolution: 2048,
  sizeThreshold: 20, // Megabytes
  supportedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  storagePattern: 'smart', // 'smart', 'temporal', 'grouped'
  trackingEnabled: true,
};

// Global settings management
window.extension_settings = window.extension_settings || {};
window.extension_settings[EXT_NAMESPACE] = window.extension_settings[EXT_NAMESPACE] || {};
const extensionConfig = window.extension_settings[EXT_NAMESPACE];

// Initialize configuration with defaults
for (const [setting, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
  if (extensionConfig[setting] === undefined) {
    extensionConfig[setting] = defaultValue;
  }
}

// Advanced image processing engine
class MediaProcessor {
  constructor() {
    this.renderCanvas = null;
    this.renderContext = null;
    this.statistics = {
      filesProcessed: 0,
      bytesReduced: 0,
      averageCompression: 0,
    };
  }

  // Setup rendering environment
  setupCanvas() {
    if (!this.renderCanvas) {
      this.renderCanvas = document.createElement('canvas');
      this.renderContext = this.renderCanvas.getContext('2d');
    }
  }

  // Process image with intelligent algorithms
  async enhanceMedia(sourceFile, processingOptions = {}) {
    this.setupCanvas();

    const strategy = processingOptions.strategy || extensionConfig.processingStrategy;
    const compression = (processingOptions.compression || extensionConfig.compressionRate) / 100;
    const maxDimension = processingOptions.maxDimension || extensionConfig.maxResolution;

    return new Promise((resolve, reject) => {
      const imageElement = new Image();

      imageElement.onload = () => {
        try {
          const targetDimensions = this.calculateTargetSize(
            imageElement.width,
            imageElement.height,
            maxDimension,
            strategy,
          );

          this.renderCanvas.width = targetDimensions.width;
          this.renderCanvas.height = targetDimensions.height;

          // Apply processing algorithms
          this.applyProcessing(imageElement, targetDimensions, strategy);

          // Generate processed data
          const processedData = this.renderCanvas.toDataURL(sourceFile.type, compression);

          // Update performance metrics
          this.recordMetrics(sourceFile.size, processedData.length);

          resolve(processedData);
        } catch (processingError) {
          reject(processingError);
        }
      };

      imageElement.onerror = () => reject(new Error('Media loading failed'));
      imageElement.src = URL.createObjectURL(sourceFile);
    });
  }

  // Calculate optimal dimensions based on strategy
  calculateTargetSize(originalWidth, originalHeight, maxDimension, processingStrategy) {
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (processingStrategy === 'compress' && (originalWidth > maxDimension || originalHeight > maxDimension)) {
      // Compression mode: aggressive scaling
      const scaleFactor = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
      targetWidth = Math.floor(originalWidth * scaleFactor);
      targetHeight = Math.floor(originalHeight * scaleFactor);
    } else if (processingStrategy === 'preserve') {
      // Preserve mode: maintain higher resolution
      const scaleFactor = Math.min((maxDimension * 1.2) / originalWidth, (maxDimension * 1.2) / originalHeight);
      if (scaleFactor < 1) {
        targetWidth = Math.floor(originalWidth * scaleFactor);
        targetHeight = Math.floor(originalHeight * scaleFactor);
      }
    } else {
      // Adaptive mode: intelligent scaling based on aspect ratio
      const aspectRatio = originalWidth / originalHeight;
      if (aspectRatio > 2 || aspectRatio < 0.5) {
        // Extreme aspect ratios: conservative scaling
        const scaleFactor = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
        if (scaleFactor < 1) {
          targetWidth = Math.floor(originalWidth * scaleFactor);
          targetHeight = Math.floor(originalHeight * scaleFactor);
        }
      } else {
        // Standard aspect ratios: more aggressive scaling
        const scaleFactor = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
        targetWidth = Math.floor(originalWidth * scaleFactor);
        targetHeight = Math.floor(originalHeight * scaleFactor);
      }
    }

    return { width: targetWidth, height: targetHeight };
  }

  // Apply processing algorithms based on strategy
  applyProcessing(imageElement, targetDimensions, processingStrategy) {
    if (processingStrategy === 'preserve') {
      // Preserve mode: high-quality interpolation
      this.renderContext.imageSmoothingEnabled = true;
      this.renderContext.imageSmoothingQuality = 'high';
    } else if (processingStrategy === 'compress') {
      // Compress mode: disable smoothing for speed
      this.renderContext.imageSmoothingEnabled = false;
    } else {
      // Adaptive mode: balanced smoothing
      this.renderContext.imageSmoothingEnabled = true;
      this.renderContext.imageSmoothingQuality = 'medium';
    }

    this.renderContext.drawImage(imageElement, 0, 0, targetDimensions.width, targetDimensions.height);
  }

  // Record performance statistics
  recordMetrics(originalBytes, processedBytes) {
    if (!extensionConfig.trackingEnabled) return;

    this.statistics.filesProcessed++;
    const bytesReduced = originalBytes - processedBytes;
    this.statistics.bytesReduced += bytesReduced;

    const compressionPercentage = (bytesReduced / originalBytes) * 100;
    this.statistics.averageCompression =
      (this.statistics.averageCompression * (this.statistics.filesProcessed - 1) + compressionPercentage) /
      this.statistics.filesProcessed;
  }

  // Get performance statistics
  getStatistics() {
    return { ...this.statistics };
  }
}

// File validation and security checks
class SecurityValidator {
  static validateFile(inputFile) {
    if (!inputFile || typeof inputFile !== 'object') {
      throw new Error('Invalid file object provided');
    }

    if (!inputFile.type || !inputFile.type.startsWith('image/')) {
      throw new Error('Only image files are supported');
    }

    if (!extensionConfig.supportedTypes.includes(inputFile.type)) {
      throw new Error(`Unsupported format: ${inputFile.type}`);
    }

    const maxBytes = extensionConfig.sizeThreshold * 1024 * 1024;
    if (inputFile.size > maxBytes) {
      throw new Error(`File exceeds size limit: ${extensionConfig.sizeThreshold}MB`);
    }

    return true;
  }

  static createUniqueId(filename) {
    const currentTime = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const filenameHash = this.generateHash(filename);
    return `mf_${currentTime}_${filenameHash}_${randomSuffix}`;
  }

  static generateHash(inputString) {
    let hashValue = 5381;
    for (let i = 0; i < inputString.length; i++) {
      hashValue = (hashValue << 5) + hashValue + inputString.charCodeAt(i);
    }
    return (hashValue >>> 0).toString(36);
  }
}

// Storage path management system
class PathManager {
  static createStoragePath(characterName, pattern = extensionConfig.storagePattern) {
    const currentDate = new Date();

    switch (pattern) {
      case 'temporal':
        return `media-assets/${currentDate.getFullYear()}/${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      case 'grouped':
        return `characters/${characterName || 'default'}/media`;

      case 'smart':
      default:
        const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
        return `mediaflow/${characterName || 'default'}/${currentDate.getFullYear()}-${monthStr}`;
    }
  }

  static buildFilename(originalFilename, uniqueIdentifier) {
    const fileExtension = originalFilename.split('.').pop();
    const baseFilename = originalFilename.replace(/\.[^/.]+$/, '').substring(0, 50);
    return `${baseFilename}_${uniqueIdentifier}.${fileExtension}`;
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
