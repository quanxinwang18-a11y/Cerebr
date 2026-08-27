import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildApiCredentialsMap,
    mergeApiCredentials,
    normalizeApiConfigRecord,
    stripApiConfigForSync,
} from '../src/runtime/chat/api-config.js';

test('normalizes legacy configs as OpenAI configs', () => {
    const config = normalizeApiConfigRecord({
        id: 'legacy',
        apiKey: 'old-secret',
        baseUrl: 'https://proxy.example/v1',
        modelName: 'legacy-model',
    });
    assert.equal(config.apiType, 'openai-completions');
    assert.equal(config.authMode, 'auto');
    assert.equal(config.baseUrl, 'https://proxy.example/v1/chat/completions');
});
test('sync payload strips API keys and custom headers', () => {
    const config = normalizeApiConfigRecord({
        id: 'config-1',
        apiKey: 'secret',
        headers: [{ name: 'Authorization', value: 'also-secret' }],
    });
    const synced = stripApiConfigForSync(config);
    assert.equal('apiKey' in synced, false);
    assert.equal('headers' in synced, false);
    assert.equal('systemPrompt' in synced.advancedSettings, false);
    assert.deepEqual(buildApiCredentialsMap([config]), {
        'config-1': {
            apiKey: 'secret',
            headers: [{ name: 'Authorization', value: 'also-secret' }],
        },
    });
});

test('local credentials override legacy inline credentials', () => {
    const merged = mergeApiCredentials(
        { id: 'config-1', apiKey: 'legacy', headers: [] },
        { apiKey: 'local', headers: [{ name: 'x-secret', value: 'value' }] }
    );
    assert.equal(merged.apiKey, 'local');
    assert.deepEqual(merged.headers, [{ name: 'x-secret', value: 'value' }]);
});
