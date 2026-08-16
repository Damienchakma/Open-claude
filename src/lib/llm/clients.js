// LLM Client Factory with Universal Industry-Standard Reasoning Detection
// Supports API-level reasoning_content/reasoning/thinking/thought AND live tag streaming (<think>, <thinking>)

const THINKING_FIELDS = [
    'reasoning_content',
    'reasoning',
    'thinking',
    'thought',
    'thought_process',
    'chain_of_thought',
    'internal_monologue',
    'thinking_blocks',
    'reasoning_blocks'
];

/**
 * Universal reasoning extraction function - checks payload for any known reasoning field
 */
function extractThinking(apiResponse) {
    if (!apiResponse) return { thinking: null, content: null };

    if (typeof apiResponse === 'string') {
        return { thinking: null, content: apiResponse };
    }

    let thinking = null;
    let content = null;

    // Check delta or message or candidate content or top-level payload
    const target = apiResponse.delta || apiResponse.message || (apiResponse.content && typeof apiResponse.content === 'object' ? apiResponse.content : null) || apiResponse;

    // 1. Check all known reasoning fields
    for (const field of THINKING_FIELDS) {
        if (target[field] && typeof target[field] === 'string') {
            thinking = target[field];
            break;
        }
    }

    // 2. Check Gemini candidate parts format: { text: "...", thought: true }
    const parts = target.parts || apiResponse.content?.parts || apiResponse.parts;
    if (Array.isArray(parts)) {
        for (const part of parts) {
            if (part.thought || part.type === 'thinking' || part.type === 'reasoning') {
                thinking = (thinking || '') + (part.text || (typeof part.thought === 'string' ? part.thought : ''));
            } else if (part.text) {
                content = (content || '') + part.text;
            }
        }
    }

    // 3. Check Anthropic content_block format
    if (!thinking && target.type && (target.type === 'thinking' || target.type === 'reasoning')) {
        thinking = target.thinking || target.text || target.content;
    }

    // Determine normal content
    if (!content) {
        if (typeof target.content === 'string') {
            content = target.content;
        } else if (typeof target.text === 'string') {
            content = target.text;
        } else if (typeof apiResponse.text === 'string') {
            content = apiResponse.text;
        }
    }

    return { thinking, content };
}

/**
 * Extract reasoning tokens from usage metadata
 */
function extractThinkingTokens(apiResponse) {
    if (!apiResponse?.usage && !apiResponse?.usageMetadata) return null;
    const usage = apiResponse.usage || apiResponse.usageMetadata;
    return usage.reasoning_tokens ||
        usage.completion_tokens_details?.reasoning_tokens ||
        usage.thinking_tokens ||
        usage.candidatesTokenCount ||
        null;
}

/**
 * StreamingTagParser - Live token-by-token stream parser for <think>, <thinking>, [THINKING], etc.
 * Handles split tags across SSE chunks without buffering lag.
 */
class StreamingTagParser {
    constructor() {
        this.reset();
    }

    reset() {
        this.inThinking = false;
        this.buffer = '';
        this.currentTag = null;
    }

    processChunk(text) {
        if (!text) return [];

        this.buffer += text;
        const results = [];

        const TAGS = [
            { open: '<think>', close: '</think>' },
            { open: '<thinking>', close: '</thinking>' },
            { open: '[THINKING]', close: '[/THINKING]' },
            { open: '[REASONING]', close: '[/REASONING]' }
        ];

        let loop = true;
        while (loop && this.buffer.length > 0) {
            loop = false;

            if (!this.inThinking) {
                // Find earliest opening tag in buffer
                let earliestIndex = -1;
                let matchedTag = null;

                for (const tag of TAGS) {
                    const idx = this.buffer.indexOf(tag.open);
                    if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
                        earliestIndex = idx;
                        matchedTag = tag;
                    }
                }

                if (earliestIndex !== -1) {
                    if (earliestIndex > 0) {
                        results.push({ isThinking: false, content: this.buffer.slice(0, earliestIndex) });
                    }
                    this.inThinking = true;
                    this.currentTag = matchedTag;
                    this.buffer = this.buffer.slice(earliestIndex + matchedTag.open.length);
                    loop = true;
                } else {
                    // Check if buffer ends with a partial prefix of any open tag
                    let partialLength = 0;
                    for (const tag of TAGS) {
                        for (let len = 1; len < tag.open.length; len++) {
                            const prefix = tag.open.slice(0, len);
                            if (this.buffer.endsWith(prefix)) {
                                partialLength = Math.max(partialLength, len);
                            }
                        }
                    }

                    if (partialLength > 0) {
                        const safeText = this.buffer.slice(0, this.buffer.length - partialLength);
                        if (safeText) {
                            results.push({ isThinking: false, content: safeText });
                        }
                        this.buffer = this.buffer.slice(this.buffer.length - partialLength);
                    } else {
                        results.push({ isThinking: false, content: this.buffer });
                        this.buffer = '';
                    }
                }
            } else {
                // In thinking mode - search for closing tag
                const closeTag = this.currentTag.close;
                const closeIdx = this.buffer.indexOf(closeTag);

                if (closeIdx !== -1) {
                    if (closeIdx > 0) {
                        results.push({ isThinking: true, content: this.buffer.slice(0, closeIdx) });
                    }
                    this.inThinking = false;
                    this.buffer = this.buffer.slice(closeIdx + closeTag.length);
                    this.currentTag = null;
                    loop = true;
                } else {
                    // Check if buffer contains a clear double-newline transition to an answer (unclosed <think> tag safety)
                    const answerTransitionMatch = this.buffer.match(/\n\n(?=Based on|Here|The|According to|In summary|To |## |# |\d+\.\s|\*|Sure|Certainly|Note:)/i);
                    if (answerTransitionMatch && answerTransitionMatch.index > 30) {
                        const thinkPart = this.buffer.slice(0, answerTransitionMatch.index);
                        results.push({ isThinking: true, content: thinkPart });
                        this.inThinking = false;
                        this.currentTag = null;
                        this.buffer = this.buffer.slice(answerTransitionMatch.index);
                        loop = true;
                    } else {
                        // Check if buffer ends with a partial prefix of closing tag
                        let partialLength = 0;
                        for (let len = 1; len < closeTag.length; len++) {
                            const prefix = closeTag.slice(0, len);
                            if (this.buffer.endsWith(prefix)) {
                                partialLength = Math.max(partialLength, len);
                            }
                        }

                        if (partialLength > 0) {
                            const safeThinking = this.buffer.slice(0, this.buffer.length - partialLength);
                            if (safeThinking) {
                                results.push({ isThinking: true, content: safeThinking });
                            }
                            this.buffer = this.buffer.slice(this.buffer.length - partialLength);
                        } else {
                            results.push({ isThinking: true, content: this.buffer });
                            this.buffer = '';
                        }
                    }
                }
            }
        }

        return results;
    }

    flush() {
        const results = [];
        if (this.buffer) {
            if (this.inThinking) {
                // Check if buffer in unclosed thinking contains a double-newline transition to main answer
                const splitIdx = this.buffer.search(/\n\n(?=[A-Z0-9#\*])/i);
                if (splitIdx > 30) {
                    results.push({ isThinking: true, content: this.buffer.slice(0, splitIdx).trim() });
                    results.push({ isThinking: false, content: this.buffer.slice(splitIdx).trim() });
                } else {
                    results.push({ isThinking: true, content: this.buffer });
                }
            } else {
                results.push({ isThinking: false, content: this.buffer });
            }
            this.buffer = '';
        }
        return results;
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

    async streamChat(messages, onChunk, modelId, options = {}) {
        throw new Error('Not implemented');
    }
}

// OpenAI Client with comprehensive detection
export class OpenAIClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gpt-4o', options = {}) {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');

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
            }),
            signal: options.signal
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

                        // LAYER 1: Check API-level reasoning fields (reasoning_content, reasoning, thinking, etc.)
                        const extracted = extractThinking(data.choices?.[0]);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            // LAYER 2: Parse content for live embedded tags (<think>, <thinking>)
                            const tagResults = tagParser.processChunk(extracted.content);
                            for (const result of tagResults) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract thinking tokens
                        const tokens = extractThinkingTokens(data);
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

        // Flush any remaining tag parser buffer
        const flushed = tagParser.flush();
        for (const result of flushed) {
            onChunk(result.content, { isThinking: result.isThinking });
        }
    }
}

// Groq Client with universal detection, robust multimodal support, and DeepSeek reasoning
export class GroqClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'llama-3.3-70b-versatile', options = {}) {
        if (!this.apiKey) throw new Error('Groq API Key missing. Please add your Groq API key in Settings.');

        const tagParser = new StreamingTagParser();
        const cleanModelId = (modelId || 'llama-3.3-70b-versatile').trim();

        // Format messages - handle multimodal images, system messages, and empty content edge cases
        const formattedMessages = messages.map(m => {
            // Case 1: Already an array of content parts (from ChatMode)
            if (Array.isArray(m.content)) {
                const filteredParts = m.content.filter(part => {
                    if (part.type === 'text') return Boolean(part.text && part.text.trim());
                    if (part.type === 'image_url') return Boolean(part.image_url?.url);
                    return true;
                });

                // If text part was empty but image exists, add default text
                if (filteredParts.length > 0 && !filteredParts.some(p => p.type === 'text')) {
                    filteredParts.unshift({ type: 'text', text: "What's in this image?" });
                }

                return {
                    role: m.role,
                    content: filteredParts.length > 0 ? filteredParts : '...'
                };
            }

            // Case 2: Message with attached images in metadata
            if (m.images && Array.isArray(m.images) && m.images.length > 0) {
                const contentParts = [];
                const textContent = (m.content || '').trim();

                contentParts.push({
                    type: 'text',
                    text: textContent || "What's in this image?"
                });

                for (const img of m.images) {
                    let url = null;
                    if (img.dataUrl) {
                        url = img.dataUrl;
                    } else if (img.base64) {
                        url = `data:${img.type || 'image/png'};base64,${img.base64}`;
                    } else if (typeof img === 'string' && img.startsWith('data:')) {
                        url = img;
                    }

                    if (url) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url }
                        });
                    }
                }

                return { role: m.role, content: contentParts };
            }

            // Case 3: Standard text message
            const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
            return {
                role: m.role,
                content: text.trim() || (m.role === 'assistant' ? '...' : '')
            };
        });

        // Filter out completely empty messages (which cause Groq 400 errors)
        const validMessages = formattedMessages.filter(m => {
            if (!m.content) return false;
            if (typeof m.content === 'string' && !m.content.trim()) return false;
            if (Array.isArray(m.content) && m.content.length === 0) return false;
            return true;
        });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey.trim()}`
            },
            body: JSON.stringify({
                model: cleanModelId,
                messages: validMessages,
                stream: true
            }),
            signal: options.signal
        });

        if (!response.ok) {
            let errorDetails = 'Groq API Error';
            try {
                const err = await response.json();
                errorDetails = err.error?.message || err.message || JSON.stringify(err);
            } catch {
                errorDetails = `Groq API Error (${response.status}: ${response.statusText})`;
            }
            throw new Error(errorDetails);
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
                        const choice = data.choices?.[0];
                        const delta = choice?.delta;

                        // LAYER 1: DeepSeek/Groq reasoning stream (reasoning or reasoning_content)
                        if (delta?.reasoning || delta?.reasoning_content) {
                            const reasonText = delta.reasoning || delta.reasoning_content;
                            onChunk(reasonText, { isThinking: true });
                        } else {
                            const extracted = extractThinking(choice);
                            if (extracted.thinking) {
                                onChunk(extracted.thinking, { isThinking: true });
                            }
                        }

                        // LAYER 2: Text content & live embedded <think> tag parsing
                        if (delta?.content) {
                            const tagResults = tagParser.processChunk(delta.content);
                            for (const result of tagResults) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract finish reason & usage
                        const finishReason = choice?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }

                        const tokens = extractThinkingTokens(data);
                        if (tokens) {
                            onChunk('', { thinkingTokens: tokens });
                        }
                    } catch (e) {
                        console.error('Error parsing Groq chunk', e);
                    }
                }
            }
        }

        const flushed = tagParser.flush();
        for (const result of flushed) {
            onChunk(result.content, { isThinking: result.isThinking });
        }
    }
}

// Gemini Client with universal detection
export class GeminiClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gemini-1.5-flash', options = {}) {
        if (!this.apiKey) throw new Error('Gemini API Key missing');

        // Sanitize modelId - strip 'models/' prefix if present
        let cleanModelId = (modelId || 'gemini-1.5-flash').trim().replace(/^models\//, '');
        if (!cleanModelId) cleanModelId = 'gemini-1.5-flash';

        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelId}:streamGenerateContent`);
        url.searchParams.set('key', this.apiKey);
        url.searchParams.set('alt', 'sse');
        const tagParser = new StreamingTagParser();

        let systemInstructionText = '';
        const rawTurns = [];

        for (const m of messages) {
            if (m.role === 'system') {
                const sys = typeof m.content === 'string'
                    ? m.content
                    : Array.isArray(m.content)
                        ? m.content.map(p => p?.text || '').join('\n')
                        : '';
                if (sys.trim()) {
                    systemInstructionText += (systemInstructionText ? '\n\n' : '') + sys.trim();
                }
                continue;
            }

            const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
            const parts = [];

            // 1. Handle content (string or array)
            if (typeof m.content === 'string') {
                if (m.content.trim()) {
                    parts.push({ text: m.content });
                }
            } else if (Array.isArray(m.content)) {
                for (const part of m.content) {
                    if (typeof part === 'string') {
                        if (part.trim()) parts.push({ text: part });
                    } else if (part && typeof part === 'object') {
                        if (part.type === 'text' && part.text) {
                            parts.push({ text: part.text });
                        } else if (part.type === 'image_url' && part.image_url?.url) {
                            const dataUrl = part.image_url.url;
                            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                            if (match) {
                                parts.push({
                                    inline_data: {
                                        mime_type: match[1],
                                        data: match[2]
                                    }
                                });
                            }
                        }
                    }
                }
            }

            // 2. Handle images attached directly on message
            if (m.images && Array.isArray(m.images)) {
                for (const img of m.images) {
                    let mimeType = img.type || 'image/png';
                    let base64Data = img.base64 || '';
                    if (img.dataUrl) {
                        const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                        if (match) {
                            mimeType = match[1];
                            base64Data = match[2];
                        }
                    } else if (typeof img === 'string' && img.startsWith('data:')) {
                        const match = img.match(/^data:([^;]+);base64,(.+)$/);
                        if (match) {
                            mimeType = match[1];
                            base64Data = match[2];
                        }
                    }
                    if (base64Data) {
                        parts.push({
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        });
                    }
                }
            }

            if (parts.length > 0) {
                rawTurns.push({ role, parts });
            }
        }

        // Gemini API strict turn rules:
        // 1. Must alternate between 'user' and 'model'
        // 2. First turn MUST be 'user'
        const contents = [];
        for (const turn of rawTurns) {
            if (contents.length === 0) {
                if (turn.role === 'model') {
                    // Prepend a dummy user turn if conversation started with assistant
                    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
                }
                contents.push(turn);
            } else {
                const lastTurn = contents[contents.length - 1];
                if (lastTurn.role === turn.role) {
                    // Merge consecutive turns of the same role
                    lastTurn.parts.push(...turn.parts);
                } else {
                    contents.push(turn);
                }
            }
        }

        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
        }

        const requestBody = {
            contents
        };

        if (systemInstructionText) {
            requestBody.system_instruction = {
                parts: [{ text: systemInstructionText }]
            };
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: options.signal
        });

        if (!response.ok) {
            let errMsg = 'Gemini API Error';
            try {
                const err = await response.json();
                errMsg = err.error?.message || (Array.isArray(err) && err[0]?.error?.message) || JSON.stringify(err);
            } catch {
                errMsg = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errMsg);
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

                    if (candidate) {
                        const extracted = extractThinking(candidate);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            const results = tagParser.processChunk(extracted.content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        const finishReason = candidate.finishReason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    }

                    // Extract thinking/usage tokens if present
                    const tokens = extractThinkingTokens(data);
                    if (tokens) {
                        onChunk('', { thinkingTokens: tokens });
                    }
                } catch (e) {
                    console.error('Error parsing Gemini chunk', e);
                }
            }
        }

        if (buffer.trim()) {
            try {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data:')) {
                    const payload = trimmed.replace(/^data:\s*/, '');
                    if (payload && payload !== '[DONE]') {
                        const data = JSON.parse(payload);
                        const candidate = data.candidates?.[0];

                        if (candidate) {
                            const extracted = extractThinking(candidate);

                            if (extracted.thinking) {
                                onChunk(extracted.thinking, { isThinking: true });
                            }

                            if (extracted.content) {
                                const results = tagParser.processChunk(extracted.content);
                                for (const result of results) {
                                    onChunk(result.content, { isThinking: result.isThinking });
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing final Gemini chunk', e);
            }
        }

        const flushed = tagParser.flush();
        for (const result of flushed) {
            onChunk(result.content, { isThinking: result.isThinking });
        }
    }
}

// Ollama Client with tag support
export class OllamaClient extends BaseClient {
    constructor() {
        super(null);
    }

    async streamChat(messages, onChunk, modelId = 'llama2', options = {}) {
        const tagParser = new StreamingTagParser();

        const formattedMessages = messages.map(m => {
            const msg = { role: m.role, content: m.content };

            if (m.images && m.images.length > 0) {
                msg.images = m.images.map(img => {
                    // Ollama expects raw base64 strings (no data URL prefix)
                    if (img.base64) return img.base64;
                    if (img.dataUrl) {
                        const match = img.dataUrl.match(/^data:[^;]+;base64,(.+)$/);
                        return match ? match[1] : img.dataUrl;
                    }
                    if (typeof img === 'string' && img.startsWith('data:')) {
                        const match = img.match(/^data:[^;]+;base64,(.+)$/);
                        return match ? match[1] : img;
                    }
                    return typeof img === 'string' ? img : '';
                }).filter(Boolean);
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
            }),
            signal: options.signal
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
                        const extracted = extractThinking(data);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            const results = tagParser.processChunk(extracted.content);
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

        const flushed = tagParser.flush();
        for (const result of flushed) {
            onChunk(result.content, { isThinking: result.isThinking });
        }
    }
}

// LM Studio Client with tag support
export class LMStudioClient extends BaseClient {
    constructor() {
        super(null);
    }

    async streamChat(messages, onChunk, modelId, options = {}) {
        const tagParser = new StreamingTagParser();

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
            }),
            signal: options.signal
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
                        const extracted = extractThinking(data.choices?.[0]);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            const results = tagParser.processChunk(extracted.content);
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

        const flushed = tagParser.flush();
        for (const result of flushed) {
            onChunk(result.content, { isThinking: result.isThinking });
        }
    }
}
