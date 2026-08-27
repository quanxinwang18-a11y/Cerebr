/**
 * API卡片配置接口
 * @typedef {Object} APIConfig
 * @property {string} apiKey - API密钥
 * @property {string} baseUrl - API的基础URL
 * @property {string} modelName - 模型名称
 * @property {Object} advancedSettings - 高级设置
 * @property {string} advancedSettings.systemPrompt - 系统提示
 * @property {string} advancedSettings.reasoningEffort - 思考等级
 * @property {boolean} advancedSettings.isExpanded - 高级设置是否展开
 */

/**
 * 渲染 API 卡片
 * @param {Object} params - 渲染参数
 * @param {Array<APIConfig>} params.apiConfigs - API配置列表
 * @param {HTMLElement} params.apiCardsContainer - 卡片容器元素
 * @param {HTMLElement} params.templateCard - 模板卡片元素
 * @param {function} params.onCardCreate - 卡片创建回调函数
 * @param {function} params.onCardSelect - 卡片选择回调函数
 * @param {function} params.onCardDuplicate - 卡片复制回调函数
 * @param {function} params.onCardDelete - 卡片删除回调函数
 * @param {function} params.onCardChange - 卡片内容变更回调函数
 * @param {number} params.selectedIndex - 当前选中的卡片索引
 */
export function renderAPICards({
    apiConfigs,
    apiCardsContainer,
    templateCard,
    onCardCreate,
    onCardSelect,
    onCardDuplicate,
    onCardDelete,
    onCardChange,
    selectedIndex
}) {
    if (!templateCard) {
        console.error('找不到模板卡片元素');
        return;
    }

    // 保存模板的副本
    const templateClone = templateCard.cloneNode(true);

    // 清空现有卡片
    apiCardsContainer.innerHTML = '';

    // 先重新添加模板（保持隐藏状态）
    apiCardsContainer.appendChild(templateClone);

    // 移除所有卡片的选中状态
    document.querySelectorAll('.api-card').forEach(card => {
        card.classList.remove('selected');
    });

    // 渲染实际的卡片
    apiConfigs.forEach((config, index) => {
        const card = createAPICard({
            config,
            index,
            templateCard: templateClone,
            onSelect: onCardSelect,
            onDuplicate: onCardDuplicate,
            onDelete: onCardDelete,
            onChange: onCardChange,
            isSelected: index === selectedIndex
        });
        apiCardsContainer.appendChild(card);
        if (onCardCreate) {
            onCardCreate(card, index);
        }
    });
}

/**
 * 创建单个 API 卡片
 * @param {Object} params - 创建参数
 * @param {APIConfig} params.config - API配置
 * @param {number} params.index - 卡片索引
 * @param {HTMLElement} params.templateCard - 模板卡片元素
 * @param {function} params.onSelect - 选择回调
 * @param {function} params.onDuplicate - 复制回调
 * @param {function} params.onDelete - 删除回调
 * @param {function} params.onChange - 变更回调
 * @param {boolean} params.isSelected - 是否选中
 * @returns {HTMLElement} 创建的卡片元素
 */

import { modelSupportsReasoningEffort, normalizeReasoningEffort } from '../utils/reasoning-effort.js';
import { t } from '../utils/i18n.js';
import {
    API_TYPE_ANTHROPIC_MESSAGES,
    API_TYPE_OPENAI_COMPLETIONS,
    normalizeApiType,
    normalizeCustomHeaders,
    normalizeProviderUrl,
} from '../runtime/chat/provider-adapters.js';

function createAPICard({
    config,
    index,
    templateCard,
    onSelect,
    onDuplicate,
    onDelete,
    onChange,
    isSelected
}) {
    // 克隆模板
    const template = templateCard.cloneNode(true);
    template.classList.remove('template');
    template.style.display = '';
    template.setAttribute('tabindex', '0');

    // 设置选中状态
    if (isSelected) {
        template.classList.add('selected');
    } else {
        template.classList.remove('selected');
    }

    const apiKeyInput = template.querySelector('.api-key');
    const apiTypeSelect = template.querySelector('.api-type');
    const authModeSelect = template.querySelector('.auth-mode');
    const baseUrlInput = template.querySelector('.base-url');
    const modelNameInput = template.querySelector('.model-name');
    const advancedSettingsContainer = template.querySelector('.advanced-settings');
    const systemPromptInput = template.querySelector('.system-prompt');
    const systemPromptLabel = template.querySelector('.system-prompt-label');
    const systemPromptHint = template.querySelector('.system-prompt-hint');
    const reasoningEffortSetting = template.querySelector('.reasoning-effort-setting');
    const reasoningEffortSelect = template.querySelector('.reasoning-effort');
    const reasoningEffortLabel = template.querySelector('.reasoning-effort-label');
    const reasoningEffortHint = template.querySelector('.reasoning-effort-hint');
    const maxTokensInput = template.querySelector('.max-tokens');
    const maxTokensLabel = template.querySelector('.max-tokens-label');
    const maxTokensHint = template.querySelector('.max-tokens-hint');
    const customHeadersList = template.querySelector('.custom-headers-list');
    const customHeaderAddButton = template.querySelector('.custom-header-add');
    const apiKeyVisibilityButton = template.querySelector('.api-key-visibility-btn');
    const advancedSettingsHeader = template.querySelector('.advanced-settings-header');
    const advancedSettingsContent = template.querySelector('.advanced-settings-content');

    const controlIds = {
        advancedSettingsHeader: `advanced-settings-header-${index}`,
        advancedSettingsContent: `advanced-settings-content-${index}`,
        systemPrompt: `system-prompt-${index}`,
        systemPromptHint: `system-prompt-hint-${index}`,
        reasoningEffort: `reasoning-effort-${index}`,
        reasoningEffortHint: `reasoning-effort-hint-${index}`,
        maxTokens: `max-tokens-${index}`,
        maxTokensHint: `max-tokens-hint-${index}`,
    };

    advancedSettingsHeader.id = controlIds.advancedSettingsHeader;
    advancedSettingsHeader.setAttribute('aria-controls', controlIds.advancedSettingsContent);
    advancedSettingsContent.id = controlIds.advancedSettingsContent;
    advancedSettingsContent.setAttribute('role', 'region');
    advancedSettingsContent.setAttribute('aria-labelledby', controlIds.advancedSettingsHeader);
    systemPromptInput.id = controlIds.systemPrompt;
    systemPromptLabel?.setAttribute('for', controlIds.systemPrompt);
    systemPromptHint.id = controlIds.systemPromptHint;
    systemPromptInput.setAttribute('aria-describedby', controlIds.systemPromptHint);
    reasoningEffortSelect.id = controlIds.reasoningEffort;
    reasoningEffortLabel?.setAttribute('for', controlIds.reasoningEffort);
    reasoningEffortHint.id = controlIds.reasoningEffortHint;
    reasoningEffortSelect.setAttribute('aria-describedby', controlIds.reasoningEffortHint);
    maxTokensInput.id = controlIds.maxTokens;
    maxTokensLabel?.setAttribute('for', controlIds.maxTokens);
    maxTokensHint.id = controlIds.maxTokensHint;
    maxTokensInput.setAttribute('aria-describedby', controlIds.maxTokensHint);

    const stopPropagation = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };

    const stopPropagationOnly = (e) => {
        e.stopPropagation();
    };

    const setControlTabIndex = (control, enabled) => {
        if (!control) return;

        if (enabled) {
            control.removeAttribute('tabindex');
            return;
        }

        control.setAttribute('tabindex', '-1');
    };

    const syncAdvancedControlInteractivity = (expanded) => {
        setControlTabIndex(systemPromptInput, expanded);
        setControlTabIndex(
            reasoningEffortSelect,
            expanded && !reasoningEffortSelect.disabled && !reasoningEffortSetting.hidden
        );
        setControlTabIndex(maxTokensInput, expanded);
        customHeadersList.querySelectorAll('input, button').forEach((control) => {
            setControlTabIndex(control, expanded);
        });
    };

    const setAdvancedExpanded = (expanded) => {
        advancedSettingsContainer.dataset.expanded = String(expanded);
        advancedSettingsHeader.setAttribute('aria-expanded', String(expanded));
        advancedSettingsContent.setAttribute('aria-hidden', String(!expanded));
        syncAdvancedControlInteractivity(expanded);
    };

    // 设置初始值
    apiTypeSelect.value = normalizeApiType(config.apiType);
    authModeSelect.value = config.authMode || 'auto';
    apiKeyInput.value = config.apiKey || '';
    baseUrlInput.value = config.baseUrl || 'https://api.openai.com/v1/chat/completions';
    modelNameInput.value = config.modelName || 'gpt-4o';

    // 设置系统提示的默认值
    systemPromptInput.value = config.advancedSettings?.systemPrompt || '';
    reasoningEffortSelect.value = normalizeReasoningEffort(config.advancedSettings?.reasoningEffort);
    maxTokensInput.value = config.advancedSettings?.maxTokens || '';

    const getHeaderValues = () => Array.from(customHeadersList.querySelectorAll('.custom-header-row'))
        .map((row) => ({
            name: row.querySelector('.custom-header-name')?.value || '',
            value: row.querySelector('.custom-header-value')?.value || '',
        }));

    const createHeaderRow = (header = {}) => {
        const row = document.createElement('div');
        row.className = 'custom-header-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'custom-header-name';
        nameInput.autocomplete = 'off';
        nameInput.spellcheck = false;
        nameInput.placeholder = t('api_custom_header_name_placeholder');
        nameInput.setAttribute('aria-label', t('api_custom_header_name_placeholder'));
        nameInput.value = header.name || '';

        const valueInput = document.createElement('input');
        valueInput.type = 'password';
        valueInput.className = 'custom-header-value';
        valueInput.autocomplete = 'off';
        valueInput.spellcheck = false;
        valueInput.placeholder = t('api_custom_header_value_placeholder');
        valueInput.setAttribute('aria-label', t('api_custom_header_value_placeholder'));
        valueInput.value = header.value || '';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'custom-header-remove';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', t('api_custom_header_remove_aria'));

        [nameInput, valueInput].forEach((input) => {
            input.addEventListener('click', stopPropagationOnly);
            input.addEventListener('focus', stopPropagationOnly);
            input.addEventListener('input', () => {
                onChange(index, buildNextConfig(), { kind: 'apiFields' });
            });
            input.addEventListener('change', () => {
                onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
            });
        });
        removeButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            row.remove();
            onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
        });

        row.append(nameInput, valueInput, removeButton);
        customHeadersList.appendChild(row);
        syncAdvancedControlInteractivity(advancedSettingsContainer.dataset.expanded === 'true');
        return row;
    };

    normalizeCustomHeaders(config.headers).forEach(createHeaderRow);

    const updateReasoningEffortVisibility = () => {
        const isSupported = apiTypeSelect.value === API_TYPE_OPENAI_COMPLETIONS
            && modelSupportsReasoningEffort(modelNameInput.value || 'gpt-4o');
        reasoningEffortSetting.hidden = !isSupported;
        reasoningEffortSelect.disabled = !isSupported;
        syncAdvancedControlInteractivity(advancedSettingsContainer.dataset.expanded === 'true');
    };

    const isExpanded = config.advancedSettings?.isExpanded || false;

    updateReasoningEffortVisibility();
    setAdvancedExpanded(isExpanded);

    const buildNextConfig = ({ advancedSettingsOverride } = {}) => {
        const nextAdvancedSettings = {
            ...(config.advancedSettings || {}),
            isExpanded: advancedSettingsContainer.dataset.expanded === 'true',
            systemPrompt: systemPromptInput.value,
            reasoningEffort: normalizeReasoningEffort(reasoningEffortSelect.value),
            maxTokens: maxTokensInput.value ? Math.max(1, Math.floor(Number(maxTokensInput.value) || 0)) : null,
            ...(advancedSettingsOverride || {}),
        };

        return {
            ...config,
            apiType: normalizeApiType(apiTypeSelect.value),
            authMode: authModeSelect.value || 'auto',
            apiKey: apiKeyInput.value,
            headers: normalizeCustomHeaders(getHeaderValues()),
            baseUrl: baseUrlInput.value,
            modelName: modelNameInput.value,
            advancedSettings: nextAdvancedSettings,
        };
    };

    // 添加高级设置的展开/折叠功能
    advancedSettingsHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyExpanded = advancedSettingsContainer.dataset.expanded === 'true';
        setAdvancedExpanded(!isCurrentlyExpanded);

        // 更新配置
        onChange(index, buildNextConfig({
            advancedSettingsOverride: {
                isExpanded: !isCurrentlyExpanded,
            }
        }));
    });
    advancedSettingsHeader.addEventListener('keydown', stopPropagationOnly);
    advancedSettingsContent.addEventListener('click', stopPropagationOnly);

    // 系统提示：实时更新并自动保存（由外层实现节流/同步策略）
    systemPromptInput.addEventListener('input', () => {
        onChange(index, buildNextConfig(), { kind: 'systemPrompt' });
    });

    // 在失焦时强制落盘一次，避免 debounce 尚未触发导致丢失
    systemPromptInput.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'systemPrompt', flush: true });
    });

    // 其他字段：实时更新并自动保存（由外层实现节流/同步策略）
    [apiKeyInput, baseUrlInput, modelNameInput].forEach((input) => {
        input.addEventListener('input', () => {
            if (input === modelNameInput) {
                updateReasoningEffortVisibility();
            }
            onChange(index, buildNextConfig(), { kind: 'apiFields' });
        });
    });

    reasoningEffortSelect.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'apiFields' });
    });
    maxTokensInput.addEventListener('input', () => {
        onChange(index, buildNextConfig(), { kind: 'apiFields' });
    });
    maxTokensInput.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
    });

    customHeaderAddButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = createHeaderRow();
        row.querySelector('.custom-header-name')?.focus();
    });

    apiKeyVisibilityButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldShow = apiKeyInput.type === 'password';
        apiKeyInput.type = shouldShow ? 'text' : 'password';
        apiKeyVisibilityButton.setAttribute(
            'aria-label',
            t(shouldShow ? 'api_key_hide_aria' : 'api_key_show_aria')
        );
    });

    apiTypeSelect.addEventListener('change', () => {
        const previousType = normalizeApiType(config.apiType);
        const nextType = normalizeApiType(apiTypeSelect.value);
        const currentUrl = baseUrlInput.value.trim();
        const previousDefault = previousType === API_TYPE_ANTHROPIC_MESSAGES
            ? 'https://api.anthropic.com/v1/messages'
            : 'https://api.openai.com/v1/chat/completions';
        const legacyDefault = 'https://api.0-0.pro/v1/chat/completions';
        if (!currentUrl || currentUrl === previousDefault || currentUrl === legacyDefault) {
            baseUrlInput.value = nextType === API_TYPE_ANTHROPIC_MESSAGES
                ? 'https://api.anthropic.com/v1/messages'
                : 'https://api.openai.com/v1/chat/completions';
        }
        if (nextType === API_TYPE_ANTHROPIC_MESSAGES && !maxTokensInput.value) {
            maxTokensInput.value = '8192';
        }
        updateReasoningEffortVisibility();
        onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
    });

    authModeSelect.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
    });

    // 为输入框添加点击事件阻止冒泡
    [apiKeyInput, baseUrlInput, modelNameInput, systemPromptInput, maxTokensInput].forEach(control => {
        control.addEventListener('click', stopPropagation);
        control.addEventListener('focus', stopPropagation);
    });
    reasoningEffortSelect.addEventListener('click', stopPropagationOnly);
    reasoningEffortSelect.addEventListener('focus', stopPropagationOnly);
    apiTypeSelect.addEventListener('click', stopPropagationOnly);
    apiTypeSelect.addEventListener('focus', stopPropagationOnly);
    authModeSelect.addEventListener('click', stopPropagationOnly);
    authModeSelect.addEventListener('focus', stopPropagationOnly);

    // 添加输入法状态跟踪
    let isComposing = false;

    // 监听输入法开始
    [apiKeyInput, baseUrlInput, modelNameInput, systemPromptInput].forEach(input => {
        input.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        // 监听输入法结束
        input.addEventListener('compositionend', () => {
            isComposing = false;
        });
    });

    // 修改键盘事件处理（普通输入框）
    [apiKeyInput, baseUrlInput, modelNameInput].forEach(input => {
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (isComposing) {
                    // 如果正在使用输入法，不触发选择
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                if (input === baseUrlInput) {
                    baseUrlInput.value = normalizeProviderUrl(baseUrlInput.value, apiTypeSelect.value) || baseUrlInput.value.trim();
                }

                const maybePromise = onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    try {
                        await maybePromise;
                    } catch {
                        // ignore
                    }
                }
                onSelect(template, index);
            }
        });
    });

    reasoningEffortSelect.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    });

    // 修改键盘事件处理（系统提示 textarea：回车先 flush 再返回）
    systemPromptInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (isComposing) return;
            e.preventDefault();
            e.stopPropagation();

            const maybePromise = onChange(index, buildNextConfig(), { kind: 'systemPrompt', flush: true });
            if (maybePromise && typeof maybePromise.then === 'function') {
                try {
                    await maybePromise;
                } catch {
                    // ignore
                }
            }

            onSelect(template, index);
        }
    });

    // 为按钮添加点击事件阻止冒泡
    template.querySelectorAll('.card-button').forEach(button => {
        button.addEventListener('click', stopPropagation);
        button.addEventListener('keydown', stopPropagationOnly);
    });

    // 添加回车键选择功能
    template.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isComposing) {
            e.preventDefault();
            onSelect(template, index);
        }
    });

    // 监听输入框变化
    [apiKeyInput, baseUrlInput, modelNameInput].forEach(input => {
        input.addEventListener('change', () => {
            if (input === baseUrlInput) {
                baseUrlInput.value = normalizeProviderUrl(baseUrlInput.value, apiTypeSelect.value) || baseUrlInput.value.trim();
            }
            if (input === modelNameInput) {
                updateReasoningEffortVisibility();
            }
            onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
        });
    });

    // 复制配置
    template.querySelector('.duplicate-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDuplicate(config, index);
    });

    // 删除配置
    template.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete(index);
    });

    // 选择配置
    template.addEventListener('click', (e) => {
        // 如果点击的是输入框或按钮，不触发选择
        if (
            e.target.matches('input, textarea, select') ||
            e.target.matches('.card-button') ||
            e.target.closest('.card-button') ||
            e.target.closest('.advanced-settings')
        ) {
            return;
        }
        onSelect(template, index);
    });

    return template;
}

/**
 * 创建API卡片回调处理函数
 * @param {Object} params - 参数对象
 * @param {function} params.selectCard - 选择卡片的函数
 * @param {Array<APIConfig>} params.apiConfigs - API配置列表
 * @param {number} params.selectedConfigIndex - 当前选中的配置索引
 * @param {function} params.saveAPIConfigs - 保存API配置的函数
 * @param {function} params.renderAPICardsWithCallbacks - 重新渲染卡片的函数
 * @returns {Object} 回调函数对象
 */
export function createCardCallbacks({
    selectCard,
    apiConfigs,
    selectedConfigIndex,
    saveAPIConfigs,
    queueApiConfigsPersist,
    flushApiConfigsPersist,
    queueSystemPromptPersist,
    flushSystemPromptPersist,
    renderAPICardsWithCallbacks,
    onBeforeCardDelete,
    onConfigChange,
}) {
    return {
        onCardSelect: selectCard,
        onCardDuplicate: (config, index) => {
            const cloned = (typeof structuredClone === 'function')
                ? structuredClone(config)
                : JSON.parse(JSON.stringify(config));
            delete cloned.id;
            // 在当前选中卡片后面插入新卡片
            apiConfigs.splice(index + 1, 0, cloned);
            // 保存配置但不改变选中状态
            saveAPIConfigs();
            // 重新渲染所有卡片，保持原来的选中状态
            renderAPICardsWithCallbacks();
        },
        onCardDelete: (index) => {
            if (apiConfigs.length > 1) {
                if (typeof onBeforeCardDelete === 'function') {
                    onBeforeCardDelete(apiConfigs[index], index);
                }
                apiConfigs.splice(index, 1);
                if (selectedConfigIndex >= apiConfigs.length) {
                    selectedConfigIndex = apiConfigs.length - 1;
                }
                saveAPIConfigs();
                renderAPICardsWithCallbacks();
            }
        },
        onCardChange: (index, newConfig, options = {}) => {
            apiConfigs[index] = newConfig;
            if (typeof onConfigChange === 'function') {
                onConfigChange(index, newConfig, options);
            }

            if (options.kind === 'systemPrompt') {
                if (options.flush && typeof flushSystemPromptPersist === 'function') {
                    return flushSystemPromptPersist(newConfig);
                }
                if (typeof queueSystemPromptPersist === 'function') {
                    queueSystemPromptPersist(newConfig);
                    return;
                }
                // 回退：如果未注入专用保存逻辑，就沿用全量保存
            }

            if (options.kind === 'apiFields') {
                if (options.flush && typeof flushApiConfigsPersist === 'function') {
                    return flushApiConfigsPersist();
                }
                if (typeof queueApiConfigsPersist === 'function') {
                    queueApiConfigsPersist();
                    return;
                }
                // 回退：如果未注入专用保存逻辑，就沿用全量保存
            }

            saveAPIConfigs();
        }
    };
}

/**
 * 选择API卡片的函数
 * @param {Object} params - 参数对象
 * @param {Object} params.template - 模板对象
 * @param {number} params.index - 选中的索引
 * @param {function} params.onIndexChange - 索引变更回调函数
 * @param {function} params.onSave - 保存配置的回调函数
 * @param {string} params.cardSelector - 卡片元素的CSS选择器
 * @param {function} params.onSelect - 选中后的回调函数
 * @returns {void}
 */
export function selectCard({
    template,
    index,
    onIndexChange,
    onSave,
    cardSelector = '.api-card',
    currentIndex = null,
    onSelect
}) {
    // 更新选中索引
    onIndexChange(index);

    const cardNodes = Array.from(document.querySelectorAll(cardSelector))
        .filter((card) => !card.classList.contains('template'));

    if (currentIndex !== index) {
        // 保存配置
        onSave();
    }

    // 更新UI状态
    cardNodes.forEach((card) => {
        card.classList.remove('selected');
    });

    // 选中当前卡片
    const selectedCard = cardNodes[index] || null;
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // 执行选中后的回调
    if (onSelect) {
        onSelect(selectedCard, index);
    }

    return selectedCard;
}
