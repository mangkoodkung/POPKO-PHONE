/**
 *  不知道能不能发送文件啊，试试吧- SillyTavern Extension
 * 作者: kencuo
 * 版本: 1.0.0
 * GitHub: https://github.com/kencuo/chajian
 */

// 导入SillyTavern核心模块
import { saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getBase64Async, saveBase64AsFile } from '../../../utils.js';

// 插件元数据
const PLUGIN_ID = 'visual-bridge-kencuo';
const MODULE_NAME = 'third-party-image-processor';
const UPDATE_INTERVAL = 1000;
const PLUGIN_VERSION = '1.0.0';
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

  // 文档处理设置
  enableDocumentProcessing: true, // 启用文档处理功能
  documentFormats: [
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json',
    'text/markdown',
    'text/csv',
    'application/rtf',
    'text/html',
    'text/xml',
    'application/xml',
  ],
  documentMaxSize: 50 * 1024 * 1024, // 文档最大50MB
  enableAIReading: true, // 启用AI阅读功能
  documentStoragePath: 'user/documents',
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
 * 文件验证器 - 支持图像和文档
 */
class FileValidator {
  static validate(file, fileType = 'image') {
    if (!file || typeof file !== 'object') {
      throw new Error('无效的文件对象');
    }

    if (fileType === 'image') {
      if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('仅支持图像文件');
      }

      if (!pluginConfig.formatSupport.includes(file.type)) {
        throw new Error(`不支持的格式: ${file.type}`);
      }
    } else if (fileType === 'document') {
      const supportedDocs = [
        'text/plain',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/json',
        'text/markdown',
      ];

      if (!supportedDocs.includes(file.type)) {
        throw new Error(`不支持的文档格式: ${file.type}`);
      }
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
 * 文档处理器
 */
class DocumentProcessor {
  constructor() {
    this.supportedTypes = pluginConfig.documentFormats || [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
  }

  async processDocument(file) {
    // 验证文件
    FileValidator.validate(file, 'document');

    let content = '';

    switch (file.type) {
      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
      case 'text/html':
      case 'text/xml':
      case 'application/xml':
      case 'application/rtf':
        content = await this.readTextFile(file);
        break;
      case 'application/pdf':
        content = await this.readPDFFile(file);
        break;
      case 'application/json':
        content = await this.readJSONFile(file);
        break;
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        content = await this.readWordFile(file);
        break;
      default:
        throw new Error(`暂不支持的文档类型: ${file.type}`);
    }

    return {
      content,
      type: file.type,
      name: file.name,
      size: file.size,
      timestamp: new Date().toISOString(),
    };
  }

  async readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  }

  async readJSONFile(file) {
    const text = await this.readTextFile(file);
    try {
      const json = JSON.parse(text);
      return JSON.stringify(json, null, 2);
    } catch (error) {
      return text; // 如果不是有效JSON，返回原文本
    }
  }

  async readPDFFile(file) {
    // 注意：这里需要PDF.js库来解析PDF
    // 简化版本，实际使用时需要引入PDF.js
    throw new Error('PDF处理需要额外的库支持，请使用SillyTavern的Data Bank功能');
  }

  async readWordFile(file) {
    // Word文档处理
    // 对于.doc和.docx文件，我们尝试基础的文本提取
    try {
      // 首先尝试作为文本文件读取（可能包含一些格式字符）
      const rawContent = await this.readTextFile(file);

      // 简单的文本清理，移除一些常见的Word格式字符
      let cleanContent = rawContent
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // 移除控制字符
        .replace(/\r\n/g, '\n') // 统一换行符
        .replace(/\n{3,}/g, '\n\n') // 合并多余的空行
        .trim();

      // 如果内容看起来像是二进制数据（包含太多不可打印字符），提供提示
      const printableChars = cleanContent.replace(/[^\x20-\x7E\n\t]/g, '').length;
      const totalChars = cleanContent.length;

      if (totalChars > 0 && printableChars / totalChars < 0.7) {
        return `[Word文档] ${file.name}

注意：这是一个Word文档文件，当前只能进行基础的文本提取。
文件大小：${(file.size / 1024).toFixed(2)} KB

建议：
1. 将Word文档另存为.txt格式后重新上传，以获得更好的文本提取效果
2. 或者复制文档内容，使用"文字描述"模式发送
3. 使用SillyTavern的Data Bank功能来处理复杂的Word文档

提取的部分内容：
${cleanContent.substring(0, 500)}${cleanContent.length > 500 ? '...' : ''}`;
      }

      return cleanContent || `[Word文档] ${file.name}\n\n文档内容无法直接提取，建议转换为文本格式后重新上传。`;
    } catch (error) {
      return `[Word文档] ${file.name}\n\n无法读取Word文档内容。建议：\n1. 将文档另存为.txt格式\n2. 或复制内容使用文字描述模式\n\n错误信息：${error.message}`;
    }
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

  static generateDocumentPath(characterName, mode = 'hybrid') {
    const now = new Date();
    const basePath = pluginConfig.documentStoragePath || 'user/documents';

    switch (mode) {
      case 'chronological':
        return `${basePath}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

      case 'character':
        return `${basePath}/${characterName || 'unknown'}`;

      case 'hybrid':
      default:
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${basePath}/${characterName || 'default'}/${now.getFullYear()}-${month}`;
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
 * SillyTavern AI接口封装
 */
async function callSillyTavernAI(prompt, context = {}) {
  try {
    // 获取SillyTavern的AI生成函数
    const AI_GENERATE =
      typeof generate === 'function'
        ? generate
        : window.parent && window.parent.generate
        ? window.parent.generate
        : top && top.generate
        ? top.generate
        : null;

    // 获取generateRaw函数（用于直接生成回复）
    const AI_GENERATE_RAW =
      typeof generateRaw === 'function'
        ? generateRaw
        : window.parent && window.parent.generateRaw
        ? window.parent.generateRaw
        : top && top.generateRaw
        ? top.generateRaw
        : null;

    if (!AI_GENERATE && !AI_GENERATE_RAW) {
      throw new Error('SillyTavern AI接口不可用');
    }

    // 构建完整的分析提示
    let fullPrompt = prompt;
    if (context.documentContent) {
      fullPrompt += `\n\n文档内容：\n${context.documentContent}`;
    }
    if (context.fileName) {
      fullPrompt += `\n\n文件名：${context.fileName}`;
    }

    console.log('[SillyTavern AI] 发送文档分析请求...');

    // 优先使用generateRaw，它更适合直接生成回复
    if (AI_GENERATE_RAW) {
      const result = await AI_GENERATE_RAW(fullPrompt, false, false, '', '');
      if (result && typeof result === 'string') {
        return result;
      }
    }

    // 备用方案：使用generate函数
    if (AI_GENERATE) {
      const requestData = {
        prompt: fullPrompt,
        use_default_jailbreak: false,
        force_name2: true,
        quiet_prompt: true,
        quiet_image: true,
        skip_examples: false,
        top_a: 0,
        rep_pen: 1.1,
        rep_pen_range: 1024,
        rep_pen_slope: 0.9,
        temperature: 0.7,
        tfs: 1,
        top_k: 0,
        top_p: 0.9,
        typical: 1,
        sampler_order: [6, 0, 1, 3, 4, 2, 5],
        singleline: false,
      };

      const result = await AI_GENERATE('', requestData);
      if (result && typeof result === 'string') {
        return result;
      } else if (result && result.content) {
        return result.content;
      }
    }

    throw new Error('AI返回格式异常');
  } catch (error) {
    console.error('[SillyTavern AI] 调用失败:', error);
    throw error;
  }
}

/**
 * 发送AI分析结果到聊天
 */
async function sendAnalysisToChat(analysisResult, fileName, context) {
  try {
    // 获取SillyTavern的聊天函数
    const addOneMessage =
      typeof window.addOneMessage === 'function'
        ? window.addOneMessage
        : window.parent && typeof window.parent.addOneMessage === 'function'
        ? window.parent.addOneMessage
        : top && typeof top.addOneMessage === 'function'
        ? top.addOneMessage
        : null;

    const sendSystemMessage =
      typeof window.sendSystemMessage === 'function'
        ? window.sendSystemMessage
        : window.parent && typeof window.parent.sendSystemMessage === 'function'
        ? window.parent.sendSystemMessage
        : top && typeof top.sendSystemMessage === 'function'
        ? top.sendSystemMessage
        : null;

    if (addOneMessage) {
      // 构建消息内容
      const messageContent = `📄 **文档分析结果** (${fileName})\n\n${analysisResult}`;

      // 添加助手消息到聊天
      await addOneMessage({
        name: context.characterName || 'Assistant',
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: messageContent,
        extra: {
          type: 'document_analysis',
          file_name: fileName,
          processed_by: 'smart_media_assistant',
        },
      });

      console.log('[Chat Integration] AI分析结果已发送到聊天');
    } else if (sendSystemMessage) {
      // 备用方案：发送系统消息
      await sendSystemMessage('system', `📄 文档分析完成：${fileName}\n\n${analysisResult}`);
      console.log('[Chat Integration] AI分析结果已作为系统消息发送');
    } else {
      console.warn('[Chat Integration] 无法找到聊天发送函数');
    }
  } catch (error) {
    console.error('[Chat Integration] 发送分析结果失败:', error);
  }
}

/**
 * 发送原始文档内容到聊天
 */
async function sendDocumentToChat(content, fileName, context) {
  try {
    const addOneMessage =
      typeof window.addOneMessage === 'function'
        ? window.addOneMessage
        : window.parent && typeof window.parent.addOneMessage === 'function'
        ? window.parent.addOneMessage
        : top && typeof top.addOneMessage === 'function'
        ? top.addOneMessage
        : null;

    if (addOneMessage) {
      // 限制内容长度，避免聊天界面过于拥挤
      const maxLength = 2000;
      const truncatedContent =
        content.length > maxLength ? content.substring(0, maxLength) + '\n\n...(内容已截断)' : content;

      const messageContent = `📄 **文档内容** (${fileName})\n\n${truncatedContent}`;

      await addOneMessage({
        name: 'User',
        is_user: true,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: messageContent,
        extra: {
          type: 'document_upload',
          file_name: fileName,
          processed_by: 'smart_media_assistant',
        },
      });

      console.log('[Chat Integration] 文档内容已发送到聊天');
    }
  } catch (error) {
    console.error('[Chat Integration] 发送文档内容失败:', error);
  }
}

/**
 * 外部接口 - 文档处理入口
 */
window.__processDocumentByPlugin = async function (documentFile, options = {}) {
  try {
    if (!documentFile) {
      throw new Error('请提供文档文件');
    }

    if (!pluginConfig.enableDocumentProcessing) {
      throw new Error('文档处理功能已禁用');
    }

    // 显示处理信息
    if (pluginConfig.showProcessingInfo) {
      toastr.info('正在处理文档...', '文档处理');
    }

    const processor = new DocumentProcessor();
    const result = await processor.processDocument(documentFile);

    // 获取上下文信息
    const context = await ContextProvider.getCurrentContext();

    // 如果启用AI阅读，调用SillyTavern的AI功能
    if (pluginConfig.enableAIReading && options.enableAIReading !== false) {
      try {
        // 构建AI阅读提示
        const aiPrompt = options.aiPrompt || `请阅读并总结以下文档内容，提供详细的分析和见解：`;

        // 调用SillyTavern的AI生成功能
        const aiResult = await callSillyTavernAI(aiPrompt, {
          documentContent: result.content,
          fileName: documentFile.name,
          fileType: result.type,
        });

        if (aiResult) {
          result.aiAnalysis = aiResult;
          console.log('[Document Processor] AI阅读完成');

          // 如果启用自动发送到聊天，将AI分析结果发送到聊天中
          if (options.sendToChat !== false) {
            await sendAnalysisToChat(aiResult, documentFile.name, context);
          }
        }
      } catch (aiError) {
        console.warn('[Document Processor] AI阅读失败:', aiError);
        // 即使AI分析失败，也可以将原始内容发送到聊天
        if (options.sendToChat !== false && options.sendRawContent) {
          await sendDocumentToChat(result.content, documentFile.name, context);
        }
      }
    } else if (options.sendToChat !== false && options.sendRawContent) {
      // 如果没有启用AI阅读但要求发送原始内容到聊天
      await sendDocumentToChat(result.content, documentFile.name, context);
    }

    // 显示成功信息
    if (pluginConfig.showProcessingInfo) {
      toastr.success(`文档处理完成！类型: ${result.type}`, '处理成功');
    }

    console.log('[Document Processor] 处理完成:', {
      文件: documentFile.name,
      类型: result.type,
      大小: `${documentFile.size} bytes`,
      内容长度: `${result.content.length} chars`,
    });

    return {
      success: true,
      content: result.content,
      metadata: {
        originalName: documentFile.name,
        type: result.type,
        size: documentFile.size,
        contentLength: result.content.length,
        character: context.characterName,
        timestamp: result.timestamp,
      },
    };
  } catch (error) {
    console.error('[Document Processor] 处理失败:', error.message);

    if (pluginConfig.showProcessingInfo) {
      toastr.error(error.message, '处理失败');
    }

    throw new Error(`文档处理失败: ${error.message}`);
  }
};

/**
 * 外部接口 - 通用文件处理入口（自动识别文件类型）
 */
window.__processFileByPlugin = async function (file, options = {}) {
  try {
    if (!file) {
      throw new Error('请提供文件');
    }

    // 自动识别文件类型
    if (file.type.startsWith('image/')) {
      return await window.__uploadImageByPlugin(file, options);
    } else if (pluginConfig.documentFormats.includes(file.type)) {
      return await window.__processDocumentByPlugin(file, options);
    } else {
      throw new Error(`不支持的文件类型: ${file.type}`);
    }
  } catch (error) {
    console.error('[File Processor] 处理失败:', error.message);
    throw error;
  }
};

/**
 * 外部接口 - 获取SillyTavern AI生成函数
 */
window.__getSillyTavernAI = function () {
  const AI_GENERATE =
    typeof generate === 'function'
      ? generate
      : window.parent && window.parent.generate
      ? window.parent.generate
      : top && top.generate
      ? top.generate
      : null;

  return {
    generate: AI_GENERATE,
    available: !!AI_GENERATE,
    callAI: callSillyTavernAI,
  };
};

/**
 * 外部接口 - 直接调用SillyTavern AI
 */
window.__callSillyTavernAI = callSillyTavernAI;

/**
 * 外部接口 - 获取支持的文件类型
 */
window.__getSupportedFileTypes = function () {
  return {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
    documents: pluginConfig.documentFormats || [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/html',
      'text/xml',
      'application/xml',
      'application/json',
      'application/rtf',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    all: function () {
      return [...this.images, ...this.documents];
    },
  };
};

/**
 * 外部接口 - 检查文件类型是否支持
 */
window.__isFileTypeSupported = function (fileType) {
  const supportedTypes = window.__getSupportedFileTypes();
  return supportedTypes.all().includes(fileType);
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
 * 添加折叠样式
 */
function addCollapsibleStyles() {
  const styleId = 'third-party-image-processor-collapsible-styles';
  if (document.getElementById(styleId)) return; // 避免重复添加

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ctrl的插件（bug大杂烩) */
    .third-party-image-processor-settings {
      margin-bottom: 20px;
    }

    .extension-collapsible {
      border: 1px solid #ccc;
      border-radius: 4px;
      margin-bottom: 15px;
      overflow: hidden;
      background: #f9f9f9;
      box-shadow: none;
    }

    .extension-header {
      background: #e9ecef;
      color: #495057;
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: normal;
      font-size: 14px;
      transition: background-color 0.2s ease;
      user-select: none;
      list-style: none;
      border-bottom: 1px solid #dee2e6;
    }

    .extension-header:hover {
      background: #dee2e6;
      transform: none;
      box-shadow: none;
    }

    .extension-header::-webkit-details-marker {
      display: none;
    }

    .extension-icon {
      font-size: 14px;
    }

    .extension-title {
      flex: 1;
      font-weight: 600;
    }

    .extension-version {
      background: #6c757d;
      color: white;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: normal;
    }

    .collapse-indicator {
      font-size: 10px;
      transition: transform 0.2s ease;
      color: #6c757d;
    }

    .extension-collapsible[open] .collapse-indicator {
      transform: rotate(180deg);
    }

    .extension-content {
      padding: 15px;
      background: #fff;
      border-top: none;
    }

    .setting-group {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 3px;
      padding: 12px;
      margin-bottom: 10px;
    }

    .setting-group h4 {
      margin: 0 0 8px 0;
      color: #495057;
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid #dee2e6;
      padding-bottom: 5px;
    }

    .setting-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: #6c757d;
    }

    .setting-group input[type="checkbox"] {
      margin-right: 6px;
    }

    .setting-group select,
    .setting-group input[type="number"],
    .setting-group input[type="range"] {
      width: 100%;
      padding: 4px 8px;
      border: 1px solid #ced4da;
      border-radius: 3px;
      font-size: 12px;
      background: white;
    }

    /* 响应式设计 */
    @media (max-width: 768px) {
      .extension-header {
        padding: 12px 15px;
        font-size: 14px;
      }

      .extension-content {
        padding: 15px;
      }

      .setting-group {
        padding: 12px;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * 创建设置界面
 */
function createSettingsHtml() {
  const simpleModeChecked = pluginConfig.simpleMode ? 'checked' : '';
  const smartModeSelected = pluginConfig.processingMode === 'smart' ? 'selected' : '';
  const directModeSelected = pluginConfig.processingMode === 'direct' ? 'selected' : '';
  const compressModeSelected = pluginConfig.processingMode === 'compress' ? 'selected' : '';
  const adaptiveModeSelected = pluginConfig.compressionMode === 'adaptive' ? 'selected' : '';
  const qualityModeSelected = pluginConfig.compressionMode === 'quality' ? 'selected' : '';
  const sizeModeSelected = pluginConfig.compressionMode === 'size' ? 'selected' : '';
  const maxFileSizeMB = Math.round(pluginConfig.maxFileSize / 1024 / 1024);
  const qualityPercent = Math.round(pluginConfig.quality * 100);
  const enableWebPChecked = pluginConfig.enableWebP ? 'checked' : '';
  const autoOptimizeChecked = pluginConfig.autoOptimize ? 'checked' : '';
  const showProcessingInfoChecked = pluginConfig.showProcessingInfo ? 'checked' : '';
  const enableLoggingChecked = pluginConfig.enableLogging ? 'checked' : '';

  return `
    <div class="third-party-image-processor-settings">
        <details class="extension-collapsible" open>
            <summary class="extension-header">
                <span class="extension-icon">🖼️</span>
                <span class="extension-title">ctrl的插件（bug大杂烩）</span>
                <span class="extension-version">v${PLUGIN_VERSION}</span>
                <span class="collapse-indicator">▼</span>
            </summary>
            <div class="extension-content">
                <div class="setting-group">
                    <h4>📋 运行模式</h4>
                    <label>
                        <input type="checkbox" id="simpleMode" ${simpleModeChecked}> 启用简单上传模式
                    </label>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        <strong>默认模式</strong>：使用原有的Visual Bridge智能处理（推荐）<br>
                        <strong>简单模式</strong>：基础上传功能，无额外处理<br>
                        注意：默认情况下使用原有的上传方式，无需更改设置
                    </div>
                </div>

                <div class="setting-group" id="advancedSettings">
                    <h4>🔧 处理模式</h4>
                    <label>
                        处理方式:
                        <select id="processingMode">
                            <option value="smart" ${smartModeSelected}>智能模式（默认原有方式）</option>
                            <option value="direct" ${directModeSelected}>直接保存（无处理）</option>
                            <option value="compress" ${compressModeSelected}>高级压缩处理</option>
                        </select>
                    </label>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        智能模式：使用原有的Visual Bridge处理方式（推荐）<br>
                        直接保存：保持原始图像不变<br>
                        高级压缩：使用新的压缩算法优化图像
                    </div>
                </div>

                <div class="setting-group" id="compressionSettings">
                    <h4>⚙️ 压缩设置</h4>
                    <label>
                        最大宽度: <input type="number" id="maxWidth" min="100" max="4096" value="${pluginConfig.maxWidth}">
                    </label>
                    <label>
                        最大高度: <input type="number" id="maxHeight" min="100" max="4096" value="${pluginConfig.maxHeight}">
                    </label>
                    <label>
                        图像质量: <input type="range" id="quality" min="0.1" max="1" step="0.05" value="${pluginConfig.quality}">
                        <span id="qualityValue">${qualityPercent}%</span>
                    </label>
                    <label>
                        压缩模式:
                        <select id="compressionMode">
                            <option value="adaptive" ${adaptiveModeSelected}>自适应</option>
                            <option value="quality" ${qualityModeSelected}>保持质量</option>
                            <option value="size" ${sizeModeSelected}>压缩优先</option>
                        </select>
                    </label>
                </div>

                <div class="setting-group" id="fileSettings">
                    <h4>📁 文件限制</h4>
                    <label>
                        最大文件大小 (MB): <input type="number" id="maxFileSize" min="1" max="100" value="${maxFileSizeMB}">
                    </label>
                </div>

                <div class="setting-group" id="advancedOptions">
                    <h4>🔬 高级选项</h4>
                    <label>
                        <input type="checkbox" id="enableWebP" ${enableWebPChecked}> 启用WebP格式
                    </label>
                    <label>
                        <input type="checkbox" id="autoOptimize" ${autoOptimizeChecked}> 自动优化
                    </label>
                    <label>
                        <input type="checkbox" id="showProcessingInfo" ${showProcessingInfoChecked}> 显示处理信息
                    </label>
                    <label>
                        <input type="checkbox" id="enableLogging" ${enableLoggingChecked}> 启用调试日志
                    </label>
                </div>
            </div>
        </details>
    </div>`;
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
 * 绑定折叠功能事件
 */
function bindCollapsibleEvents() {
  // 保存折叠状态到localStorage
  const saveCollapsedState = isOpen => {
    localStorage.setItem('third-party-image-processor-collapsed', !isOpen);
  };

  // 加载折叠状态
  const loadCollapsedState = () => {
    const collapsed = localStorage.getItem('third-party-image-processor-collapsed');
    return collapsed === 'true';
  };

  // 应用保存的折叠状态
  const details = $('.extension-collapsible')[0];
  if (details && loadCollapsedState()) {
    details.removeAttribute('open');
  }

  // 监听折叠状态变化
  $('.extension-collapsible').on('toggle', function () {
    const isOpen = this.hasAttribute('open');
    saveCollapsedState(isOpen);

    // 添加动画效果
    const indicator = $(this).find('.collapse-indicator');
    if (isOpen) {
      indicator.css('transform', 'rotate(180deg)');
    } else {
      indicator.css('transform', 'rotate(0deg)');
    }
  });

  // 添加点击动画效果
  $('.extension-header')
    .on('mousedown', function () {
      $(this).css('transform', 'translateY(0px)');
    })
    .on('mouseup mouseleave', function () {
      $(this).css('transform', 'translateY(-1px)');
    });

  console.log('[Visual Bridge] 折叠功能已启用');
}

/**
 * 插件启动
 */
jQuery(async () => {
  try {
    console.log(`[Visual Bridge] 启动中... v${PLUGIN_VERSION} by ${PLUGIN_AUTHOR}`);

    // 加载设置
    loadSettings();

    // 添加折叠样式
    addCollapsibleStyles();

    // 创建设置界面
    const settingsHtml = createSettingsHtml();
    $('#extensions_settings').append(settingsHtml);

    // 绑定事件
    $('#vb-enabled').on('change', EventManager.onToggleActive);
    $('#vb-optimization-mode').on('change', EventManager.onModeChange);
    $('#vb-quality').on('input', EventManager.onQualityChange);

    // 绑定新增的设置事件
    bindSettingsEvents();

    // 绑定折叠功能
    bindCollapsibleEvents();

    // 初始化
    await ConfigManager.loadConfig();
    await visualBridge.initialize();

    // 注册事件监听器
    eventSource.on(event_types.SETTINGS_LOADED, loadSettings);

    console.log('[Visual Bridge] 启动完成!');
    console.log('[Visual Bridge] GitHub: https://github.com/kencuo/chajian');

    // 显示初始化成功消息
    if (pluginConfig.showProcessingInfo) {
      const modeText = pluginConfig.simpleMode ? '简单上传模式' : '完整图像处理模式';
      toastr.success(`智能图像处理插件已启用 (${modeText})`, '插件加载');
    }
  } catch (error) {
    console.error('[Visual Bridge] 启动失败:', error);
  }
});
