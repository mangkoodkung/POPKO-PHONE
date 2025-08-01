import {
    getBase64Async,
    getStringHash,
} from "../../../utils.js";

import {
    extension_settings,
    getContext,
    loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

const defaultSettings = { 
    plugin_enabled: true,
    debug_mode: false 
};

const extensionName = "Vision-Bridge";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

window.extension_settings = window.extension_settings || {};
window.extension_settings[extensionName] =
    window.extension_settings[extensionName] || {};
const extensionSettings = window.extension_settings[extensionName];

window.__visionAnalysisByTavern = async function (input, prompt = null) {
    try {
        // 检查插件是否启用
        if (!extension_settings[extensionName]?.plugin_enabled) {
            throw new Error("视觉识图桥接器插件未启用");
        }

        // 验证输入
        if (!input) {
            throw new Error("请提供图片文件或base64数据");
        }

        let imageData;

        // 处理输入数据
        if (typeof input === 'string') {
            imageData = input;
        } else if (input && typeof input === "object" && input.type && input.type.startsWith("image/")) {
            // 使用SillyTavern的工具函数转换文件
            const fileBase64 = await getBase64Async(input);
            imageData = fileBase64;
        } else {
            throw new Error("无效的输入格式，请提供图片文件或base64字符串");
        }

        // 获取SillyTavern上下文
        const ctx = window.SillyTavern.getContext();
        if (!ctx) {
            throw new Error("无法获取SillyTavern上下文");
        }

        // 默认识图提示词
        const defaultPrompt = "请详细描述这张图片的内容，包括图片中的物体、人物、场景、文字、颜色、情感等所有可见的元素。请用客观、详细的语言描述，不要加入主观评价。";
        const visionPrompt = prompt || defaultPrompt;

        // 调试日志
        if (extension_settings[extensionName]?.debug_mode) {
            console.log('🔍 Vision Bridge: 开始识图分析');
            console.log('🔍 Vision Bridge: 提示词:', visionPrompt);
            console.log('🔍 Vision Bridge: 图片数据类型:', typeof imageData);
        }

        // 构建消息格式 - 尝试使用SillyTavern的标准消息格式
        const messageData = {
            name: 'System',
            is_user: false,
            is_system: true,
            send_date: Date.now(),
            mes: visionPrompt,
            extra: {
                image: imageData,
                type: 'vision_analysis'
            }
        };

        // 尝试调用SillyTavern的生成函数
        let response;

        // 方法1: 尝试使用全局的Generate函数
        if (typeof window.Generate === 'function') {
            response = await window.Generate(visionPrompt, {
                image: imageData,
                quiet: true,
                force_name2: true
            });
        }
        // 方法2: 尝试使用generateRaw函数
        else if (typeof window.generateRaw === 'function') {
            response = await window.generateRaw({
                prompt: visionPrompt,
                image: imageData,
                stream: false
            });
        }
        // 方法3: 尝试通过事件系统触发
        else if (window.eventSource) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('识图请求超时'));
                }, 30000);

                window.eventSource.once('generation_ended', (data) => {
                    clearTimeout(timeout);
                    if (data && data.text) {
                        resolve({
                            success: true,
                            result: data.text.trim(),
                            timestamp: Date.now()
                        });
                    } else {
                        reject(new Error('生成结果为空'));
                    }
                });

                // 触发生成事件
                window.eventSource.emit('generation_started', {
                    prompt: visionPrompt,
                    image: imageData
                });
            });
        }
        else {
            throw new Error("没有可用的生成函数");
        }

        // 处理响应
        if (response && typeof response === 'string' && response.trim()) {
            const result = response.trim();
            
            if (extension_settings[extensionName]?.debug_mode) {
                console.log('🔍 Vision Bridge: 识图成功');
                console.log('🔍 Vision Bridge: 结果长度:', result.length);
            }

            return {
                success: true,
                result: result,
                timestamp: Date.now()
            };
        } else {
            throw new Error("SillyTavern返回空结果或无效结果");
        }

    } catch (error) {
        console.error('🔍 Vision Bridge: 识图失败:', error);
        
        return {
            success: false,
            result: '',
            error: error.message || '未知错误',
            timestamp: Date.now()
        };
    }
};

/**
 * 获取插件状态和信息
 */
window.__getVisionBridgeInfo = function() {
    return {
        pluginName: "Vision-Bridge",
        version: "1.0.0",
        enabled: extension_settings[extensionName]?.plugin_enabled || false,
        debugMode: extension_settings[extensionName]?.debug_mode || false,
        hasGenerate: typeof window.Generate === 'function',
        hasGenerateRaw: typeof window.generateRaw === 'function',
        hasEventSource: !!window.eventSource,
        contextAvailable: !!(window.SillyTavern?.getContext?.())
    };
};

// 设置管理函数
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    $("#vision_bridge_enable_switch").prop(
        "checked",
        extension_settings[extensionName].plugin_enabled
    );

    $("#vision_bridge_debug_switch").prop(
        "checked",
        extension_settings[extensionName].debug_mode
    );

    $("#vision_bridge_test_btn").prop(
        "disabled",
        !extension_settings[extensionName].plugin_enabled
    );
}

function onDebugModeSwitch(event) {
    const enabled = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].debug_mode = enabled;
    saveSettingsDebounced();

    if (enabled) {
        toastr.info("调试模式已开启，将在控制台显示详细日志", "视觉识图桥接器");
    } else {
        toastr.info("调试模式已关闭", "视觉识图桥接器");
    }
}

function onTestButtonClick() {
    const info = window.__getVisionBridgeInfo();
    const statusText = `
插件状态: ${info.enabled ? '已启用' : '已禁用'}
调试模式: ${info.debugMode ? '开启' : '关闭'}
Generate函数: ${info.hasGenerate ? '可用' : '不可用'}
generateRaw函数: ${info.hasGenerateRaw ? '可用' : '不可用'}
事件系统: ${info.hasEventSource ? '可用' : '不可用'}
SillyTavern上下文: ${info.contextAvailable ? '可用' : '不可用'}
    `.trim();

    toastr.info(statusText, "视觉识图桥接器状态");
}

let pluginEnableSwitchInitialized = false;

function onPluginEnableSwitch(event) {
    const enabled = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].plugin_enabled = enabled;
    saveSettingsDebounced?.();

    $("#vision_bridge_test_btn").prop("disabled", !enabled);
    $("#vision_bridge_debug_switch").prop("disabled", !enabled);

    if (pluginEnableSwitchInitialized) {
        if (enabled) {
            toastr.success("视觉识图桥接功能已开启", "视觉识图桥接器");
        } else {
            toastr.warning("视觉识图桥接功能已关闭", "视觉识图桥接器");
        }
    }
    pluginEnableSwitchInitialized = true;
}

jQuery(async () => {
    // 创建设置界面HTML
    const settingsHtml = `
        <div class="vision-bridge-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>视觉识图桥接器</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="flex-container">
                        <label for="vision_bridge_enable_switch">启用插件</label>
                        <input id="vision_bridge_enable_switch" type="checkbox" />
                    </div>
                    <div class="flex-container">
                        <label for="vision_bridge_debug_switch">调试模式</label>
                        <input id="vision_bridge_debug_switch" type="checkbox" />
                    </div>
                    <div class="flex-container">
                        <button id="vision_bridge_test_btn" class="menu_button">测试插件状态</button>
                    </div>
                    <small>为外部应用提供SillyTavern内置视觉识图功能</small>
                </div>
            </div>
        </div>
    `;

    // 将设置添加到扩展面板
    $("#extensions_settings").append(settingsHtml);

    // 绑定事件
    $("#vision_bridge_enable_switch").on("input", onPluginEnableSwitch);
    $("#vision_bridge_debug_switch").on("input", onDebugModeSwitch);
    $("#vision_bridge_test_btn").on("click", onTestButtonClick);

    // 加载设置
    loadSettings();

    // 插件加载完成提示
    console.log('🔍 Vision Bridge: 插件已加载');
});
