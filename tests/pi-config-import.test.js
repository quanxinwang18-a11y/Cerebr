import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePiConfiguration } from '../src/runtime/models/pi-config-import.js';
import { mergeProviderModels } from '../src/runtime/models/provider-config.js';

test('imports Pi provider, credentials, selected model and exact model parameters', () => {
    const result = parsePiConfiguration({
        modelsConfig: {
            providers: {
                'xf-maas': {
                    name: '讯飞 MaaS',
                    baseUrl: 'https://maas.example/v2',
                    api: 'openai-completions',
                    apiKey: 'local-secret',
                    headers: { 'x-tenant': 'one' },
                    models: [
                        { id: 'deep', name: 'Deep', reasoning: false, input: ['text'], contextWindow: 1048576, maxTokens: 8192 },
                        { id: 'mini', name: 'Mini', reasoning: true, input: ['text'], contextWindow: 204800, maxTokens: 8192, compat: { maxTokensField: 'max_tokens' } },
                    ],
                },
            },
        },
        settingsConfig: { defaultProvider: 'xf-maas', defaultModel: 'mini' },
    });
    assert.equal(result.providers[0].modelSource, 'provider');
    assert.equal(result.credentials['xf-maas'].key, 'local-secret');
    assert.deepEqual(result.credentials['xf-maas'].headers, [{ name: 'x-tenant', value: 'one' }]);
    assert.deepEqual(result.selectedModel, { providerId: 'xf-maas', modelId: 'mini' });
    assert.equal(result.providers[0].userModels[1].contextWindow, 204800);
    assert.equal(result.providers[0].userModels[1].reasoning, true);
    assert.equal(result.providers[0].userModels[1].compat.maxTokensField, 'max_tokens');
});

test('does not import Pi env/command credentials into browser storage', () => {
    const result = parsePiConfiguration({
        modelsConfig: {
            providers: {
                env: { baseUrl: 'https://example.test/v1', api: 'openai-completions', apiKey: '$OPENAI_API_KEY', models: [{ id: 'm' }] },
                command: { baseUrl: 'https://example.test/v1', api: 'openai-completions', apiKey: '!security find-generic-password', models: [{ id: 'm' }] },
            },
        },
    });
    assert.equal(result.credentials.env.key, '');
    assert.equal(result.credentials.command.key, '');
});

test('provider discovery keeps exact Pi metadata when the model endpoint only returns ids', () => {
    const provider = {
        id: 'custom', api: 'openai-completions', baseUrl: 'https://example.test/v1', modelSource: 'provider',
        userModels: [{ id: 'deepseek-chat', name: 'Pinned', contextWindow: 777777, maxTokens: 12345, reasoning: false, input: ['text'] }],
        modelOverrides: {}, hiddenModelIds: [],
    };
    const models = mergeProviderModels(provider, {
        providerModels: [{ id: 'deepseek-chat', inferred: true, inferredFields: ['contextWindow', 'maxTokens', 'reasoning', 'input'] }],
    });
    const model = models.find((entry) => entry.id === 'deepseek-chat');
    assert.equal(model.contextWindow, 777777);
    assert.equal(model.maxTokens, 12345);
    assert.equal(model.reasoning, false);
    assert.deepEqual(model.input, ['text']);
});

test('id-only discovery adapts known models from the global Pi catalog', () => {
    const provider = {
        id: 'custom', api: 'openai-completions', baseUrl: 'https://example.test/v1', modelSource: 'provider',
        userModels: [], modelOverrides: {}, hiddenModelIds: [],
    };
    const models = mergeProviderModels(provider, {
        providerModels: [{
            id: 'deepseek-v4-pro',
            inferred: true,
            inferredFields: ['contextWindow', 'maxTokens', 'reasoning', 'input'],
        }],
    });
    const model = models.find((entry) => entry.id === 'deepseek-v4-pro');
    assert.equal(model.source, 'provider-adapted');
    assert.notEqual(model.contextWindow, 128000);
    assert.ok(model.maxTokens > 0);
});
