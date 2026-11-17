// Every provider here was checked for browser CORS support; local runners need their own CORS setting enabled.
export const PROVIDERS = [
    { id: 'anthropic', name: 'Anthropic (Claude)', key: true, defaultModel: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'openai', name: 'OpenAI', key: true, defaultModel: 'gpt-6-astra', keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'gemini', name: 'Google Gemini', key: true, defaultModel: 'gemini-4-hydrogen', keyUrl: 'https://aistudio.google.com/app/apikey' },
    { id: 'groq', name: 'Groq', key: true, baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys' },
    { id: 'openrouter', name: 'OpenRouter', key: true, baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys' },
    { id: 'mistral', name: 'Mistral AI', key: true, baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-4', keyUrl: 'https://console.mistral.ai/api-keys' },
    { id: 'deepseek', name: 'DeepSeek', key: true, baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'xai', name: 'xAI (Grok)', key: true, baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4.7', keyUrl: 'https://console.x.ai' },
    { id: 'together', name: 'Together AI', key: true, baseUrl: 'https://api.together.xyz/v1', defaultModel: 'moonshotai/Kimi-K3.1-Pro', keyUrl: 'https://api.together.ai/settings/api-keys' },
    { id: 'cerebras', name: 'Cerebras', key: true, baseUrl: 'https://api.cerebras.ai/v1', defaultModel: 'gpt-oss-120b', keyUrl: 'https://cloud.cerebras.ai' },
    { id: 'fireworks', name: 'Fireworks AI', key: true, baseUrl: 'https://api.fireworks.ai/inference/v1', defaultModel: 'accounts/fireworks/models/deepseek-v4p1-flash-1017', keyUrl: 'https://fireworks.ai/account/api-keys' },
    { id: 'custom', name: 'Custom (OpenAI-compatible)', key: false, optionalKey: true, defaultModel: '' },
    { id: 'ollama', name: 'Ollama (local)', key: false, defaultModel: 'qwen3' },
    { id: 'lmstudio', name: 'LM Studio (local)', key: false, defaultModel: 'local-model' }
];

export const providerInfo = id => PROVIDERS.find(provider => provider.id === id);
export const providerName = id => providerInfo(id)?.name || id;
export const keyProviders = PROVIDERS.filter(provider => provider.key || provider.optionalKey).map(provider => provider.id);
export const compatibleProviders = PROVIDERS.filter(provider => provider.baseUrl && provider.id !== 'groq').map(provider => provider.id);
