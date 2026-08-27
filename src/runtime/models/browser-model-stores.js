export const PROVIDER_CREDENTIALS_STORAGE_KEY = 'providerCredentialsV2';
export const PROVIDER_MODEL_CATALOG_STORAGE_KEY = 'providerModelCatalogV1';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function throwIfAborted(options) {
    options?.signal?.throwIfAborted?.();
    if (options?.signal?.aborted) {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
    }
}

class StorageMapStore {
    constructor(storage, storageKey) {
        if (!storage?.get || !storage?.set || !storage?.remove) {
            throw new TypeError('A storage adapter with get/set/remove is required');
        }
        this.storage = storage;
        this.storageKey = storageKey;
        this.writeChain = Promise.resolve();
    }

    async readMap(options) {
        throwIfAborted(options);
        const result = await this.storage.get(this.storageKey);
        throwIfAborted(options);
        const value = result?.[this.storageKey];
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    mutate(mutator, options) {
        const operation = this.writeChain
            .catch(() => {})
            .then(async () => {
                throwIfAborted(options);
                const map = await this.readMap(options);
                const result = await mutator(map);
                throwIfAborted(options);
                if (Object.keys(map).length === 0) {
                    await this.storage.remove(this.storageKey);
                } else {
                    await this.storage.set({ [this.storageKey]: map });
                }
                throwIfAborted(options);
                return result;
            });
        this.writeChain = operation.catch(() => {});
        return operation;
    }
}

export class ChromeCredentialStore extends StorageMapStore {
    constructor(storage, storageKey = PROVIDER_CREDENTIALS_STORAGE_KEY) {
        super(storage, storageKey);
    }

    async read(providerId, options) {
        const map = await this.readMap(options);
        return clone(map[providerId]);
    }

    async list(options) {
        const map = await this.readMap(options);
        return Object.entries(map).map(([providerId, credential]) => ({
            providerId,
            type: credential?.type || 'api_key',
        }));
    }

    modify(providerId, update, options) {
        return this.mutate(async (map) => {
            const current = clone(map[providerId]);
            const next = await update(current);
            if (next !== undefined) map[providerId] = clone(next);
            return clone(next ?? current);
        }, options);
    }

    delete(providerId, options) {
        return this.mutate((map) => {
            delete map[providerId];
        }, options);
    }
}

export class ChromeModelsStore extends StorageMapStore {
    constructor(storage, storageKey = PROVIDER_MODEL_CATALOG_STORAGE_KEY) {
        super(storage, storageKey);
    }

    async read(providerId, options) {
        const map = await this.readMap(options);
        return clone(map[providerId]);
    }

    write(providerId, entry, options) {
        return this.mutate((map) => {
            map[providerId] = clone(entry);
        }, options);
    }

    delete(providerId, options) {
        return this.mutate((map) => {
            delete map[providerId];
        }, options);
    }
}

export function createBrowserAuthContext() {
    return {
        env: async () => undefined,
        fileExists: async () => false,
    };
}
