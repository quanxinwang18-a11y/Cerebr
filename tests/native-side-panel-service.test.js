import test from 'node:test';
import assert from 'node:assert/strict';

import {
    NATIVE_SIDE_PANEL_PORT_NAME,
    createNativeSidePanelService,
} from '../src/host/background/native-side-panel-service.js';

function createEvent() {
    const listeners = [];
    return {
        addListener(listener) {
            listeners.push(listener);
        },
        emit(value) {
            listeners.forEach((listener) => listener(value));
        },
    };
}

function createMockChrome() {
    const calls = [];
    return {
        calls,
        runtime: {
            sendMessage(message) {
                calls.push(['broadcast', message]);
                return Promise.resolve();
            },
        },
        tabs: {
            async query() {
                return [{ id: 11, windowId: 7 }];
            },
            async get() {
                return { id: 11, windowId: 7 };
            },
            async sendMessage() {},
        },
        sidePanel: {
            async open(options) {
                calls.push(['open', options]);
            },
            async close(options) {
                calls.push(['close', options]);
            },
        },
    };
}

function createPort() {
    const onMessage = createEvent();
    const onDisconnect = createEvent();
    const messages = [];
    return {
        name: NATIVE_SIDE_PANEL_PORT_NAME,
        onMessage,
        onDisconnect,
        messages,
        postMessage(message) {
            messages.push(message);
        },
    };
}

test('queues commands until the window side panel registers', async () => {
    const chromeApi = createMockChrome();
    const service = createNativeSidePanelService({ chromeApi });
    const result = await service.sendCommand({ type: 'NEW_CHAT' }, { windowId: 7, openIfNeeded: true });
    assert.equal(result.queued, true);
    assert.deepEqual(chromeApi.calls[0], ['open', { windowId: 7 }]);

    const port = createPort();
    assert.equal(service.attachPort(port), true);
    port.onMessage.emit({ type: 'SIDE_PANEL_READY', windowId: 7 });
    assert.deepEqual(port.messages, [{ type: 'NEW_CHAT' }]);
    assert.equal(service.isOpen(7), true);
});

test('toggles an attached side panel closed and an absent panel open', async () => {
    const chromeApi = createMockChrome();
    const service = createNativeSidePanelService({ chromeApi });
    const port = createPort();
    service.attachPort(port);
    port.onMessage.emit({ type: 'SIDE_PANEL_READY', windowId: 7 });

    await service.toggle({ windowId: 7 });
    assert.deepEqual(chromeApi.calls.at(-1), ['close', { windowId: 7 }]);
    port.onDisconnect.emit();
    await service.toggle({ windowId: 7 });
    assert.deepEqual(chromeApi.calls.at(-1), ['open', { windowId: 7 }]);
});
