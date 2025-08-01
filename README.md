# chajian#
🌉 Visual Bridge - 视觉桥接插件

## 📖 功能简介

Visual Bridge 是一个为 SillyTavern 设计的视觉媒体处理插件，专门用于桥接外部应用与 SillyTavern 的图片处理功能。插件提供了图片上传、压缩、格式转换等核心功能，让外部网页应用能够无缝调用 SillyTavern 的媒体处理能力，实现高效的图片识别和AI对话集成。

## 🔧 核心原理

### 技术架构
插件采用**函数暴露模式**，通过在全局 `window` 对象上注册特定函数，让外部应用能够直接调用 SillyTavern 的内部功能：

```javascript
// 核心暴露函数
window.VisualBridgeUpload = async function(file, options) {
    // 1. 文件验证和预处理
    // 2. 调用 SillyTavern 内置的 saveBase64AsFile
    // 3. 返回本地文件路径供AI模型访问
}
```

### 工作流程
1. **外部调用** → 网页应用调用 `window.VisualBridgeUpload()`
2. **文件处理** → 插件验证、压缩、转换图片格式
3. **本地保存** → 利用 SillyTavern 的 `utils.js` 保存到本地
4. **路径返回** → 返回可访问的本地文件 URL
5. **AI识图** → 外部应用使用返回的 URL 进行识图

### 关键技术点
- **模块导入**：从 SillyTavern 核心模块导入 `getBase64Async`、`saveBase64AsFile` 等工具函数
- **上下文获取**：通过 `getContext()` 获取当前角色信息，实现按角色分类存储
- **Canvas压缩**：内置图片压缩算法，优化存储空间和传输效率
- **错误回退**：多层错误处理机制，确保功能稳定性

## 🎯 适用场景

- **AI识图应用**：为网页端AI识图功能提供图片上传支持
- **聊天增强**：增强SillyTavern的媒体处理能力
- **第三方集成**：让外部工具能够利用SillyTavern的文件管理系统
- **开发调试**：为开发者提供便捷的媒体文件测试环境

## 💡 设计理念

插件遵循**最小侵入原则**，不修改 SillyTavern 核心代码，仅通过标准的插件接口暴露必要功能。同时采用**渐进增强策略**，即使插件未安装，外部应用也能通过检测函数存在性来优雅降级到备用方案。

---

**作者**:  ctrl 
**项目地址**: https://github.com/kencuo/chajian  
**许可证**: MIT License
