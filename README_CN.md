<p align="center">
<img src="./icons/icon128.png">
</p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/cerebr/kjojanemcpiamhohkcpcddpkbnciojkj">
    <img src="https://img.shields.io/chrome-web-store/v/kjojanemcpiamhohkcpcddpkbnciojkj?color=blue&label=Chrome%20商店&logo=google-chrome&logoColor=white" alt="Chrome Web Store">
</a>
  <a href="https://t.me/uni_api">
    <img src="https://img.shields.io/badge/Join Telegram Group-blue?&logo=telegram">
  </a>
</p>

[English](./README.md) | [简体中文](./README_CN.md)

# 🧠 Cerebr - 智能 AI 助手

![screenshot](./statics/image.png)

Cerebr 是一款面向 Chrome 141+ 的浏览器 AI 助手扩展，专注于提升文章阅读、学习和整理效率。"Cerebr"源自拉丁语词根，与"大脑"或"脑"相关。这个命名体现了我们的愿景：整合 Claude、OpenAI 等 AI 的强大能力，使 Cerebr 成为您的第二大脑，为您提供深度阅读和理解支持。

在尝试了市面上现有的浏览器 AI 助手后，我们发现它们要么有使用次数限制，要么界面过于花哨。Cerebr 应运而生，专注于提供一个简洁、高效、无干扰的 AI 助手体验。

## ✨ 核心特性

- 🎯 **Chrome 原生侧边栏** - 通过快捷键(Windows: `Alt+Z` / Mac: `Ctrl+Z`)打开浏览器原生 Side Panel
- 🔄 **Pi 多 Provider 内核** - 支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Google Generative AI 与自定义兼容端点
- 🧭 **模型目录** - Chrome 扩展可合并 Pi 内置目录、pi.dev 更新、服务商发现与用户自定义模型
- 🔁 **安全配置同步** - 模型与端点等非敏感配置可同步，API Key 与 Header 值仅保存在本机
- 📚 **文章学习操作** - 一键发送自定义学习提示词，并可将完整会话导出为 Markdown
- 📝 **全能问答** - 支持网页内容问答、PDF 文档问答、图片问答等多种场景
- 🎨 **优雅渲染** - 完美支持 Markdown 文本渲染、LaTeX 数学公式显示
- ⚡ **实时响应** - 采用流式输出,即时获取 AI 回复
- ⏹️ **灵活控制** - 支持在生成过程中随时停止，发送新消息自动停止当前生成
- 🌓 **主题切换** - 支持浅色/深色主题,呵护您的眼睛
- 🌐 **网页版** - 支持网页版，无需安装，通过任何浏览器访问，支持 vercel、GitHub Pages 和 cloudflare pages 部署

## 🛠️ 技术特性

- 💾 **状态持久化** - 自动保存对话历史、草稿与阅读进度
- 🔄 **配置同步** - 支持通过 Chrome 同步 API 共享非敏感配置
- 🔍 **智能提取** - 自动识别并提取网页/PDF 内容
- ⌨️ **快捷操作** - 支持快捷键清空聊天(Windows: `Alt+X` / Mac: `Ctrl+X`)、上下键快速调用历史问题
- 🔒 **安全可靠** - 支持多 API Key 管理,数据本地存储
- 🎭 **版本要求** - Chrome 141 或更高版本

## 🎮 使用指南

1. 🔑 **配置 API**
   - 点击设置按钮
   - 选择 Provider 预设或创建自定义 Provider，填写 API Key 与 API 根地址
   - 刷新或手动添加模型，在同一个 Provider 下快速切换

2. 💬 **开始对话**
   - 使用快捷键 Windows: `Alt+Z` / Mac: `Ctrl+Z` 唤出侧边栏
   - 输入问题并发送
   - 支持图片上传进行图像问答

3. 📚 **网页/PDF 问答**
   - 开启网页问答开关
   - 自动识别并提取当前页面内容
   - 支持 PDF 文件智能问答

## 💡 使用技巧

- ↔️ **调整侧边栏宽度** - 拖动侧边栏左侧边界可调整宽度；双击边界可重置为默认宽度
- ⌨️ **发送消息** - `Enter` 发送，`Shift+Enter` 换行，`Esc` 取消输入框焦点
- ⬆️⬇️ **历史问题回溯** - 输入框为空时，按 `↑`/`↓` 可循环切换最近的问题；在最新一条时再按 `↓` 可回到空输入框
- 📋 **消息菜单** - 对消息右键（触屏设备长按）可复制/重新生成/删除；`Esc` 关闭菜单
- 🖼️ **图片预览** - 点击图片预览大图；按 `Esc` 或点击遮罩关闭

## 🔧 高级功能

- 📋 **右键复制** - 支持右键直接复制消息文本
- 🔄 **历史记录** - 使用上下方向键快速调用历史问题
- ⏹️ **停止生成** - 在生成消息时右键显示停止按钮，可随时中断生成
- 🖼️ **图片预览** - 点击图片可查看大图
- ⚙️ **自定义配置** - 支持自定义快捷键、主题等设置

## 🚀 网页版部署

1. 你可以一键将 Cerebr 的 Web 版本部署到 Fugue：

[![Deploy to Fugue](https://api.fugue.pro/button.svg?v=a37d3d9)](https://fugue.pro/new/repository?repository-url=https%3A%2F%2Fgithub.com%2Fyym68686%2Fcerebr)

2. 你可以一键将 Cerebr 的 Web 版本部署到 Vercel：

[![使用 Vercel 部署](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyym68686%2Fcerebr)

3. 你可以部署到 Cloudflare Pages：

2.1 注册好 CF 账号后，申请 Workers API TOKEN。

进入 CF 首页后，右上角选择配置文件 -> 我的个人资料 -> API 令牌 -> 创建令牌 -> 编辑 Cloudflare Workers -> `账户资源`和`区域资源`可以自己选择授予权限 -> 继续以显示摘要 -> 创建令牌 -> 保存令牌（**注意：** 保存好自己的令牌，因为只显示一次）

2.2 回到首页，左侧找到 Workers -> 打开 `Worker 和 Pages` -> 点击`创建` -> `Pages` -> 导入现有 Git 存储库 -> 找到 Fork 的存储库 -> 开始部署

2.3 项目名称写上自己喜欢的名字，在`构建命令`项输入：

`bash scripts/prepare_pages_site.sh pages-site`

2.4 在`构建输出目录`项输入：

`pages-site`

2.5 使用 Git 直连的 Pages 部署时，不需要额外配置环境变量。

2.6 保存并部署。

4. 你也可以部署到 GitHub Pages：

```bash
# Fork 这个仓库
# 然后进入你的仓库的 Settings -> Pages
# 在"构建和部署"部分：
# - 将"Source"选择为"Deploy from a branch"
# - 选择你的分支（main/master）和根目录（/）
# - 点击保存
```

部署将由 GitHub Actions 自动处理。你可以通过 `https://<你的用户名>.github.io/cerebr` 访问你的站点

### Web 版本特点
- 🌐 无需安装，通过任何浏览器访问
- 💻 保留聊天、配置、主题和 Markdown 导出；网页内容提取仅在 Chrome 扩展中可用
- 🧩 Web 版仅使用手动 Provider/模型，不访问 pi.dev，也不自动调用服务商模型列表接口
- ☁️ 部署自己的实例以获得更好的控制
- 🔒 安全私密的部署方案

## mac 桌面应用

安装 dmg 后，需要执行以下命令：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/Cerebr.app
```

本项目使用 Pake 打包，打包命令如下：

```bash
iconutil -c icns icon.iconset
pake https://xxx/ --name Cerebr --hide-title-bar --icon ./icon.icns
```

https://github.com/tw93/Pake

## 🚀 最新更新

### v2.7.0

- 🧠 使用固定版本 `@earendil-works/pi-ai` 作为模型与流式协议内核
- 🔌 新增 OpenAI Responses 与 Google Generative AI，并保留 OpenAI/Anthropic 兼容端点
- 🗂️ Provider 与 Model 分离，同一 Provider 可共享凭据并管理多个模型
- 🔄 Chrome 扩展支持 Pi 目录、服务商发现、ETag 缓存和手动模型覆盖
- 🔐 API Key、自定义 Header 和动态目录缓存继续仅保存在本机
- ♻️ 自动迁移 2.6.x API 配置，同时保留旧数据用于回滚

### v2.6.1

- 🐛 修复点击扩展图标后 Chrome 原生 Side Panel 没有打开的问题
- ✅ 工具栏图标开关改由 Chrome 原生 `openPanelOnActionClick` 行为处理

### v2.6.0

- 🧩 新增 OpenAI Chat Completions 与 Anthropic Messages 双 Provider
- 🪟 悬浮面板升级为 Chrome 141+ 原生 Side Panel
- 📚 新增可配置的“学习文章”固定提示词按钮
- 📤 新增完整会话 Markdown 导出
- 🔐 API Key 与自定义 Header 改为仅在本机保存
- 🌐 保留独立 Web 版本，并使用 `v/2.6.0` 版本化资源

## 📝 开发说明

本项目采用 Chrome Extension Manifest V3 开发,主要技术栈:

- 🎨 原生 JavaScript + CSS
- 📦 Chrome Extension API
- 🧠 `@earendil-works/pi-ai` + esbuild 浏览器 bundle
- 🔧 PDF.js + MathJax + Marked.js + Mermaid

首次开发构建：

```bash
npm ci
npm run build:pi-ai
npm test
```

隐私与第三方组件说明见 [PRIVACY_CN.md](./PRIVACY_CN.md) 和 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 🤝 贡献指南

欢迎提交 Issue 进行讨论。为减少维护成本，本项目禁止任何 Feature PR（新增/改进功能）；任何功能增加/改进请移步 Issue 讨论。PR 仅接受 Bug 修复类。

提交 Bug 修复 PR 之前,请确保:

- 🔍 已经搜索过相关的 Issue
- ✅ 遵循现有的代码风格
- 📝 提供清晰的描述和复现步骤

## 📄 许可证

本项目采用 GPLv3 许可证
