# Cerebr Privacy Notice

Cerebr does not operate an LLM proxy. Chat requests go directly from the browser to the Provider configured by the user and may include conversation messages, webpage/PDF/YouTube content the user enabled, and attached images.

## On-device data

- API keys and custom header values are stored in `chrome.storage.local` and are not synced through Chrome Sync.
- Provider-discovered model catalogs, ETags, and refresh timestamps are local caches.
- Conversations, drafts, reading progress, and oversized system prompts follow Cerebr's existing local-storage policy.
- A full-data export contains local credentials. Treat exported backup files as sensitive.

## Synced configuration

Provider names, protocols, base URLs, model IDs, model capability overrides, the selected model, and system prompts that fit the sync quota may use Chrome Sync. Credentials must be entered again on a new device.

## External requests

- Chat and “Test connection” contact the selected Provider. A connection test sends a minimal prompt and may consume a small number of billable tokens.
- The Chrome extension may request `https://pi.dev/api/models/providers/<providerId>` for model metadata. This request contains the Provider ID and catalog validators such as ETag, but not the user's Provider API key, custom headers, or conversation content.
- The Chrome extension may use the user's Provider credentials to call that Provider's model-list endpoint. The Web build does not contact pi.dev and does not perform automatic model discovery.

Cerebr never executes code from a remote model catalog; catalog responses are validated and treated only as JSON data.

## User controls and deletion

Users can edit or remove Providers, delete conversations, export their data, and remove locally stored Cerebr data through browser controls. Uninstalling the extension removes its extension-scoped storage according to Chrome's behavior.

Questions and reports can be submitted through [GitHub Issues](https://github.com/yym68686/Cerebr/issues).
