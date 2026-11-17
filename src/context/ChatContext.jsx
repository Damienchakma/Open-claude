import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ModelService, getModelCapabilities } from '../lib/llm/ModelService';
import { PROVIDERS, providerInfo, keyProviders } from '../lib/llm/providers';
import { validChatImport } from '../lib/chat-ui';

const makeChat = (initial = {}) => ({
    id: crypto.randomUUID(), title: 'New chat', artifacts: [], createdAt: Date.now(),
    ...initial,
    messages: (initial.messages || []).map(message => ({ ...message, id: crypto.randomUUID(), timestamp: Date.now() }))
});

const modelService = new ModelService();
const ChatContext = createContext();

export function ChatProvider({ children }) {
    const historyNeedsRecovery = useRef(false);
    const [chats, setChats] = useState(() => {
        try {
            const raw = localStorage.getItem('chat_history');
            if (!raw) return [makeChat()];
            const saved = JSON.parse(raw);
            if (validChatImport(saved)) return saved.map(chat => ({ ...chat, artifacts: chat.artifacts || [] }));
            historyNeedsRecovery.current = true;
        } catch { historyNeedsRecovery.current = true; }
        return [makeChat()];
    });
    const [currentChatId, setCurrentChatId] = useState(() => {
        const saved = localStorage.getItem('current_chat_id');
        return chats.some(chat => chat.id === saved) ? saved : chats[0].id;
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isIncognitoMode, setIsIncognitoMode] = useState(false);
    const [privateChat, setPrivateChat] = useState(() => makeChat());
    const [persistenceError, setPersistenceError] = useState('');
    const currentChat = isIncognitoMode ? privateChat : chats.find(chat => chat.id === currentChatId) || chats[0];
    const messages = currentChat.messages;
    const artifacts = currentChat.artifacts;
    const updateCurrentChat = useCallback(update => {
        if (isIncognitoMode) setPrivateChat(update);
        else setChats(previous => previous.map(chat => chat.id === currentChatId ? update(chat) : chat));
    }, [currentChatId, isIncognitoMode]);
    const setArtifacts = useCallback(update => updateCurrentChat(chat => ({
        ...chat, artifacts: typeof update === 'function' ? update(chat.artifacts) : update
    })), [updateCurrentChat]);
    const toggleIncognitoMode = useCallback(() => {
        if (!isIncognitoMode) setPrivateChat(makeChat());
        setIsIncognitoMode(previous => !previous);
    }, [isIncognitoMode]);

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

    useEffect(() => {
        if (historyNeedsRecovery.current) { setPersistenceError('Saved history could not be read and has not been overwritten. Import a valid backup or explicitly delete saved chats in Data controls to resume saving.'); return; }
        try {
            localStorage.setItem('chat_history', JSON.stringify(chats));
            localStorage.setItem('current_chat_id', currentChatId);
            setPersistenceError('');
        } catch {
            setPersistenceError('Browser storage is full or unavailable. Export your chats before closing this page.');
        }
    }, [chats, currentChatId]);

    const createNewChat = useCallback((initial = {}) => {
        const newChat = makeChat(initial);
        if (isIncognitoMode) setPrivateChat(newChat);
        else {
            setChats(previous => [newChat, ...previous]);
            setCurrentChatId(newChat.id);
        }
        setCurrentArtifactId(null);
        setIsArtifactOpen(false);
    }, [isIncognitoMode]);
    const switchToChat = useCallback(chatId => {
        setIsIncognitoMode(false);
        setCurrentChatId(chatId);
        setCurrentArtifactId(null);
        setIsArtifactOpen(false);
    }, []);
    const deleteChat = useCallback(chatId => {
        if (isIncognitoMode && privateChat.id === chatId) { setPrivateChat(makeChat()); return; }
        const remaining = chats.filter(chat => chat.id !== chatId);
        const next = remaining.length ? remaining : [makeChat()];
        setChats(next);
        if (chatId === currentChatId) {
            setCurrentChatId(next[0].id);
            setCurrentArtifactId(null);
            setIsArtifactOpen(false);
        }
    }, [chats, currentChatId, isIncognitoMode, privateChat.id]);
    const renameChat = useCallback((chatId, title) => {
        const trimmed = title.trim().slice(0, 120);
        if (!trimmed) return;
        if (isIncognitoMode && privateChat.id === chatId) setPrivateChat(chat => ({ ...chat, title: trimmed }));
        else setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, title: trimmed } : chat));
    }, [isIncognitoMode, privateChat.id]);
    const importChats = useCallback(imported => {
        if (!validChatImport(imported)) throw new Error('Choose a valid Open Claude chat export.');
        historyNeedsRecovery.current = false;
        const restored = imported.map(chat => makeChat({ ...chat, id: crypto.randomUUID(), artifacts: chat.artifacts || [] }));
        setChats(previous => [...restored, ...previous]);
        setCurrentChatId(restored[0].id);
        setIsIncognitoMode(false);
    }, []);
    const deleteAllChats = useCallback(() => {
        historyNeedsRecovery.current = false;
        const fresh = makeChat();
        setChats([fresh]);
        setCurrentChatId(fresh.id);
        setIsArtifactOpen(false);
    }, []);

    // Provider and Model Selection
    const [selectedProvider, setSelectedProvider] = useState(
        localStorage.getItem('selected_provider') || 'groq'
    );
    const [selectedModel, setSelectedModel] = useState(
        localStorage.getItem('selected_model') || ''
    );

    // Available models from all providers
    const [availableModels, setAvailableModels] = useState(() => Object.fromEntries(PROVIDERS.map(provider => [provider.id, []])));

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
        const newArtifact = { ...artifact, id: crypto.randomUUID(), createdAt: Date.now() };
        setArtifacts(prev => [newArtifact, ...prev]);
        setCurrentArtifactId(newArtifact.id);
        setIsArtifactOpen(true);
        return newArtifact.id;
    }, [setArtifacts]);

    const updateArtifactContent = useCallback((id, content) => {
        setArtifacts(prev => prev.map(art =>
            art.id === id ? { ...art, content } : art
        ));
    }, [setArtifacts]);

    const getArtifact = useCallback((id) => {
        return artifacts.find(a => a.id === id);
    }, [artifacts]);

    // API Keys
    const [apiKeys, setApiKeys] = useState(() => Object.fromEntries([...keyProviders, 'tavily'].map(provider => [provider, localStorage.getItem(`${provider}_key`) || ''])));
    const [customBaseUrl, setCustomBaseUrlState] = useState(() => localStorage.getItem('custom_base_url') || '');
    const setCustomBaseUrl = url => { setCustomBaseUrlState(url); localStorage.setItem('custom_base_url', url); };

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
            const fallback = providerInfo(provider)?.defaultModel;
            if (fallback !== undefined) updateModel(fallback);
        }
    };

    const updateModel = (modelId) => {
        setSelectedModel(modelId);
        localStorage.setItem('selected_model', modelId);
    };

    const fetchModels = useCallback(async () => {
        setIsLoadingModels(true);
        try {
            const models = await modelService.getAllModels(apiKeys, { customBaseUrl });
            setAvailableModels(models);

            // Auto-select first available model if none selected
            if (!selectedModel) {
                for (const { id: provider } of PROVIDERS) {
                    if (models[provider] && models[provider].length > 0) {
                        const preferred = models[provider].find(model => model.id === providerInfo(provider)?.defaultModel) || models[provider][0];
                        setSelectedProvider(provider);
                        setSelectedModel(preferred.id);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching models:', error);
        } finally {
            setIsLoadingModels(false);
        }
    }, [apiKeys, selectedModel, customBaseUrl]);

    // Fetch models when API keys change
    const keySignature = keyProviders.map(provider => apiKeys[provider]).join('\n') + customBaseUrl;
    useEffect(() => {
        if (keySignature.trim()) {
            fetchModels();
        }
    }, [keySignature]);

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
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            metadata: safeMetadata, // Store full metadata object
            // Legacy fields for backward compatibility
            thinking: thinking || safeMetadata.thinking || null,
            thinkingTokens: safeMetadata.thinkingTokens || null,
            duration: safeMetadata.duration || null,
            // Image support
            images: images || []
        };
        updateCurrentChat(chat => ({
            ...chat,
            title: role === 'user' && chat.messages.length === 0 ? (content || 'Attachment').slice(0, 50) : chat.title,
            messages: [...chat.messages, newMessage], updatedAt: Date.now()
        }));
    }, [updateCurrentChat]);

    const clearChat = useCallback(() => {
        updateCurrentChat(chat => ({ ...chat, messages: [], artifacts: [] }));
        setCurrentArtifactId(null);
        setIsArtifactOpen(false);
    }, [updateCurrentChat]);

    const refreshModels = useCallback(() => {
        modelService.clearCache();
        fetchModels();
    }, [fetchModels]);

    return (
        <ChatContext.Provider value={{
            messages,
            addMessage,
            updateCurrentChat,
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
            customBaseUrl,
            setCustomBaseUrl,
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
            currentChatId: currentChat.id,
            currentChat,
            createNewChat,
            switchToChat,
            deleteChat,
            renameChat,
            importChats,
            deleteAllChats,
            persistenceError,
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
