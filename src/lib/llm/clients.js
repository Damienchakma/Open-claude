// Simple factory to get the right client based on model/provider

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

export class OpenAIClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gpt-4o') {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenAI API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let thinkingContent = '';
        let isThinkingPhase = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));

                        // Check for thinking/reasoning content (o1 models may have this)
                        // Some extended thinking models return it in delta.reasoning or similar
                        const content = data.choices[0]?.delta?.content || '';
                        const reasoning = data.choices[0]?.delta?.reasoning || '';

                        // If we have reasoning content, it's thinking phase
                        if (reasoning) {
                            thinkingContent += reasoning;
                            onChunk(reasoning, { isThinking: true });
                        } else if (content) {
                            // Regular content
                            onChunk(content, { isThinking: false });
                        }

                        // Check for usage info that might contain thinking tokens
                        if (data.usage?.reasoning_tokens) {
                            onChunk('', { thinkingTokens: data.usage.reasoning_tokens });
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
    }
}

export class GroqClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'llama-3.3-70b-versatile') {
        if (!this.apiKey) throw new Error('Groq API Key missing');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
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
                        // Groq doesn't currently support thinking, but maintain consistency with metadata
                        if (content) onChunk(content, { isThinking: false });
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
    }
}

export class GeminiClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gemini-1.5-flash') {
        if (!this.apiKey) throw new Error('Gemini API Key missing');

        // Gemini uses a different format and endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${this.apiKey}`;

        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const response = await fetch(url, {
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

            // Gemini returns newline-delimited JSON objects
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        // Gemini thinking models may return thoughts in metadata, but not currently in stable API
                        if (text) onChunk(text, { isThinking: false });
                    } catch (e) {
                        console.error('Error parsing Gemini chunk', e);
                    }
                }
            }
        }

        // Process remaining buffer
        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer);
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) onChunk(text, { isThinking: false });
            } catch (e) {
                console.error('Error parsing final Gemini chunk', e);
            }
        }
    }
}

// Ollama Client (local)
export class OllamaClient extends BaseClient {
    constructor() {
        super(null); // No API key needed for local
    }

    async streamChat(messages, onChunk, modelId = 'llama2') {
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
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
                        if (content) onChunk(content, { isThinking: false });
                    } catch (e) {
                        console.error('Error parsing Ollama chunk', e);
                    }
                }
            }
        }
    }
}

// LM Studio Client (local, OpenAI-compatible)
export class LMStudioClient extends BaseClient {
    constructor() {
        super(null); // No API key needed for local
    }

    async streamChat(messages, onChunk, modelId) {
        const response = await fetch('http://localhost:1234/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId || 'local-model', // LM Studio uses the loaded model
                messages: messages.map(m => ({ role: m.role, content: m.content })),
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
                        if (content) onChunk(content, { isThinking: false });
                    } catch (e) {
                        console.error('Error parsing LM Studio chunk', e);
                    }
                }
            }
        }
    }
}

