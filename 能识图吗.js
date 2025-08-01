import { getBase64Async } from "../../../utils.js";
import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";


const PLUGIN_ID = "SmartVisionBridge";
const CONFIG_KEY = `${PLUGIN_ID}_config`;

// 配置管理器
class VisionConfig {
    constructor() {
        this.settings = extension_settings[CONFIG_KEY] || this.getDefaults();
        extension_settings[CONFIG_KEY] = this.settings;
    }

    getDefaults() {
        return {
            active: true,
            verboseLogging: false,
            analysisTimeout: 30000
        };
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        extension_settings[CONFIG_KEY] = this.settings;
        saveSettingsDebounced();
    }

    isActive() {
        return this.get('active');
    }
}

// 图像处理器
class ImageProcessor {
    static async processInput(input) {
        if (!input) throw new Error("图像输入不能为空");

        if (typeof input === 'string') {
            return this.validateBase64(input);
        }
        
        if (this.isImageFile(input)) {
            return await getBase64Async(input);
        }
        
        throw new Error("不支持的图像格式");
    }

    static isImageFile(file) {
        return file && file.type && file.type.startsWith('image/');
    }

    static validateBase64(data) {
        if (!data.includes('data:image/')) {
            throw new Error("无效的base64图像数据");
        }
        return data;
    }
}

// 分析引擎
class AnalysisEngine {
    constructor(config) {
        this.config = config;
        this.logger = new Logger(config);
    }

    async analyze(imageData, instruction) {
        this.logger.debug("启动图像分析", { instruction, dataLength: imageData.length });

        const prompt = instruction || "请对这张图像进行全面的视觉分析和描述。";
        
        try {
            const result = await this.callTavernAPI(prompt, imageData);
            this.logger.debug("分析完成", { resultLength: result.length });
            return this.formatSuccess(result);
        } catch (error) {
            this.logger.error("分析失败", error);
            return this.formatError(error);
        }
    }

    async callTavernAPI(prompt, imageData) {
        // 智能API选择策略
        const apiMethods = [
            () => this.tryGenerateRaw(prompt, imageData),
            () => this.tryGenerate(prompt, imageData),
            () => this.tryFallbackMethod(prompt, imageData)
        ];

        for (const method of apiMethods) {
            try {
                const result = await method();
                if (result && result.trim()) {
                    return result.trim();
                }
            } catch (error) {
                this.logger.debug("API方法失败，尝试下一个", error.message);
                continue;
            }
        }

        throw new Error("所有API调用方法都失败了");
    }

    async tryGenerateRaw(prompt, imageData) {
        if (!window.generateRaw) throw new Error("generateRaw不可用");
        
        return await window.generateRaw({
            prompt: prompt,
            image: imageData,
            stream: false,
            timeout: this.config.get('analysisTimeout')
        });
    }

    async tryGenerate(prompt, imageData) {
        if (!window.Generate) throw new Error("Generate不可用");
        
        return await window.Generate(prompt, { 
            image: imageData,
            quiet: true
        });
    }

    async tryFallbackMethod(prompt, imageData) {
        // 备用方法：通过事件系统
        if (!window.eventSource) throw new Error("事件系统不可用");
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("分析超时"));
            }, this.config.get('analysisTimeout'));

            window.eventSource.once('analysis_complete', (data) => {
                clearTimeout(timeout);
                resolve(data.result);
            });

            window.eventSource.emit('request_analysis', { prompt, image: imageData });
        });
    }

    formatSuccess(result) {
        return {
            status: 'success',
            data: result,
            timestamp: new Date().toISOString(),
            processingTime: Date.now()
        };
    }

    formatError(error) {
        return {
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString(),
            code: 'ANALYSIS_FAILED'
        };
    }
}

// 日志管理器
class Logger {
    constructor(config) {
        this.config = config;
        this.prefix = "🎯 SmartVision";
    }

    debug(message, data = null) {
        if (this.config.get('verboseLogging')) {
            console.log(`${this.prefix} [DEBUG]:`, message, data || '');
        }
    }

    error(message, error) {
        console.error(`${this.prefix} [ERROR]:`, message, error);
    }

    info(message) {
        console.log(`${this.prefix} [INFO]:`, message);
    }
}

// 系统诊断器
class SystemDiagnostics {
    static getCapabilities() {
        return {
            pluginId: PLUGIN_ID,
            version: "1.0.0",
            buildDate: new Date().toISOString(),
            runtime: {
                generateRaw: this.checkFunction('generateRaw'),
                generate: this.checkFunction('Generate'),
                eventSystem: this.checkObject('eventSource'),
                sillyTavern: this.checkObject('SillyTavern')
            },
            status: this.getOverallStatus()
        };
    }

    static checkFunction(name) {
        return typeof window[name] === 'function';
    }

    static checkObject(name) {
        return !!window[name];
    }

    static getOverallStatus() {
        const hasAnyAPI = this.checkFunction('generateRaw') || 
                         this.checkFunction('Generate') || 
                         this.checkObject('eventSource');
        return hasAnyAPI ? 'operational' : 'degraded';
    }
}

// 主要API - 使用完全不同的命名
const config = new VisionConfig();
const engine = new AnalysisEngine(config);
const logger = new Logger(config);

/**
 * 智能图像分析接口 - 主要暴露函数
 */
window.analyzeImageWithTavern = async function(imageInput, analysisInstruction) {
    if (!config.isActive()) {
        return { status: 'disabled', message: '智能视觉分析器未激活' };
    }

    try {
        const processedImage = await ImageProcessor.processInput(imageInput);
        return await engine.analyze(processedImage, analysisInstruction);
    } catch (error) {
        logger.error("图像分析请求失败", error);
        return { status: 'error', message: error.message };
    }
};

/**
 * 系统状态查询接口
 */
window.getVisionSystemStatus = function() {
    return {
        ...SystemDiagnostics.getCapabilities(),
        configuration: {
            active: config.get('active'),
            verboseLogging: config.get('verboseLogging'),
            timeout: config.get('analysisTimeout')
        }
    };
};

/**
 * 快速验证接口
 */
window.validateVisionSystem = async function() {
    const testPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    
    logger.info("执行系统验证测试");
    const result = await window.analyzeImageWithTavern(testPixel, "描述这个像素的颜色");
    
    if (result.status === 'success') {
        logger.info("系统验证通过");
    } else {
        logger.error("系统验证失败", result);
    }
    
    return result;
};

// UI管理器 - 完全不同的界面设计
class InterfaceManager {
    static initialize() {
        this.createControlPanel();
        this.attachEventHandlers();
        logger.info("控制面板已初始化");
    }

    static createControlPanel() {
        const panelHTML = `
            <div class="smart-vision-panel" style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">🎯 智能视觉分析器</h4>
                
                <div class="control-row" style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                    <span style="min-width: 80px;">系统状态:</span>
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" id="svb-activate" ${config.get('active') ? 'checked' : ''}>
                        <span>激活分析器</span>
                    </label>
                </div>
                
                <div class="control-row" style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                    <span style="min-width: 80px;">调试输出:</span>
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" id="svb-verbose" ${config.get('verboseLogging') ? 'checked' : ''}>
                        <span>详细日志</span>
                    </label>
                </div>
                
                <div class="control-row" style="margin: 8px 0; display: flex; gap: 8px;">
                    <button id="svb-validate" class="btn-validate" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">验证系统</button>
                    <button id="svb-diagnose" class="btn-diagnose" style="padding: 6px 12px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">系统诊断</button>
                </div>
                
                <div style="margin-top: 10px; font-size: 12px; color: #666;">
                    为外部应用提供智能图像分析能力
                </div>
            </div>
        `;
        
        $("#extensions_settings").append(panelHTML);
    }

    static attachEventHandlers() {
        // 激活开关
        $("#svb-activate").on("change", function() {
            config.set('active', this.checked);
            const message = this.checked ? "智能视觉分析器已激活" : "智能视觉分析器已停用";
            toastr.info(message, "系统状态");
        });

        // 详细日志开关
        $("#svb-verbose").on("change", function() {
            config.set('verboseLogging', this.checked);
            const message = this.checked ? "详细日志已开启" : "详细日志已关闭";
            toastr.info(message, "日志设置");
        });

        // 系统验证
        $("#svb-validate").on("click", async function() {
            const $btn = $(this);
            $btn.prop("disabled", true).text("验证中...");
            
            try {
                const result = await window.validateVisionSystem();
                if (result.status === 'success') {
                    toastr.success("系统验证通过！分析器工作正常", "验证结果");
                } else {
                    toastr.error(`验证失败: ${result.message}`, "验证结果");
                }
            } catch (error) {
                toastr.error(`验证异常: ${error.message}`, "验证结果");
            } finally {
                $btn.prop("disabled", false).text("验证系统");
            }
        });

        // 系统诊断
        $("#svb-diagnose").on("click", function() {
            const status = window.getVisionSystemStatus();
            const info = `
版本: ${status.version}
状态: ${status.status}
generateRaw: ${status.runtime.generateRaw ? '✓' : '✗'}
Generate: ${status.runtime.generate ? '✓' : '✗'}
事件系统: ${status.runtime.eventSystem ? '✓' : '✗'}
SillyTavern: ${status.runtime.sillyTavern ? '✓' : '✗'}
            `.trim();
            
            toastr.info(info, "系统诊断", { timeOut: 6000 });
        });
    }
}

// 插件启动
jQuery(function() {
    InterfaceManager.initialize();
    logger.info(`${PLUGIN_ID} 已成功加载`);
    
    // 启动时进行快速状态检查
    if (config.get('verboseLogging')) {
        const status = SystemDiagnostics.getCapabilities();
        logger.debug("启动状态检查", status);
    }
});
