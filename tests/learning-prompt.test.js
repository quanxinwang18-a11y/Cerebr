import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInitialLearningPrompt } from '../src/runtime/learning/learning-prompt.js';

test('uses and persists the default learning prompt only when storage is missing', () => {
    assert.deepEqual(resolveInitialLearningPrompt({}, 'learningPromptV1', 'Default'), {
        value: 'Default',
        shouldPersistDefault: true,
    });
});

test('preserves saved learning prompts including an intentionally empty value', () => {
    assert.deepEqual(resolveInitialLearningPrompt({ learningPromptV1: 'Custom' }, 'learningPromptV1', 'Default'), {
        value: 'Custom',
        shouldPersistDefault: false,
    });
    assert.deepEqual(resolveInitialLearningPrompt({ learningPromptV1: '' }, 'learningPromptV1', 'Default'), {
        value: '',
        shouldPersistDefault: false,
    });
});
