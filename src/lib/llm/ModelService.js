// Model Discovery Service - Dynamic capability detection
// Dynamically extracts modalities and capabilities directly from provider API metadata

// Dynamic semantic pattern matching for models when API metadata needs augmentation
const VISION_PATTERNS = {
    positive: [
        'vision',            // explicit vision
        '-vl',               // Qwen2-VL, Qwen2.5-VL, InternVL
        '_vl',
        'vl-',
        'gpt-5',             // OpenAI GPT-5 series (GPT-5.6, GPT-5.2, GPT-5-mini)
        'gpt-4.5',           // GPT-4.5
        'gpt-4o',            // OpenAI multimodal (gpt-4o, gpt-4o-mini)
        'gpt-4-turbo',       // GPT-4 Turbo with vision
        'o1',                // OpenAI o1 with vision
        'o3',                // OpenAI o3 with vision
        'claude-5',          // Claude 5 models (Claude Opus 5, Claude 5 Sonnet)
        'claude-4',          // Claude 4 models
        'claude-3',          // Claude 3 models
        'claude-sonnet',
        'claude-opus',
        'claude-haiku',
        'gemini',            // All Gemini chat models are natively multimodal (Gemini 3.7, 3.5, 2.5, 2.0)
        'llava',             // LLaVA models
        'bakllava',          // BakLLaVA
        'llama-4',           // Llama 4 multimodal (Llama 4 Scout, Llama 4 Maverick)
        'llama-3.2.*vision', // Llama 3.2 vision
        'llama3.2.*vision',
        'pixtral',           // Mistral Pixtral
        'minicpm-v',         // MiniCPM-V
        'moondream',         // Moondream
        'gemma-3',           // Gemma 3 multimodal
        'gemma-4',
        'qwen2-vl',          // Qwen2-VL
        'qwen2.5-vl',        // Qwen2.5-VL
        'qwen-vl',
        'qwen-3.6',          // Qwen 3.6 multimodal
        'deepseek-v4',       // DeepSeek V4 multimodal
        'granite.*vision',   // IBM Granite vision
        'cogvlm',            // CogVLM
        'internvl',          // InternVL
        'phi-3-vision',      // Phi-3 Vision
        'phi-3.5-vision',    // Phi-3.5 Vision
        'phi-4.*multimodal', // Phi-4 Multimodal
        'multimodal',        // Generic multimodal
        'omni'               // Omni models
    ],
    negative: [
        'text-embedding',
        'embed',
        'whisper',
        'tts',
        'dall-e',
        'imagen',
        'rerank',
        'moderation'
    ]
};

// Audio detection patterns
const AUDIO_PATTERNS = {
    positive: [
        'gemini-1.5',      // Gemini 1.5 supports audio
        'gemini-2',        // Gemini 2.0 supports audio
        'gemini-2.5',
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
        'gemini-2.5',
        'video',           // Generic video
    ],
    negative: []
};

/**
 * Dynamic capability detection using pattern matching
 */
function detectCapabilityFromName(modelId, patterns) {
    if (!modelId) return false;

    const lowerModelId = modelId.toLowerCase();

    // Check negative patterns first
    for (const pattern of patterns.negative) {
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'), 'i');
            if (regex.test(lowerModelId)) return false;
        } else if (lowerModelId.includes(pattern.toLowerCase())) {
            return false;
        }
    }

    // Check positive patterns
    for (const pattern of patterns.positive) {
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'), 'i');
            if (regex.test(lowerModelId)) return true;
        } else if (lowerModelId.includes(pattern.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Extract capabilities directly from provider API response metadata
 */
export function extractCapabilitiesFromApiResponse(rawModel, provider) {
    if (!rawModel) return { text: true, image: false, audio: false, video: false };

    const modelId = typeof rawModel === 'string' ? rawModel : (rawModel.id || rawModel.name || '');
    const lowerId = modelId.toLowerCase();

    // 1. Ollama-specific API metadata inspection (families array / architecture)
    if (provider === 'ollama') {
        const details = rawModel.details || {};
        const families = Array.isArray(details.families) ? details.families.map(f => String(f).toLowerCase()) : [];
        const family = String(details.family || '').toLowerCase();
        
        const hasVisionFamily = families.some(f => 
            f.includes('clip') || f.includes('vision') || f.includes('mllama') || f.includes('qwen2vl') || f.includes('minicpm')
        ) || family.includes('clip') || family.includes('mllama') || family.includes('vision') || family.includes('qwen2vl');

        if (hasVisionFamily) {
            return { text: true, image: true, audio: false, video: false };
        }
    }

    // 2. Gemini-specific API metadata inspection (description & supported methods)
    if (provider === 'gemini') {
        const desc = String(rawModel.description || '').toLowerCase();
        const isMultimodal = desc.includes('multimodal') || desc.includes('image') || desc.includes('vision') || lowerId.includes('gemini');
        const hasAudio = desc.includes('audio') || lowerId.includes('gemini-1.5') || lowerId.includes('gemini-2') || lowerId.includes('gemini-2.5');
        const hasVideo = desc.includes('video') || lowerId.includes('pro') || lowerId.includes('gemini-2') || lowerId.includes('gemini-2.5');
        return {
            text: true,
            image: isMultimodal,
            audio: hasAudio,
            video: hasVideo
        };
    }

    // 3. LM Studio metadata inspection
    if (provider === 'lmstudio') {
        const caps = rawModel.capabilities || rawModel.type || rawModel.arch || '';
        const capsStr = typeof caps === 'string' ? caps.toLowerCase() : JSON.stringify(caps).toLowerCase();
        if (capsStr.includes('vision') || capsStr.includes('image') || capsStr.includes('multimodal') || capsStr.includes('clip')) {
            return { text: true, image: true, audio: false, video: false };
        }
    }

    // 4. Default: Dynamic detection from model identifier
    return {
        text: true,
        image: detectCapabilityFromName(modelId, VISION_PATTERNS),
        audio: detectCapabilityFromName(modelId, AUDIO_PATTERNS),
        video: detectCapabilityFromName(modelId, VIDEO_PATTERNS)
    };
}

/**
 * Get model capabilities dynamically
 * @param {string|object} modelOrId - The model identifier or raw model object
 * @param {string} provider - The model provider
 * @returns {Object} Capabilities object
 */
export function getModelCapabilities(modelOrId, provider = null) {
    if (!modelOrId) {
        return { text: true, image: false, audio: false, video: false };
    }

    if (typeof modelOrId === 'object') {
        return extractCapabilitiesFromApiResponse(modelOrId, provider || modelOrId.provider);
    }

    return extractCapabilitiesFromApiResponse({ id: modelOrId }, provider);
}

/**
 * Check if model supports images
 */
export function supportsImage(modelId, provider = null) {
    return getModelCapabilities(modelId, provider).image;
}

/**
 * Check if model supports audio
 */
export function supportsAudio(modelId, provider = null) {
    return getModelCapabilities(modelId, provider).audio;
}

/**
 * Check if model supports video
 */
export function supportsVideo(modelId, provider = null) {
    return getModelCapabilities(modelId, provider).video;
}

/**
 * Get human-readable capability label
 */
export function getModelCapabilityLabel(modelId, provider = null) {
    const caps = getModelCapabilities(modelId, provider);
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
                    // Dynamic capability detection from API response & architecture
                    capabilities: getModelCapabilities(model, 'openai')
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
                { id: 'gpt-5.6', name: 'GPT-5.6 Sol', provider: 'openai', capabilities: getModelCapabilities('gpt-5.6', 'openai') },
                { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', capabilities: getModelCapabilities('gpt-5.2', 'openai') },
                { id: 'o3-mini', name: 'o3 Mini (Reasoning)', provider: 'openai', capabilities: getModelCapabilities('o3-mini', 'openai') },
                { id: 'o1', name: 'o1 Reasoning', provider: 'openai', capabilities: getModelCapabilities('o1', 'openai') },
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: getModelCapabilities('gpt-4o', 'openai') },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: getModelCapabilities('gpt-4o-mini', 'openai') }
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
            const models = (data.data || [])
                .filter(model => {
                    const id = (model.id || '').toLowerCase();
                    return !id.includes('whisper') &&
                           !id.includes('guard') &&
                           !id.includes('embed') &&
                           !id.includes('tts') &&
                           !id.includes('audio');
                })
                .map(model => ({
                    id: model.id,
                    name: model.id,
                    provider: 'groq',
                    contextWindow: model.context_window || 8192,
                    owned_by: model.owned_by,
                    // Dynamic capability detection directly from API model data!
                    capabilities: getModelCapabilities(model, 'groq')
                }))
                .sort((a, b) => a.id.localeCompare(b.id));

            const finalModels = models.length > 0 ? models : [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', capabilities: getModelCapabilities('llama-3.3-70b-versatile', 'groq') },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', capabilities: getModelCapabilities('llama-3.1-8b-instant', 'groq') },
                { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision Preview', provider: 'groq', capabilities: getModelCapabilities('llama-3.2-11b-vision-preview', 'groq') },
                { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision Preview', provider: 'groq', capabilities: getModelCapabilities('llama-3.2-90b-vision-preview', 'groq') },
                { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (Thinking)', provider: 'groq', capabilities: getModelCapabilities('deepseek-r1-distill-llama-70b', 'groq') },
                { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B 32k', provider: 'groq', capabilities: getModelCapabilities('mixtral-8x7b-32768', 'groq') },
                { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B', provider: 'groq', capabilities: getModelCapabilities('qwen-2.5-32b', 'groq') }
            ];

            this.cache.groq = {
                models: finalModels,
                timestamp: Date.now()
            };

            return finalModels;
        } catch (error) {
            console.error('Error fetching Groq models:', error);
            return [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', capabilities: getModelCapabilities('llama-3.3-70b-versatile', 'groq') },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', capabilities: getModelCapabilities('llama-3.1-8b-instant', 'groq') },
                { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision Preview', provider: 'groq', capabilities: getModelCapabilities('llama-3.2-11b-vision-preview', 'groq') },
                { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision Preview', provider: 'groq', capabilities: getModelCapabilities('llama-3.2-90b-vision-preview', 'groq') },
                { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (Thinking)', provider: 'groq', capabilities: getModelCapabilities('deepseek-r1-distill-llama-70b', 'groq') },
                { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B 32k', provider: 'groq', capabilities: getModelCapabilities('mixtral-8x7b-32768', 'groq') },
                { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B', provider: 'groq', capabilities: getModelCapabilities('qwen-2.5-32b', 'groq') }
            ];
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
                // Dynamic capability detection directly from Ollama family/manifest!
                capabilities: getModelCapabilities(model, 'ollama')
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
                // Dynamic capability detection from LM Studio model metadata!
                capabilities: getModelCapabilities(model, 'lmstudio')
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
                    const id = (model.name?.replace(/^models\//, '') || model.id || '').toLowerCase();
                    const methods = model.supportedGenerationMethods || [];
                    const supportsGenerate = methods.includes('generateContent') || methods.includes('streamGenerateContent');
                    
                    // Filter to actual chat/multiturn-capable models
                    return supportsGenerate &&
                        !id.includes('embedding') &&
                        !id.includes('aqa') &&
                        !id.includes('imagen') &&
                        !id.includes('whisper') &&
                        !id.includes('tts') &&
                        !id.includes('learnlm') &&
                        !id.includes('antigravity');
                })
                .map(model => {
                    const id = model.name?.replace(/^models\//, '') || model.id;
                    return {
                        id,
                        name: model.displayName || id,
                        provider: 'gemini',
                        contextWindow: model.inputTokenLimit,
                        // Dynamic capability detection from Gemini API description & methods!
                        capabilities: getModelCapabilities(model, 'gemini')
                    };
                })
                .filter(model => model.id)
                .sort((a, b) => a.id.localeCompare(b.id));

            const finalModels = models.length > 0 ? models : [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-2.5-flash', 'gemini') },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-2.0-flash', 'gemini') },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-1.5-flash', 'gemini') },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', capabilities: getModelCapabilities('gemini-1.5-pro', 'gemini') }
            ];

            this.cache.gemini = {
                models: finalModels,
                timestamp: Date.now()
            };

            return finalModels;
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            return [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-2.5-flash', 'gemini') },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-2.0-flash', 'gemini') },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', capabilities: getModelCapabilities('gemini-1.5-flash', 'gemini') },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', capabilities: getModelCapabilities('gemini-1.5-pro', 'gemini') }
            ];
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
