import {
    anthropicMessagesApi,
    createModels,
    createProvider,
    googleGenerativeAIApi,
    openAICompletionsApi,
    openAIResponsesApi,
} from '../../vendor/pi-ai/index.js';
import {
    API_ANTHROPIC_MESSAGES,
    API_GOOGLE_GENERATIVE_AI,
    API_OPENAI_COMPLETIONS,
    API_OPENAI_RESPONSES,
    mergeProviderModels,
    normalizeProviderConfig,
} from './provider-config.js';
import { createBrowserAuthContext } from './browser-model-stores.js';

const API_STREAMS = Object.freeze({
    [API_OPENAI_COMPLETIONS]: openAICompletionsApi(),
    [API_OPENAI_RESPONSES]: openAIResponsesApi(),
    [API_ANTHROPIC_MESSAGES]: anthropicMessagesApi(),
    [API_GOOGLE_GENERATIVE_AI]: googleGenerativeAIApi(),
});

function stringValue(value) {
    return String(value ?? '').trim();
}

function headersToRecord(headers) {
    const record = {};
    const entries = Array.isArray(headers)
        ? headers.map((header) => [header?.name, header?.value])
        : Object.entries(headers && typeof headers === 'object' ? headers : {});
    entries.forEach(([name, value]) => {
        const normalized = stringValue(name);
        if (normalized) record[normalized] = String(value ?? '');
    });
    return record;
}

function credentialHeaders(providerConfig, credential) {
    const headers = headersToRecord(credential?.headers);
    const key = stringValue(credential?.key);
    const autoMode = providerConfig.api === API_ANTHROPIC_MESSAGES || providerConfig.api === API_GOOGLE_GENERATIVE_AI
        ? 'x-api-key'
        : 'bearer';
    const mode = providerConfig.authMode === 'auto' ? autoMode : providerConfig.authMode;
    if (key && mode === 'x-api-key') {
        headers[providerConfig.api === API_GOOGLE_GENERATIVE_AI ? 'x-goog-api-key' : 'x-api-key'] = key;
    }
    return { headers, key, mode };
}

function createBrowserProviderAuth(providerConfig) {
    return {
        name: `${providerConfig.name} API key`,
        check: async ({ credential, signal }) => {
            signal.throwIfAborted();
            if (providerConfig.authMode === 'none') return { type: 'api_key', source: 'no authentication' };
            return stringValue(credential?.key) ? { type: 'api_key', source: 'stored credential' } : undefined;
        },
        resolve: async ({ credential, signal }) => {
            signal.throwIfAborted();
            const resolved = credentialHeaders(providerConfig, credential);
            if (resolved.mode !== 'none' && !resolved.key) return undefined;
            return {
                auth: {
                    // Pi adapters require an API-key-shaped value even when a custom header owns auth.
                    apiKey: resolved.mode === 'bearer'
                        || (resolved.mode === 'x-api-key' && (
                            providerConfig.api === API_ANTHROPIC_MESSAGES
                            || providerConfig.api === API_GOOGLE_GENERATIVE_AI
                        ))
                        ? resolved.key
                        : 'unused',
                    headers: resolved.headers,
                },
                source: resolved.mode === 'none' ? 'no authentication' : 'stored credential',
            };
        },
    };
}

function createRuntimeProvider(providerConfig, models) {
    const apiMap = {};
    models.forEach((model) => {
        apiMap[model.api] = API_STREAMS[model.api];
    });
    return createProvider({
        id: providerConfig.id,
        name: providerConfig.name,
        baseUrl: providerConfig.baseUrl,
        auth: { apiKey: createBrowserProviderAuth(providerConfig) },
        models,
        api: apiMap,
    });
}

export class PiModelRuntimeService {
    constructor({ credentials, modelsStore, catalogService = null } = {}) {
        this.credentials = credentials;
        this.catalogService = catalogService;
        this.models = createModels({
            credentials,
            modelsStore,
            authContext: createBrowserAuthContext(),
        });
        this.providerConfigs = new Map();
        this.catalogEntries = new Map();
        this.selectedModel = null;
    }

    async configure({ providerConfigs = [], selectedModel = null } = {}) {
        this.models.clearProviders();
        this.providerConfigs.clear();
        this.catalogEntries.clear();
        for (const rawConfig of providerConfigs) {
            const config = normalizeProviderConfig(rawConfig);
            const cached = this.catalogService
                ? await this.catalogService.getCached(config.id).catch(() => undefined)
                : undefined;
            const models = mergeProviderModels(config, {
                ...(cached || {}),
                selectedModelId: selectedModel?.providerId === config.id ? selectedModel.modelId : '',
            });
            this.providerConfigs.set(config.id, config);
            if (cached) this.catalogEntries.set(config.id, cached);
            this.models.setProvider(createRuntimeProvider(config, models));
        }
        this.selectedModel = selectedModel && this.models.getModel(selectedModel.providerId, selectedModel.modelId)
            ? { providerId: selectedModel.providerId, modelId: selectedModel.modelId }
            : this.firstModelRef();
        return this.getSnapshot();
    }

    firstModelRef() {
        const model = this.models.getModels()[0];
        return model ? { providerId: model.provider, modelId: model.id } : null;
    }

    getSnapshot() {
        return {
            providers: Array.from(this.providerConfigs.values()),
            models: this.models.getModels(),
            selectedModel: this.selectedModel ? { ...this.selectedModel } : null,
        };
    }

    getProviderConfig(providerId) {
        return this.providerConfigs.get(providerId);
    }

    getModels(providerId) {
        return this.models.getModels(providerId);
    }

    getModel(providerId, modelId) {
        return this.models.getModel(providerId, modelId);
    }

    getSelectedModel() {
        if (!this.selectedModel) return undefined;
        return this.getModel(this.selectedModel.providerId, this.selectedModel.modelId);
    }

    selectModel(providerId, modelId) {
        const model = this.getModel(providerId, modelId);
        if (!model) return false;
        this.selectedModel = { providerId, modelId };
        return true;
    }

    async refreshProvider(providerId, options) {
        const config = this.providerConfigs.get(providerId);
        if (!config || !this.catalogService) return null;
        const storedCredential = await this.credentials?.read?.(providerId, options).catch(() => undefined);
        const credentials = storedCredential ? {
            apiKey: storedCredential.key,
            headers: storedCredential.headers,
        } : {};
        const result = await this.catalogService.refresh(config, credentials, options);
        if (result?.entry) this.catalogEntries.set(providerId, result.entry);
        const models = result?.models || mergeProviderModels(config, {
            ...(this.catalogEntries.get(providerId) || {}),
            selectedModelId: this.selectedModel?.providerId === providerId ? this.selectedModel.modelId : '',
        });
        this.models.setProvider(createRuntimeProvider(config, models));
        return { ...result, models };
    }

    checkAuth(providerId, options) {
        return this.models.checkAuth(providerId, options);
    }

    streamSimple(model, context, options) {
        return this.models.streamSimple(model, context, options);
    }

    completeSimple(model, context, options) {
        return this.models.completeSimple(model, context, options);
    }
}

export function getPiApiStreams() {
    return API_STREAMS;
}
