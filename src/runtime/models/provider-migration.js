import {
    API_ANTHROPIC_MESSAGES,
    API_OPENAI_COMPLETIONS,
    normalizeModelDefinition,
    normalizePiBaseUrl,
    normalizeProviderApi,
    providerModelKey,
} from './provider-config.js';

function stringValue(value) {
    return String(value ?? '').trim();
}

function stableHeaders(headers) {
    const entries = Array.isArray(headers)
        ? headers.map((header) => [stringValue(header?.name).toLowerCase(), String(header?.value ?? '')])
        : Object.entries(headers && typeof headers === 'object' ? headers : {})
            .map(([name, value]) => [name.toLowerCase(), String(value ?? '')]);
    return entries.filter(([name]) => name).sort(([a], [b]) => a.localeCompare(b));
}

function providerName(baseUrl, index) {
    try {
        return new URL(baseUrl).hostname || `Provider ${index + 1}`;
    } catch {
        return `Provider ${index + 1}`;
    }
}

function legacyApi(value) {
    const api = stringValue(value);
    return api === API_ANTHROPIC_MESSAGES ? api : API_OPENAI_COMPLETIONS;
}

function credentialsFor(config, credentialsById) {
    const stored = credentialsById?.[config.id] || {};
    return {
        apiKey: String(stored.apiKey ?? config.apiKey ?? ''),
        headers: stableHeaders(stored.headers ?? config.headers).map(([name, value]) => ({ name, value })),
    };
}

function connectionFingerprint(config, credentials) {
    return JSON.stringify({
        api: config.api,
        baseUrl: config.baseUrl,
        authMode: config.authMode,
        apiKey: credentials.apiKey,
        headers: stableHeaders(credentials.headers),
    });
}

export function migrateLegacyApiConfigs({
    apiConfigs = [],
    selectedConfigIndex = 0,
    credentialsById = {},
    generateId = (index) => `provider-${index + 1}`,
} = {}) {
    const providerConfigs = [];
    const providerCredentials = {};
    const modelSettings = {};
    const systemPrompts = {};
    const configSelections = [];
    const groups = new Map();

    apiConfigs.forEach((legacy, index) => {
        const api = normalizeProviderApi(legacyApi(legacy?.apiType));
        const baseUrl = normalizePiBaseUrl(legacy?.baseUrl, api);
        const credentials = credentialsFor(legacy || {}, credentialsById);
        const normalized = {
            api,
            baseUrl,
            authMode: stringValue(legacy?.authMode) || 'auto',
        };
        const modelId = stringValue(legacy?.modelName) || (api === API_OPENAI_COMPLETIONS ? 'gpt-4o' : 'model');
        const fingerprint = connectionFingerprint(normalized, credentials);
        let provider = groups.get(fingerprint);

        if (provider?.userModels.some((model) => model.id === modelId)) provider = null;
        if (!provider) {
            const id = stringValue(legacy?.id) ? `provider-${legacy.id}` : generateId(providerConfigs.length);
            provider = {
                id,
                name: providerName(baseUrl, providerConfigs.length),
                presetId: null,
                api,
                baseUrl,
                authMode: normalized.authMode,
                modelSource: 'manual',
                modelListPath: api === API_ANTHROPIC_MESSAGES ? 'v1/models' : 'models',
                defaultModelId: modelId,
                userModels: [],
                modelOverrides: {},
                hiddenModelIds: [],
            };
            providerConfigs.push(provider);
            groups.set(fingerprint, provider);
            providerCredentials[id] = {
                type: 'api_key',
                key: credentials.apiKey,
                headers: credentials.headers,
            };
        }

        provider.userModels.push(normalizeModelDefinition({
            id: modelId,
            name: modelId,
            reasoning: legacy?.advancedSettings?.reasoningEffort
                && legacy.advancedSettings.reasoningEffort !== 'off',
            maxTokens: legacy?.advancedSettings?.maxTokens,
        }, {
            providerId: provider.id,
            api,
            baseUrl,
            source: 'user',
        }));
        const settingsKey = providerModelKey(provider.id, modelId);
        modelSettings[settingsKey] = {
            reasoningEffort: stringValue(legacy?.advancedSettings?.reasoningEffort) || 'off',
            maxTokens: Number(legacy?.advancedSettings?.maxTokens) > 0
                ? Math.floor(Number(legacy.advancedSettings.maxTokens))
                : null,
        };
        systemPrompts[settingsKey] = String(legacy?.advancedSettings?.systemPrompt ?? '');
        configSelections[index] = { providerId: provider.id, modelId };
    });

    const safeSelectedIndex = Number.isInteger(selectedConfigIndex)
        ? Math.max(0, Math.min(selectedConfigIndex, configSelections.length - 1))
        : 0;
    return {
        providerConfigs,
        selectedModel: configSelections[safeSelectedIndex]
            || (providerConfigs[0] ? {
                providerId: providerConfigs[0].id,
                modelId: providerConfigs[0].defaultModelId,
            } : null),
        modelSettings,
        systemPrompts,
        providerCredentials,
    };
}
