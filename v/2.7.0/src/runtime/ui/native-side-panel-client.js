import { NATIVE_SIDE_PANEL_PORT_NAME } from '../../host/background/native-side-panel-service.js';

export function isNativeSidePanelPage() {
    const protocol = globalThis.location?.protocol || '';
    return (protocol === 'chrome-extension:' || protocol === 'moz-extension:')
        && globalThis.top === globalThis;
}

export function createNativeSidePanelClient({ chromeApi = globalThis.chrome, logger = console } = {}) {
    let port = null;
    let stopped = false;
    let reconnectTimer = 0;

    const resolveWindowId = async () => {
        const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
        return Number.isFinite(Number(tab?.windowId)) ? Number(tab.windowId) : null;
    };

    const connect = async () => {
        if (stopped || !isNativeSidePanelPage()) return false;
        const windowId = await resolveWindowId();
        if (windowId === null) return false;

        port = chromeApi.runtime.connect({ name: NATIVE_SIDE_PANEL_PORT_NAME });
        port.onMessage.addListener((message) => {
            if (!message || typeof message !== 'object') return;
            window.postMessage(message, '*');
        });
        port.onDisconnect.addListener(() => {
            port = null;
            if (stopped) return;
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = 0;
                void connect().catch((error) => {
                    logger?.warn?.('[Cerebr] Failed to reconnect native side panel', error);
                });
            }, 300);
        });
        port.postMessage({ type: 'SIDE_PANEL_READY', windowId });
        document.documentElement.classList.add('cerebr-native-side-panel');
        return true;
    };

    return {
        connect,
        stop() {
            stopped = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            reconnectTimer = 0;
            try {
                port?.disconnect?.();
            } catch {
                // ignore
            }
            port = null;
        },
    };
}
