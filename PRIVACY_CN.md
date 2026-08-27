# Cerebr 隐私说明

Cerebr 不提供中转模型服务。聊天请求会从浏览器直接发送到用户配置的 Provider；请求可能包含对话、用户主动启用的网页/PDF/YouTube 内容以及图片。

## 本机保存

- API Key、自定义 Header 值存入 `chrome.storage.local`，不通过 Chrome Sync 同步。
- 导入 Pi 配置时，文件中的字面量 API Key 与 Header 会写入同一个仅限本机的凭据区；环境变量和命令形式的密钥不会导入。
- 服务商动态模型目录、ETag 和刷新时间仅作为本机缓存保存。
- 会话、草稿、阅读进度和大体积系统提示按现有本机存储策略保存。
- “导出全部数据”生成的备份包含本地凭据，应作为敏感文件妥善保管。

## 可同步配置

Provider 名称、协议、Base URL、模型 ID、模型能力覆盖、所选模型和容量允许的系统提示可以通过 Chrome Sync 同步。新设备需要重新填写凭据。

## 外部请求

- 聊天和“测试连接”会请求用户选择的 Provider；测试连接会发送最小提示并可能产生少量 Tokens 费用。
- Chrome 扩展可请求 `https://pi.dev/api/models/providers/<providerId>` 更新模型元数据。该请求只包含 Provider ID、ETag 等目录信息，不包含用户 Provider 的 API Key、自定义 Header 或对话内容。
- Chrome 扩展可使用用户凭据请求 Provider 的模型列表接口。Web 版不会请求 pi.dev，也不会自动发现模型。

Cerebr 不会执行远程模型目录中的代码；目录响应只按 JSON 数据解析和校验。

## 用户控制与删除

用户可以编辑或删除 Provider、删除会话、导出数据，并通过浏览器控制清除 Cerebr 的本地数据。卸载扩展后，Chrome 会按自身规则移除扩展作用域内的存储。

问题和反馈可提交至 [GitHub Issues](https://github.com/yym68686/Cerebr/issues)。
