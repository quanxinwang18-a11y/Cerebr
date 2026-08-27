export const NATIVE_SIDE_PANEL_PORT_NAME = 'cerebr.native-side-panel';

export async function configureNativeSidePanelAction({
    chromeApi = globalThis.chrome,
    logger = console,
} = {}) {
    if (typeof chromeApi?.sidePanel?.setPanelBehavior !== 'function') {
        logger?.error?.('[Cerebr] Chrome Side Panel action behavior is unavailable');
        return false;
    }

    try {
        await chromeApi.sidePanel.setPanelBehavior({
            openPanelOnActionClick: true,
        });
        return true;
    } catch (error) {
        logger?.error?.('[Cerebr] Failed to configure native Side Panel action behavior', error);
        return false;
    }
}

function normalizeWindowId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}

export function createNativeSidePanelService({ chromeApi = globalThis.chrome, logger = console } = {}) {
    const portsByWindowId = new Map();
    const pendingByWindowId = new Map();

    const broadcastState = (windowId, open) => {
        void chromeApi?.runtime?.sendMessage?.({
            type: 'SIDE_PANEL_STATE_CHANGED',
            windowId,
            open: !!open,
        }).catch?.(() => {});
        void Promise.resolve(chromeApi?.tabs?.query?.({ windowId }) || [])
            .then((tabs) => Promise.allSettled(
                (Array.isArray(tabs) ? tabs : [])
                    .filter((tab) => Number.isFinite(Number(tab?.id)))
                    .map((tab) => chromeApi.tabs.sendMessage(tab.id, {
                        type: 'SIDE_PANEL_STATE_CHANGED',
                        windowId,
                        open: !!open,
                    }))
            ))
            .catch(() => {});
    };

    const flushPending = (windowId) => {
        const port = portsByWindowId.get(windowId);
        const pending = pendingByWindowId.get(windowId) || [];
        if (!port || pending.length === 0) return;

        while (pending.length > 0) {
            const payload = pending.shift();
            try {
                port.postMessage(payload);
            } catch (error) {
                pending.unshift(payload);
                logger?.warn?.('[Cerebr] Failed to flush a native side panel command', error);
                break;
            }
        }
        if (pending.length === 0) pendingByWindowId.delete(windowId);
    };

    const attachPort = (port) => {
        if (!port || port.name !== NATIVE_SIDE_PANEL_PORT_NAME) return false;
        let attachedWindowId = null;

        const onMessage = (message = {}) => {
            if (message?.type !== 'SIDE_PANEL_READY') return;
            const windowId = normalizeWindowId(message.windowId);
            if (windowId === null) return;

            if (attachedWindowId !== null && portsByWindowId.get(attachedWindowId) === port) {
                portsByWindowId.delete(attachedWindowId);
            }
            attachedWindowId = windowId;
            portsByWindowId.set(windowId, port);
            broadcastState(windowId, true);
            flushPending(windowId);
        };

        const onDisconnect = () => {
            if (attachedWindowId !== null && portsByWindowId.get(attachedWindowId) === port) {
                portsByWindowId.delete(attachedWindowId);
                broadcastState(attachedWindowId, false);
            }
        };

        port.onMessage?.addListener?.(onMessage);
        port.onDisconnect?.addListener?.(onDisconnect);
        return true;
    };

    const resolveWindowId = async ({ windowId = null, tabId = null, sender = null } = {}) => {
        const directWindowId = normalizeWindowId(windowId ?? sender?.tab?.windowId);
        if (directWindowId !== null) return directWindowId;

        const normalizedTabId = Number.isFinite(Number(tabId)) ? Math.floor(Number(tabId)) : null;
        if (normalizedTabId !== null) {
            try {
                const tab = await chromeApi.tabs.get(normalizedTabId);
                const tabWindowId = normalizeWindowId(tab?.windowId);
                if (tabWindowId !== null) return tabWindowId;
            } catch {
                // fall through to active tab lookup
            }
        }

        const [activeTab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
        return normalizeWindowId(activeTab?.windowId);
    };

    const open = async (options = {}) => {
        const windowId = await resolveWindowId(options);
        if (windowId === null) throw new Error('No browser window is available for the side panel');
        await chromeApi.sidePanel.open({ windowId });
        return { success: true, open: true, windowId };
    };

    const close = async (options = {}) => {
        const windowId = await resolveWindowId(options);
        if (windowId === null) throw new Error('No browser window is available for the side panel');
        await chromeApi.sidePanel.close({ windowId });
        return { success: true, open: false, windowId };
    };

    const toggle = async (options = {}) => {
        const windowId = await resolveWindowId(options);
        if (windowId === null) throw new Error('No browser window is available for the side panel');
        return portsByWindowId.has(windowId)
            ? close({ windowId })
            : open({ windowId });
    };

    const sendCommand = async (payload, options = {}) => {
        const windowId = await resolveWindowId(options);
        if (windowId === null) throw new Error('No browser window is available for the side panel');
        const port = portsByWindowId.get(windowId);
        if (port) {
            port.postMessage(payload);
            return { success: true, delivered: true, windowId };
        }

        const pending = pendingByWindowId.get(windowId) || [];
        pending.push(payload);
        pendingByWindowId.set(windowId, pending.slice(-32));
        if (options.openIfNeeded) {
            await chromeApi.sidePanel.open({ windowId });
        }
        return { success: true, delivered: false, queued: true, windowId };
    };

    const handleRuntimeMessage = async (message = {}, sender = null) => {
        const options = {
            windowId: message.windowId,
            tabId: message.tabId,
            sender,
        };
        if (message.type === 'SIDE_PANEL_OPEN') return open(options);
        if (message.type === 'SIDE_PANEL_CLOSE') return close(options);
        if (message.type === 'SIDE_PANEL_TOGGLE') return toggle(options);
        if (message.type === 'SIDE_PANEL_COMMAND') {
            return sendCommand(message.payload, {
                ...options,
                openIfNeeded: message.openIfNeeded === true,
            });
        }
        if (message.type === 'SIDE_PANEL_STATE') {
            const windowId = await resolveWindowId(options);
            return {
                success: windowId !== null,
                windowId,
                open: windowId !== null && portsByWindowId.has(windowId),
            };
        }
        return null;
    };

    return {
        attachPort,
        close,
        handleRuntimeMessage,
        isOpen(windowId) {
            const normalized = normalizeWindowId(windowId);
            return normalized !== null && portsByWindowId.has(normalized);
        },
        open,
        sendCommand,
        toggle,
    };
}
