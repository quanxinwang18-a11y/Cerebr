import {
    API_ANTHROPIC_MESSAGES,
    API_GOOGLE_GENERATIVE_AI,
    defaultModelListPath,
    mergeProviderModels,
    normalizeModelDefinition,
    normalizeModelSource,
    normalizePiBaseUrl,
    normalizeProviderApi,
} from './provider-config.js';

export const MODEL_CATALOG_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const PI_CATALOG_BASE_URL = 'https://pi.dev';

function stringValue(value) {
    return String(value ?? '').trim();
}

function customHeadersToRecord(headers) {
    const entries = Array.isArray(headers)
        ? headers.map((header) => [header?.name, header?.value])
        : Object.entries(headers && typeof headers === 'object' ? headers : {});
    const record = {};
    entries.forEach(([name, value]) => {
        const normalized = stringValue(name);
        if (normalized) record[normalized] = String(value ?? '');
    });
    return record;
}

function setHeader(headers, name, value) {
    for (const existing of Object.keys(headers)) {
        if (existing.toLowerCase() === name.toLowerCase()) delete headers[existing];
    }
    if (value !== undefined && value !== null) headers[name] = value;
}

export function buildCatalogAuthHeaders(providerConfig, credentials = {}) {
    const headers = { Accept: 'application/json' };
    const api = normalizeProviderApi(providerConfig?.api);
    const authMode = stringValue(providerConfig?.authMode || 'auto').toLowerCase();
    const apiKey = stringValue(credentials?.apiKey || credentials?.key);
    const resolvedMode = authMode === 'auto'
        ? (api === API_ANTHROPIC_MESSAGES || api === API_GOOGLE_GENERATIVE_AI ? 'x-api-key' : 'bearer')
        : authMode;
    if (apiKey && resolvedMode === 'bearer') setHeader(headers, 'Authorization', `Bearer ${apiKey}`);
    if (apiKey && resolvedMode === 'x-api-key') {
        setHeader(headers, api === API_GOOGLE_GENERATIVE_AI ? 'x-goog-api-key' : 'x-api-key', apiKey);
    }
    if (api === API_ANTHROPIC_MESSAGES) setHeader(headers, 'anthropic-version', '2023-06-01');
    for (const [name, value] of Object.entries(customHeadersToRecord(credentials?.headers))) {
        setHeader(headers, name, value);
    }
    return headers;
}

export function joinProviderPath(baseUrl, path) {
    const base = normalizePiBaseUrl(baseUrl).replace(/\/+$/u, '');
    const suffix = stringValue(path).replace(/^\/+|\/+$/gu, '');
    if (!base) return '';
    if (!suffix) return base;
    const baseParts = new URL(base).pathname.replace(/\/+$/u, '').split('/').filter(Boolean);
    const suffixParts = suffix.split('/').filter(Boolean);
    while (baseParts.length && suffixParts.length && baseParts.at(-1) === suffixParts[0]) suffixParts.shift();
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/${suffixParts.join('/')}`;
    return url.toString();
}

function assertResponse(response, label) {
    if (!response.ok) {
        const error = new Error(`${label} failed with HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
}

function parseOpenAIModels(payload, defaults) {
    const entries = Array.isArray(payload?.data) ? payload.data : [];
    return entries.map((model) => normalizeModelDefinition({
        id: model?.id,
        name: model?.name || model?.id,
        contextWindow: model?.context_length || model?.top_provider?.context_length,
        maxTokens: model?.top_provider?.max_completion_tokens,
        input: model?.architecture?.input_modalities?.includes('image') ? ['text', 'image'] : ['text'],
        reasoning: Array.isArray(model?.supported_parameters) && model.supported_parameters.includes('reasoning'),
        cost: model?.pricing ? {
            input: Number(model.pricing.prompt) * 1_000_000 || 0,
            output: Number(model.pricing.completion) * 1_000_000 || 0,
            cacheRead: 0,
            cacheWrite: 0,
        } : undefined,
    }, { ...defaults, source: 'provider', inferred: !model?.context_length })).filter(Boolean);
}

async function fetchAnthropicModels(url, headers, fetchImpl, signal, defaults) {
    const models = [];
    let afterId = '';
    do {
        const pageUrl = new URL(url);
        pageUrl.searchParams.set('limit', '1000');
        if (afterId) pageUrl.searchParams.set('after_id', afterId);
        const response = await fetchImpl(pageUrl, { headers, signal });
        assertResponse(response, 'Anthropic model discovery');
        const payload = await response.json();
        for (const model of Array.isArray(payload?.data) ? payload.data : []) {
            models.push(normalizeModelDefinition({
                id: model?.id,
                name: model?.display_name || model?.id,
                contextWindow: model?.max_input_tokens,
                maxTokens: model?.max_tokens,
                reasoning: model?.capabilities?.thinking?.supported === true
                    || model?.capabilities?.effort != null,
                input: model?.capabilities?.vision?.supported === true ? ['text', 'image'] : ['text'],
            }, { ...defaults, source: 'provider', inferred: !model?.max_input_tokens }));
        }
        afterId = payload?.has_more && payload?.last_id ? String(payload.last_id) : '';
    } while (afterId);
    return models.filter(Boolean);
}

async function fetchGoogleModels(url, headers, fetchImpl, signal, defaults) {
    const models = [];
    let pageToken = '';
    do {
        const pageUrl = new URL(url);
        pageUrl.searchParams.set('pageSize', '1000');
        if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
        const response = await fetchImpl(pageUrl, { headers, signal });
        assertResponse(response, 'Google model discovery');
        const payload = await response.json();
        for (const model of Array.isArray(payload?.models) ? payload.models : []) {
            const methods = model?.supportedGenerationMethods || model?.supported_actions || [];
            if (!methods.includes('generateContent')) continue;
            const id = stringValue(model?.name).replace(/^models\//u, '');
            models.push(normalizeModelDefinition({
                id,
                name: model?.displayName || id,
                contextWindow: model?.inputTokenLimit,
                maxTokens: model?.outputTokenLimit,
                input: ['text', 'image'],
            }, { ...defaults, source: 'provider', inferred: !model?.inputTokenLimit }));
        }
        pageToken = stringValue(payload?.nextPageToken);
    } while (pageToken);
    return models.filter(Boolean);
}

export async function discoverProviderModels(providerConfig, credentials, {
    fetchImpl = globalThis.fetch,
    signal,
} = {}) {
    const api = normalizeProviderApi(providerConfig?.api);
    const path = providerConfig?.modelListPath || defaultModelListPath(api);
    const url = joinProviderPath(providerConfig?.baseUrl, path);
    const headers = buildCatalogAuthHeaders(providerConfig, credentials);
    const defaults = {
        providerId: providerConfig.id,
        api,
        baseUrl: providerConfig.baseUrl,
    };
    if (api === API_ANTHROPIC_MESSAGES) {
        return fetchAnthropicModels(url, headers, fetchImpl, signal, defaults);
    }
    if (api === API_GOOGLE_GENERATIVE_AI) {
        return fetchGoogleModels(url, headers, fetchImpl, signal, defaults);
    }
    const response = await fetchImpl(url, { headers, signal });
    assertResponse(response, 'OpenAI-compatible model discovery');
    return parseOpenAIModels(await response.json(), defaults);
}

function parsePiCatalog(payload, providerConfig) {
    const entries = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.models)
            ? payload.models
            : payload && typeof payload === 'object'
                ? Object.values(payload)
                : [];
    return entries.map((model) => normalizeModelDefinition(model, {
        providerId: providerConfig.id,
        api: providerConfig.api,
        baseUrl: providerConfig.baseUrl,
        source: 'pi-catalog',
    })).filter(Boolean);
}

export class ModelCatalogService {
    constructor({ store, fetchImpl = globalThis.fetch, isExtension = true, now = () => Date.now() }) {
        this.store = store;
        this.fetchImpl = fetchImpl;
        this.isExtension = isExtension;
        this.now = now;
        this.generations = new Map();
        this.controllers = new Map();
    }

    async getCached(providerId, options) {
        if (!this.isExtension) return undefined;
        return this.store.read(providerId, options);
    }

    abort(providerId) {
        this.controllers.get(providerId)?.abort();
        this.controllers.delete(providerId);
        this.generations.set(providerId, (this.generations.get(providerId) || 0) + 1);
    }

    async refresh(providerConfig, credentials = {}, { force = false, signal } = {}) {
        if (!this.isExtension) return { skipped: 'web-manual-only', models: [] };
        this.abort(providerConfig.id);
        const generation = this.generations.get(providerConfig.id) || 0;
        const controller = new AbortController();
        this.controllers.set(providerConfig.id, controller);
        const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        const cached = await this.store.read(providerConfig.id, { signal: combinedSignal }) || {};
        if (!force && cached.checkedAt && this.now() - cached.checkedAt < MODEL_CATALOG_REFRESH_INTERVAL_MS) {
            return { cached: true, entry: cached, models: mergeProviderModels(providerConfig, cached) };
        }

        const source = normalizeModelSource(providerConfig.modelSource);
        const wantsPi = source === 'hybrid' || source === 'pi-catalog';
        const wantsProvider = source === 'hybrid' || source === 'provider';
        let piModels = cached.piModels || [];
        let providerModels = cached.providerModels || [];
        let etag = cached.etag;
        let lastModified = cached.lastModified;
        const errors = {};

        if (wantsPi && providerConfig.presetId) {
            try {
                const headers = { Accept: 'application/json' };
                if (etag && piModels.length) headers['If-None-Match'] = etag;
                const url = new URL(`/api/models/providers/${encodeURIComponent(providerConfig.presetId)}`, PI_CATALOG_BASE_URL);
                const response = await this.fetchImpl(url, { headers, signal: combinedSignal });
                if (response.status !== 304 && response.status !== 404 && response.status !== 501) {
                    assertResponse(response, 'Pi model catalog');
                    piModels = parsePiCatalog(await response.json(), providerConfig);
                    etag = response.headers.get('etag') || undefined;
                    const parsed = Date.parse(response.headers.get('last-modified') || '');
                    lastModified = Number.isNaN(parsed) ? 0 : parsed;
                }
            } catch (error) {
                if (combinedSignal.aborted) throw error;
                errors.pi = error instanceof Error ? error.message : String(error);
            }
        }

        if (wantsProvider) {
            try {
                providerModels = await discoverProviderModels(providerConfig, credentials, {
                    fetchImpl: this.fetchImpl,
                    signal: combinedSignal,
                });
            } catch (error) {
                if (combinedSignal.aborted) throw error;
                errors.provider = error instanceof Error ? error.message : String(error);
            }
        }

        const entry = {
            models: [...piModels, ...providerModels],
            piModels,
            providerModels,
            checkedAt: this.now(),
            lastModified,
            etag,
            errors,
        };
        if (combinedSignal.aborted || this.generations.get(providerConfig.id) !== generation) {
            return { aborted: true, entry: cached, models: mergeProviderModels(providerConfig, cached) };
        }
        await this.store.write(providerConfig.id, entry, { signal: combinedSignal });
        if (this.controllers.get(providerConfig.id) === controller) this.controllers.delete(providerConfig.id);
        return { entry, errors, models: mergeProviderModels(providerConfig, entry) };
    }
}
