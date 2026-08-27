import test from 'node:test';
import assert from 'node:assert/strict';

import {
    API_ANTHROPIC_MESSAGES,
    API_OPENAI_COMPLETIONS,
    mergeProviderModels,
    normalizePiBaseUrl,
    normalizeProviderConfig,
    providerModelKey,
} from '../src/runtime/models/provider-config.js';
import {
    ModelCatalogService,
    buildCatalogAuthHeaders,
    discoverProviderModels,
    joinProviderPath,
} from '../src/runtime/models/model-catalog-service.js';
import { migrateLegacyApiConfigs } from '../src/runtime/models/provider-migration.js';
import { PiModelRuntimeService, getPiApiStreams } from '../src/runtime/models/pi-model-runtime-service.js';

function response(payload, { status = 200, headers = {} } = {}) {
    return new Response(payload === null ? null : JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

function memoryCatalogStore(initial = {}) {
    const entries = structuredClone(initial);
    return {
        entries,
        async read(id) { return structuredClone(entries[id]); },
        async write(id, entry) { entries[id] = structuredClone(entry); },
        async delete(id) { delete entries[id]; },
    };
}

test('normalizes Pi API roots without forcing v1', () => {
    assert.equal(normalizePiBaseUrl('https://example.test/v2/chat/completions', API_OPENAI_COMPLETIONS), 'https://example.test/v2');
    assert.equal(normalizePiBaseUrl('https://api.anthropic.com/v1/messages', API_ANTHROPIC_MESSAGES), 'https://api.anthropic.com');
    assert.equal(joinProviderPath('https://example.test/v2', 'models'), 'https://example.test/v2/models');
    assert.equal(joinProviderPath('https://api.anthropic.com/v1', 'v1/models'), 'https://api.anthropic.com/v1/models');
});

test('provider config exposes Pi builtin catalogs and user override precedence', () => {
    const config = normalizeProviderConfig({
        id: 'openai-local',
        presetId: 'openai',
        modelOverrides: { 'gpt-4o': { name: 'My GPT', maxTokens: 9999 } },
        userModels: [{ id: 'private-model', contextWindow: 42 }],
    });
    const models = mergeProviderModels(config, {
        piModels: [{ id: 'gpt-4o', name: 'Remote GPT', contextWindow: 10 }],
        providerModels: [{ id: 'provider-new' }],
    });
    assert.equal(models.find((model) => model.id === 'gpt-4o').name, 'My GPT');
    assert.equal(models.find((model) => model.id === 'gpt-4o').maxTokens, 9999);
    assert.equal(models.find((model) => model.id === 'private-model').contextWindow, 42);
    assert.equal(models.find((model) => model.id === 'provider-new').inferred, true);
    assert.ok(models.every((model) => model.provider === 'openai-local'));
    assert.ok(models.every((model) => model.baseUrl === 'https://api.openai.com/v1'));
});

test('catalog auth headers do not mix Pi requests with provider credentials', () => {
    const headers = buildCatalogAuthHeaders({ api: API_ANTHROPIC_MESSAGES, authMode: 'auto' }, {
        apiKey: 'secret',
        headers: [{ name: 'x-extra', value: 'ok' }],
    });
    assert.equal(headers['x-api-key'], 'secret');
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(headers['x-extra'], 'ok');
});

test('discovers OpenAI-compatible, Anthropic and Google model lists', async () => {
    const openAI = await discoverProviderModels({
        id: 'custom', api: API_OPENAI_COMPLETIONS, baseUrl: 'https://example.test/v2', modelListPath: 'models', authMode: 'bearer',
    }, { apiKey: 'key' }, {
        fetchImpl: async (_url, init) => {
            assert.equal(init.headers.Authorization, 'Bearer key');
            return response({ data: [{ id: 'a' }] });
        },
    });
    assert.equal(openAI[0].id, 'a');
    assert.equal(openAI[0].contextWindow, 128000);

    let anthropicPage = 0;
    const anthropic = await discoverProviderModels({
        id: 'anthropic', api: API_ANTHROPIC_MESSAGES, baseUrl: 'https://api.anthropic.com', authMode: 'auto',
    }, { apiKey: 'key' }, {
        fetchImpl: async (url) => {
            anthropicPage++;
            return anthropicPage === 1
                ? response({ data: [{ id: 'claude-a', display_name: 'Claude A', max_input_tokens: 200, max_tokens: 20 }], has_more: true, last_id: 'claude-a' })
                : response({ data: [{ id: 'claude-b' }], has_more: false });
        },
    });
    assert.deepEqual(anthropic.map((model) => model.id), ['claude-a', 'claude-b']);
    assert.equal(anthropic[0].contextWindow, 200);

    const google = await discoverProviderModels({
        id: 'google', api: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com', authMode: 'auto',
    }, { apiKey: 'key' }, {
        fetchImpl: async (_url, init) => {
            assert.equal(init.headers['x-goog-api-key'], 'key');
            return response({ models: [
                { name: 'models/gemini-chat', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 100, outputTokenLimit: 10 },
                { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
            ] });
        },
    });
    assert.deepEqual(google.map((model) => model.id), ['gemini-chat']);
});

test('catalog refresh restores stale data, uses ETag and keeps failures non-destructive', async () => {
    const store = memoryCatalogStore({
        p: { piModels: [{ id: 'old' }], providerModels: [], checkedAt: 1, etag: 'old-tag' },
    });
    const calls = [];
    const service = new ModelCatalogService({
        store,
        now: () => 20_000_000,
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), headers: init.headers });
            if (String(url).includes('pi.dev')) {
                assert.equal(init.headers['If-None-Match'], 'old-tag');
                return response(null, { status: 304 });
            }
            return response({ message: 'unsupported' }, { status: 404 });
        },
    });
    const result = await service.refresh({
        id: 'p', presetId: 'openai', api: API_OPENAI_COMPLETIONS, baseUrl: 'https://example.test/v1', modelSource: 'hybrid', userModels: [], modelOverrides: {}, hiddenModelIds: [],
    }, { apiKey: 'secret' }, { force: true });
    assert.ok(result.models.some((model) => model.id === 'old'));
    assert.match(result.errors.provider, /HTTP 404/);
    assert.equal(calls[0].headers.Authorization, undefined);
    assert.equal(store.entries.p.piModels[0].id, 'old');
});

test('web catalog mode never performs network discovery', async () => {
    const service = new ModelCatalogService({
        store: memoryCatalogStore(),
        isExtension: false,
        fetchImpl: async () => { throw new Error('must not fetch'); },
    });
    assert.deepEqual(await service.refresh({ id: 'web' }), { skipped: 'web-manual-only', models: [] });
});

test('legacy migration groups distinct models and preserves conflicting duplicate profiles', () => {
    const shared = {
        apiType: API_OPENAI_COMPLETIONS,
        baseUrl: 'https://maas.example/v2/chat/completions',
        authMode: 'auto',
    };
    const result = migrateLegacyApiConfigs({
        apiConfigs: [
            { ...shared, id: 'a', modelName: 'model-a', advancedSettings: { systemPrompt: 'A', maxTokens: 10, reasoningEffort: 'off' } },
            { ...shared, id: 'b', modelName: 'model-b', advancedSettings: { systemPrompt: 'B', maxTokens: 20, reasoningEffort: 'high' } },
            { ...shared, id: 'c', modelName: 'model-a', advancedSettings: { systemPrompt: 'C', maxTokens: 30, reasoningEffort: 'off' } },
        ],
        selectedConfigIndex: 1,
        credentialsById: {
            a: { apiKey: 'same' }, b: { apiKey: 'same' }, c: { apiKey: 'same' },
        },
    });
    assert.equal(result.providerConfigs.length, 2);
    assert.equal(result.providerConfigs[0].baseUrl, 'https://maas.example/v2');
    assert.deepEqual(result.providerConfigs[0].userModels.map((model) => model.id), ['model-a', 'model-b']);
    assert.equal(result.selectedModel.modelId, 'model-b');
    assert.equal(result.systemPrompts[providerModelKey(result.providerConfigs[0].id, 'model-b')], 'B');
    assert.equal(result.providerCredentials[result.providerConfigs[0].id].key, 'same');
});

test('Pi runtime registers all four APIs and selects models from provider catalogs', async () => {
    const credentialEntries = {
        custom: { type: 'api_key', key: 'secret', headers: [] },
    };
    const credentials = {
        async read(id) { return credentialEntries[id]; },
        async list() { return Object.keys(credentialEntries).map((providerId) => ({ providerId, type: 'api_key' })); },
        async modify(id, update) { credentialEntries[id] = await update(credentialEntries[id]); return credentialEntries[id]; },
        async delete(id) { delete credentialEntries[id]; },
    };
    const runtime = new PiModelRuntimeService({ credentials });
    await runtime.configure({
        providerConfigs: [{
            id: 'custom',
            name: 'Custom',
            api: API_OPENAI_COMPLETIONS,
            baseUrl: 'https://example.test/v2',
            authMode: 'bearer',
            modelSource: 'manual',
            userModels: [{ id: 'model-a' }],
        }],
        selectedModel: { providerId: 'custom', modelId: 'model-a' },
    });
    assert.deepEqual(Object.keys(getPiApiStreams()).sort(), [
        'anthropic-messages',
        'google-generative-ai',
        'openai-completions',
        'openai-responses',
    ]);
    assert.equal(runtime.getSelectedModel().id, 'model-a');
    assert.equal(runtime.getSelectedModel().baseUrl, 'https://example.test/v2');
    assert.equal((await runtime.checkAuth('custom')).source, 'stored credential');
});
