import {
    ChromeCredentialStore,
    ChromeModelsStore,
    PROVIDER_CREDENTIALS_STORAGE_KEY,
} from '../runtime/models/browser-model-stores.js';
import { ModelCatalogService } from '../runtime/models/model-catalog-service.js';
import { PiModelRuntimeService } from '../runtime/models/pi-model-runtime-service.js';
import {
    MODEL_SOURCES,
    PROVIDER_PRESETS,
    SUPPORTED_MODEL_APIS,
    defaultModelListPath,
    normalizeProviderConfig,
    providerModelKey,
} from '../runtime/models/provider-config.js';
import { migrateLegacyApiConfigs } from '../runtime/models/provider-migration.js';
import { createLifecycleFetch, toPiContext } from '../runtime/chat/pi-chat-adapter.js';

export const PROVIDER_CONFIGS_STORAGE_KEY = 'providerConfigsV1';
export const SELECTED_MODEL_STORAGE_KEY = 'selectedModelV1';
export const MODEL_SETTINGS_STORAGE_KEY = 'modelSettingsV1';
export const MODEL_PROMPT_INDEX_STORAGE_KEY = 'providerModelPromptIndexV1';

const MODEL_PROMPT_PREFIX = 'providerModelPromptV1_';
const MODEL_PROMPT_LOCAL_ONLY_PREFIX = 'providerModelPromptLocalOnlyV1_';
const LEGACY_API_KEYS = ['apiConfigs', 'selectedConfigIndex'];
const LEGACY_CREDENTIALS_KEY = 'apiCredentialsV1';
const LEGACY_PROMPT_PREFIX = 'apiConfigSystemPrompt_';
const PROMPT_SYNC_LIMIT_BYTES = 6000;

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
    return String(value ?? '').trim();
}

function createId(prefix = 'provider') {
    if (typeof crypto?.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function promptKey(modelKey) {
    return `${MODEL_PROMPT_PREFIX}${modelKey}`;
}

function promptLocalOnlyKey(modelKey) {
    return `${MODEL_PROMPT_LOCAL_ONLY_PREFIX}${modelKey}`;
}

function byteLength(value) {
    try {
        return new TextEncoder().encode(String(value ?? '')).length;
    } catch {
        return String(value ?? '').length;
    }
}

function option(value, label, selected = false) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    element.selected = selected;
    return element;
}

function element(tag, className = '', content = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== '') node.textContent = content;
    return node;
}

function inputControl({ type = 'text', value = '', className = '', placeholder = '', min } = {}) {
    const input = document.createElement('input');
    input.type = type;
    input.value = value ?? '';
    input.className = className;
    input.placeholder = placeholder;
    if (min !== undefined) input.min = String(min);
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
}

function field(labelText, control, hint = '') {
    const wrapper = element('label', 'provider-field');
    wrapper.append(element('span', 'provider-field-label', labelText), control);
    if (hint) wrapper.append(element('span', 'provider-field-hint', hint));
    return wrapper;
}

function modelSourceLabel(source, tr) {
    return ({
        'pi-builtin': tr('provider_source_pi_builtin', 'Pi 内置'),
        'pi-catalog': tr('provider_source_pi_catalog', 'Pi 目录'),
        provider: tr('provider_source_provider', '服务商发现'),
        user: tr('provider_source_user', '用户添加'),
        'user-override': tr('provider_source_override', '用户覆盖'),
        'stale-selected': tr('provider_source_stale', '目录中已不可见'),
    })[source] || source;
}

export function buildCompatibilityApiConfig({
    provider,
    model,
    credential = {},
    settings = {},
    systemPrompt = '',
} = {}) {
    if (!provider || !model) return null;
    return {
        id: provider.id,
        providerId: provider.id,
        providerName: provider.name,
        api: model.api || provider.api,
        apiType: model.api || provider.api,
        baseUrl: provider.baseUrl,
        authMode: provider.authMode,
        apiKey: String(credential?.key || ''),
        headers: clone(credential?.headers || []),
        modelId: model.id,
        modelName: model.id,
        modelDisplayName: model.name,
        model: clone(model),
        advancedSettings: {
            systemPrompt: String(systemPrompt || ''),
            reasoningEffort: settings.reasoningEffort || 'off',
            maxTokens: Number(settings.maxTokens) > 0 ? Number(settings.maxTokens) : model.maxTokens,
            isExpanded: false,
        },
    };
}

export function createProviderSettingsController({
    root,
    storage,
    syncStorage,
    isExtension,
    t,
    showToast,
    onSelectionChanged,
} = {}) {
    const localStorage = storage;
    const configStorage = isExtension ? syncStorage : storage;
    const credentialStore = new ChromeCredentialStore(localStorage);
    const modelsStore = new ChromeModelsStore(localStorage);
    const catalogService = new ModelCatalogService({ store: modelsStore, isExtension });
    const runtime = new PiModelRuntimeService({ credentials: credentialStore, modelsStore, catalogService });
    const tr = (key, fallback) => {
        const translated = typeof t === 'function' ? t(key) : '';
        return translated && translated !== key ? translated : fallback;
    };
    const state = {
        providers: [],
        selectedModel: null,
        modelSettings: {},
        prompts: {},
        promptIndex: [],
        statuses: new Map(),
        persistTimer: null,
    };

    const defaultProvider = () => normalizeProviderConfig({
        id: createId(),
        name: tr('provider_custom_name', '自定义 Provider'),
        api: 'openai-completions',
        baseUrl: 'https://api.openai.com/v1',
        authMode: 'auto',
        modelSource: 'manual',
        defaultModelId: 'gpt-4o',
        userModels: [{ id: 'gpt-4o', name: 'GPT-4o', input: ['text', 'image'] }],
    });

    const readLegacyMeta = async () => {
        const primary = await configStorage.get(LEGACY_API_KEYS).catch(() => ({}));
        if (primary?.apiConfigs) return primary;
        return storage.get(LEGACY_API_KEYS).catch(() => ({}));
    };

    const migrateLegacyIfNeeded = async () => {
        const legacyMeta = await readLegacyMeta();
        if (!Array.isArray(legacyMeta?.apiConfigs) || legacyMeta.apiConfigs.length === 0) return null;
        const credentialsResult = await storage.get(LEGACY_CREDENTIALS_KEY).catch(() => ({}));
        const credentialsById = credentialsResult?.[LEGACY_CREDENTIALS_KEY] || {};
        const legacyConfigs = clone(legacyMeta.apiConfigs);
        for (const config of legacyConfigs) {
            if (!config?.id) continue;
            const key = `${LEGACY_PROMPT_PREFIX}${config.id}`;
            const [localPrompt, syncPrompt] = await Promise.all([
                storage.get(key).catch(() => ({})),
                isExtension ? syncStorage.get(key).catch(() => ({})) : Promise.resolve({}),
            ]);
            const prompt = localPrompt?.[key] ?? syncPrompt?.[key];
            if (typeof prompt === 'string') {
                config.advancedSettings = { ...(config.advancedSettings || {}), systemPrompt: prompt };
            }
        }
        const migrated = migrateLegacyApiConfigs({
            apiConfigs: legacyConfigs,
            selectedConfigIndex: legacyMeta.selectedConfigIndex,
            credentialsById,
            generateId: () => createId(),
        });
        for (const [providerId, credential] of Object.entries(migrated.providerCredentials)) {
            await credentialStore.modify(providerId, () => credential);
        }
        return migrated;
    };

    const loadPrompts = async (promptIndex) => {
        const keys = promptIndex.map(promptKey);
        const local = keys.length ? await storage.get(keys).catch(() => ({})) : {};
        const synced = isExtension && keys.length ? await syncStorage.get(keys).catch(() => ({})) : {};
        return Object.fromEntries(promptIndex.map((modelKey) => {
            const key = promptKey(modelKey);
            return [modelKey, String(local?.[key] ?? synced?.[key] ?? '')];
        }));
    };

    const persistNow = async () => {
        if (state.persistTimer) clearTimeout(state.persistTimer);
        state.persistTimer = null;
        const promptIndex = Array.from(new Set(Object.keys(state.prompts).filter((key) => state.prompts[key] !== '')));
        state.promptIndex = promptIndex;
        const configPayload = {
            [PROVIDER_CONFIGS_STORAGE_KEY]: state.providers.map((provider) => clone(provider)),
            [SELECTED_MODEL_STORAGE_KEY]: clone(state.selectedModel),
            [MODEL_SETTINGS_STORAGE_KEY]: clone(state.modelSettings),
            [MODEL_PROMPT_INDEX_STORAGE_KEY]: promptIndex,
        };
        await configStorage.set(configPayload);
        const localPrompts = {};
        const syncPrompts = {};
        for (const modelKey of promptIndex) {
            const value = String(state.prompts[modelKey] || '');
            localPrompts[promptKey(modelKey)] = value;
            if (isExtension) {
                const fits = byteLength(value) <= PROMPT_SYNC_LIMIT_BYTES;
                syncPrompts[promptKey(modelKey)] = fits ? value : '';
                syncPrompts[promptLocalOnlyKey(modelKey)] = !fits;
            }
        }
        if (Object.keys(localPrompts).length) await storage.set(localPrompts);
        if (isExtension && Object.keys(syncPrompts).length) await syncStorage.set(syncPrompts);
    };

    const queuePersist = () => {
        if (state.persistTimer) clearTimeout(state.persistTimer);
        state.persistTimer = setTimeout(() => persistNow().catch(() => {}), 600);
    };

    const ensureSelected = () => {
        if (state.selectedModel && runtime.getModel(state.selectedModel.providerId, state.selectedModel.modelId)) return;
        state.selectedModel = runtime.firstModelRef();
    };

    const emitSelection = async () => {
        ensureSelected();
        if (!state.selectedModel) {
            onSelectionChanged?.(null);
            return;
        }
        const provider = state.providers.find((item) => item.id === state.selectedModel.providerId);
        const model = runtime.getModel(state.selectedModel.providerId, state.selectedModel.modelId);
        const credential = await credentialStore.read(state.selectedModel.providerId).catch(() => undefined);
        const key = providerModelKey(state.selectedModel.providerId, state.selectedModel.modelId);
        onSelectionChanged?.(buildCompatibilityApiConfig({
            provider,
            model,
            credential,
            settings: state.modelSettings[key],
            systemPrompt: state.prompts[key],
        }));
    };

    const configureRuntime = async () => {
        await runtime.configure({ providerConfigs: state.providers, selectedModel: state.selectedModel });
        ensureSelected();
        await emitSelection();
    };

    const reload = async () => {
        const stored = await configStorage.get([
            PROVIDER_CONFIGS_STORAGE_KEY,
            SELECTED_MODEL_STORAGE_KEY,
            MODEL_SETTINGS_STORAGE_KEY,
            MODEL_PROMPT_INDEX_STORAGE_KEY,
        ]).catch(() => ({}));
        let providers = stored?.[PROVIDER_CONFIGS_STORAGE_KEY];
        let migration = null;
        if (!Array.isArray(providers)) migration = await migrateLegacyIfNeeded();
        providers = migration?.providerConfigs || providers;
        if (!Array.isArray(providers) || providers.length === 0) providers = [defaultProvider()];
        state.providers = providers.map((provider) => normalizeProviderConfig({
            ...provider,
            ...(!isExtension ? { modelSource: 'manual' } : {}),
        }));
        state.selectedModel = migration?.selectedModel || stored?.[SELECTED_MODEL_STORAGE_KEY] || null;
        state.modelSettings = migration?.modelSettings || stored?.[MODEL_SETTINGS_STORAGE_KEY] || {};
        state.promptIndex = Array.from(new Set([
            ...(stored?.[MODEL_PROMPT_INDEX_STORAGE_KEY] || []),
            ...Object.keys(migration?.systemPrompts || {}),
        ]));
        state.prompts = {
            ...(await loadPrompts(state.promptIndex)),
            ...(migration?.systemPrompts || {}),
        };
        await configureRuntime();
        if (migration) await persistNow();
        render();
        if (isExtension) {
            void Promise.all(state.providers
                .filter((provider) => provider.modelSource !== 'manual')
                .map((provider) => runtime.refreshProvider(provider.id, { force: false }).catch(() => null)))
                .then(async () => {
                    ensureSelected();
                    await emitSelection();
                    render();
                });
        }
        return getSelectedApiConfig();
    };

    const getSelectedApiConfig = async () => {
        if (!state.selectedModel) return null;
        const provider = state.providers.find((item) => item.id === state.selectedModel.providerId);
        const model = runtime.getModel(state.selectedModel.providerId, state.selectedModel.modelId);
        const credential = await credentialStore.read(state.selectedModel.providerId).catch(() => undefined);
        const key = providerModelKey(state.selectedModel.providerId, state.selectedModel.modelId);
        return buildCompatibilityApiConfig({
            provider,
            model,
            credential,
            settings: state.modelSettings[key],
            systemPrompt: state.prompts[key],
        });
    };

    const updateProvider = async (provider, patch) => {
        Object.assign(provider, patch);
        const normalized = normalizeProviderConfig(provider);
        const index = state.providers.findIndex((item) => item.id === provider.id);
        state.providers[index] = normalized;
        await configureRuntime();
        queuePersist();
        render();
    };

    const selectModel = async (providerId, modelId) => {
        state.selectedModel = { providerId, modelId };
        runtime.selectModel(providerId, modelId);
        const key = providerModelKey(providerId, modelId);
        state.modelSettings[key] ||= { reasoningEffort: 'off', maxTokens: runtime.getModel(providerId, modelId)?.maxTokens || null };
        await emitSelection();
        queuePersist();
        render();
    };

    const setStatus = (providerId, status) => {
        state.statuses.set(providerId, status);
        render();
    };

    const refreshProvider = async (provider) => {
        if (!isExtension) return;
        setStatus(provider.id, { kind: 'busy', message: tr('provider_refreshing', '正在刷新模型…') });
        try {
            const result = await runtime.refreshProvider(provider.id, { force: true });
            setStatus(provider.id, {
                kind: Object.keys(result?.errors || {}).length ? 'warning' : 'success',
                message: Object.keys(result?.errors || {}).length
                    ? Object.values(result.errors).join('; ')
                    : tr('provider_refresh_success', `已刷新 ${result?.models?.length || 0} 个模型`),
            });
            ensureSelected();
            await emitSelection();
        } catch (error) {
            setStatus(provider.id, { kind: 'error', message: error?.message || String(error) });
        }
    };

    const testProvider = async (provider) => {
        setStatus(provider.id, { kind: 'busy', message: tr('provider_testing', '正在测试连接…') });
        const modelId = state.selectedModel?.providerId === provider.id
            ? state.selectedModel.modelId
            : provider.defaultModelId || runtime.getModels(provider.id)[0]?.id;
        const model = runtime.getModel(provider.id, modelId);
        if (!model) {
            setStatus(provider.id, { kind: 'error', message: tr('provider_no_model', '请先添加或选择模型') });
            return;
        }
        const credential = await credentialStore.read(provider.id).catch(() => undefined);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const fetchImpl = createLifecycleFetch({
                providerConfig: provider,
                credential,
                signal: controller.signal,
                state: {},
            });
            const stream = runtime.streamSimple(model, toPiContext([
                { role: 'user', content: 'Reply with OK.' },
            ], model, 'Connection test.'), {
                fetch: fetchImpl,
                signal: controller.signal,
                maxRetries: 0,
                maxTokens: 4,
            });
            let completed = false;
            for await (const event of stream) {
                if (event.type === 'done') completed = true;
                if (event.type === 'error') throw new Error(event.error?.errorMessage || 'Connection failed');
            }
            if (!completed) throw new Error('Connection ended without a completed response');
            setStatus(provider.id, { kind: 'success', message: tr('provider_test_success', '连接测试成功') });
        } catch (error) {
            setStatus(provider.id, { kind: 'error', message: error?.name === 'AbortError' ? tr('provider_test_timeout', '连接测试超时') : error?.message || String(error) });
        } finally {
            clearTimeout(timeout);
        }
    };

    const resolvedEndpoint = (provider) => {
        const base = provider.baseUrl.replace(/\/+$/u, '');
        if (provider.api === 'anthropic-messages') return `${base}/v1/messages`;
        if (provider.api === 'openai-responses') return `${base}/responses`;
        if (provider.api === 'google-generative-ai') return `${base}/v1beta/models/${provider.defaultModelId || '{model}'}:streamGenerateContent`;
        return `${base}/chat/completions`;
    };

    const renderHeader = (container) => {
        const actions = element('div', 'provider-add-row');
        const presetSelect = document.createElement('select');
        presetSelect.className = 'provider-preset-select';
        presetSelect.append(option('custom', tr('provider_custom_name', '自定义 Provider')));
        Object.values(PROVIDER_PRESETS).forEach((preset) => presetSelect.append(option(preset.id, preset.name)));
        const addButton = element('button', 'provider-primary-button', tr('provider_add', '添加 Provider'));
        addButton.type = 'button';
        addButton.addEventListener('click', async () => {
            const preset = PROVIDER_PRESETS[presetSelect.value];
            const id = createId();
            const provider = normalizeProviderConfig(preset ? {
                id,
                presetId: preset.id,
                name: preset.name,
                api: preset.api,
                baseUrl: preset.baseUrl,
                authMode: preset.authMode,
                modelSource: isExtension ? 'hybrid' : 'manual',
                defaultModelId: preset.models[0]?.id || '',
            } : { ...defaultProvider(), id });
            state.providers.push(provider);
            state.selectedModel = { providerId: id, modelId: provider.defaultModelId || provider.userModels[0]?.id };
            await configureRuntime();
            queuePersist();
            render();
        });
        actions.append(presetSelect, addButton);
        container.append(actions);
    };

    const renderHeaders = (provider, credential, section) => {
        const list = element('div', 'provider-header-list');
        const headers = Array.isArray(credential?.headers) ? credential.headers : [];
        const saveHeaders = async () => {
            await credentialStore.modify(provider.id, (current = { type: 'api_key', key: '', headers: [] }) => ({
                ...current,
                headers: clone(headers),
            }));
            await emitSelection();
        };
        headers.forEach((header, index) => {
            const row = element('div', 'provider-header-row');
            const name = inputControl({ value: header.name, placeholder: 'Header' });
            const value = inputControl({ type: 'password', value: header.value, placeholder: tr('provider_header_value', '值') });
            const remove = element('button', 'provider-icon-button', '×');
            remove.type = 'button';
            name.addEventListener('change', () => { header.name = name.value; void saveHeaders(); });
            value.addEventListener('change', () => { header.value = value.value; void saveHeaders(); });
            remove.addEventListener('click', () => { headers.splice(index, 1); void saveHeaders().then(render); });
            row.append(name, value, remove);
            list.append(row);
        });
        const add = element('button', 'provider-secondary-button', tr('provider_add_header', '添加 Header'));
        add.type = 'button';
        add.addEventListener('click', () => { headers.push({ name: '', value: '' }); void saveHeaders().then(render); });
        section.append(list, add);
    };

    const updateModel = async (provider, model, patch) => {
        const userIndex = provider.userModels.findIndex((item) => item.id === model.id);
        if (userIndex >= 0) provider.userModels[userIndex] = { ...provider.userModels[userIndex], ...patch };
        else provider.modelOverrides[model.id] = { ...(provider.modelOverrides[model.id] || {}), ...patch };
        await updateProvider(provider, {});
    };

    const renderModelRow = (provider, model, list) => {
        const row = element('div', `provider-model-row${state.selectedModel?.providerId === provider.id && state.selectedModel?.modelId === model.id ? ' selected' : ''}`);
        const summary = element('div', 'provider-model-summary');
        const radio = inputControl({ type: 'radio' });
        radio.name = 'selected-provider-model';
        radio.checked = state.selectedModel?.providerId === provider.id && state.selectedModel?.modelId === model.id;
        radio.addEventListener('change', () => { if (radio.checked) void selectModel(provider.id, model.id); });
        const identity = element('button', 'provider-model-identity');
        identity.type = 'button';
        identity.append(
            element('strong', '', model.name || model.id),
            element('span', '', model.id),
        );
        const meta = element('span', 'provider-model-meta', `${Math.round(model.contextWindow / 1000)}K · ${model.input?.includes('image') ? '🖼' : 'T'} · ${model.reasoning ? 'Reasoning' : 'Standard'}`);
        const source = element('span', 'provider-model-source', modelSourceLabel(model.source, tr));
        summary.append(radio, identity, meta, source);
        row.append(summary);

        const details = element('div', 'provider-model-details');
        details.hidden = true;
        identity.addEventListener('click', () => { details.hidden = !details.hidden; });
        const name = inputControl({ value: model.name });
        const context = inputControl({ type: 'number', value: model.contextWindow, min: 1 });
        const maxTokens = inputControl({ type: 'number', value: model.maxTokens, min: 1 });
        const reasoning = inputControl({ type: 'checkbox' });
        reasoning.checked = !!model.reasoning;
        const image = inputControl({ type: 'checkbox' });
        image.checked = model.input?.includes('image');
        name.addEventListener('change', () => void updateModel(provider, model, { name: name.value }));
        context.addEventListener('change', () => void updateModel(provider, model, { contextWindow: Number(context.value) }));
        maxTokens.addEventListener('change', () => void updateModel(provider, model, { maxTokens: Number(maxTokens.value) }));
        reasoning.addEventListener('change', () => void updateModel(provider, model, { reasoning: reasoning.checked }));
        image.addEventListener('change', () => void updateModel(provider, model, { input: image.checked ? ['text', 'image'] : ['text'] }));
        details.append(
            field(tr('provider_model_display_name', '显示名称'), name),
            field(tr('provider_context_window', '上下文 Tokens'), context),
            field(tr('provider_max_tokens', '最大输出 Tokens'), maxTokens),
            field(tr('provider_reasoning', '支持推理'), reasoning),
            field(tr('provider_image_input', '支持图片'), image),
        );
        const remove = element('button', 'provider-danger-button', model.source === 'user' ? tr('provider_delete_model', '删除模型') : tr('provider_hide_model', '隐藏模型'));
        remove.type = 'button';
        remove.addEventListener('click', async () => {
            if (model.source === 'user') provider.userModels = provider.userModels.filter((item) => item.id !== model.id);
            else provider.hiddenModelIds = Array.from(new Set([...(provider.hiddenModelIds || []), model.id]));
            await updateProvider(provider, {});
        });
        details.append(remove);
        row.append(details);
        list.append(row);
    };

    const renderModels = (provider, card) => {
        const section = element('section', 'provider-models-section');
        section.append(element('h3', '', tr('provider_models', '模型')));
        const search = inputControl({ className: 'provider-model-search', placeholder: tr('provider_search_models', '搜索模型') });
        const list = element('div', 'provider-model-list');
        const models = runtime.getModels(provider.id);
        models.forEach((model) => renderModelRow(provider, model, list));
        search.addEventListener('input', () => {
            const query = search.value.trim().toLowerCase();
            Array.from(list.children).forEach((row) => {
                row.hidden = query && !row.textContent.toLowerCase().includes(query);
            });
        });
        const addRow = element('div', 'provider-add-model-row');
        const idInput = inputControl({ placeholder: tr('provider_model_id', '模型 ID') });
        const addButton = element('button', 'provider-secondary-button', tr('provider_add_model', '添加模型'));
        addButton.type = 'button';
        addButton.addEventListener('click', async () => {
            const id = text(idInput.value);
            if (!id || provider.userModels.some((model) => model.id === id)) return;
            provider.userModels.push({ id, name: id, api: provider.api, input: ['text'], reasoning: false, contextWindow: 128000, maxTokens: 16384 });
            provider.defaultModelId ||= id;
            await updateProvider(provider, {});
            await selectModel(provider.id, id);
        });
        addRow.append(idInput, addButton);
        section.append(search, list, addRow);
        card.append(section);
    };

    const renderProvider = async (provider, container) => {
        const credential = await credentialStore.read(provider.id).catch(() => undefined) || { type: 'api_key', key: '', headers: [] };
        const card = element('article', `provider-card${state.selectedModel?.providerId === provider.id ? ' selected' : ''}`);
        const heading = element('div', 'provider-card-heading');
        const title = element('div');
        title.append(element('h2', '', provider.name), element('span', 'provider-card-subtitle', `${provider.api} · ${runtime.getModels(provider.id).length} models`));
        const actions = element('div', 'provider-card-actions');
        const test = element('button', 'provider-secondary-button', tr('provider_test', '测试连接'));
        test.type = 'button';
        test.addEventListener('click', () => void testProvider(provider));
        actions.append(test);
        if (isExtension) {
            const refresh = element('button', 'provider-secondary-button', tr('provider_refresh', '刷新模型'));
            refresh.type = 'button';
            refresh.addEventListener('click', () => void refreshProvider(provider));
            actions.prepend(refresh);
        }
        const removeProvider = element('button', 'provider-icon-button', '×');
        removeProvider.type = 'button';
        removeProvider.title = tr('provider_delete', '删除 Provider');
        removeProvider.addEventListener('click', async () => {
            state.providers = state.providers.filter((item) => item.id !== provider.id);
            await credentialStore.delete(provider.id).catch(() => {});
            if (!state.providers.length) state.providers.push(defaultProvider());
            state.selectedModel = null;
            await configureRuntime();
            queuePersist();
            render();
        });
        actions.append(removeProvider);
        heading.append(title, actions);
        card.append(heading);

        const form = element('div', 'provider-form-grid');
        const name = inputControl({ value: provider.name });
        const api = document.createElement('select');
        SUPPORTED_MODEL_APIS.forEach((value) => api.append(option(value, value, value === provider.api)));
        const baseUrl = inputControl({ value: provider.baseUrl, placeholder: 'https://…' });
        const auth = document.createElement('select');
        [['auto', tr('api_auth_mode_auto', '自动')], ['bearer', 'Authorization: Bearer'], ['x-api-key', 'x-api-key'], ['none', tr('api_auth_mode_none', '无')]]
            .forEach(([value, label]) => auth.append(option(value, label, value === provider.authMode)));
        const source = document.createElement('select');
        MODEL_SOURCES.forEach((value) => source.append(option(value, value, value === provider.modelSource)));
        source.disabled = !isExtension;
        const listPath = inputControl({ value: provider.modelListPath });
        name.addEventListener('change', () => void updateProvider(provider, { name: name.value }));
        api.addEventListener('change', () => void updateProvider(provider, { api: api.value, modelListPath: defaultModelListPath(api.value) }));
        baseUrl.addEventListener('change', () => void updateProvider(provider, { baseUrl: baseUrl.value }));
        auth.addEventListener('change', () => void updateProvider(provider, { authMode: auth.value }));
        source.addEventListener('change', () => void updateProvider(provider, { modelSource: source.value }));
        listPath.addEventListener('change', () => void updateProvider(provider, { modelListPath: listPath.value }));
        form.append(
            field(tr('provider_name', 'Provider 名称'), name),
            field(tr('api_type_label', 'API 格式'), api),
            field(tr('base_url_label', 'Base URL'), baseUrl, `${tr('provider_resolved_endpoint', '最终请求地址')}: ${resolvedEndpoint(provider)}`),
            field(tr('api_auth_mode_label', '认证方式'), auth),
            field(tr('provider_model_source', '模型来源'), source),
            field(tr('provider_model_list_path', '模型列表路径'), listPath),
        );
        const key = inputControl({ type: 'password', value: credential.key || '', placeholder: tr('api_key_placeholder', '输入 API Key') });
        key.addEventListener('change', async () => {
            await credentialStore.modify(provider.id, (current = { type: 'api_key', headers: [] }) => ({ ...current, key: key.value }));
            await emitSelection();
        });
        form.append(field('API Key', key, credential.key ? tr('provider_credentials_local', '凭据仅保存在本机') : tr('provider_credentials_required', '此设备需要填写凭据')));
        card.append(form);
        const headersSection = element('section', 'provider-headers-section');
        headersSection.append(element('h3', '', tr('api_custom_headers_label', '自定义 Headers')));
        renderHeaders(provider, credential, headersSection);
        card.append(headersSection);

        const selectedHere = state.selectedModel?.providerId === provider.id;
        if (selectedHere) {
            const selectedKey = providerModelKey(provider.id, state.selectedModel.modelId);
            const selectedModel = runtime.getModel(provider.id, state.selectedModel.modelId);
            state.modelSettings[selectedKey] ||= {
                reasoningEffort: 'off',
                maxTokens: selectedModel?.maxTokens || null,
            };
            const prompt = document.createElement('textarea');
            prompt.rows = 4;
            prompt.value = state.prompts[selectedKey] || '';
            prompt.placeholder = tr('api_system_prompt_hint', '为当前模型的请求追加系统提示。');
            prompt.addEventListener('input', () => {
                state.prompts[selectedKey] = prompt.value;
                void emitSelection();
                queuePersist();
            });
            const requestSettings = element('div', 'provider-form-grid');
            const reasoningEffort = document.createElement('select');
            ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].forEach((value) => {
                reasoningEffort.append(option(value, value, state.modelSettings[selectedKey].reasoningEffort === value));
            });
            const maxTokens = inputControl({
                type: 'number',
                value: state.modelSettings[selectedKey].maxTokens || selectedModel?.maxTokens || '',
                min: 1,
            });
            reasoningEffort.disabled = !selectedModel?.reasoning;
            reasoningEffort.addEventListener('change', () => {
                state.modelSettings[selectedKey].reasoningEffort = reasoningEffort.value;
                void emitSelection();
                queuePersist();
            });
            maxTokens.addEventListener('change', () => {
                state.modelSettings[selectedKey].maxTokens = Number(maxTokens.value) > 0 ? Math.floor(Number(maxTokens.value)) : null;
                void emitSelection();
                queuePersist();
            });
            requestSettings.append(
                field(tr('api_reasoning_effort_label', '思考等级'), reasoningEffort),
                field(tr('api_max_tokens_label', '最大输出 Tokens'), maxTokens),
            );
            card.append(field(tr('api_system_prompt_label', '系统提示'), prompt), requestSettings);
        }
        const status = state.statuses.get(provider.id);
        if (status) card.append(element('div', `provider-status provider-status--${status.kind}`, status.message));
        renderModels(provider, card);
        container.append(card);
    };

    async function render() {
        if (!root) return;
        root.replaceChildren();
        renderHeader(root);
        const cards = element('div', 'provider-cards');
        root.append(cards);
        for (const provider of state.providers) await renderProvider(provider, cards);
    }

    return {
        initialize: reload,
        reload,
        render,
        flush: persistNow,
        getSelectedApiConfig,
        getState: () => clone({
            providers: state.providers,
            selectedModel: state.selectedModel,
            modelSettings: state.modelSettings,
        }),
    };
}
