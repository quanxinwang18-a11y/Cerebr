import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ChromeCredentialStore,
    ChromeModelsStore,
    PROVIDER_CREDENTIALS_STORAGE_KEY,
    PROVIDER_MODEL_CATALOG_STORAGE_KEY,
    createBrowserAuthContext,
} from '../src/runtime/models/browser-model-stores.js';

function createMemoryStorage() {
    const data = {};
    return {
        data,
        async get(key) {
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(keys.map((item) => [item, structuredClone(data[item])]));
        },
        async set(payload) {
            Object.assign(data, structuredClone(payload));
        },
        async remove(key) {
            for (const item of Array.isArray(key) ? key : [key]) delete data[item];
        },
    };
}

test('ChromeCredentialStore persists cloned credentials and lists providers', async () => {
    const storage = createMemoryStorage();
    const store = new ChromeCredentialStore(storage);
    const credential = { type: 'api_key', key: 'secret', headers: [{ name: 'x-test', value: '1' }] };

    await store.modify('custom', () => credential);
    credential.key = 'mutated';

    const loaded = await store.read('custom');
    assert.equal(loaded.key, 'secret');
    loaded.key = 'again';
    assert.equal((await store.read('custom')).key, 'secret');
    assert.deepEqual(await store.list(), [{ providerId: 'custom', type: 'api_key' }]);
    assert.ok(storage.data[PROVIDER_CREDENTIALS_STORAGE_KEY]);

    await store.delete('custom');
    assert.equal(await store.read('custom'), undefined);
    assert.equal(storage.data[PROVIDER_CREDENTIALS_STORAGE_KEY], undefined);
});

test('ChromeModelsStore writes, reads and deletes isolated provider entries', async () => {
    const storage = createMemoryStorage();
    const store = new ChromeModelsStore(storage);
    const entry = { models: [{ id: 'a' }], checkedAt: 1, etag: 'v1' };

    await store.write('one', entry);
    await store.write('two', { models: [{ id: 'b' }] });
    entry.models[0].id = 'changed';

    assert.equal((await store.read('one')).models[0].id, 'a');
    assert.equal((await store.read('two')).models[0].id, 'b');
    assert.ok(storage.data[PROVIDER_MODEL_CATALOG_STORAGE_KEY]);

    await store.delete('one');
    assert.equal(await store.read('one'), undefined);
    assert.equal((await store.read('two')).models[0].id, 'b');
});

test('browser model stores honor aborted operations', async () => {
    const storage = createMemoryStorage();
    const store = new ChromeModelsStore(storage);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        store.write('one', { models: [] }, { signal: controller.signal }),
        (error) => error?.name === 'AbortError'
    );
    assert.deepEqual(storage.data, {});
});

test('BrowserAuthContext never resolves environment or filesystem credentials', async () => {
    const authContext = createBrowserAuthContext();
    assert.equal(await authContext.env('OPENAI_API_KEY'), undefined);
    assert.equal(await authContext.fileExists('/tmp/key'), false);
});
