// Model Discovery Service - Dynamic capability detection
// NO HARDCODED MODEL IDS - Uses pattern matching and API detection

// Vision detection patterns - detect by model name patterns, NOT specific IDs
const VISION_PATTERNS = {
    // Positive patterns - if model name contains these, it likely supports vision
    positive: [
        'vision',          // explicit vision models
        'gpt-4o',          // OpenAI multimodal
        'gpt-4-turbo',     // GPT-4 Turbo with vision
        'claude-3',        // All Claude 3+ support vision
        'claude-4',        // All Claude 4+ support vision
        'claude-sonnet',   // Claude Sonnet models
        'claude-opus',     // Claude Opus models
        'claude-haiku',    // Claude Haiku models
        'gemini-1.5',      // Gemini 1.5 models
        'gemini-2',        // Gemini 2.0 models
        'gemini-pro-vision', // Explicit vision
        'llava',           // LLaVA models
        'llama-3.2.*vision', // Llama 3.2 vision
        'llama-4',         // Llama 4 is multimodal
        'pixtral',         // Mistral's vision model
        'multimodal',      // Generic multimodal
    ],
    // Negative patterns - these definitely DON'T support vision
    negative: [
        'o1-',             // o1 reasoning models (no vision)
        'o3-',             // o3 reasoning models (no vision)
        'gpt-3.5',         // GPT-3.5 (no vision)
        'text-',           // Text-only models
        'embed',           // Embedding models
        'whisper',         // Audio models
        'tts',             // Text-to-speech
        'dall-e',          // Image generation, not input
    ]
};

// Audio detection patterns
const AUDIO_PATTERNS = {
    positive: [
        'gemini-1.5',      // Gemini 1.5 supports audio
        'gemini-2',        // Gemini 2.0 supports audio
        'whisper',         // Whisper audio models
        'audio',           // Generic audio
    ],
    negative: []
};

// Video detection patterns  
const VIDEO_PATTERNS = {
    positive: [
        'gemini-1.5-pro',  // Gemini Pro supports video
        'gemini-2',        // Gemini 2.0 supports video
        'video',           // Generic video
    ],
    negative: []
};

/**
 * Dynamic capability detection using pattern matching
 * Works with ANY model, including future ones
 */
function detectCapabilityFromName(modelId, patterns) {
    if (!modelId) return false;

    const lowerModelId = modelId.toLowerCase();

    // Check negative patterns first
    for (const pattern of patterns.negative) {
        if (pattern.includes('*')) {
            // Regex pattern
            const regex = new RegExp(pattern.replace('*', '.*'), 'i');
            if (regex.test(lowerModelId)) return false;
        } else if (lowerModelId.includes(pattern.toLowerCase())) {
            return false;
        }
    }

    // Check positive patterns
    for (const pattern of patterns.positive) {
        if (pattern.includes('*')) {
            // Regex pattern
            const regex = new RegExp(pattern.replace('*', '.*'), 'i');
            if (regex.test(lowerModelId)) return true;
        } else if (lowerModelId.includes(pattern.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Get model capabilities dynamically
 * @param {string} modelId - The model identifier
 * @returns {Object} Capabilities object
 */
export function getModelCapabilities(modelId) {
    if (!modelId) {
        return { text: true, image: false, audio: false, video: false };
    }

    return {
        text: true, // All models support text
        image: detectCapabilityFromName(modelId, VISION_PATTERNS),
        audio: detectCapabilityFromName(modelId, AUDIO_PATTERNS),
        video: detectCapabilityFromName(modelId, VIDEO_PATTERNS)
    };
}

/**
 * Check if model supports images
 */
export function supportsImage(modelId) {
    return getModelCapabilities(modelId).image;
}

/**
 * Check if model supports audio
 */
export function supportsAudio(modelId) {
    return getModelCapabilities(modelId).audio;
}

/**
 * Check if model supports video
 */
export function supportsVideo(modelId) {
    return getModelCapabilities(modelId).video;
}

/**
 * Get human-readable capability label
 */
export function getModelCapabilityLabel(modelId) {
    const caps = getModelCapabilities(modelId);
    const labels = [];
    if (caps.image) labels.push('📷 Images');
    if (caps.audio) labels.push('🎤 Audio');
    if (caps.video) labels.push('🎬 Video');
    return labels.length > 0 ? labels.join(' • ') : '📝 Text only';
}

/**
 * Format images for specific provider APIs
 * Each provider has different image format requirements
 */
export function formatImagesForProvider(images, provider, textContent) {
    const content = [];

    // Add text first
    if (textContent) {
        content.push({
            type: 'text',
            text: textContent
        });
    }

    // Format images based on provider
    for (const img of images) {
        switch (provider) {
            case 'openai':
            case 'groq':
            case 'lmstudio':
                // OpenAI-compatible format: data URI in image_url
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: img.dataUrl || `data:${img.type};base64,${img.base64}`
                    }
                });
                break;

            case 'anthropic':
                // Anthropic uses separate base64 and media_type
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: img.type || 'image/png',
                        data: img.base64
                    }
                });
                break;

            case 'gemini':
                // Google Gemini uses inline_data format
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: img.dataUrl || `data:${img.type};base64,${img.base64}`
                    }
                });
                break;

            case 'ollama':
                // Ollama uses images array with base64
                // This is handled differently in the client
                content.push({
                    type: 'image',
                    data: img.base64
                });
                break;

            default:
                console.warn(`Unknown provider for image formatting: ${provider}`);
        }
    }

    return content;
}

/**
 * Get vision-capable model suggestions for error messages
 */
export function getVisionModelSuggestions(provider) {
    const suggestions = {
        openai: 'GPT-4o, GPT-4o Mini, GPT-4 Turbo',
        groq: 'Llama 3.2 Vision, Llama 4 Scout/Maverick, LLaVA, Pixtral',
        gemini: 'Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0',
        anthropic: 'Any Claude 3 or Claude 4 model',
        ollama: 'LLaVA, Llama 3.2 Vision models',
        lmstudio: 'LLaVA or other multimodal models'
    };

    return suggestions[provider] || 'a vision-capable model';
}

export class ModelService {
    constructor() {
        this.cache = {
            groq: { models: null, timestamp: null },
            ollama: { models: null, timestamp: null },
            lmstudio: { models: null, timestamp: null },
            openai: { models: null, timestamp: null },
            gemini: { models: null, timestamp: null }
        };
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    // Fetch models from OpenAI API dynamically
    async fetchOpenAIModels(apiKey) {
        if (!apiKey) return [];

        try {
            if (this.cache.openai.models && (Date.now() - this.cache.openai.timestamp < this.CACHE_DURATION)) {
                return this.cache.openai.models;
            }

            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch OpenAI models');
            }

            const data = await response.json();

            // Filter to chat models only and add capabilities dynamically
            const models = data.data
                .filter(model => {
                    const id = model.id.toLowerCase();
                    return (id.includes('gpt') || id.includes('o1') || id.includes('o3'))
                        && !id.includes('instruct')
                        && !id.includes('embed');
                })
                .map(model => ({
                    id: model.id,
                    name: model.id,
                    provider: 'openai',
                    owned_by: model.owned_by,
                    // Dynamic capability detection
                    capabilities: getModelCapabilities(model.id)
                }))
                .sort((a, b) => a.id.localeCompare(b.id));

            this.cache.openai = {
                models,
                timestamp: Date.now()
            };

            return models;
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
            // Return fallback list
            return [
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: getModelCapabilities('gpt-4o') },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: getModelCapabilities('gpt-4o-mini') },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', capabilities: getModelCapabilities('gpt-4-turbo') },
                { id: 'gpt-4', name: 'GPT-4', provider: 'openai', capabilities: getModelCapabilities('gpt-4') },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', capabilities: getModelCapabilities('gpt-3.5-turbo') },
            ];
        }
    }

    // Fetch models from Groq
    async fetchGroqModels(apiKey) {
        if (!apiKey) return [];

        try {
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
                owned_by: model.owned_by,
                // Dynamic capability detection!
                capabilities: getModelCapabilities(model.id)
            }));

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
                modified: model.modified_at,
                // Dynamic capability detection!
                capabilities: getModelCapabilities(model.name)
            }));

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
                owned_by: model.owned_by,
                // Dynamic capability detection!
                capabilities: getModelCapabilities(model.id)
            }));

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

    // Fetch models from Gemini (Google Generative Language API)
    async fetchGeminiModels(apiKey) {
        if (!apiKey) return [];

        try {
            if (this.cache.gemini.models && (Date.now() - this.cache.gemini.timestamp < this.CACHE_DURATION)) {
                return this.cache.gemini.models;
            }

            const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
            url.searchParams.set('key', apiKey);

            const response = await fetch(url.toString());

            if (!response.ok) {
                throw new Error('Failed to fetch Gemini models');
            }

            const data = await response.json();

            const models = (data.models || [])
                .filter(model => {
                    const methods = model.supportedGenerationMethods || [];
                    return methods.includes('generateContent') || methods.includes('streamGenerateContent');
                })
                .map(model => {
                    const id = model.name?.replace(/^models\//, '') || model.id;
                    return {
                        id,
                        name: model.displayName || id,
                        provider: 'gemini',
                        contextWindow: model.inputTokenLimit,
                        capabilities: getModelCapabilities(id)
                    };
                })
                .filter(model => model.id)
                .sort((a, b) => a.id.localeCompare(b.id));

            this.cache.gemini = {
                models,
                timestamp: Date.now()
            };

            return models;
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            return [];
        }
    }

    // Clear cache for a specific provider
    clearCache(provider) {
        if (provider && this.cache[provider]) {
            this.cache[provider] = { models: null, timestamp: null };
        } else {
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
            openai: [],
            gemini: []
        };

        // Fetch OpenAI models dynamically
        if (apiKeys.openai) {
            allModels.openai = await this.fetchOpenAIModels(apiKeys.openai);
        }

        // Fetch Groq models
        if (apiKeys.groq) {
            allModels.groq = await this.fetchGroqModels(apiKeys.groq);
        }

        // Fetch Ollama models
        allModels.ollama = await this.fetchOllamaModels();

        // Fetch LM Studio models
        allModels.lmstudio = await this.fetchLMStudioModels();

        // Fetch Gemini models dynamically
        if (apiKeys.gemini) {
            allModels.gemini = await this.fetchGeminiModels(apiKeys.gemini);
        }

        return allModels;
    }
}

// Singleton instance
export const modelService = new ModelService();
