import test from 'node:test';
import assert from 'node:assert/strict';

import {
    API_TYPE_ANTHROPIC_MESSAGES,
    API_TYPE_OPENAI_COMPLETIONS,
    buildProviderRequest,
    consumeProviderSseLine,
    createProviderStreamState,
    normalizeAnthropicMessagesUrl,
} from '../src/runtime/chat/provider-adapters.js';

test('normalizes Anthropic base URLs and builds required headers', () => {
    assert.equal(
        normalizeAnthropicMessagesUrl('https://api.anthropic.com'),
        'https://api.anthropic.com/v1/messages'
    );
    const request = buildProviderRequest({
        apiConfig: {
            apiType: API_TYPE_ANTHROPIC_MESSAGES,
            authMode: 'auto',
            apiKey: 'secret',
            baseUrl: 'https://api.anthropic.com',
            modelName: 'claude-test',
            headers: [{ name: 'anthropic-version', value: 'custom-version' }],
            advancedSettings: { maxTokens: 2048 },
        },
        systemPrompt: 'Study the article.',
        messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(request.headers['x-api-key'], 'secret');
    assert.equal(request.headers['anthropic-version'], 'custom-version');
    assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(request.requestBody.system, 'Study the article.');
    assert.equal(request.requestBody.max_tokens, 2048);
    assert.deepEqual(request.requestBody.messages, [{ role: 'user', content: 'Hello' }]);
});
test('maps multimodal content to Anthropic content blocks', () => {
    const request = buildProviderRequest({
        apiConfig: {
            apiType: API_TYPE_ANTHROPIC_MESSAGES,
            authMode: 'none',
            baseUrl: 'https://gateway.example/v1/messages',
            modelName: 'claude-test',
        },
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: 'Look' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
            ],
        }],
    });

    assert.deepEqual(request.requestBody.messages[0].content, [
        { type: 'text', text: 'Look' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    ]);
});

test('parses OpenAI content and reasoning SSE lines', () => {
    const state = createProviderStreamState(API_TYPE_OPENAI_COMPLETIONS);
    assert.equal(consumeProviderSseLine('data: {"choices":[{"delta":{"reasoning_content":"think"}}]}', state).hasUpdate, true);
    assert.equal(consumeProviderSseLine('data: {"choices":[{"delta":{"content":"answer"}}]}', state).hasUpdate, true);
    assert.equal(consumeProviderSseLine('data: [DONE]', state).done, true);
    assert.equal(state.reasoning_content, 'think');
    assert.equal(state.content, 'answer');
});

test('parses Anthropic event, text, thinking, ping, error, and stop lines', () => {
    const state = createProviderStreamState(API_TYPE_ANTHROPIC_MESSAGES);
    consumeProviderSseLine('event: content_block_delta', state);
    consumeProviderSseLine('data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"think"}}', state);
    consumeProviderSseLine('', state);
    consumeProviderSseLine('event: ping', state);
    assert.equal(consumeProviderSseLine('data: {"type":"ping"}', state).hasUpdate, false);
    consumeProviderSseLine('event: content_block_delta', state);
    consumeProviderSseLine('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}', state);
    const errorResult = consumeProviderSseLine('data: {"type":"error","error":{"type":"overloaded_error","message":"Busy"}}', state);
    assert.deepEqual(errorResult.error, { code: 'overloaded_error', message: 'Busy' });
    assert.equal(consumeProviderSseLine('data: {"type":"message_stop"}', state).done, true);
    assert.equal(state.reasoning_content, 'think');
    assert.equal(state.content, 'answer');
});
