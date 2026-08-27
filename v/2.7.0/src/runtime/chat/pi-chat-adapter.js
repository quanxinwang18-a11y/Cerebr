import { normalizeMessageForChatCompletions } from '../../utils/message-content.js';
import { normalizeReasoningEffort } from '../../utils/reasoning-effort.js';
import { PiModelRuntimeService } from '../models/pi-model-runtime-service.js';
import {
    API_ANTHROPIC_MESSAGES,
    API_OPENAI_COMPLETIONS,
    normalizePiBaseUrl,
    normalizeProviderApi,
} from '../models/provider-config.js';

function stringValue(value) {
    return String(value ?? '').trim();
}

function parseDataImage(value) {
    const match = stringValue(value).match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]+)$/iu);
    if (!match) return null;
    return { type: 'image', mimeType: match[1], data: match[2].replace(/\s+/gu, '') };
}

function toPiUserContent(content) {
    if (!Array.isArray(content)) return String(content ?? '');
    const blocks = [];
    for (const part of content) {
        if (part?.type === 'text' && String(part.text ?? '')) {
            blocks.push({ type: 'text', text: String(part.text) });
            continue;
        }
        if (part?.type === 'image_url') {
            const image = parseDataImage(part?.image_url?.url);
            if (image) blocks.push(image);
        }
    }
    return blocks.length ? blocks : '';
}

function zeroUsage() {
    return {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
}

export function toPiContext(messages, model, systemPrompt = '') {
    const normalized = [];
    for (const rawMessage of Array.isArray(messages) ? messages : []) {
        if (rawMessage?.role === 'system') continue;
        const message = normalizeMessageForChatCompletions({
            role: rawMessage?.role,
            content: rawMessage?.content,
        });
        if (message?.role === 'user') {
            normalized.push({
                role: 'user',
                content: toPiUserContent(message.content),
                timestamp: Number(rawMessage?.timestamp) || Date.now(),
            });
            continue;
        }
        if (message?.role === 'assistant') {
            const text = Array.isArray(message.content)
                ? message.content.filter((part) => part?.type === 'text').map((part) => String(part.text ?? '')).join('\n')
                : String(message.content ?? '');
            normalized.push({
                role: 'assistant',
                content: text ? [{ type: 'text', text }] : [],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: zeroUsage(),
                stopReason: 'stop',
                timestamp: Number(rawMessage?.timestamp) || Date.now(),
            });
        }
    }
    return { systemPrompt: String(systemPrompt || ''), messages: normalized };
}

function createStaticCredentialStore(providerId, credential) {
    return {
        async read(id, options) {
            options?.signal?.throwIfAborted?.();
            return id === providerId ? structuredClone(credential) : undefined;
        },
        async list(options) {
            options?.signal?.throwIfAborted?.();
            return [{ providerId, type: 'api_key' }];
        },
        async modify(id, update, options) {
            options?.signal?.throwIfAborted?.();
            if (id !== providerId) return undefined;
            return update(structuredClone(credential));
        },
        async delete() {},
    };
}

export async function createPiChatRequest(apiConfig = {}) {
    const api = normalizeProviderApi(apiConfig.api || apiConfig.apiType);
    const providerId = stringValue(apiConfig.providerId || apiConfig.id) || 'cerebr-request-provider';
    const modelId = stringValue(apiConfig.modelId || apiConfig.modelName)
        || (api === API_OPENAI_COMPLETIONS ? 'gpt-4o' : 'model');
    const baseUrl = normalizePiBaseUrl(apiConfig.baseUrl, api);
    const authMode = stringValue(apiConfig.authMode) || 'auto';
    const apiKey = String(apiConfig.apiKey ?? '');
    if (!baseUrl || !modelId || (authMode !== 'none' && !apiKey.trim())) {
        throw new Error('CEREBR_API_CONFIG_INCOMPLETE');
    }

    const credential = {
        type: 'api_key',
        key: apiKey,
        headers: Array.isArray(apiConfig.headers) ? apiConfig.headers : [],
    };
    const runtime = new PiModelRuntimeService({
        credentials: createStaticCredentialStore(providerId, credential),
    });
    const reasoningEffort = normalizeReasoningEffort(apiConfig.advancedSettings?.reasoningEffort);
    await runtime.configure({
        providerConfigs: [{
            id: providerId,
            name: stringValue(apiConfig.providerName) || providerId,
            api,
            baseUrl,
            authMode,
            modelSource: 'manual',
            defaultModelId: modelId,
            userModels: [{
                id: modelId,
                name: stringValue(apiConfig.modelDisplayName) || modelId,
                api,
                reasoning: apiConfig.model?.reasoning === true || reasoningEffort !== 'off',
                input: apiConfig.model?.input || ['text', 'image'],
                contextWindow: apiConfig.model?.contextWindow,
                maxTokens: apiConfig.model?.maxTokens || apiConfig.advancedSettings?.maxTokens,
                compat: apiConfig.model?.compat,
            }],
        }],
        selectedModel: { providerId, modelId },
    });
    return {
        runtime,
        model: runtime.getSelectedModel(),
        providerConfig: runtime.getProviderConfig(providerId),
        credential,
    };
}

function headersRecord(value) {
    try {
        return Object.fromEntries(new Headers(value || {}).entries());
    } catch {
        return { ...(value || {}) };
    }
}

function hasHeader(headers, name) {
    const target = name.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function deleteHeader(headers, name) {
    const target = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === target) delete headers[key];
    }
}

function normalizeAuthHeaders(headers, providerConfig, credential) {
    const customHeaders = headersRecord(Object.fromEntries(
        (credential?.headers || []).map((header) => [header?.name, header?.value]).filter(([name]) => name)
    ));
    const automatic = providerConfig.api === API_ANTHROPIC_MESSAGES || providerConfig.api === 'google-generative-ai'
        ? 'x-api-key'
        : 'bearer';
    const mode = providerConfig.authMode === 'auto' ? automatic : providerConfig.authMode;
    if (mode !== 'bearer' && !hasHeader(customHeaders, 'authorization')) deleteHeader(headers, 'authorization');
    if (mode === 'none' && !hasHeader(customHeaders, 'x-api-key')) deleteHeader(headers, 'x-api-key');
    if (mode === 'none' && !hasHeader(customHeaders, 'x-goog-api-key')) deleteHeader(headers, 'x-goog-api-key');
    return headers;
}

function parseRequestBody(body) {
    if (typeof body !== 'string') return {};
    try {
        const value = JSON.parse(body);
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
}

export function createLifecycleFetch({
    lifecycle,
    providerConfig,
    credential,
    signal,
    fetchImpl = globalThis.fetch,
    state = {},
} = {}) {
    let didRunBeforeRequest = false;
    return async (input, init = {}) => {
        let url = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || input);
        let requestBody = parseRequestBody(init.body);
        let requestInit = {
            ...init,
            headers: normalizeAuthHeaders(headersRecord(init.headers), providerConfig, credential),
            signal,
        };
        if (!didRunBeforeRequest && typeof lifecycle?.beforeRequest === 'function') {
            didRunBeforeRequest = true;
            const next = await lifecycle.beforeRequest({
                url,
                requestBody: structuredClone(requestBody),
                requestInit: { ...requestInit, headers: { ...requestInit.headers } },
            });
            if (next && typeof next === 'object') {
                if (typeof next.url === 'string' && next.url.trim()) url = next.url;
                if (next.requestBody && typeof next.requestBody === 'object') requestBody = next.requestBody;
                if (next.requestInit && typeof next.requestInit === 'object') {
                    requestInit = {
                        ...requestInit,
                        ...next.requestInit,
                        headers: { ...requestInit.headers, ...headersRecord(next.requestInit.headers) },
                        signal,
                    };
                }
            }
        }
        requestInit.body = JSON.stringify(requestBody);
        state.url = url;
        state.requestBody = requestBody;
        state.requestInit = requestInit;
        const response = await fetchImpl(url, requestInit);
        state.status = response.status;
        state.statusText = response.statusText;
        if (typeof lifecycle?.onResponse === 'function') {
            await lifecycle.onResponse({ response, url, requestBody, requestInit });
        }
        return response;
    };
}

export async function consumePiStream(stream, {
    onUpdate,
    onStreamMessage,
    chatId,
    requestState,
    detectMisfiledThinkSilently = false,
    misfiledThinkSilentlyPrefixes = ['think'],
} = {}) {
    const current = { content: '', reasoning_content: '' };
    let hasDispatched = false;
    for await (const event of stream) {
        if (event.type === 'text_delta') current.content += event.delta;
        if (event.type === 'thinking_delta') current.reasoning_content += event.delta;
        if (event.type === 'error') {
            const error = new Error(event.error?.errorMessage || 'Provider stream error');
            error.code = event.reason === 'aborted' ? 'ABORTED' : 'PROVIDER_STREAM_ERROR';
            error.name = event.reason === 'aborted' ? 'AbortError' : 'CerebrChatError';
            error.status = requestState?.status;
            error.url = requestState?.url;
            throw error;
        }
        if (event.type !== 'text_delta' && event.type !== 'thinking_delta') continue;
        if (detectMisfiledThinkSilently && !hasDispatched && !current.reasoning_content) {
            const start = current.content.trimStart().toLowerCase();
            if (misfiledThinkSilentlyPrefixes.some((prefix) => start.startsWith(prefix))) {
                const error = new Error('Detected misfiled reasoning content in content field');
                error.name = 'CerebrChatError';
                error.code = 'CEREBR_MISFILED_THINK_SILENTLY';
                error.contentPreview = current.content;
                throw error;
            }
            if (misfiledThinkSilentlyPrefixes.some((prefix) => prefix.startsWith(start))) continue;
        }
        hasDispatched = true;
        onUpdate?.({ ...current });
        if (typeof onStreamMessage === 'function') {
            await onStreamMessage({
                delta: event.delta,
                currentMessage: { ...current },
                chatId,
                url: requestState?.url,
                apiType: event.partial?.api,
            });
        }
    }
    onUpdate?.({ ...current });
    return current;
}
