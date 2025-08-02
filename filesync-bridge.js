<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>插件折叠功能测试</title>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background: #f5f5f5;
      }

      .container {
        background: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
      }

      /* 模拟SillyTavern的扩展设置区域 */
      #extensions_settings {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #ddd;
      }

      .test-info {
        background: #e3f2fd;
        border: 1px solid #2196f3;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 20px;
        color: #1976d2;
      }

      .success {
        background: #e8f5e8;
        border-color: #4caf50;
        color: #2e7d32;
      }

      button {
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        margin: 5px;
      }

      button:hover {
        background: #0056b3;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🖼️ 插件折叠功能测试</h1>

      <div class="test-info">
        <h3>📋 测试说明</h3>
        <p>这个页面模拟了SillyTavern的扩展设置环境，用于测试智能媒体处理助手的折叠功能。</p>
        <ul>
          <li>点击插件标题栏可以展开/收起设置面板</li>
          <li>折叠状态会自动保存到localStorage</li>
          <li>刷新页面后会保持上次的折叠状态</li>
          <li>低调的原生风格，与SillyTavern完美融合</li>
        </ul>
      </div>

      <div class="container">
        <h2>🔧 模拟SillyTavern扩展设置区域</h2>
        <div id="extensions_settings">
          <!-- 插件设置界面将在这里动态生成 -->
          <p style="color: #666; text-align: center; padding: 20px">正在加载插件设置界面...</p>
        </div>
      </div>

      <div class="container">
        <h2>🧪 功能测试</h2>
        <button onclick="testCollapse()">测试折叠功能</button>
        <button onclick="testSaveState()">测试状态保存</button>
        <button onclick="clearSavedState()">清除保存状态</button>
        <button onclick="reloadPlugin()">重新加载插件</button>

        <div
          id="testResults"
          style="
            margin-top: 15px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
          "
        ></div>
      </div>
    </div>

    <script>
      // 模拟SillyTavern环境
      window.extension_settings = window.extension_settings || {};

      // 模拟toastr通知
      window.toastr = {
        success: (message, title) => console.log(`✅ ${title}: ${message}`),
        info: (message, title) => console.log(`ℹ️ ${title}: ${message}`),
        warning: (message, title) => console.log(`⚠️ ${title}: ${message}`),
        error: (message, title) => console.log(`❌ ${title}: ${message}`),
      };

      // 模拟SillyTavern的保存函数
      window.saveSettingsDebounced = () => {
        console.log('💾 设置已保存');
      };

      // 模拟插件配置
      const PLUGIN_VERSION = '2.1.0';
      const PLUGIN_AUTHOR = 'ctrl';
      const CONFIG_DEFAULTS = {
        simpleMode: false,
        processingMode: 'smart',
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        compressionMode: 'adaptive',
        maxFileSize: 20 * 1024 * 1024,
        enableWebP: true,
        autoOptimize: true,
        showProcessingInfo: false,
        enableLogging: false,
      };

      window.extension_settings['third-party-image-processor'] =
        window.extension_settings['third-party-image-processor'] || {};
      const pluginConfig = window.extension_settings['third-party-image-processor'];

      // 初始化默认配置
      for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
        if (pluginConfig[key] === undefined) {
          pluginConfig[key] = value;
        }
      }

      // 测试函数
      function testCollapse() {
        const details = $('.extension-collapsible')[0];
        if (details) {
          if (details.hasAttribute('open')) {
            details.removeAttribute('open');
            updateTestResults('折叠测试：面板已收起');
          } else {
            details.setAttribute('open', '');
            updateTestResults('折叠测试：面板已展开');
          }
        } else {
          updateTestResults('错误：找不到折叠元素');
        }
      }

      function testSaveState() {
        const details = $('.extension-collapsible')[0];
        if (details) {
          const isOpen = details.hasAttribute('open');
          const savedState = localStorage.getItem('third-party-image-processor-collapsed');
          updateTestResults(`状态测试：
当前状态: ${isOpen ? '展开' : '收起'}
保存状态: ${savedState === 'true' ? '收起' : '展开'}
localStorage值: ${savedState}`);
        }
      }

      function clearSavedState() {
        localStorage.removeItem('third-party-image-processor-collapsed');
        updateTestResults('状态清除：已清除保存的折叠状态');
      }

      function reloadPlugin() {
        $('#extensions_settings')
          .empty()
          .html('<p style="color: #666; text-align: center; padding: 20px;">正在重新加载插件...</p>');

        setTimeout(() => {
          loadPluginInterface();
          updateTestResults('插件重载：插件界面已重新加载');
        }, 500);
      }

      function updateTestResults(message) {
        const results = document.getElementById('testResults');
        const timestamp = new Date().toLocaleTimeString();
        results.textContent += `[${timestamp}] ${message}\n`;
        results.scrollTop = results.scrollHeight;
      }

      // 加载插件界面
      function loadPluginInterface() {
        // 这里直接复制插件的HTML生成逻辑
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

        // 添加样式
        addCollapsibleStyles();

        // 生成HTML
        const settingsHtml = createSettingsHtml();
        $('#extensions_settings').html(settingsHtml);

        // 绑定事件
        bindCollapsibleEvents();

        updateTestResults('插件界面加载完成');
      }

      // 页面加载时初始化
      $(document).ready(function () {
        updateTestResults('页面加载完成，开始初始化插件界面...');
        setTimeout(loadPluginInterface, 100);
      });
    </script>

    <!-- 这里会动态加载插件的样式和HTML生成函数 -->
    <script>
      // 复制插件的样式生成函数
      function addCollapsibleStyles() {
        const styleId = 'third-party-image-processor-collapsible-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
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
                    background: #f8f9fa;
                    color: #495057;
                    padding: 6px 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    font-weight: 500;
                    font-size: 13px;
                    transition: background-color 0.2s ease;
                    user-select: none;
                    list-style: none;
                    border-bottom: 1px solid #dee2e6;
                    min-height: 32px;
                }

                .extension-header:hover {
                    background: #e9ecef;
                    transform: none;
                    box-shadow: none;
                }

                .extension-header::-webkit-details-marker {
                    display: none;
                }

                .extension-icon {
                    font-size: 13px;
                }

                .extension-title {
                    font-weight: 500;
                    text-align: center;
                }

                .extension-version {
                    background: #6c757d;
                    color: white;
                    padding: 1px 5px;
                    border-radius: 2px;
                    font-size: 9px;
                    font-weight: normal;
                    opacity: 0.8;
                }

                .collapse-indicator {
                    font-size: 9px;
                    transition: transform 0.2s ease;
                    color: #6c757d;
                    opacity: 0.7;
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
            `;

        document.head.appendChild(style);
      }

      // 复制插件的HTML生成函数（简化版）
      function createSettingsHtml() {
        const simpleModeChecked = pluginConfig.simpleMode ? 'checked' : '';

        return `
                <div class="third-party-image-processor-settings">
                    <details class="extension-collapsible" open>
                        <summary class="extension-header">
                            <span class="extension-icon">🖼️</span>
                            <span class="extension-title">智能媒体处理助手</span>
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
                                    <strong>简单模式</strong>：基础上传功能，无额外处理
                                </div>
                            </div>
                            
                            <div class="setting-group">
                                <h4>📄 文档处理</h4>
                                <div style="font-size: 13px; color: #333;">
                                    ✅ 支持文本文件 (.txt, .md, .csv)<br>
                                    ✅ 支持JSON文件 (.json)<br>
                                    ⚠️ 支持Word文档 (.doc, .docx)<br>
                                    ✅ 支持HTML/XML文件<br>
                                    🤖 集成AI阅读分析功能
                                </div>
                            </div>
                            
                            <div class="setting-group">
                                <h4>🎯 功能特性</h4>
                                <div style="font-size: 13px; color: #333;">
                                    🖼️ 智能图像处理和压缩<br>
                                    📄 真实文档上传和解析<br>
                                    🤖 AI内容分析（通过SillyTavern内置函数）<br>
                                    💾 自动保存和路径管理<br>
                                    🎨 美观的消息渲染<br>
                                    📱 完美集成同层手机界面
                                </div>
                            </div>
                        </div>
                    </details>
                </div>
            `;
      }

      // 复制插件的折叠事件绑定函数
      function bindCollapsibleEvents() {
        const saveCollapsedState = isOpen => {
          localStorage.setItem('third-party-image-processor-collapsed', !isOpen);
        };

        const loadCollapsedState = () => {
          const collapsed = localStorage.getItem('third-party-image-processor-collapsed');
          return collapsed === 'true';
        };

        const details = $('.extension-collapsible')[0];
        if (details && loadCollapsedState()) {
          details.removeAttribute('open');
        }

        $('.extension-collapsible').on('toggle', function () {
          const isOpen = this.hasAttribute('open');
          saveCollapsedState(isOpen);

          const indicator = $(this).find('.collapse-indicator');
          if (isOpen) {
            indicator.css('transform', 'rotate(180deg)');
          } else {
            indicator.css('transform', 'rotate(0deg)');
          }

          updateTestResults(`折叠状态变化: ${isOpen ? '展开' : '收起'}`);
        });

        $('.extension-header')
          .on('mousedown', function () {
            $(this).css('transform', 'translateY(0px)');
          })
          .on('mouseup mouseleave', function () {
            $(this).css('transform', 'translateY(-1px)');
          });
      }
    </script>
  </body>
</html>
