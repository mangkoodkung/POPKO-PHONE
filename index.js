/**
 * 智能媒体助手 - SillyTavern 插件
 * 作者: kencuo
 * 版本: 1.0.0
 * 功能: 为外部应用提供智能媒体文件处理、压缩和本地存储服务
 * GitHub: https://github.com/kencuo/chajian
 */

// 导入SillyTavern核心工具函数
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';

import { getContext } from '../../../extensions.js';

import { saveSettingsDebounced } from '../../../../script.js';

// 插件标识和配置
const EXTENSION_NAME = 'kencuo-media-helper';
const EXTENSION_VERSION = '1.0.0';

// 默认配置
const DEFAULT_CONFIG = {
  enabled: true,
  compressionEnabled: true,
  compressionQuality: 0.8,
  maxFileSize: 15, // MB
  autoOrganize: true,
  supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  storageStructure: 'date-based', // 'date-based' or 'character-based'
};

// 初始化插件设置存储
window.extension_settings = window.extension_settings || {};
window.extension_settings[EXTENSION_NAME] = window.extension_settings[EXTENSION_NAME] || {};
const settings = window.extension_settings[EXTENSION_NAME];

// 合并默认配置
Object.keys(DEFAULT_CONFIG).forEach(key => {
  if (settings[key] === undefined) {
    settings[key] = DEFAULT_CONFIG[key];
  }
});

/**
 * 图片压缩工具类
 */
class ImageCompressor {
  constructor(quality = 0.8) {
    this.quality = quality;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * 压缩图片文件
   * @param {File} file - 原始图片文件
   * @param {number} maxWidth - 最大宽度
   * @param {number} maxHeight - 最大高度
   * @returns {Promise<string>} 压缩后的base64数据
   */
  async compressImage(file, maxWidth = 1920, maxHeight = 1080) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 计算压缩后的尺寸
        let { width, height } = this.calculateDimensions(img.width, img.height, maxWidth, maxHeight);

        // 设置canvas尺寸
        this.canvas.width = width;
        this.canvas.height = height;

        // 绘制压缩后的图片
        this.ctx.drawImage(img, 0, 0, width, height);

        // 转换为base64
        const compressedBase64 = this.canvas.toDataURL(file.type, this.quality);
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * 计算压缩后的尺寸（保持宽高比）
   */
  calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
    let width = originalWidth;
    let height = originalHeight;

    // 如果图片尺寸超过限制，按比例缩放
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }
}

/**
 * 文件验证器类
 */
class FileValidator {
  constructor(config) {
    this.supportedTypes = config.supportedTypes;
    this.maxFileSize = config.maxFileSize * 1024 * 1024; // 转换为字节
  }

  /**
   * 验证文件是否符合要求
   */
  validateFile(file) {
    if (!file || !file.type) {
      throw new Error('无效的文件对象');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('仅支持图片文件格式');
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`文件大小超过限制 (${this.maxFileSize / 1024 / 1024}MB)`);
    }

    if (!this.supportedTypes.includes(file.type)) {
      throw new Error(`不支持的文件格式: ${file.type}`);
    }

    return true;
  }

  /**
   * 生成唯一的文件标识符
   */
  generateFileIdentifier(originalName) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const nameHash = this.createSimpleHash(originalName);
    return `img_${timestamp}_${nameHash}_${randomSuffix}`;
  }

  /**
   * 创建简单哈希（自实现，避免依赖）
   */
  createSimpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * 路径生成器类
 */
class PathGenerator {
  constructor(storageStructure) {
    this.storageStructure = storageStructure;
  }

  /**
   * 生成存储路径
   */
  generateStoragePath(characterName) {
    if (this.storageStructure === 'date-based') {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `media/${year}/${month}/${day}`;
    } else {
      // character-based
      return `characters/${characterName || 'default'}/media`;
    }
  }
}

/**
 * 聊天上下文管理器
 */
class ChatContextManager {
  /**
   * 获取当前聊天上下文信息
   */
  async getCurrentChatContext() {
    try {
      const context = getContext();
      const currentChar = context.characters[context.characterId];

      return {
        characterId: context.characterId,
        characterName: currentChar?.name || 'default',
        chatId: context.chatId || 'unknown',
      };
    } catch (error) {
      console.warn('获取聊天上下文失败，使用默认值:', error);
      return {
        characterId: 'default',
        characterName: 'default',
        chatId: 'unknown',
      };
    }
  }
}

/**
 * 智能媒体处理器 - 主处理类
 */
class SmartMediaProcessor {
  constructor() {
    this.compressor = new ImageCompressor(settings.compressionQuality);
    this.validator = new FileValidator(settings);
    this.pathGenerator = new PathGenerator(settings.storageStructure);
    this.contextManager = new ChatContextManager();
  }

  /**
   * 处理媒体文件的主要方法
   * @param {File} file - 要处理的文件
   * @param {Object} options - 处理选项
   * @returns {Promise<Object>} 处理结果
   */
  async processMediaFile(file, options = {}) {
    try {
      // 第一步：验证文件
      this.validator.validateFile(file);

      // 第二步：获取聊天上下文
      const chatContext = await this.contextManager.getCurrentChatContext();

      // 第三步：处理图片（压缩或直接转换）
      let imageData;
      if (settings.compressionEnabled && !options.skipCompression) {
        // 使用压缩
        imageData = await this.compressor.compressImage(file);
      } else {
        // 直接转换为base64
        imageData = await getBase64Async(file);
      }

      // 第四步：准备文件信息
      const base64Data = imageData.split(',')[1]; // 移除前缀
      const fileExtension = file.type.split('/')[1] || 'png';
      const uniqueFileName = this.validator.generateFileIdentifier(file.name);

      // 第五步：生成存储路径
      const storagePath = this.pathGenerator.generateStoragePath(chatContext.characterName);

      // 第六步：保存文件
      const savedUrl = await saveBase64AsFile(base64Data, storagePath, uniqueFileName, fileExtension);

      // 第七步：返回结果
      return {
        success: true,
        url: savedUrl,
        info: {
          originalName: file.name,
          processedName: `${uniqueFileName}.${fileExtension}`,
          size: file.size,
          type: file.type,
          character: chatContext.characterName,
          compressed: settings.compressionEnabled && !options.skipCompression,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[智能媒体助手] 处理失败:', error);
      throw new Error(`媒体处理失败: ${error.message}`);
    }
  }
}

// 创建全局实例
const smartProcessor = new SmartMediaProcessor();

/**
 * 主要的外部接口函数 - 智能图片处理器
 * 为外部应用提供图片上传和处理服务
 *
 * @param {File} imageFile - 要处理的图片文件
 * @param {Object} processingOptions - 处理选项
 * @returns {Promise<Object>} 处理结果，包含URL和元数据
 */
window.__uploadImageByPlugin = async function (imageFile, processingOptions = {}) {
  try {
    // 验证插件状态
    if (!settings.enabled) {
      throw new Error('智能媒体助手插件已禁用，请在设置中启用');
    }

    // 验证输入参数
    if (!imageFile || typeof imageFile !== 'object') {
      throw new Error('请提供有效的图片文件对象');
    }

    // 使用智能处理器处理文件
    const processingResult = await smartProcessor.processMediaFile(imageFile, processingOptions);

    // 输出处理日志
    console.log(`[智能媒体助手] 图片处理完成:`, {
      原始文件: imageFile.name,
      处理后大小: processingResult.info.size,
      存储位置: processingResult.url,
      是否压缩: processingResult.info.compressed,
    });

    // 返回标准格式的结果（兼容原有接口）
    return {
      url: processingResult.url,
      metadata: processingResult.info,
    };
  } catch (processingError) {
    console.error(`[智能媒体助手] 图片处理失败:`, processingError.message);

    // 抛出用户友好的错误信息
    throw new Error(`图片处理失败: ${processingError.message}`);
  }
};

/**
 * 设置管理器
 */
class SettingsManager {
  constructor() {
    this.settingsLoaded = false;
  }

  /**
   * 加载插件设置
   */
  async loadSettings() {
    try {
      // 确保设置对象存在
      if (Object.keys(settings).length === 0) {
        Object.assign(settings, DEFAULT_CONFIG);
        console.log('[智能媒体助手] 使用默认配置');
      }

      // 更新UI
      this.updateUI();
      this.settingsLoaded = true;

      console.log('[智能媒体助手] 设置加载完成:', settings);
    } catch (error) {
      console.error('[智能媒体助手] 设置加载失败:', error);
    }
  }

  /**
   * 更新设置界面
   */
  updateUI() {
    // 主开关
    const enabledSwitch = $('#kencuo-media-enabled');
    if (enabledSwitch.length) {
      enabledSwitch.prop('checked', settings.enabled);
    }

    // 压缩开关
    const compressionSwitch = $('#kencuo-media-compression');
    if (compressionSwitch.length) {
      compressionSwitch.prop('checked', settings.compressionEnabled);
    }

    // 质量滑块
    const qualitySlider = $('#kencuo-media-quality');
    if (qualitySlider.length) {
      qualitySlider.val(settings.compressionQuality);
    }
  }

  /**
   * 保存设置
   */
  saveSettings() {
    try {
      saveSettingsDebounced();
      console.log('[智能媒体助手] 设置已保存');
    } catch (error) {
      console.error('[智能媒体助手] 设置保存失败:', error);
    }
  }
}

// 创建设置管理器实例
const settingsManager = new SettingsManager();

/**
 * 事件处理器
 */
const EventHandlers = {
  /**
   * 主开关切换
   */
  onMainToggle(event) {
    const isEnabled = Boolean($(event.target).prop('checked'));
    settings.enabled = isEnabled;
    settingsManager.saveSettings();

    // 显示状态提示
    if (isEnabled) {
      toastr.success('智能媒体助手已启用', 'kencuo插件');
    } else {
      toastr.warning('智能媒体助手已禁用', 'kencuo插件');
    }
  },

  /**
   * 压缩功能切换
   */
  onCompressionToggle(event) {
    const isEnabled = Boolean($(event.target).prop('checked'));
    settings.compressionEnabled = isEnabled;
    settingsManager.saveSettings();

    // 更新压缩器设置
    smartProcessor.compressor.quality = settings.compressionQuality;
  },

  /**
   * 压缩质量调整
   */
  onQualityChange(event) {
    const quality = parseFloat($(event.target).val());
    settings.compressionQuality = quality;
    settingsManager.saveSettings();

    // 更新压缩器设置
    smartProcessor.compressor.quality = quality;
  },
};

/**
 * 插件初始化入口
 */
jQuery(async () => {
  try {
    console.log(`[智能媒体助手] 开始初始化 v${EXTENSION_VERSION}`);

    // 绑定事件监听器
    $('#kencuo-media-enabled').on('change', EventHandlers.onMainToggle);
    $('#kencuo-media-compression').on('change', EventHandlers.onCompressionToggle);
    $('#kencuo-media-quality').on('input', EventHandlers.onQualityChange);

    // 加载设置
    await settingsManager.loadSettings();

    // 初始化完成
    console.log(`[智能媒体助手] 初始化完成! 作者: kencuo`);
    console.log(`[智能媒体助手] GitHub: https://github.com/kencuo/chajian`);
  } catch (initError) {
    console.error('[智能媒体助手] 初始化失败:', initError);
  }
});
