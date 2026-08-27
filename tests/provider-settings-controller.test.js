import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCompatibilityApiConfig } from '../src/components/provider-settings-controller.js';

test('provider selection exposes the legacy apiConfig compatibility view without losing model metadata', () => {
    const config = buildCompatibilityApiConfig({
        provider: { id: 'p', name: 'Provider', api: 'openai-responses', baseUrl: 'https://example.test/v1', authMode: 'bearer' },
        model: { id: 'm', name: 'Model', api: 'openai-responses', maxTokens: 100, reasoning: true },
        credential: { key: 'secret', headers: [{ name: 'x-test', value: '1' }] },
        settings: { reasoningEffort: 'high', maxTokens: 50 },
        systemPrompt: 'System',
    });
    assert.equal(config.providerId, 'p');
    assert.equal(config.apiType, 'openai-responses');
    assert.equal(config.modelName, 'm');
    assert.equal(config.apiKey, 'secret');
    assert.equal(config.advancedSettings.systemPrompt, 'System');
    assert.equal(config.advancedSettings.maxTokens, 50);
    assert.equal(config.model.reasoning, true);
});
