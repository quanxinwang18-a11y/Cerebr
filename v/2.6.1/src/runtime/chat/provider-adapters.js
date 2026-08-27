import { normalizeChatCompletionsUrl } from '../../utils/api-url.js';
import { modelSupportsReasoningEffort, normalizeReasoningEffort } from '../../utils/reasoning-effort.js';

export const API_TYPE_OPENAI_COMPLETIONS = 'openai-completions';
export const API_TYPE_ANTHROPIC_MESSAGES = 'anthropic-messages';
export const SUPPORTED_API_TYPES = Object.freeze([
    API_TYPE_OPENAI_COMPLETIONS,
    API_TYPE_ANTHROPIC_MESSAGES,
]);

export const AUTH_MODE_AUTO = 'auto';
export const AUTH_MODE_BEARER = 'bearer';
export const AUTH_MODE_X_API_KEY = 'x-api-key';
export const AUTH_MODE_NONE = 'none';
export const SUPPORTED_AUTH_MODES = Object.freeze([
    AUTH_MODE_AUTO,
    AUTH_MODE_BEARER,
    AUTH_MODE_X_API_KEY,
    AUTH_MODE_NONE,
]);

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;

function normalizeString(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}
function normalizePositiveInt(value, fallback = null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.max(1, Math.floor(numeric));
}

export function normalizeApiType(value) {
    const normalized = normalizeString(value).toLowerCase();
    return SUPPORTED_API_TYPES.includes(normalized)
        ? normalized
        : API_TYPE_OPENAI_COMPLETIONS;
}

export function normalizeAuthMode(value) {
    const normalized = normalizeString(value).toLowerCase();
    return SUPPORTED_AUTH_MODES.includes(normalized)
        ? normalized
        : AUTH_MODE_AUTO;
}

export function normalizeAnthropicMessagesUrl(value) {
    const raw = normalizeString(value);
    if (!raw) return '';

    const normalizePath = (pathname) => {
        const withoutTrailingSlash = (pathname || '/').replace(/\/+$/, '');
        const base = withoutTrailingSlash === '/' ? '' : withoutTrailingSlash;
        if (base.endsWith('/messages')) return base || '/messages';
        if (base.endsWith('/v1')) return `${base}/messages`;
        if (!/(^|\/)v1(\/|$)/.test(`${base || '/'}/`)) {
            return `${base}/v1/messages` || '/v1/messages';
        }
        return `${base}/messages`;
    };

    try {
        const url = new URL(raw);
        url.pathname = normalizePath(url.pathname);
        return url.toString();
    } catch {
        const withoutTrailingSlash = raw.replace(/\/+$/, '');
        if (withoutTrailingSlash.endsWith('/messages')) return withoutTrailingSlash;
        if (withoutTrailingSlash.endsWith('/v1')) return `${withoutTrailingSlash}/messages`;
        if (!/(^|\/)v1(\/|$)/.test(`${withoutTrailingSlash}/`)) {
            return `${withoutTrailingSlash}/v1/messages`;
        }
        return `${withoutTrailingSlash}/messages`;
    }
}

export function normalizeProviderUrl(value, apiType) {
    return normalizeApiType(apiType) === API_TYPE_ANTHROPIC_MESSAGES
        ? normalizeAnthropicMessagesUrl(value)
        : normalizeChatCompletionsUrl(value);
}

export function normalizeCustomHeaders(headers) {
    const entries = Array.isArray(headers)
        ? headers
        : Object.entries(headers && typeof headers === 'object' ? headers : {})
            .map(([name, value]) => ({ name, value }));
    const byName = new Map();

    entries.forEach((entry) => {
        const name = normalizeString(entry?.name);
        if (!name) return;
        const normalizedName = name.toLowerCase();
        byName.set(normalizedName, {
            name,
            value: String(entry?.value ?? ''),
        });
    });

    return Array.from(byName.values());
}

function resolveAuthMode(apiType, authMode) {
    const normalizedMode = normalizeAuthMode(authMode);
    if (normalizedMode !== AUTH_MODE_AUTO) return normalizedMode;
    return normalizeApiType(apiType) === API_TYPE_ANTHROPIC_MESSAGES
        ? AUTH_MODE_X_API_KEY
        : AUTH_MODE_BEARER;
}

export function buildProviderHeaders(apiConfig = {}) {
    const apiType = normalizeApiType(apiConfig.apiType);
    const headers = {};
    const apiKey = normalizeString(apiConfig.apiKey);
    const authMode = resolveAuthMode(apiType, apiConfig.authMode);

    if (authMode === AUTH_MODE_BEARER && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    } else if (authMode === AUTH_MODE_X_API_KEY && apiKey) {
        headers['x-api-key'] = apiKey;
    }

    if (apiType === API_TYPE_ANTHROPIC_MESSAGES) {
        headers['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
    }

    normalizeCustomHeaders(apiConfig.headers).forEach(({ name, value }) => {
        const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
        if (existingKey) delete headers[existingKey];
        headers[name] = value;
    });

    headers['Content-Type'] = 'application/json';
    if (apiType === API_TYPE_ANTHROPIC_MESSAGES) {
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    return headers;
}

function parseDataImageUrl(value) {
    const match = normalizeString(value).match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!match) return null;
    return {
        mediaType: match[1],
        data: match[2].replace(/\s+/g, ''),
    };
}

function toAnthropicContent(content) {
    if (!Array.isArray(content)) return String(content ?? '');

    return content.map((part) => {
        if (part?.type === 'text') {
            return {
                type: 'text',
                text: String(part.text ?? ''),
            };
        }
        if (part?.type === 'image_url') {
            const imageUrl = normalizeString(part?.image_url?.url);
            const dataImage = parseDataImageUrl(imageUrl);
            if (dataImage) {
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: dataImage.mediaType,
                        data: dataImage.data,
                    },
                };
            }
            if (/^https?:\/\//i.test(imageUrl)) {
                return {
                    type: 'image',
                    source: {
                        type: 'url',
                        url: imageUrl,
                    },
                };
            }
        }
        return null;
    }).filter(Boolean);
}

function toAnthropicMessages(messages = []) {
    return messages
        .filter((message) => message?.role === 'user' || message?.role === 'assistant')
        .map((message) => ({
            role: message.role,
            content: toAnthropicContent(message.content),
        }))
        .filter((message) => (
            Array.isArray(message.content)
                ? message.content.length > 0
                : !!String(message.content || '').trim()
        ));
}

export function buildProviderRequest({
    apiConfig = {},
    systemPrompt = '',
    messages = [],
} = {}) {
    const apiType = normalizeApiType(apiConfig.apiType);
    const url = normalizeProviderUrl(apiConfig.baseUrl, apiType);
    const authMode = resolveAuthMode(apiType, apiConfig.authMode);
    const apiKey = normalizeString(apiConfig.apiKey);

    if (!url) {
        throw new Error('API endpoint is required');
    }
    if (authMode !== AUTH_MODE_NONE && !apiKey) {
        throw new Error('API key is required for the selected authentication mode');
    }

    if (apiType === API_TYPE_ANTHROPIC_MESSAGES) {
        const requestBody = {
            model: normalizeString(apiConfig.modelName),
            messages: toAnthropicMessages(messages),
            max_tokens: normalizePositiveInt(
                apiConfig.advancedSettings?.maxTokens,
                DEFAULT_ANTHROPIC_MAX_TOKENS
            ),
            stream: true,
        };
        if (normalizeString(systemPrompt)) {
            requestBody.system = systemPrompt;
        }
        return {
            apiType,
            url,
            headers: buildProviderHeaders(apiConfig),
            requestBody,
        };
    }

    const requestMessages = [...messages];
    if (normalizeString(systemPrompt) && (requestMessages.length === 0 || requestMessages[0]?.role !== 'system')) {
        requestMessages.unshift({
            role: 'system',
            content: systemPrompt,
        });
    }

    const requestBody = {
        model: normalizeString(apiConfig.modelName, 'gpt-4o'),
        messages: requestMessages,
        stream: true,
    };
    const maxTokens = normalizePositiveInt(apiConfig.advancedSettings?.maxTokens);
    if (maxTokens) {
        requestBody.max_tokens = maxTokens;
    }
    const reasoningEffort = normalizeReasoningEffort(apiConfig.advancedSettings?.reasoningEffort);
    if (modelSupportsReasoningEffort(requestBody.model) && reasoningEffort !== 'off') {
        requestBody.reasoning = {
            effort: reasoningEffort,
            summary: 'auto',
        };
    }

    return {
        apiType,
        url,
        headers: buildProviderHeaders(apiConfig),
        requestBody,
    };
}

export function createProviderStreamState(apiType) {
    return {
        apiType: normalizeApiType(apiType),
        eventName: '',
        content: '',
        reasoning_content: '',
        done: false,
    };
}

function applyOpenAiData(data, state) {
    if (data === '[DONE]') {
        state.done = true;
        return { done: true, hasUpdate: false, delta: null };
    }

    const payload = JSON.parse(data);
    if (payload?.error) {
        return {
            done: false,
            hasUpdate: false,
            error: {
                code: normalizeString(payload.error.code, 'PROVIDER_STREAM_ERROR'),
                message: normalizeString(payload.error.message, 'Provider stream error'),
            },
        };
    }
    const delta = payload?.choices?.[0]?.delta || null;
    let hasUpdate = false;
    if (typeof delta?.content === 'string' && delta.content) {
        state.content += delta.content;
        hasUpdate = true;
    }
    if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
        state.reasoning_content += delta.reasoning_content;
        hasUpdate = true;
    }
    return { done: false, hasUpdate, delta };
}

function applyAnthropicData(data, state) {
    const payload = JSON.parse(data);
    if (payload?.type === 'message_stop') {
        state.done = true;
        return { done: true, hasUpdate: false, delta: null };
    }
    if (payload?.type === 'error') {
        return {
            done: false,
            hasUpdate: false,
            error: {
                code: normalizeString(payload?.error?.type, 'PROVIDER_STREAM_ERROR'),
                message: normalizeString(payload?.error?.message, 'Anthropic stream error'),
            },
        };
    }
    if (payload?.type !== 'content_block_delta') {
        return { done: false, hasUpdate: false, delta: payload?.delta || null };
    }

    const delta = payload?.delta || null;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        state.content += delta.text;
        return { done: false, hasUpdate: !!delta.text, delta };
    }
    if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        state.reasoning_content += delta.thinking;
        return { done: false, hasUpdate: !!delta.thinking, delta };
    }
    return { done: false, hasUpdate: false, delta };
}

export function consumeProviderSseLine(line, state) {
    const normalizedLine = String(line ?? '').replace(/\r$/, '');
    if (!normalizedLine) {
        state.eventName = '';
        return null;
    }
    if (normalizedLine.startsWith(':')) return null;
    if (normalizedLine.startsWith('event:')) {
        state.eventName = normalizeString(normalizedLine.slice(6));
        return null;
    }
    if (!normalizedLine.startsWith('data:')) return null;

    const data = normalizedLine.slice(5).trimStart();
    if (!data) return null;
    return state.apiType === API_TYPE_ANTHROPIC_MESSAGES
        ? applyAnthropicData(data, state)
        : applyOpenAiData(data, state);
}
