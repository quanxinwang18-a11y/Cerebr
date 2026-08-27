import {
    ANTHROPIC_MODELS,
    CEREBRAS_MODELS,
    DEEPSEEK_MODELS,
    GOOGLE_MODELS,
    GROQ_MODELS,
    MINIMAX_CN_MODELS,
    MISTRAL_MODELS,
    MOONSHOTAI_CN_MODELS,
    OPENAI_MODELS,
    OPENROUTER_MODELS,
    XAI_MODELS,
} from '../../vendor/pi-ai/index.js';

export const API_OPENAI_COMPLETIONS = 'openai-completions';
export const API_OPENAI_RESPONSES = 'openai-responses';
export const API_ANTHROPIC_MESSAGES = 'anthropic-messages';
export const API_GOOGLE_GENERATIVE_AI = 'google-generative-ai';

export const SUPPORTED_MODEL_APIS = Object.freeze([
    API_OPENAI_COMPLETIONS,
    API_OPENAI_RESPONSES,
    API_ANTHROPIC_MESSAGES,
    API_GOOGLE_GENERATIVE_AI,
]);

export const MODEL_SOURCE_HYBRID = 'hybrid';
export const MODEL_SOURCE_PI_CATALOG = 'pi-catalog';
export const MODEL_SOURCE_PROVIDER = 'provider';
export const MODEL_SOURCE_MANUAL = 'manual';

export const MODEL_SOURCES = Object.freeze([
    MODEL_SOURCE_HYBRID,
    MODEL_SOURCE_PI_CATALOG,
    MODEL_SOURCE_PROVIDER,
    MODEL_SOURCE_MANUAL,
]);

const PRESET_DEFINITIONS = [
    ['openai', 'OpenAI', API_OPENAI_RESPONSES, 'https://api.openai.com/v1', 'bearer', OPENAI_MODELS],
    ['anthropic', 'Anthropic', API_ANTHROPIC_MESSAGES, 'https://api.anthropic.com', 'x-api-key', ANTHROPIC_MODELS],
    ['google', 'Google Gemini', API_GOOGLE_GENERATIVE_AI, 'https://generativelanguage.googleapis.com', 'x-api-key', GOOGLE_MODELS],
    ['openrouter', 'OpenRouter', API_OPENAI_COMPLETIONS, 'https://openrouter.ai/api/v1', 'bearer', OPENROUTER_MODELS],
    ['deepseek', 'DeepSeek', API_OPENAI_COMPLETIONS, 'https://api.deepseek.com', 'bearer', DEEPSEEK_MODELS],
    ['groq', 'Groq', API_OPENAI_COMPLETIONS, 'https://api.groq.com/openai/v1', 'bearer', GROQ_MODELS],
    ['xai', 'xAI', API_OPENAI_COMPLETIONS, 'https://api.x.ai/v1', 'bearer', XAI_MODELS],
    ['mistral', 'Mistral', API_OPENAI_COMPLETIONS, 'https://api.mistral.ai/v1', 'bearer', MISTRAL_MODELS],
    ['moonshotai-cn', 'Moonshot AI CN', API_OPENAI_COMPLETIONS, 'https://api.moonshot.cn/v1', 'bearer', MOONSHOTAI_CN_MODELS],
    ['minimax-cn', 'MiniMax CN', API_ANTHROPIC_MESSAGES, 'https://api.minimaxi.com/anthropic', 'x-api-key', MINIMAX_CN_MODELS],
    ['cerebras', 'Cerebras', API_OPENAI_COMPLETIONS, 'https://api.cerebras.ai/v1', 'bearer', CEREBRAS_MODELS],
];

export const PROVIDER_PRESETS = Object.freeze(Object.fromEntries(
    PRESET_DEFINITIONS.map(([id, name, api, baseUrl, authMode, models]) => [id, Object.freeze({
        id,
        name,
        api,
        baseUrl,
        authMode,
        models: Object.freeze(Object.values(models)),
    })])
));

function stringValue(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function positiveInt(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

export function normalizeProviderApi(value) {
    const api = stringValue(value).toLowerCase();
    return SUPPORTED_MODEL_APIS.includes(api) ? api : API_OPENAI_COMPLETIONS;
}

export function normalizeModelSource(value) {
    const source = stringValue(value).toLowerCase();
    return MODEL_SOURCES.includes(source) ? source : MODEL_SOURCE_HYBRID;
}

export function normalizePiBaseUrl(value, api = API_OPENAI_COMPLETIONS) {
    const raw = stringValue(value).replace(/\/+$/u, '');
    if (!raw) return '';
    if (normalizeProviderApi(api) === API_ANTHROPIC_MESSAGES) {
        return raw.replace(/\/v1\/messages$/iu, '').replace(/\/messages$/iu, '');
    }
    if (normalizeProviderApi(api) === API_OPENAI_RESPONSES) {
        return raw.replace(/\/responses$/iu, '');
    }
    return raw.replace(/\/chat\/completions$/iu, '');
}

export function defaultModelListPath(api) {
    switch (normalizeProviderApi(api)) {
        case API_ANTHROPIC_MESSAGES:
            return 'v1/models';
        case API_GOOGLE_GENERATIVE_AI:
            return 'v1beta/models';
        default:
            return 'models';
    }
}

export function normalizeModelDefinition(model, {
    providerId,
    api,
    baseUrl,
    source = 'user',
    inferred = false,
} = {}) {
    const id = stringValue(model?.id);
    if (!id) return null;
    const normalizedApi = normalizeProviderApi(model?.api || api);
    const normalizedProvider = stringValue(providerId, model?.provider);
    const normalizedBaseUrl = normalizePiBaseUrl(baseUrl || model?.baseUrl, normalizedApi);
    return {
        ...model,
        id,
        name: stringValue(model?.name, id),
        api: normalizedApi,
        provider: normalizedProvider,
        baseUrl: normalizedBaseUrl,
        reasoning: !!model?.reasoning,
        input: Array.isArray(model?.input) && model.input.length
            ? Array.from(new Set(model.input.filter((item) => item === 'text' || item === 'image')))
            : ['text'],
        cost: {
            input: Number(model?.cost?.input) || 0,
            output: Number(model?.cost?.output) || 0,
            cacheRead: Number(model?.cost?.cacheRead) || 0,
            cacheWrite: Number(model?.cost?.cacheWrite) || 0,
            ...(Array.isArray(model?.cost?.tiers) ? { tiers: model.cost.tiers } : {}),
        },
        contextWindow: positiveInt(model?.contextWindow, 128000),
        maxTokens: positiveInt(model?.maxTokens, 16384),
        source: stringValue(model?.source, source),
        inferred: model?.inferred === true || inferred,
    };
}

export function normalizeProviderConfig(provider, { generateId = () => crypto.randomUUID() } = {}) {
    const preset = PROVIDER_PRESETS[provider?.presetId] || null;
    const api = normalizeProviderApi(provider?.api || preset?.api);
    const id = stringValue(provider?.id) || generateId();
    const baseUrl = normalizePiBaseUrl(provider?.baseUrl || preset?.baseUrl, api);
    return {
        id,
        name: stringValue(provider?.name, preset?.name || id),
        presetId: preset?.id || stringValue(provider?.presetId) || null,
        api,
        baseUrl,
        authMode: stringValue(provider?.authMode, preset?.authMode || 'auto'),
        modelSource: normalizeModelSource(provider?.modelSource),
        modelListPath: stringValue(provider?.modelListPath, defaultModelListPath(api)),
        defaultModelId: stringValue(provider?.defaultModelId),
        userModels: (Array.isArray(provider?.userModels) ? provider.userModels : [])
            .map((model) => normalizeModelDefinition(model, { providerId: id, api, baseUrl, source: 'user' }))
            .filter(Boolean),
        modelOverrides: provider?.modelOverrides && typeof provider.modelOverrides === 'object'
            ? structuredClone(provider.modelOverrides)
            : {},
        hiddenModelIds: Array.from(new Set(
            (Array.isArray(provider?.hiddenModelIds) ? provider.hiddenModelIds : [])
                .map((modelId) => stringValue(modelId))
                .filter(Boolean)
        )),
    };
}

export function getPresetModels(providerConfig) {
    const preset = PROVIDER_PRESETS[providerConfig?.presetId];
    if (!preset) return [];
    return preset.models
        .map((model) => normalizeModelDefinition(model, {
            providerId: providerConfig.id,
            api: model.api || providerConfig.api,
            baseUrl: providerConfig.baseUrl,
            source: 'pi-builtin',
        }))
        .filter(Boolean);
}

function mergeById(base, overlay) {
    const merged = new Map(base.map((model) => [model.id, model]));
    overlay.forEach((model) => {
        const current = merged.get(model.id);
        merged.set(model.id, current ? { ...current, ...model } : model);
    });
    return Array.from(merged.values());
}

export function mergeProviderModels(providerConfig, {
    piModels = [],
    providerModels = [],
    selectedModelId = '',
} = {}) {
    const config = normalizeProviderConfig(providerConfig);
    const normalizeLayer = (models, source, inferred = false) => (Array.isArray(models) ? models : [])
        .map((model) => normalizeModelDefinition(model, {
            providerId: config.id,
            api: config.api,
            baseUrl: config.baseUrl,
            source,
            inferred,
        }))
        .filter(Boolean);

    let models = getPresetModels(config);
    models = mergeById(models, normalizeLayer(piModels, 'pi-catalog'));
    models = mergeById(models, normalizeLayer(providerModels, 'provider', true));
    models = mergeById(models, normalizeLayer(config.userModels, 'user'));
    models = models.map((model) => {
        const override = config.modelOverrides[model.id];
        return override
            ? normalizeModelDefinition({ ...model, ...override, source: 'user-override', inferred: false }, {
                providerId: config.id,
                api: config.api,
                baseUrl: config.baseUrl,
            })
            : model;
    });

    const hidden = new Set(config.hiddenModelIds);
    models = models.filter((model) => !hidden.has(model.id) || model.id === selectedModelId);
    if (selectedModelId && !models.some((model) => model.id === selectedModelId)) {
        models.push(normalizeModelDefinition({ id: selectedModelId, name: selectedModelId }, {
            providerId: config.id,
            api: config.api,
            baseUrl: config.baseUrl,
            source: 'stale-selected',
            inferred: true,
        }));
    }
    return models;
}

export function providerModelKey(providerId, modelId) {
    return `${encodeURIComponent(String(providerId))}::${encodeURIComponent(String(modelId))}`;
}
