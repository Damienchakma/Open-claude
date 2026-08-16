import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ModelService, getModelCapabilities } from '../lib/llm/ModelService';

const modelService = new ModelService();
const ChatContext = createContext();

export function ChatProvider({ children }) {
    // Chat History
    const [chats, setChats] = useState(() => {
        const saved = localStorage.getItem('chat_history');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return [{
                    id: Date.now().toString(),
                    title: 'New Chat',
                    messages: [],
                    artifacts: [],
                    createdAt: Date.now()
                }];
            }
        }
        return [{
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            artifacts: [],
            createdAt: Date.now()
        }];
    });

    const [currentChatId, setCurrentChatId] = useState(() => {
        const saved = localStorage.getItem('current_chat_id');
        return saved || chats[0]?.id;
    });

    // Current chat state
    const currentChat = chats.find(c => c.id === currentChatId) || chats[0];
    const [messages, setMessages] = useState(currentChat?.messages || []);
    const [artifacts, setArtifacts] = useState(currentChat?.artifacts || []);

    const [isLoading, setIsLoading] = useState(false);

    // Incognito Mode - chats won't be saved when enabled
    const [isIncognitoMode, setIsIncognitoMode] = useState(false);

    const toggleIncognitoMode = useCallback(() => {
        setIsIncognitoMode(prev => !prev);
    }, []);

    // User Name - persisted to localStorage
    const [userName, setUserNameState] = useState(() => {
        return localStorage.getItem('user_name') || '';
    });

    const setUserName = useCallback((name) => {
        setUserNameState(name);
        localStorage.setItem('user_name', name);
    }, []);

    // Custom System Prompt - persisted to localStorage
    const [customSystemPrompt, setCustomSystemPromptState] = useState(() => {
        return localStorage.getItem('custom_system_prompt') || '';
    });

    const setCustomSystemPrompt = useCallback((prompt) => {
        setCustomSystemPromptState(prompt);
        localStorage.setItem('custom_system_prompt', prompt);
    }, []);

    // Save chats to localStorage whenever they change (but not in incognito mode)
    useEffect(() => {
        if (!isIncognitoMode) {
            localStorage.setItem('chat_history', JSON.stringify(chats));
            localStorage.setItem('current_chat_id', currentChatId);
        }
    }, [chats, currentChatId, isIncognitoMode]);

    // Update current chat when messages or artifacts change
    useEffect(() => {
        // Only update chats if we have a current chat and either messages or artifacts have actually changed
        // from what's stored in the chats array.
        setChats(prev => {
            const chat = prev.find(c => c.id === currentChatId);
            if (!chat) return prev;

            // Check if anything actually changed to avoid infinite loops or unnecessary updates
            if (chat.messages === messages && chat.artifacts === artifacts) return prev;

            return prev.map(c =>
                c.id === currentChatId
                    ? { ...c, messages, artifacts, updatedAt: Date.now() }
                    : c
            );
        });
    }, [messages, artifacts]);

    // Load chat when switching
    useEffect(() => {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            setMessages(chat.messages || []);
            setArtifacts(chat.artifacts || []);
        }
    }, [currentChatId]);

    // Chat history functions
    const createNewChat = useCallback(() => {
        const newChat = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            artifacts: [],
            createdAt: Date.now()
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
    }, []);

    const switchToChat = useCallback((chatId) => {
        setCurrentChatId(chatId);
    }, []);

    const deleteChat = useCallback((chatId) => {
        setChats(prev => {
            const filtered = prev.filter(c => c.id !== chatId);
            // If deleting current chat, switch to first remaining chat
            if (chatId === currentChatId && filtered.length > 0) {
                setCurrentChatId(filtered[0].id);
            }
            return filtered.length > 0 ? filtered : [{
                id: Date.now().toString(),
                title: 'New Chat',
                messages: [],
                artifacts: [],
                createdAt: Date.now()
            }];
        });
    }, [currentChatId]);

    // Provider and Model Selection
    const [selectedProvider, setSelectedProvider] = useState(
        localStorage.getItem('selected_provider') || 'groq'
    );
    const [selectedModel, setSelectedModel] = useState(
        localStorage.getItem('selected_model') || ''
    );

    // Available models from all providers
    const [availableModels, setAvailableModels] = useState({
        groq: [],
        ollama: [],
        lmstudio: [],
        openai: [],
        gemini: []
    });

    // Current model capabilities
    const [currentModelCapabilities, setCurrentModelCapabilities] = useState({
        text: true,
        image: false,
        audio: false,
        video: false
    });

    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Artifacts
    const [currentArtifactId, setCurrentArtifactId] = useState(null);
    const [isArtifactOpen, setIsArtifactOpen] = useState(false);

    const addArtifact = useCallback((artifact) => {
        const newArtifact = { ...artifact, id: Date.now().toString(), createdAt: Date.now() };
        setArtifacts(prev => [newArtifact, ...prev]);
        setCurrentArtifactId(newArtifact.id);
        setIsArtifactOpen(true);
        return newArtifact.id;
    }, []);

    const updateArtifactContent = useCallback((id, content) => {
        setArtifacts(prev => prev.map(art =>
            art.id === id ? { ...art, content } : art
        ));
    }, []);

    const getArtifact = useCallback((id) => {
        return artifacts.find(a => a.id === id);
    }, [artifacts]);

    // API Keys
    const [apiKeys, setApiKeys] = useState({
        openai: localStorage.getItem('openai_key') || '',
        groq: localStorage.getItem('groq_key') || '',
        gemini: localStorage.getItem('gemini_key') || '',
        tavily: localStorage.getItem('tavily_key') || '',
    });

    const updateApiKey = (provider, key) => {
        setApiKeys(prev => ({ ...prev, [provider]: key }));
        localStorage.setItem(`${provider}_key`, key);
    };

    const updateProvider = (provider) => {
        setSelectedProvider(provider);
        localStorage.setItem('selected_provider', provider);
        // Auto-select first model if current selection is from different provider
        const modelsForProvider = availableModels[provider];
        if (modelsForProvider && modelsForProvider.length > 0) {
            if (!selectedModel || !modelsForProvider.find(m => m.id === selectedModel)) {
                updateModel(modelsForProvider[0].id);
            }
        } else {
            const defaults = {
                gemini: 'gemini-1.5-flash',
                groq: 'llama-3.3-70b-versatile',
                openai: 'gpt-4o',
                ollama: 'llama3',
                lmstudio: 'local-model'
            };
            if (defaults[provider]) {
                updateModel(defaults[provider]);
            }
        }
    };

    const updateModel = (modelId) => {
        setSelectedModel(modelId);
        localStorage.setItem('selected_model', modelId);
    };

    const fetchModels = useCallback(async () => {
        setIsLoadingModels(true);
        try {
            const models = await modelService.getAllModels(apiKeys);
            setAvailableModels(models);

            // Auto-select first available model if none selected
            if (!selectedModel) {
                for (const provider of ['groq', 'openai', 'gemini', 'ollama', 'lmstudio']) {
                    if (models[provider] && models[provider].length > 0) {
                        setSelectedProvider(provider);
                        setSelectedModel(models[provider][0].id);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching models:', error);
        } finally {
            setIsLoadingModels(false);
        }
    }, [apiKeys, selectedModel]);

    // Fetch models when API keys change
    useEffect(() => {
        if (apiKeys.groq || apiKeys.openai || apiKeys.gemini) {
            fetchModels();
        }
    }, [apiKeys.groq, apiKeys.openai, apiKeys.gemini]);

    // Update capabilities dynamically when model or provider changes
    useEffect(() => {
        if (selectedModel) {
            const providerModels = availableModels[selectedProvider] || [];
            const foundModel = providerModels.find(m => m.id === selectedModel);
            const capabilities = foundModel?.capabilities || getModelCapabilities(selectedModel, selectedProvider);
            setCurrentModelCapabilities(capabilities);
        }
    }, [selectedModel, selectedProvider, availableModels]);

    const addMessage = useCallback((role, content, metadata = {}, thinking = null, images = []) => {
        const safeMetadata = metadata || {};
        const newMessage = {
            role,
            content,
            id: Date.now().toString(),
            timestamp: Date.now(),
            metadata: safeMetadata, // Store full metadata object
            // Legacy fields for backward compatibility
            thinking: thinking || safeMetadata.thinking || null,
            thinkingTokens: safeMetadata.thinkingTokens || null,
            duration: safeMetadata.duration || null,
            // Image support
            images: images || []
        };
        setMessages(prev => {
            const updated = [...prev, newMessage];

            // Update chat title from first user message
            if (role === 'user' && prev.length === 0) {
                const titleContent = content || (images.length > 0 ? '[Image]' : '');
                const title = titleContent.length > 50 ? titleContent.substring(0, 50) + '...' : titleContent || 'New Chat';
                setChats(prevChats => prevChats.map(chat =>
                    chat.id === currentChatId ? { ...chat, title } : chat
                ));
            }

            return updated;
        });
    }, [currentChatId]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setArtifacts([]);
        setCurrentArtifactId(null);
    }, []);

    const refreshModels = useCallback(() => {
        modelService.clearCache();
        fetchModels();
    }, [fetchModels]);

    return (
        <ChatContext.Provider value={{
            messages,
            addMessage,
            isLoading,
            setIsLoading,
            selectedProvider,
            selectedModel,
            updateProvider,
            updateModel,
            availableModels,
            isLoadingModels,
            fetchModels,
            refreshModels,
            apiKeys,
            updateApiKey,
            clearChat,
            artifacts,
            addArtifact,
            updateArtifactContent,
            getArtifact,
            currentArtifactId,
            setCurrentArtifactId,
            isArtifactOpen,
            setIsArtifactOpen,
            // Chat history
            chats,
            currentChatId,
            createNewChat,
            switchToChat,
            deleteChat,
            // Incognito mode
            isIncognitoMode,
            toggleIncognitoMode,
            // User settings
            userName,
            setUserName,
            customSystemPrompt,
            setCustomSystemPrompt,
            // Model capabilities
            currentModelCapabilities,
            supportsImages: currentModelCapabilities.image,
            supportsAudio: currentModelCapabilities.audio,
            supportsVideo: currentModelCapabilities.video
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
