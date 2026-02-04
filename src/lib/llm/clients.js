// LLM Client Factory with Industry-Standard Thinking Detection
// Based on Open-WebUI and LobeChat implementations

// UNIVERSAL Configuration - Works across ALL providers and models
const THINKING_CONFIG = {
    // Universal standard: <think> tags (de-facto industry standard)
    tags: {
        patterns: [
            { open: '<think>', close: '</think>', name: 'think' },
            { open: '<thinking>', close: '</thinking>', name: 'thinking' },
            { open: '[THINKING]', close: '[/THINKING]', name: 'THINKING' },
            { open: '[REASONING]', close: '[/REASONING]', name: 'REASONING' },
        ]
    },

    // Provider-specific API field mappings
    fields: {
        openai: {
            delta: ['reasoning'],
            message: ['reasoning_content'],
            usage: 'reasoning_tokens'
        },
        anthropic: {
            contentBlocks: true,
            blockTypes: ['thinking', 'reasoning']
        },
        deepseek: {
            message: ['reasoning_content'],
            delta: ['reasoning']
        },
        google: {
            message: ['thought_process', 'thinking']
        }
    },

    // Universal field names to check (works for any provider)
    universalFields: [
        'reasoning',
        'reasoning_content',
        'thinking',
        'thought_process',
        'chain_of_thought',
        'internal_monologue',
        'thinking_blocks',
        'reasoning_blocks'
    ]
};

// Universal extraction function - checks ALL possible locations
function extractThinking(apiResponse, providerConfig = null) {
    if (!apiResponse) return { thinking: null, content: null };

    // Method 1: Check provider-specific fields
    if (providerConfig) {
        // Check delta fields (streaming)
        if (apiResponse.delta && providerConfig.delta) {
            for (const field of providerConfig.delta) {
                if (apiResponse.delta[field]) {
                    return {
                        thinking: apiResponse.delta[field],
                        content: apiResponse.delta.content || null
                    };
                }
            }
        }

        // Check message fields
        if (apiResponse.message && providerConfig.message) {
            for (const field of providerConfig.message) {
                if (apiResponse.message[field]) {
                    return {
                        thinking: apiResponse.message[field],
                        content: apiResponse.message.content || null
                    };
                }
            }
        }

        // Check content blocks (Anthropic style)
        if (providerConfig.contentBlocks && Array.isArray(apiResponse.content)) {
            let thinking = null;
            let content = '';

            for (const block of apiResponse.content) {
                if (providerConfig.blockTypes.includes(block.type)) {
                    thinking = block.text;
                } else if (block.type === 'text') {
                    content += block.text;
                }
            }

            if (thinking) {
                return { thinking, content };
            }
        }
    }

    // Method 2: Check universal field names
    for (const field of THINKING_CONFIG.universalFields) {
        if (apiResponse[field]) {
            return {
                thinking: apiResponse[field],
                content: apiResponse.content || apiResponse.text || null
            };
        }

        // Check nested in message
        if (apiResponse.message && apiResponse.message[field]) {
            return {
                thinking: apiResponse.message[field],
                content: apiResponse.message.content || null
            };
        }
    }

    // Method 3: No structured thinking found
    return {
        thinking: null,
        content: apiResponse.content || apiResponse.text || null
    };
}

// Extract thinking tokens from usage data
function extractThinkingTokens(apiResponse, providerConfig) {
    if (!apiResponse.usage || !providerConfig?.usage) return null;
    return apiResponse.usage[providerConfig.usage] || null;
}

// Streaming tag parser - tracks state across chunks
class StreamingTagParser {
    constructor() {
        this.reset();
    }

    reset() {
        this.inThinking = false;
        this.thinkingBuffer = '';
        this.contentBuffer = '';
        this.currentTag = null;
    }

    // Process a text chunk and extract thinking/content
    processChunk(text) {
        const results = [];
        let remaining = text;

        while (remaining) {
            if (!this.inThinking) {
                // Look for opening tag
                let earliestMatch = null;
                let earliestIndex = Infinity;

                for (const tag of THINKING_CONFIG.tags.patterns) {
                    const index = remaining.indexOf(tag.open);
                    if (index !== -1 && index < earliestIndex) {
                        earliestIndex = index;
                        earliestMatch = tag;
                    }
                }

                if (earliestMatch) {
                    // Emit content before tag
                    if (earliestIndex > 0) {
                        const beforeTag = remaining.substring(0, earliestIndex);
                        if (beforeTag.trim()) {
                            results.push({ isThinking: false, content: beforeTag });
                        }
                    }

                    // Enter thinking mode
                    this.inThinking = true;
                    this.currentTag = earliestMatch;
                    remaining = remaining.substring(earliestIndex + earliestMatch.open.length);
                } else {
                    // No tag found, emit as regular content
                    if (remaining.trim()) {
                        results.push({ isThinking: false, content: remaining });
                    }
                    remaining = '';
                }
            } else {
                // Look for closing tag
                const closeIndex = remaining.indexOf(this.currentTag.close);

                if (closeIndex !== -1) {
                    // Found closing tag
                    const thinkingContent = remaining.substring(0, closeIndex);
                    this.thinkingBuffer += thinkingContent;

                    // Emit complete thinking
                    if (this.thinkingBuffer.trim()) {
                        results.push({ isThinking: true, content: this.thinkingBuffer.trim() });
                    }

                    // Exit thinking mode
                    this.inThinking = false;
                    this.thinkingBuffer = '';
                    this.currentTag = null;
                    remaining = remaining.substring(closeIndex + this.currentTag.close.length);
                } else {
                    // No closing tag yet, buffer it
                    this.thinkingBuffer += remaining;
                    remaining = '';
                }
            }
        }

        return results;
    }

    // Get any buffered incomplete thinking
    getBuffered() {
        if (this.thinkingBuffer && this.inThinking) {
            return { isThinking: true, content: this.thinkingBuffer };
        }
        return null;
    }
}

export class LLMFactory {
    static getClient(provider, apiKey) {
        switch (provider) {
            case 'openai':
                return new OpenAIClient(apiKey);
            case 'groq':
                return new GroqClient(apiKey);
            case 'gemini':
                return new GeminiClient(apiKey);
            case 'ollama':
                return new OllamaClient();
            case 'lmstudio':
                return new LMStudioClient();
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
}

class BaseClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async streamChat(messages, onChunk, modelId) {
        throw new Error('Not implemented');
    }
}

// OpenAI Client with comprehensive detection
export class OpenAIClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gpt-4o') {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');

        const config = THINKING_CONFIG.fields.openai;
        const tagParser = new StreamingTagParser();

        // Format messages - handle images if present
        const formattedMessages = messages.map(m => {
            // Check if message has images
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                // Add images in OpenAI format
                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: formattedMessages,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenAI API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));

                        // LAYER 1: Check API-level thinking fields
                        const extracted = extractThinking(data.choices?.[0], config);

                        if (extracted.thinking) {
                            // Found API-level thinking
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            // LAYER 2: Parse content for embedded tags
                            const tagResults = tagParser.processChunk(extracted.content);
                            for (const result of tagResults) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract thinking tokens
                        const tokens = extractThinkingTokens(data, config);
                        if (tokens) {
                            onChunk('', { thinkingTokens: tokens });
                        }

                        // Extract finish reason
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
    }
}

// Groq Client with tag-based detection
export class GroqClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'llama-3.3-70b-versatile') {
        if (!this.apiKey) throw new Error('Groq API Key missing');

        const tagParser = new StreamingTagParser();

        // Format messages - handle images if present (Groq uses OpenAI-compatible format)
        const formattedMessages = messages.map(m => {
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: formattedMessages,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Groq API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content || '';

                        if (content) {
                            // Parse for thinking tags in real-time
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract finish reason
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
    }
}

// Gemini Client with universal detection
export class GeminiClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gemini-1.5-flash') {
        if (!this.apiKey) throw new Error('Gemini API Key missing');

        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`);
        url.searchParams.set('key', this.apiKey);
        url.searchParams.set('alt', 'sse');
        const config = THINKING_CONFIG.fields.google;
        const tagParser = new StreamingTagParser();

        const getCandidateText = (candidate) => {
            if (!candidate?.content?.parts) return null;
            return candidate.content.parts
                .map(part => part.text || '')
                .join('');
        };

        // Format messages - handle images with Gemini's format
        const contents = messages.map(m => {
            const parts = [];

            // Add text part
            if (m.content) {
                parts.push({ text: m.content });
            }

            // Add image parts if present
            if (m.images && m.images.length > 0) {
                for (const img of m.images) {
                    parts.push({
                        inline_data: {
                            mime_type: img.type || 'image/png',
                            data: img.base64
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: parts.length > 0 ? parts : [{ text: '' }]
            };
        });

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: contents
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.replace(/^data:\s*/, '');
                if (!payload || payload === '[DONE]') continue;

                try {
                    const data = JSON.parse(payload);
                    const candidate = data.candidates?.[0];

                    // Check for API-level thinking
                    const extracted = extractThinking(candidate, config);
                    const candidateText = getCandidateText(candidate);

                    if (extracted.thinking) {
                        onChunk(extracted.thinking, { isThinking: true });
                    }

                    const content = extracted.content || candidateText;
                    if (content) {
                        // Parse for tags
                        const results = tagParser.processChunk(content);
                        for (const result of results) {
                            onChunk(result.content, { isThinking: result.isThinking });
                        }
                    }

                    // Extract finish reason
                    const finishReason = candidate?.finishReason;
                    if (finishReason) {
                        onChunk('', { finishReason });
                    }
                } catch (e) {
                    console.error('Error parsing Gemini chunk', e);
                }
            }
        }

        // Process final buffer
        if (buffer.trim()) {
            try {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data:')) {
                    const payload = trimmed.replace(/^data:\s*/, '');
                    if (payload && payload !== '[DONE]') {
                        const data = JSON.parse(payload);
                        const candidate = data.candidates?.[0];
                        const extracted = extractThinking(candidate, config);
                        const candidateText = getCandidateText(candidate);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        const content = extracted.content || candidateText;
                        if (content) {
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing final Gemini chunk', e);
            }
        }
    }
}

// Ollama Client with tag support
export class OllamaClient extends BaseClient {
    constructor() {
        super(null);
    }

    async streamChat(messages, onChunk, modelId = 'llama2') {
        const tagParser = new StreamingTagParser();

        // Format messages - Ollama uses 'images' array for multimodal
        const formattedMessages = messages.map(m => {
            const msg = { role: m.role, content: m.content };

            // Ollama expects images as array of base64 strings
            if (m.images && m.images.length > 0) {
                msg.images = m.images.map(img => img.base64);
            }

            return msg;
        });

        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: formattedMessages,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error('Ollama API Error - is Ollama running?');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        const content = data.message?.content || '';

                        if (content) {
                            // Parse for thinking tags
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing Ollama chunk', e);
                    }
                }
            }
        }
    }
}

// LM Studio Client with tag support
export class LMStudioClient extends BaseClient {
    constructor() {
        super(null);
    }

    async streamChat(messages, onChunk, modelId) {
        const tagParser = new StreamingTagParser();

        // Format messages - LM Studio uses OpenAI-compatible format
        const formattedMessages = messages.map(m => {
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        const response = await fetch('http://localhost:1234/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId || 'local-model',
                messages: formattedMessages,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error('LM Studio API Error - is LM Studio running with a model loaded?');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content || '';

                        if (content) {
                            // Parse for thinking tags
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing LM Studio chunk', e);
                    }
                }
            }
        }
    }
}
