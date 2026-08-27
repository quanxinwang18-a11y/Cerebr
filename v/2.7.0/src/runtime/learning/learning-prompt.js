export function resolveInitialLearningPrompt(storageResult, storageKey, defaultPrompt) {
    const storedValue = storageResult?.[storageKey];
    if (typeof storedValue === 'string') {
        return {
            value: storedValue,
            shouldPersistDefault: false,
        };
    }
    return {
        value: String(defaultPrompt || ''),
        shouldPersistDefault: true,
    };
}
