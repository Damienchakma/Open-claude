// Model Discovery Service - fetches available models from different providers

export class ModelService {
    constructor() {
        this.cache = {
            groq: { models: null, timestamp: null },
            ollama: { models: null, timestamp: null },
            lmstudio: { models: null, timestamp: null }
        };
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    // Fetch models from Groq
    async fetchGroqModels(apiKey) {
        if (!apiKey) return [];

        try {
            // Check cache first
            if (this.cache.groq.models && (Date.now() - this.cache.groq.timestamp < this.CACHE_DURATION)) {
                return this.cache.groq.models;
            }

            const response = await fetch('https://api.groq.com/openai/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch Groq models');
            }

            const data = await response.json();
            const models = data.data.map(model => ({
                id: model.id,
                name: model.id,
                provider: 'groq',
                contextWindow: model.context_window || 8192,
                owned_by: model.owned_by
            }));

            // Update cache
            this.cache.groq = {
                models,
                timestamp: Date.now()
            };

            return models;
        } catch (error) {
            console.error('Error fetching Groq models:', error);
            return [];
        }
    }

    // Fetch models from Ollama (local)
    async fetchOllamaModels() {
        try {
            // Check cache first
            if (this.cache.ollama.models && (Date.now() - this.cache.ollama.timestamp < this.CACHE_DURATION)) {
                return this.cache.ollama.models;
            }

            const response = await fetch('http://localhost:11434/api/tags');

            if (!response.ok) {
                throw new Error('Ollama is not running or not accessible');
            }

            const data = await response.json();
            const models = data.models.map(model => ({
                id: model.name,
                name: model.name,
                provider: 'ollama',
                size: model.size,
                modified: model.modified_at
            }));

            // Update cache
            this.cache.ollama = {
                models,
                timestamp: Date.now()
            };

            return models;
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            return [];
        }
    }

    // Fetch models from LM Studio (local)
    async fetchLMStudioModels() {
        try {
            // Check cache first
            if (this.cache.lmstudio.models && (Date.now() - this.cache.lmstudio.timestamp < this.CACHE_DURATION)) {
                return this.cache.lmstudio.models;
            }

            const response = await fetch('http://localhost:1234/v1/models');

            if (!response.ok) {
                throw new Error('LM Studio is not running or not accessible');
            }

            const data = await response.json();
            const models = data.data.map(model => ({
                id: model.id,
                name: model.id,
                provider: 'lmstudio',
                owned_by: model.owned_by
            }));

            // Update cache
            this.cache.lmstudio = {
                models,
                timestamp: Date.now()
            };

            return models;
        } catch (error) {
            console.error('Error fetching LM Studio models:', error);
            return [];
        }
    }

    // Clear cache for a specific provider
    clearCache(provider) {
        if (provider && this.cache[provider]) {
            this.cache[provider] = { models: null, timestamp: null };
        } else {
            // Clear all caches
            Object.keys(this.cache).forEach(key => {
                this.cache[key] = { models: null, timestamp: null };
            });
        }
    }

    // Get all available models from all providers
    async getAllModels(apiKeys) {
        const allModels = {
            groq: [],
            ollama: [],
            lmstudio: [],
            openai: [], // We'll add static OpenAI models
            gemini: [] // We'll add static Gemini models
        };

        // Fetch Groq models
        if (apiKeys.groq) {
            allModels.groq = await this.fetchGroqModels(apiKeys.groq);
        }

        // Fetch Ollama models
        allModels.ollama = await this.fetchOllamaModels();

        // Fetch LM Studio models
        allModels.lmstudio = await this.fetchLMStudioModels();

        // Add static OpenAI models (they don't have a public models endpoint without API key)
        if (apiKeys.openai) {
            allModels.openai = [
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000 },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000 },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextWindow: 128000 },
                { id: 'gpt-4', name: 'GPT-4', provider: 'openai', contextWindow: 8192 },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', contextWindow: 16385 }
            ];
        }

        // Add static Gemini models
        if (apiKeys.gemini) {
            allModels.gemini = [
                { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'gemini', contextWindow: 1000000 },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: 2000000 },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: 1000000 },
                { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini', contextWindow: 32768 }
            ];
        }

        return allModels;
    }
}

// Singleton instance
export const modelService = new ModelService();
