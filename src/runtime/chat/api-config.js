import {
    API_TYPE_ANTHROPIC_MESSAGES,
    API_TYPE_OPENAI_COMPLETIONS,
    normalizeApiType,
    normalizeAuthMode,
    normalizeCustomHeaders,
    normalizeProviderUrl,
} from './provider-adapters.js';
import { normalizeReasoningEffort } from '../../utils/reasoning-effort.js';

export const API_CREDENTIALS_STORAGE_KEY = 'apiCredentialsV1';

export function createDefaultApiConfig({ id = '' } = {}) {
    return {
        id,
        apiType: API_TYPE_OPENAI_COMPLETIONS,
        authMode: 'auto',
        apiKey: '',
        headers: [],
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        modelName: 'gpt-4o',
        advancedSettings: {
            systemPrompt: '',
            reasoningEffort: 'off',
            maxTokens: null,
            isExpanded: false,
        },
    };
}
export function normalizeApiConfigRecord(config, { generateId = () => '' } = {}) {
    const source = config && typeof config === 'object' ? config : {};
    const apiType = normalizeApiType(source.apiType);
    const defaultBaseUrl = apiType === API_TYPE_ANTHROPIC_MESSAGES
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.openai.com/v1/chat/completions';
    const rawMaxTokens = Number(source.advancedSettings?.maxTokens);

    return {
        ...source,
        id: String(source.id || generateId()),
        apiType,
        authMode: normalizeAuthMode(source.authMode),
        apiKey: String(source.apiKey ?? ''),
        headers: normalizeCustomHeaders(source.headers),
        baseUrl: normalizeProviderUrl(source.baseUrl || defaultBaseUrl, apiType) || defaultBaseUrl,
        modelName: String(source.modelName || (apiType === API_TYPE_OPENAI_COMPLETIONS ? 'gpt-4o' : '')),
        advancedSettings: {
            ...(source.advancedSettings || {}),
            systemPrompt: String(source.advancedSettings?.systemPrompt ?? ''),
            reasoningEffort: normalizeReasoningEffort(source.advancedSettings?.reasoningEffort),
            maxTokens: Number.isFinite(rawMaxTokens) && rawMaxTokens > 0
                ? Math.floor(rawMaxTokens)
                : (apiType === API_TYPE_ANTHROPIC_MESSAGES ? 8192 : null),
            isExpanded: !!source.advancedSettings?.isExpanded,
        },
    };
}

export function stripApiConfigForSync(config) {
    const advancedSettings = { ...(config?.advancedSettings || {}) };
    delete advancedSettings.systemPrompt;
    const sanitized = {
        ...(config || {}),
        advancedSettings,
    };
    delete sanitized.apiKey;
    delete sanitized.headers;
    return sanitized;
}

export function readApiCredentials(config) {
    return {
        apiKey: String(config?.apiKey ?? ''),
        headers: normalizeCustomHeaders(config?.headers),
    };
}

export function mergeApiCredentials(config, credentials) {
    return {
        ...(config || {}),
        apiKey: String(credentials?.apiKey ?? config?.apiKey ?? ''),
        headers: normalizeCustomHeaders(credentials?.headers ?? config?.headers),
    };
}

export function buildApiCredentialsMap(configs = []) {
    return Object.fromEntries(
        configs
            .filter((config) => config?.id)
            .map((config) => [config.id, readApiCredentials(config)])
    );
}
