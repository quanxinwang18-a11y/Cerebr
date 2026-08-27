import test from 'node:test';
import assert from 'node:assert/strict';

import {
    consumePiStream,
    createLifecycleFetch,
    createPiChatRequest,
    toPiContext,
} from '../src/runtime/chat/pi-chat-adapter.js';
import { callAPI } from '../src/runtime/chat/api-client.js';

async function* events(items) {
    for (const item of items) yield item;
}

test('converts Cerebr text and data images to Pi context without hidden reasoning', () => {
    const model = { id: 'm', api: 'openai-completions', provider: 'p' };
    const context = toPiContext([
        { role: 'user', content: 'See ![x](data:image/png;base64,AAAA)' },
        { role: 'assistant', content: 'answer', reasoning_content: 'hidden' },
    ], model, 'system');
    assert.equal(context.systemPrompt, 'system');
    assert.equal(context.messages[0].content[1].type, 'image');
    assert.equal(context.messages[1].content[0].text, 'answer');
    assert.equal(JSON.stringify(context).includes('hidden'), false);
});

test('creates Pi request models from full legacy endpoints', async () => {
    const request = await createPiChatRequest({
        id: 'xf', apiType: 'openai-completions', baseUrl: 'https://maas.example/v2/chat/completions',
        modelName: 'model-a', apiKey: 'secret', authMode: 'auto',
        advancedSettings: { maxTokens: 8192, reasoningEffort: 'off' },
    });
    assert.equal(request.model.baseUrl, 'https://maas.example/v2');
    assert.equal(request.model.id, 'model-a');
});

test('lifecycle fetch preserves one request hook and applies URL, body and header patches', async () => {
    let beforeCalls = 0;
    let responseCalls = 0;
    const state = {};
    const fetchImpl = createLifecycleFetch({
        providerConfig: { api: 'openai-completions', authMode: 'x-api-key' },
        credential: { headers: [{ name: 'x-api-key', value: 'secret' }] },
        signal: new AbortController().signal,
        state,
        lifecycle: {
            async beforeRequest(descriptor) {
                beforeCalls++;
                assert.equal(descriptor.requestInit.headers.authorization, undefined);
                return {
                    url: 'https://patched.test/chat',
                    requestBody: { ...descriptor.requestBody, patched: true },
                    requestInit: { headers: { 'x-plugin': 'yes' } },
                };
            },
            async onResponse() { responseCalls++; },
        },
        fetchImpl: async (url, init) => {
            assert.equal(url, 'https://patched.test/chat');
            assert.equal(JSON.parse(init.body).patched, true);
            assert.equal(init.headers['x-plugin'], 'yes');
            return new Response('{}', { status: 200 });
        },
    });
    await fetchImpl('https://original.test', {
        method: 'POST',
        headers: { Authorization: 'Bearer unused', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'm' }),
    });
    assert.equal(beforeCalls, 1);
    assert.equal(responseCalls, 1);
    assert.equal(state.url, 'https://patched.test/chat');
});

test('Pi stream bridge accumulates text and thinking and maps aborts', async () => {
    const updates = [];
    const result = await consumePiStream(events([
        { type: 'text_delta', delta: 'Hello', partial: { api: 'openai-completions' } },
        { type: 'thinking_delta', delta: 'Why', partial: { api: 'openai-completions' } },
        { type: 'text_delta', delta: '!', partial: { api: 'openai-completions' } },
        { type: 'done', reason: 'stop', message: {} },
    ]), { onUpdate: (message) => updates.push(message) });
    assert.deepEqual(result, { content: 'Hello!', reasoning_content: 'Why' });
    assert.deepEqual(updates.at(-1), result);
    await assert.rejects(
        consumePiStream(events([{ type: 'error', reason: 'aborted', error: { errorMessage: 'stopped' } }])),
        (error) => error?.name === 'AbortError'
    );
});

test('Pi stream bridge retains misfiled reasoning detection', async () => {
    await assert.rejects(
        consumePiStream(events([
            { type: 'text_delta', delta: 'thi', partial: {} },
            { type: 'text_delta', delta: 'nk privately', partial: {} },
        ]), {
            detectMisfiledThinkSilently: true,
            misfiledThinkSilentlyPrefixes: ['think'],
        }),
        (error) => error?.code === 'CEREBR_MISFILED_THINK_SILENTLY'
    );
});

test('callAPI streams an OpenAI-compatible response through Pi and invokes request hooks once', async () => {
    const originalFetch = globalThis.fetch;
    let beforeCalls = 0;
    let seenBody;
    globalThis.fetch = async (_url, init) => {
        seenBody = JSON.parse(init.body);
        return new Response([
            'data: {"id":"x","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}',
            '',
            'data: {"id":"x","choices":[{"index":0,"delta":{"content":" Pi"},"finish_reason":"stop"}]}',
            '',
            'data: [DONE]',
            '',
        ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } });
    };
    const updates = [];
    const chatManager = {
        updateLastMessage(_chatId, message) { updates.push(message); },
    };
    try {
        const request = await callAPI({
            messages: [{ role: 'user', content: 'Hi' }],
            apiConfig: {
                id: 'custom', apiType: 'openai-completions', baseUrl: 'https://example.test/v2',
                modelName: 'model-a', apiKey: 'secret', authMode: 'auto', headers: [],
                advancedSettings: { systemPrompt: 'System', maxTokens: 64, reasoningEffort: 'off' },
            },
            userLanguage: 'en',
        }, chatManager, 'chat-1', () => {}, {
            lifecycle: {
                async beforeRequest(descriptor) {
                    beforeCalls++;
                    return { requestBody: { ...descriptor.requestBody, plugin_flag: true } };
                },
            },
        });
        const result = await request.processStream();
        assert.deepEqual(result, { content: 'Hello Pi', reasoning_content: '' });
        assert.equal(beforeCalls, 1);
        assert.equal(seenBody.plugin_flag, true);
        assert.equal(seenBody.model, 'model-a');
        assert.deepEqual(updates.at(-1), result);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
