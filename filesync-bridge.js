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
import { saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';

// 插件元数据
const PLUGIN_ID = 'visual-bridge-kencuo';
const MODULE_NAME = 'third-party-image-processor';
const UPDATE_INTERVAL = 1000;
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

  // 新增的设置项 - 默认保持原有行为
  processingMode: 'smart', // 使用原有的智能模式，而不是新的压缩模式
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  compressionMode: 'adaptive', // 'adaptive', 'quality', 'size'
  maxFileSize: 20 * 1024 * 1024, // 与原有的fileLimit保持一致
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  enableWebP: true,
  autoOptimize: true,
  showProcessingInfo: false, // 默认不显示处理信息，保持原有的静默行为
  enableLogging: false, // 默认不启用调试日志
  storagePath: 'user/images',
  useTimestamp: true,
  useUniqueId: true,
  simpleMode: false, // 默认不启用简单模式，使用原有的完整处理
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

// 全局变量
let extensionSettings = {};
let isProcessing = false;
let processingQueue = [];

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
      avgCompressionRatio: 0,
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
   * 唯一ID生成
   * @returns {string} 唯一标识符
   */
  generateUniqueId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `img_${timestamp}_${random}`;
  }

  /**
   * 智能路径生成
   * @param {string} originalName 原始文件名
   * @param {string} format 输出格式
   * @returns {string} 生成的文件路径
   */
  generateStoragePath(originalName, format = 'webp') {
    const { storagePath, useTimestamp, useUniqueId } = pluginConfig;

    let fileName = originalName.split('.')[0];

    if (useTimestamp) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName += `_${timestamp}`;
    }

    if (useUniqueId) {
      const uniqueId = this.generateUniqueId().split('_').pop();
      fileName += `_${uniqueId}`;
    }

    const fullPath = `${storagePath}/${fileName}.${format}`;
    this.log(`生成存储路径: ${fullPath}`);

    return fullPath;
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
      hash = (hash << 5) + hash + str.charCodeAt(i);
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

// 全局图像处理器实例
let imageProcessor = null;

/**
 * 外部接口 - 图像处理入口
 */
window.__uploadImageByPlugin = async function (imageFile, processingOptions = {}) {
  try {
    if (!imageFile) {
      throw new Error('请提供图像文件');
    }

    // 检查是否启用了简单模式
    if (extensionSettings.simpleMode || pluginConfig.simpleMode) {
      return await simpleUploadMode(imageFile);
    }

    // 默认使用原有的Visual Bridge处理方式
    // 显示处理信息（仅在用户启用时）
    if (pluginConfig.showProcessingInfo) {
      const modeText = pluginConfig.processingMode === 'direct' ? '直接保存' : '智能处理';
      toastr.info(`正在${modeText}图像...`, '图像上传');
    }

    const result = await visualBridge.processVisualFile(imageFile, processingOptions);

    // 显示成功信息（仅在用户启用时）
    if (pluginConfig.showProcessingInfo) {
      const compressionRatio =
        result.metadata.originalSize > 0
          ? (
              ((result.metadata.originalSize - result.metadata.processedSize) / result.metadata.originalSize) *
              100
            ).toFixed(2)
          : '0.00';
      const modeText = pluginConfig.processingMode === 'direct' ? '直接保存' : `压缩率: ${compressionRatio}%`;
      toastr.success(`图像处理完成！${modeText}`, '上传成功');
    }

    console.log('[Visual Bridge] 处理完成:', {
      文件: imageFile.name,
      大小变化: `${imageFile.size} → ${result.metadata.processedSize}`,
      存储位置: result.url,
      优化模式: result.metadata.processingMode,
    });

    return {
      url: result.url,
      info: result.metadata,
      success: true,
      path: result.url,
      size: result.metadata.processedSize,
      format: result.metadata.format,
      originalSize: result.metadata.originalSize,
      compressionRatio:
        result.metadata.originalSize > 0
          ? (
              ((result.metadata.originalSize - result.metadata.processedSize) / result.metadata.originalSize) *
              100
            ).toFixed(2)
          : '0.00',
    };
  } catch (error) {
    console.error('[Visual Bridge] 处理失败:', error.message);

    if (pluginConfig.showProcessingInfo) {
      toastr.error(error.message, '上传失败');
    }

    throw new Error(`图像处理失败: ${error.message}`);
  } finally {
    isProcessing = false;
  }
};

/**
 * 加载设置
 */
function loadSettings() {
  extensionSettings = getContext().extensionSettings[MODULE_NAME] || {};
  Object.assign(extensionSettings, CONFIG_DEFAULTS, extensionSettings);

  // 初始化图像处理器
  imageProcessor = new ImageOptimizer();

  console.log(`[${MODULE_NAME}] 设置已加载`, extensionSettings);
}

/**
 * 保存设置
 */
function saveSettings() {
  getContext().extensionSettings[MODULE_NAME] = extensionSettings;
  saveSettingsDebounced();

  // 重新初始化图像处理器
  if (imageProcessor) {
    imageProcessor = new ImageOptimizer();
  }

  console.log(`[${MODULE_NAME}] 设置已保存`);
}

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

    // 更新新增的设置项
    $('#simpleMode')?.prop('checked', pluginConfig.simpleMode);
    $('#processingMode')?.val(pluginConfig.processingMode);
    $('#maxWidth')?.val(pluginConfig.maxWidth);
    $('#maxHeight')?.val(pluginConfig.maxHeight);
    $('#quality')?.val(pluginConfig.quality);
    $('#qualityValue')?.text(Math.round(pluginConfig.quality * 100) + '%');
    $('#compressionMode')?.val(pluginConfig.compressionMode);
    $('#maxFileSize')?.val(pluginConfig.maxFileSize / 1024 / 1024);
    $('#enableWebP')?.prop('checked', pluginConfig.enableWebP);
    $('#autoOptimize')?.prop('checked', pluginConfig.autoOptimize);
    $('#showProcessingInfo')?.prop('checked', pluginConfig.showProcessingInfo);
    $('#enableLogging')?.prop('checked', pluginConfig.enableLogging);
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
 * 创建设置界面
 */
function createSettingsHtml() {
  return `
    <div class="third-party-image-processor-settings">
        <h3>🖼️ 智能图像处理设置</h3>

        <div class="setting-group">
            <h4>运行模式</h4>
            <label>
                <input type="checkbox" id="simpleMode" ${pluginConfig.simpleMode ? 'checked' : ''}> 启用简单上传模式
            </label>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                <strong>默认模式</strong>：使用原有的Visual Bridge智能处理（推荐）<br>
                <strong>简单模式</strong>：基础上传功能，无额外处理<br>
                注意：默认情况下使用原有的上传方式，无需更改设置
            </div>
        </div>

        <div class="setting-group" id="advancedSettings">
            <h4>处理模式</h4>
            <label>
                处理方式:
                <select id="processingMode">
                    <option value="smart" ${
                      pluginConfig.processingMode === 'smart' ? 'selected' : ''
                    }>智能模式（默认原有方式）</option>
                    <option value="direct" ${
                      pluginConfig.processingMode === 'direct' ? 'selected' : ''
                    }>直接保存（无处理）</option>
                    <option value="compress" ${
                      pluginConfig.processingMode === 'compress' ? 'selected' : ''
                    }>高级压缩处理</option>
                </select>
            </label>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                智能模式：使用原有的Visual Bridge处理方式（推荐）<br>
                直接保存：保持原始图像不变<br>
                高级压缩：使用新的压缩算法优化图像
            </div>
        </div>

        <div class="setting-group" id="compressionSettings">
            <h4>压缩设置</h4>
            <label>
                最大宽度: <input type="number" id="maxWidth" min="100" max="4096" value="${pluginConfig.maxWidth}">
            </label>
            <label>
                最大高度: <input type="number" id="maxHeight" min="100" max="4096" value="${pluginConfig.maxHeight}">
            </label>
            <label>
                图像质量: <input type="range" id="quality" min="0.1" max="1" step="0.05" value="${
                  pluginConfig.quality
                }">
                <span id="qualityValue">${Math.round(pluginConfig.quality * 100)}%</span>
            </label>
            <label>
                压缩模式:
                <select id="compressionMode">
                    <option value="adaptive" ${
                      pluginConfig.compressionMode === 'adaptive' ? 'selected' : ''
                    }>自适应</option>
                    <option value="quality" ${
                      pluginConfig.compressionMode === 'quality' ? 'selected' : ''
                    }>保持质量</option>
                    <option value="size" ${pluginConfig.compressionMode === 'size' ? 'selected' : ''}>压缩优先</option>
                </select>
            </label>
        </div>

        <div class="setting-group" id="fileSettings">
            <h4>文件限制</h4>
            <label>
                最大文件大小 (MB): <input type="number" id="maxFileSize" min="1" max="100" value="${
                  pluginConfig.maxFileSize / 1024 / 1024
                }">
            </label>
        </div>

        <div class="setting-group" id="advancedOptions">
            <h4>高级选项</h4>
            <label>
                <input type="checkbox" id="enableWebP" ${pluginConfig.enableWebP ? 'checked' : ''}> 启用WebP格式
            </label>
            <label>
                <input type="checkbox" id="autoOptimize" ${pluginConfig.autoOptimize ? 'checked' : ''}> 自动优化
            </label>
            <label>
                <input type="checkbox" id="showProcessingInfo" ${
                  pluginConfig.showProcessingInfo ? 'checked' : ''
                }> 显示处理信息
            </label>
            <label>
                <input type="checkbox" id="enableLogging" ${pluginConfig.enableLogging ? 'checked' : ''}> 启用调试日志
            </label>
        </div>
    </div>
    `;
}

/**
 * 绑定设置事件
 */
function bindSettingsEvents() {
  // 简单模式切换
  $('#simpleMode').on('change', function () {
    pluginConfig.simpleMode = this.checked;
    ConfigManager.saveConfig();

    // 根据模式显示/隐藏高级设置
    const advancedSettings = $('#advancedSettings, #compressionSettings, #fileSettings, #advancedOptions');
    if (this.checked) {
      advancedSettings.hide();
      toastr.info('已切换到简单上传模式', '模式切换');
    } else {
      advancedSettings.show();
      toastr.info('已切换到完整图像处理模式', '模式切换');
    }
  });

  // 初始化时根据简单模式显示/隐藏高级设置
  const advancedSettings = $('#advancedSettings, #compressionSettings, #fileSettings, #advancedOptions');
  if (pluginConfig.simpleMode) {
    advancedSettings.hide();
  } else {
    advancedSettings.show();
  }

  // 处理模式切换
  $('#processingMode').on('change', function () {
    pluginConfig.processingMode = this.value;
    ConfigManager.saveConfig();

    // 根据模式显示/隐藏压缩设置
    const compressionSettings = $('#compressionSettings');
    if (this.value === 'direct' || this.value === 'smart') {
      compressionSettings.hide();
    } else {
      compressionSettings.show();
    }
  });

  // 初始化时根据当前模式显示/隐藏压缩设置
  const compressionSettings = $('#compressionSettings');
  if (pluginConfig.processingMode === 'direct' || pluginConfig.processingMode === 'smart') {
    compressionSettings.hide();
  } else {
    compressionSettings.show();
  }

  $('#maxWidth, #maxHeight').on('input', function () {
    pluginConfig[this.id] = parseInt(this.value);
    ConfigManager.saveConfig();
  });

  $('#quality').on('input', function () {
    pluginConfig.quality = parseFloat(this.value);
    $('#qualityValue').text(Math.round(this.value * 100) + '%');
    ConfigManager.saveConfig();
  });

  $('#compressionMode').on('change', function () {
    pluginConfig.compressionMode = this.value;
    ConfigManager.saveConfig();
  });

  $('#maxFileSize').on('input', function () {
    pluginConfig.maxFileSize = parseInt(this.value) * 1024 * 1024;
    ConfigManager.saveConfig();
  });

  $('#enableWebP, #autoOptimize, #showProcessingInfo, #enableLogging').on('change', function () {
    pluginConfig[this.id] = this.checked;
    ConfigManager.saveConfig();
  });
}

/**
 * 插件启动
 */
jQuery(async () => {
  try {
    console.log(`[Visual Bridge] 启动中... v${PLUGIN_VERSION} by ${PLUGIN_AUTHOR}`);

    // 加载设置
    loadSettings();

    // 创建设置界面
    const settingsHtml = createSettingsHtml();
    $('#extensions_settings').append(settingsHtml);

    // 绑定事件
    $('#vb-enabled').on('change', EventManager.onToggleActive);
    $('#vb-optimization-mode').on('change', EventManager.onModeChange);
    $('#vb-quality').on('input', EventManager.onQualityChange);

    // 绑定新增的设置事件
    bindSettingsEvents();

    // 初始化
    await ConfigManager.loadConfig();
    await visualBridge.initialize();

    // 注册事件监听器
    eventSource.on(event_types.SETTINGS_LOADED, loadSettings);

    console.log('[Visual Bridge] 启动完成!');
    console.log('[Visual Bridge] GitHub: https://github.com/kencuo/chajian');

    // 显示初始化成功消息（仅在用户启用显示处理信息时）
    if (pluginConfig.showProcessingInfo) {
      let modeText = '原有Visual Bridge模式';
      if (pluginConfig.simpleMode) {
        modeText = '简单上传模式';
      } else if (pluginConfig.processingMode === 'compress') {
        modeText = '高级压缩模式';
      } else if (pluginConfig.processingMode === 'direct') {
        modeText = '直接保存模式';
      }
      toastr.success(`智能图像处理插件已启用 (${modeText})`, '插件加载');
    }
  } catch (error) {
    console.error('[Visual Bridge] 启动失败:', error);
  }
});
