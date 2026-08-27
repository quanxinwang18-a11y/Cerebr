import {
    API_ANTHROPIC_MESSAGES,
    API_GOOGLE_GENERATIVE_AI,
    MODEL_SOURCE_HYBRID,
    MODEL_SOURCE_PROVIDER,
    PROVIDER_PRESETS,
    normalizeModelDefinition,
    normalizeProviderApi,
    normalizeProviderConfig,
} from './provider-config.js';

function text(value) {
    return String(value ?? '').trim();
}

function literalSecret(value) {
    if (typeof value !== 'string') return '';
    const secret = value.trim();
    if (!secret || /^\$(?:\{|[A-Z_])/u.test(secret) || /^!/.test(secret)) return '';
    return secret;
}

function literalHeaders(headers) {
    return Object.entries(headers && typeof headers === 'object' ? headers : {})
        .map(([name, value]) => ({ name: text(name), value: literalSecret(value) || (typeof value === 'string' ? value : '') }))
        .filter((header) => header.name && header.value);
}

function authMode(provider, api) {
    if (provider?.authHeader === true) return 'bearer';
    if (api === API_ANTHROPIC_MESSAGES || api === API_GOOGLE_GENERATIVE_AI) return 'x-api-key';
    return 'auto';
}

export function parsePiConfiguration({
    modelsConfig,
    settingsConfig = {},
    existingProviderIds = [],
} = {}) {
    if (!modelsConfig?.providers || typeof modelsConfig.providers !== 'object') {
        throw new Error('Pi models.json must contain a providers object');
    }
    const usedIds = new Set(existingProviderIds.map(text).filter(Boolean));
    const providers = [];
    const credentials = {};
    const idMap = new Map();

    for (const [sourceId, rawProvider] of Object.entries(modelsConfig.providers)) {
        if (!rawProvider || typeof rawProvider !== 'object') continue;
        const api = normalizeProviderApi(rawProvider.api);
        let id = text(sourceId) || 'pi-provider';
        if (usedIds.has(id)) {
            let suffix = 2;
            const base = `${id}-pi`;
            id = base;
            while (usedIds.has(id)) id = `${base}-${suffix++}`;
        }
        usedIds.add(id);
        idMap.set(sourceId, id);
        const presetId = PROVIDER_PRESETS[sourceId] ? sourceId : null;
        const provider = normalizeProviderConfig({
            id,
            name: text(rawProvider.name) || sourceId,
            presetId,
            api,
            baseUrl: rawProvider.baseUrl,
            authMode: authMode(rawProvider, api),
            modelSource: presetId ? MODEL_SOURCE_HYBRID : MODEL_SOURCE_PROVIDER,
            defaultModelId: rawProvider.models?.[0]?.id || '',
            userModels: (Array.isArray(rawProvider.models) ? rawProvider.models : []).map((model) => ({
                ...model,
                api: model.api || api,
                provider: id,
                baseUrl: model.baseUrl || rawProvider.baseUrl,
                source: 'user',
                inferred: false,
            })),
            modelOverrides: rawProvider.modelOverrides || {},
        });
        provider.userModels = provider.userModels.map((model) => normalizeModelDefinition(model, {
            providerId: id,
            api,
            baseUrl: provider.baseUrl,
            source: 'user',
        })).filter(Boolean);
        providers.push(provider);
        credentials[id] = {
            type: 'api_key',
            key: literalSecret(rawProvider.apiKey),
            headers: literalHeaders(rawProvider.headers),
        };
    }

    const selectedProviderId = idMap.get(settingsConfig?.defaultProvider) || providers[0]?.id || null;
    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
    const requestedModel = text(settingsConfig?.defaultModel);
    const selectedModelId = selectedProvider?.userModels.some((model) => model.id === requestedModel)
        ? requestedModel
        : selectedProvider?.defaultModelId || selectedProvider?.userModels[0]?.id || null;

    return {
        providers,
        credentials,
        selectedModel: selectedProviderId && selectedModelId
            ? { providerId: selectedProviderId, modelId: selectedModelId }
            : null,
    };
}
