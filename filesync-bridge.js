/**
 * SillyTavern 智能图像处理插件
 * 提供图像上传、压缩、优化和管理功能
 *
 * @author AI Assistant
 * @version 1.0.0
 * @requires SillyTavern >= 1.10.0
 */

import { saveSettingsDebounced } from '../../../script.js';
import { event_types, eventSource } from '../../event-source.js';
import { getContext } from '../../extensions.js';

// 插件配置
const MODULE_NAME = 'third-party-image-processor';
const UPDATE_INTERVAL = 1000;

// 默认设置
const defaultSettings = {
  // 处理模式
  processingMode: 'direct', // 'direct' = 直接保存, 'compress' = 压缩处理

  // 压缩设置（仅在compress模式下使用）
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  compressionMode: 'adaptive', // 'adaptive', 'quality', 'size'

  // 文件限制
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp', 'gif'],

  // 存储设置
  storagePath: 'user/images',
  useTimestamp: true,
  useUniqueId: true,

  // 高级选项
  enableWebP: false, // 直接模式下默认关闭WebP转换
  preserveMetadata: true, // 直接模式下保留元数据
  autoOptimize: false, // 直接模式下关闭自动优化

  // 调试选项
  enableLogging: true,
  showProcessingInfo: true,
};

// 全局变量
let extensionSettings = {};
let isProcessing = false;
let processingQueue = [];

/**
 * 图像处理核心类
 */
class ImageProcessor {
  constructor(settings) {
    this.settings = { ...defaultSettings, ...settings };
    this.canvas = null;
    this.ctx = null;
    this.initCanvas();
  }

  /**
   * 初始化Canvas渲染环境
   */
  initCanvas() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.log('Canvas渲染环境已初始化');
  }

  /**
   * 智能尺寸计算
   * @param {number} originalWidth 原始宽度
   * @param {number} originalHeight 原始高度
   * @returns {Object} 计算后的尺寸
   */
  calculateOptimalSize(originalWidth, originalHeight) {
    const { maxWidth, maxHeight } = this.settings;

    let newWidth = originalWidth;
    let newHeight = originalHeight;

    // 计算缩放比例
    const widthRatio = maxWidth / originalWidth;
    const heightRatio = maxHeight / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio, 1);

    if (ratio < 1) {
      newWidth = Math.round(originalWidth * ratio);
      newHeight = Math.round(originalHeight * ratio);
    }

    this.log(`尺寸优化: ${originalWidth}x${originalHeight} → ${newWidth}x${newHeight}`);

    return { width: newWidth, height: newHeight, ratio };
  }

  /**
   * 文件类型检查
   * @param {File} file 文件对象
   * @returns {boolean} 是否为支持的格式
   */
  validateFileType(file) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type.toLowerCase();

    const isValidExtension = this.settings.allowedFormats.includes(fileExtension);
    const isValidMimeType = mimeType.startsWith('image/');

    if (!isValidExtension || !isValidMimeType) {
      this.log(`不支持的文件格式: ${fileExtension} (${mimeType})`, 'warn');
      return false;
    }

    return true;
  }

  /**
   * 大小限制验证
   * @param {File} file 文件对象
   * @returns {boolean} 是否符合大小限制
   */
  validateFileSize(file) {
    if (file.size > this.settings.maxFileSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      const limitMB = (this.settings.maxFileSize / 1024 / 1024).toFixed(2);
      this.log(`文件过大: ${sizeMB}MB > ${limitMB}MB`, 'warn');
      return false;
    }

    return true;
  }

  /**
   * 唯一ID生成
   * @returns {string} 唯一标识符
   */
  generateUniqueId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `img_${timestamp}_${random}`;
  }

  /**
   * 智能路径生成
   * @param {string} originalName 原始文件名
   * @param {string} format 输出格式
   * @returns {string} 生成的文件路径
   */
  generateStoragePath(originalName, format = 'webp') {
    const { storagePath, useTimestamp, useUniqueId } = this.settings;

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
   * 直接处理图像（无压缩）
   * @param {File} file 原始文件
   * @returns {Promise<Blob>} 原始文件Blob
   */
  async processImageDirect(file) {
    this.log(`直接保存模式: ${file.name}, 大小: ${(file.size / 1024).toFixed(2)}KB`);
    return file;
  }

  /**
   * 智能压缩策略
   * @param {HTMLImageElement} img 图像对象
   * @param {string} outputFormat 输出格式
   * @returns {Promise<Blob>} 压缩后的图像Blob
   */
  async compressImage(img, outputFormat = 'webp') {
    const { width, height } = this.calculateOptimalSize(img.naturalWidth, img.naturalHeight);

    this.canvas.width = width;
    this.canvas.height = height;

    // 清除画布
    this.ctx.clearRect(0, 0, width, height);

    // 绘制图像
    this.ctx.drawImage(img, 0, 0, width, height);

    // 根据压缩模式确定质量
    let quality = this.settings.quality;

    switch (this.settings.compressionMode) {
      case 'quality':
        quality = Math.max(0.9, this.settings.quality);
        break;
      case 'size':
        quality = Math.min(0.7, this.settings.quality);
        break;
      case 'adaptive':
      default:
        // 根据文件大小自适应调整质量
        const pixelCount = width * height;
        if (pixelCount > 1920 * 1080) {
          quality *= 0.8;
        } else if (pixelCount < 800 * 600) {
          quality = Math.min(0.95, quality * 1.1);
        }
        break;
    }

    quality = Math.max(0.1, Math.min(1.0, quality));

    return new Promise(resolve => {
      this.canvas.toBlob(
        blob => {
          this.log(`图像压缩完成: ${outputFormat}, 质量: ${quality}, 大小: ${(blob.size / 1024).toFixed(2)}KB`);
          resolve(blob);
        },
        `image/${outputFormat}`,
        quality,
      );
    });
  }

  /**
   * 处理图像（根据模式选择直接保存或压缩）
   * @param {File} file 原始文件
   * @returns {Promise<{blob: Blob, format: string}>} 处理结果
   */
  async processImage(file) {
    if (this.settings.processingMode === 'direct') {
      // 直接保存模式
      const originalExtension = file.name.split('.').pop().toLowerCase();
      return {
        blob: await this.processImageDirect(file),
        format: originalExtension,
      };
    } else {
      // 压缩处理模式
      const img = new Image();
      const imageLoadPromise = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      await imageLoadPromise;

      // 确定输出格式
      let outputFormat = 'webp';
      if (!this.settings.enableWebP || !HTMLCanvasElement.prototype.toBlob) {
        outputFormat = 'jpeg';
      }

      const blob = await this.compressImage(img, outputFormat);

      // 清理临时URL
      URL.revokeObjectURL(img.src);

      return {
        blob: blob,
        format: outputFormat,
      };
    }
  }

  /**
   * 日志输出
   * @param {string} message 日志消息
   * @param {string} level 日志级别
   */
  log(message, level = 'info') {
    if (!this.settings.enableLogging) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${MODULE_NAME}] ${timestamp}`;

    switch (level) {
      case 'warn':
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ❌ ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️ ${message}`);
    }
  }
}

/**
 * 上下文管理器
 */
class ContextManager {
  /**
   * 获取当前角色信息
   * @returns {Object} 角色信息
   */
  static getCurrentCharacter() {
    const context = getContext();
    return {
      name: context.name1 || 'User',
      characterId: context.characterId || null,
      chatId: context.chatId || null,
      groupId: context.groupId || null,
    };
  }

  /**
   * 获取会话信息
   * @returns {Object} 会话信息
   */
  static getSessionInfo() {
    const context = getContext();
    return {
      sessionId: context.sessionId || Date.now().toString(),
      timestamp: new Date().toISOString(),
      messageCount: context.chat?.length || 0,
    };
  }

  /**
   * 生成上下文相关的文件名前缀
   * @returns {string} 文件名前缀
   */
  static generateContextPrefix() {
    const char = this.getCurrentCharacter();
    const session = this.getSessionInfo();

    let prefix = '';

    if (char.name && char.name !== 'User') {
      prefix += `${char.name.replace(/[^a-zA-Z0-9]/g, '_')}_`;
    }

    if (char.chatId) {
      prefix += `chat${char.chatId}_`;
    }

    return prefix;
  }
}

// 全局图像处理器实例
let imageProcessor = null;

/**
 * 全局上传接口函数
 * @param {File} file 要上传的文件
 * @param {Object} options 上传选项
 * @returns {Promise<Object>} 上传结果
 */
window.__uploadImageByPlugin = async function (file, options = {}) {
  if (!imageProcessor) {
    throw new Error('图像处理器未初始化');
  }

  if (isProcessing) {
    throw new Error('正在处理其他图像，请稍候');
  }

  try {
    isProcessing = true;

    // 验证文件
    if (!imageProcessor.validateFileType(file)) {
      throw new Error('不支持的文件格式');
    }

    if (!imageProcessor.validateFileSize(file)) {
      throw new Error('文件大小超出限制');
    }

    // 显示处理信息
    if (extensionSettings.showProcessingInfo) {
      const modeText = extensionSettings.processingMode === 'direct' ? '直接保存' : '压缩处理';
      toastr.info(`正在${modeText}图像...`, '图像上传');
    }

    // 处理图像（根据模式选择直接保存或压缩）
    const processResult = await imageProcessor.processImage(file);
    const { blob: processedBlob, format: outputFormat } = processResult;

    // 生成存储路径
    const contextPrefix = ContextManager.generateContextPrefix();
    const fileName = `${contextPrefix}${file.name}`;
    const storagePath = imageProcessor.generateStoragePath(fileName, outputFormat);

    // 创建FormData用于上传
    const formData = new FormData();
    formData.append('image', processedBlob, `${fileName}.${outputFormat}`);
    formData.append('path', storagePath);

    // 模拟上传到服务器（这里需要根据实际的SillyTavern API调整）
    const uploadResult = {
      success: true,
      url: `data:${processedBlob.type};base64,${await blobToBase64(processedBlob)}`,
      path: storagePath,
      size: processedBlob.size,
      format: outputFormat,
      originalSize: file.size,
      compressionRatio:
        extensionSettings.processingMode === 'direct'
          ? '0.00'
          : (((file.size - processedBlob.size) / file.size) * 100).toFixed(2),
    };

    // 显示成功信息
    if (extensionSettings.showProcessingInfo) {
      const modeText =
        extensionSettings.processingMode === 'direct' ? '直接保存' : `压缩率: ${uploadResult.compressionRatio}%`;
      toastr.success(`图像处理完成！${modeText}`, '上传成功');
    }

    imageProcessor.log(`图像上传成功: ${storagePath}`);

    return uploadResult;
  } catch (error) {
    imageProcessor.log(`图像上传失败: ${error.message}`, 'error');

    if (extensionSettings.showProcessingInfo) {
      toastr.error(error.message, '上传失败');
    }

    throw error;
  } finally {
    isProcessing = false;
  }
};

/**
 * 将Blob转换为Base64
 * @param {Blob} blob Blob对象
 * @returns {Promise<string>} Base64字符串
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 加载设置
 */
function loadSettings() {
  extensionSettings = getContext().extensionSettings[MODULE_NAME] || {};
  Object.assign(extensionSettings, defaultSettings, extensionSettings);

  // 初始化图像处理器
  imageProcessor = new ImageProcessor(extensionSettings);

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
    imageProcessor.settings = { ...defaultSettings, ...extensionSettings };
  }

  console.log(`[${MODULE_NAME}] 设置已保存`);
}

/**
 * 创建设置界面
 */
function createSettingsHtml() {
  return `
    <div class="third-party-image-processor-settings">
        <h3>🖼️ 智能图像处理设置</h3>
        
        <div class="setting-group">
            <h4>处理模式</h4>
            <label>
                处理方式:
                <select id="processingMode">
                    <option value="direct" ${
                      extensionSettings.processingMode === 'direct' ? 'selected' : ''
                    }>直接保存（无处理）</option>
                    <option value="compress" ${
                      extensionSettings.processingMode === 'compress' ? 'selected' : ''
                    }>智能压缩处理</option>
                </select>
            </label>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                直接保存：保持原始图像不变；智能压缩：优化图像大小和质量
            </div>
        </div>

        <div class="setting-group" id="compressionSettings">
            <h4>压缩设置</h4>
            <label>
                最大宽度: <input type="number" id="maxWidth" min="100" max="4096" value="${extensionSettings.maxWidth}">
            </label>
            <label>
                最大高度: <input type="number" id="maxHeight" min="100" max="4096" value="${
                  extensionSettings.maxHeight
                }">
            </label>
            <label>
                图像质量: <input type="range" id="quality" min="0.1" max="1" step="0.05" value="${
                  extensionSettings.quality
                }">
                <span id="qualityValue">${Math.round(extensionSettings.quality * 100)}%</span>
            </label>
            <label>
                压缩模式:
                <select id="compressionMode">
                    <option value="adaptive" ${
                      extensionSettings.compressionMode === 'adaptive' ? 'selected' : ''
                    }>自适应</option>
                    <option value="quality" ${
                      extensionSettings.compressionMode === 'quality' ? 'selected' : ''
                    }>保持质量</option>
                    <option value="size" ${
                      extensionSettings.compressionMode === 'size' ? 'selected' : ''
                    }>压缩优先</option>
                </select>
            </label>
        </div>
        
        <div class="setting-group">
            <h4>文件限制</h4>
            <label>
                最大文件大小 (MB): <input type="number" id="maxFileSize" min="1" max="100" value="${
                  extensionSettings.maxFileSize / 1024 / 1024
                }">
            </label>
        </div>
        
        <div class="setting-group">
            <h4>高级选项</h4>
            <label>
                <input type="checkbox" id="enableWebP" ${extensionSettings.enableWebP ? 'checked' : ''}> 启用WebP格式
            </label>
            <label>
                <input type="checkbox" id="autoOptimize" ${extensionSettings.autoOptimize ? 'checked' : ''}> 自动优化
            </label>
            <label>
                <input type="checkbox" id="showProcessingInfo" ${
                  extensionSettings.showProcessingInfo ? 'checked' : ''
                }> 显示处理信息
            </label>
            <label>
                <input type="checkbox" id="enableLogging" ${
                  extensionSettings.enableLogging ? 'checked' : ''
                }> 启用调试日志
            </label>
        </div>
    </div>
    `;
}

/**
 * 绑定设置事件
 */
function bindSettingsEvents() {
  // 处理模式切换
  $('#processingMode').on('change', function () {
    extensionSettings.processingMode = this.value;
    saveSettings();

    // 根据模式显示/隐藏压缩设置
    const compressionSettings = $('#compressionSettings');
    if (this.value === 'direct') {
      compressionSettings.hide();
    } else {
      compressionSettings.show();
    }
  });

  // 初始化时根据当前模式显示/隐藏压缩设置
  const compressionSettings = $('#compressionSettings');
  if (extensionSettings.processingMode === 'direct') {
    compressionSettings.hide();
  } else {
    compressionSettings.show();
  }

  $('#maxWidth, #maxHeight').on('input', function () {
    extensionSettings[this.id] = parseInt(this.value);
    saveSettings();
  });

  $('#quality').on('input', function () {
    extensionSettings.quality = parseFloat(this.value);
    $('#qualityValue').text(Math.round(this.value * 100) + '%');
    saveSettings();
  });

  $('#compressionMode').on('change', function () {
    extensionSettings.compressionMode = this.value;
    saveSettings();
  });

  $('#maxFileSize').on('input', function () {
    extensionSettings.maxFileSize = parseInt(this.value) * 1024 * 1024;
    saveSettings();
  });

  $('#enableWebP, #autoOptimize, #showProcessingInfo, #enableLogging').on('change', function () {
    extensionSettings[this.id] = this.checked;
    saveSettings();
  });
}

/**
 * 插件初始化
 */
jQuery(async () => {
  // 加载设置
  loadSettings();

  // 创建设置界面
  const settingsHtml = createSettingsHtml();
  $('#extensions_settings').append(settingsHtml);

  // 绑定事件
  bindSettingsEvents();

  // 注册事件监听器
  eventSource.on(event_types.SETTINGS_LOADED, loadSettings);

  console.log(`[${MODULE_NAME}] 插件初始化完成`);

  // 显示初始化成功消息
  if (extensionSettings.showProcessingInfo) {
    toastr.success('智能图像处理插件已启用', '插件加载');
  }
});
