<p align="center">
<img src="./icons/icon128.png">
</p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/cerebr/kjojanemcpiamhohkcpcddpkbnciojkj">
    <img src="https://img.shields.io/chrome-web-store/v/kjojanemcpiamhohkcpcddpkbnciojkj?color=blue&label=Chrome%20Store&logo=google-chrome&logoColor=white" alt="Chrome Web Store">
</a>
  <a href="https://t.me/uni_api">
    <img src="https://img.shields.io/badge/Join Telegram Group-blue?&logo=telegram">
  </a>
</p>

[English](./README.md) | [Simplified Chinese](./README_CN.md)

# 🧠 Cerebr - Intelligent AI Assistant

![screenshot](./statics/image.png)

The name "Cerebr" comes from a Latin root related to "brain" or "cerebrum". Cerebr is a Chrome 141+ AI assistant focused on article reading, learning, and note export. It integrates Claude, OpenAI, and compatible custom endpoints as a distraction-free second brain.

Born from a need for a clean, efficient browser AI assistant, Cerebr stands out with its minimalist design and powerful features. While other solutions often come with limitations or cluttered interfaces, Cerebr focuses on delivering a seamless, distraction-free experience for your web browsing needs.

## ✨ Core Features

- 🎯 **Native Chrome Side Panel** - Open Chrome's Side Panel via hotkey (Windows: `Alt+Z` / Mac: `Ctrl+Z`)
- 🔄 **Pi-powered Providers** - Supports OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Google Generative AI, and compatible custom endpoints
- 🧭 **Model Catalogs** - The Chrome extension merges Pi built-ins, pi.dev updates, provider discovery, and user-defined models
- 🔁 **Safer Config Sync** - Non-sensitive model and endpoint settings can sync; API keys and header values remain on-device
- 📚 **Article Learning Actions** - Send a configurable study prompt in one click and export the full conversation as Markdown
- 📝 **Comprehensive Q&A** - Support webpage content Q&A, PDF document Q&A, image Q&A and more
- 🎨 **Elegant Rendering** - Perfect support for Markdown text rendering and LaTeX math formula display
- ⚡ **Real-time Response** - Stream output for instant AI replies
- ⏹️ **Flexible Control** - Support stopping generation at any time, sending new messages will stop the current generation
- 🌓 **Theme Switching** - Support light/dark themes to protect your eyes
- 🌐 **Web Version** - Support web version, no installation required, accessable from any browser, support vercel, GitHub Pages and cloudflare pages deployment

## 🛠️ Technical Features

- 💾 **State Persistence** - Automatically save chat history, drafts, and reading progress
- 🔄 **Config Sync** - Share non-sensitive configuration through Chrome sync storage
- 🔍 **Smart Extraction** - Automatically identify and extract webpage/PDF content
- ⌨️ **Shortcut Operations** - Support hotkey to clear chat (Windows: `Alt+X` / Mac: `Ctrl+X`), up/down keys for quick history recall
- 🔒 **Secure & Reliable** - Support multiple API key management with local data storage
- 🎭 **Version Requirement** - Chrome 141 or newer

## 🎮 User Guide

1. 🔑 **Configure API**
   - Click the settings button
   - Choose a Provider preset or create a custom Provider, then enter its API key and API root
   - The Chrome extension automatically requests the model list after credentials or endpoints change and uses Pi metadata for recognized models
   - If a Provider does not expose a usable model list, choose “Import Pi config” and select `~/.pi/agent/models.json` plus `settings.json`
   - Models can also be added or overridden manually and switched within one Provider

2. 💬 **Start Chatting**
   - Use hotkey Windows: `Alt+Z` / Mac: `Ctrl+Z` to summon sidebar
   - Input questions and send
   - Support image upload for visual Q&A

3. 📚 **Webpage/PDF Q&A**
   - Enable webpage Q&A switch
   - Automatically identify and extract current page content
   - Support intelligent PDF file Q&A

## 💡 Tips & Shortcuts

- ↔️ **Resize Sidebar** - Drag the sidebar’s left edge to resize; double-click the edge to reset to default width
- ⌨️ **Send Message** - `Enter` to send, `Shift+Enter` for a new line, `Esc` to blur the input
- ⬆️⬇️ **Recall Previous Questions** - When the input is empty, press `↑`/`↓` to cycle through your recent questions; press `↓` at the newest item to return to an empty input
- 📋 **Context Menu** - Right-click a message (or long-press on touch devices) for copy/regenerate/delete; `Esc` to close
- 🖼️ **Image Preview** - Click an image to preview; press `Esc` or click outside to close

## 🔧 Advanced Features

- 📋 **Right-click Copy** - Support right-click to directly copy message text
- 🔄 **History Records** - Use up/down arrow keys to quickly recall historical questions
- ⏹️ **Stop Generation** - Show stop button when generating messages, can stop generation at any time
- 🖼️ **Image Preview** - Click images to view full size
- ⚙️ **Custom Settings** - Support customizing hotkeys, themes and more

## 🚀 Web Version Deploy

1. You can quickly deploy the web version of Cerebr to Fugue with one click:

[![Deploy to Fugue](https://api.fugue.pro/button.svg?v=a37d3d9)](https://fugue.pro/new/repository?repository-url=https%3A%2F%2Fgithub.com%2Fyym68686%2Fcerebr)

2. You can quickly deploy the web version of Cerebr to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyym68686%2Fcerebr)

3. You can deploy to Cloudflare Pages:

2.1 After registering a Cloudflare account, apply for a Workers API TOKEN.

After entering the Cloudflare homepage, select "Profile" in the upper right corner -> "My Profile" -> "API Tokens" -> "Create Token" -> "Edit Cloudflare Workers" -> You can choose the permissions for "Account Resources" and "Zone Resources" by yourself -> Continue to summary -> Create Token -> Save the token (**Note:** Save your token properly as it will only be displayed once).

2.2 Return to the homepage, find "Workers" on the left -> Open "Workers & Pages" -> Click "Create" -> "Pages" -> "Import an existing Git repository" -> Find the forked repository -> Begin setup.

2.3 Enter a name you like for the project, and in the "Build command" field, input:

`bash scripts/prepare_pages_site.sh pages-site`

2.4 In the "Build output directory" field, input:

`pages-site`

2.5 No additional environment variables are required for the standard Git-connected Pages deployment flow.

2.6 Save and deploy.

4. You can also deploy to GitHub Pages:

```bash
# Fork this repository
# Then go to your repository's Settings -> Pages
# In the "Build and deployment" section:
# - Select "Deploy from a branch" as Source
# - Choose your branch (main/master) and root (/) folder
# - Click Save
```

The deployment will be automatically handled by GitHub Actions. You can access your site at `https://<your-username>.github.io/cerebr`

### Web Version Features
- 🌐 Access Cerebr from any browser without installation
- 💻 Keeps chat, configuration, themes, and Markdown export; webpage extraction remains extension-only
- 🧩 Uses manual Providers/models only; the Web build does not contact pi.dev or provider model-list endpoints
- ☁️ Deploy your own instance for better control
- 🔒 Secure and private deployment

## 📦 Desktop Application

After installing the dmg file, you need to execute the following command:

```bash
sudo xattr -r -d com.apple.quarantine /Applications/Cerebr.app
```

This project uses Pake to pack the dmg file, the command is as follows:

```bash
iconutil -c icns icon.iconset
pake https://xxx/ --name Cerebr --hide-title-bar --icon ./icon.icns
```

https://github.com/tw93/Pake

## 🚀 Latest Updates

### v2.7.0

- ⭐ Replaces the extension artwork with a blue four-point guiding star
- 🧠 Uses pinned `@earendil-works/pi-ai` adapters and normalized streaming events
- 🔌 Adds OpenAI Responses and Google Generative AI while retaining OpenAI/Anthropic-compatible endpoints
- 🗂️ Separates Providers from Models so credentials can be shared across multiple models
- 🔄 Adds Pi catalog updates, provider discovery, ETag caching, and user model overrides to the Chrome extension
- 📥 Imports Pi Provider/model configuration while moving API keys and headers into on-device credentials
- 🔐 Keeps API keys, custom headers, and dynamic model caches on-device
- ♻️ Migrates 2.6.x API settings without deleting rollback data

### v2.6.1

- 🐛 Fixed the extension action icon not opening Chrome's native Side Panel
- ✅ Delegated toolbar toggling to Chrome's native `openPanelOnActionClick` behavior

### v2.6.0

- 🧩 Added OpenAI Chat Completions and Anthropic Messages providers
- 🪟 Replaced the floating panel with Chrome 141+ native Side Panel
- 📚 Added a configurable one-click article study prompt
- 📤 Added full-conversation Markdown export
- 🔐 API keys and custom header values now remain on-device
- 🌐 Kept the standalone Web version with versioned `v/2.6.0` assets

## 📝 Development Notes

This project is developed using Chrome Extension Manifest V3, with main tech stack:

- 🎨 Native JavaScript + CSS
- 📦 Chrome Extension API
- 🧠 `@earendil-works/pi-ai` with an esbuild browser bundle
- 🔧 PDF.js + MathJax + Marked.js + Mermaid

First-time development build:

```bash
npm ci
npm run build:pi-ai
npm test
```

See [PRIVACY.md](./PRIVACY.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for privacy and third-party component details.

## 🤝 Contribution Guide

Issues are welcome for discussion. To reduce maintenance cost, this project does not accept any feature PRs (new/improved features); please discuss feature requests in Issues. PRs are only accepted for bug fixes.

Before submitting a bug-fix PR, please ensure:

- 🔍 You have searched related issues
- ✅ Follow existing code style
- 📝 Provide clear description and reproduction steps

## 📄 License

This project is licensed under the GPLv3 License
