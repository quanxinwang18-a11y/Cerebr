import { t } from '../../utils/i18n.js';
import { sortPromptFragments } from '../../plugin/core/prompt-fragment-utils.js';
import { createChatError } from './chat-errors.js';
import {
    consumePiStream,
    createLifecycleFetch,
    createPiChatRequest,
    toPiContext,
} from './pi-chat-adapter.js';

function resolveSystemPrompt({ apiConfig, userLanguage, webpageInfo, promptFragments }) {
    let systemPrompt = String(apiConfig?.advancedSettings?.systemPrompt || '')
        .replace(/\{\{userLanguage\}\}/gm, userLanguage);
    const prepend = [];
    const append = [];
    sortPromptFragments(Array.isArray(promptFragments) ? promptFragments : []).forEach((fragment) => {
        const content = String(fragment?.content || '').trim();
        if (!content) return;
        if (fragment?.placement === 'system.prepend') prepend.push(content);
        else append.push(content);
    });
    if (prepend.length) systemPrompt = `${prepend.join('\n\n')}${systemPrompt ? '\n\n' : ''}${systemPrompt}`;
    if (append.length) systemPrompt = `${systemPrompt}${systemPrompt ? '\n\n' : ''}${append.join('\n\n')}`;
    if (webpageInfo?.pages) {
        const pages = webpageInfo.pages.map((page) => {
            const prefix = page.isCurrent ? t('webpage_prefix_current') : t('webpage_prefix_other');
            return `\n${prefix}:\n${t('webpage_title_label')}: ${page.title}\n${t('webpage_url_label')}: ${page.url}\n${t('webpage_content_label')}: ${page.content}`;
        }).join('\n\n---\n');
        systemPrompt += pages;
    }
    return systemPrompt;
}

export async function callAPI({
    messages,
    apiConfig,
    userLanguage,
    webpageInfo = null,
    promptFragments = [],
}, chatManager, chatId, onMessageUpdate, options = {}) {
    const controller = new AbortController();
    const signal = controller.signal;
    let request;
    try {
        request = await createPiChatRequest(apiConfig);
    } catch (error) {
        if (error?.message === 'CEREBR_API_CONFIG_INCOMPLETE') {
            throw new Error(t('error_api_config_incomplete'));
        }
        throw error;
    }

    const systemPrompt = resolveSystemPrompt({ apiConfig, userLanguage, webpageInfo, promptFragments });
    const context = toPiContext(messages, request.model, systemPrompt);
    const lifecycle = options?.lifecycle && typeof options.lifecycle === 'object' ? options.lifecycle : null;
    const requestState = {};

    const processStream = async () => {
        let updateTimeout = null;
        let latestMessage = { content: '', reasoning_content: '' };
        let lastUpdateTime = 0;
        const dispatchUpdate = () => {
            if (!chatManager || !chatId) return;
            const copy = { ...latestMessage };
            chatManager.updateLastMessage(chatId, copy, { throttleMs: 750 });
            onMessageUpdate(chatId, copy);
            lastUpdateTime = Date.now();
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = null;
        };
        const queueUpdate = (message) => {
            latestMessage = message;
            if (Date.now() - lastUpdateTime > 100) dispatchUpdate();
            else if (!updateTimeout) updateTimeout = setTimeout(dispatchUpdate, 100 - (Date.now() - lastUpdateTime));
        };

        try {
            const fetchImpl = createLifecycleFetch({
                lifecycle,
                providerConfig: request.providerConfig,
                credential: request.credential,
                signal,
                state: requestState,
            });
            const reasoning = String(apiConfig?.advancedSettings?.reasoningEffort || 'off');
            const maxTokens = Number(apiConfig?.advancedSettings?.maxTokens);
            const stream = request.runtime.streamSimple(request.model, context, {
                signal,
                fetch: fetchImpl,
                maxRetries: 0,
                sessionId: chatId,
                reasoning: reasoning === 'off' ? undefined : reasoning,
                maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
            });
            const prefixes = Array.from(new Set(
                (Array.isArray(options?.misfiledThinkSilentlyPrefixes)
                    ? options.misfiledThinkSilentlyPrefixes
                    : [options?.misfiledThinkSilentlyPrefix ?? 'think'])
                    .map((value) => String(value ?? '').trim().toLowerCase())
                    .filter(Boolean)
            ));
            const result = await consumePiStream(stream, {
                onUpdate: queueUpdate,
                onStreamMessage: lifecycle?.onStreamMessage,
                chatId,
                requestState,
                detectMisfiledThinkSilently: !!options?.detectMisfiledThinkSilently,
                misfiledThinkSilentlyPrefixes: prefixes,
            });
            latestMessage = result;
            dispatchUpdate();
            return result;
        } catch (error) {
            if (updateTimeout) clearTimeout(updateTimeout);
            if (typeof lifecycle?.onRequestError === 'function' && error?.name !== 'AbortError') {
                try {
                    await lifecycle.onRequestError(error, {
                        url: requestState.url,
                        requestBody: requestState.requestBody,
                        requestInit: requestState.requestInit,
                    });
                } catch (lifecycleError) {
                    console.error('[Cerebr] Request lifecycle error handler failed:', lifecycleError);
                }
            }
            if (error?.name === 'AbortError') return;
            if (error?.code) throw error;
            throw createChatError('NETWORK_ERROR', error?.message || t('error_send_failed', ['Network error']), {
                cause: error,
                url: requestState.url,
            });
        }
    };

    return { processStream, controller };
}
