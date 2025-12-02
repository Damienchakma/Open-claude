import React, { useState, useRef, useEffect } from 'react';
import { Settings, Plus, MessageSquare, Code, Send, Paperclip, Bot, Globe, Cpu, ChevronDown, Trash2 } from 'lucide-react';
import { ChatProvider, useChat } from './context/ChatContext';
import { SettingsModal } from './components/SettingsModal';
import { ChatMessage } from './components/ChatMessage';
import { ArtifactPanel } from './components/ArtifactPanel';
import { ThinkingDisplay } from './components/ThinkingDisplay';
import { LLMFactory } from './lib/llm/clients';
import { TavilyClient } from './lib/tavily';

function ChatApp() {
    const {
        messages,
        addMessage,
        isLoading,
        setIsLoading,
        apiKeys,
        selectedProvider,
        selectedModel,
        updateModel,
        availableModels,
        clearChat,
        artifacts,
        addArtifact,
        currentArtifactId,
        setCurrentArtifactId,
        getArtifact,
        // Chat history
        chats,
        currentChatId,
        createNewChat,
        switchToChat,
        deleteChat
    } = useChat();
    const [input, setInput] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isArtifactOpen, setIsArtifactOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'artifacts'
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [streamingThinking, setStreamingThinking] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const messagesEndRef = useRef(null);
    const thinkingStartTime = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage]);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setInput('');
        addMessage('user', userMessage);
        setIsLoading(true);
        thinkingStartTime.current = Date.now();

        try {
            let context = "";

            // Perform search if enabled
            if (isSearchEnabled && apiKeys.tavily) {
                try {
                    const tavily = new TavilyClient(apiKeys.tavily);
                    const searchResults = await tavily.search(userMessage);
                    context = `\n\nWeb Search Results:\n${JSON.stringify(searchResults.results.map(r => ({ title: r.title, content: r.content, url: r.url })))}`;
                } catch (e) {
                    console.error("Search failed", e);
                }
            }

            // Check if provider and model are selected
            if (!selectedProvider || !selectedModel) {
                addMessage('assistant', "Please select a provider and model in Settings to start chatting.");
                setIsLoading(false);
                return;
            }

            // Check if API key is required and provided
            if (['openai', 'groq', 'gemini'].includes(selectedProvider) && !apiKeys[selectedProvider]) {
                addMessage('assistant', `Please set your ${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key in Settings.`);
                setIsLoading(false);
                return;
            }

            const client = LLMFactory.getClient(selectedProvider, apiKeys[selectedProvider]);

            const messagesWithContext = [...messages];
            if (context) {
                messagesWithContext.push({
                    role: 'user',
                    content: userMessage + "\n\nContext from Web Search:" + context
                });
            } else {
                messagesWithContext.push({ role: 'user', content: userMessage });
            }

            // Start streaming
            setIsStreaming(true);
            setStreamingMessage('');
            setStreamingThinking('');
            let fullResponse = "";
            let fullThinking = "";
            let thinkingTokens = null;

            await client.streamChat(messagesWithContext, (chunk, metadata) => {
                if (metadata?.isThinking) {
                    // This is thinking content
                    fullThinking += chunk;
                    setStreamingThinking(fullThinking);
                } else {
                    // This is regular response content
                    fullResponse += chunk;
                    setStreamingMessage(fullResponse);
                }

                // Capture thinking tokens if provided
                if (metadata?.thinkingTokens) {
                    thinkingTokens = metadata.thinkingTokens;
                }
            }, selectedModel);

            // Calculate duration
            const duration = thinkingStartTime.current ? Date.now() - thinkingStartTime.current : null;

            // Finish streaming
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');

            // Check for artifacts (HTML, React, SVG)
            const htmlMatch = fullResponse.match(/```html\n([\s\S]*?)```/);
            const jsxMatch = fullResponse.match(/```(jsx|react)\n([\s\S]*?)```/);
            const svgMatch = fullResponse.match(/```svg\n([\s\S]*?)```/);

            let artifactData = null;

            if (htmlMatch) {
                artifactData = {
                    type: 'html',
                    language: 'html',
                    content: htmlMatch[1],
                    title: 'HTML Preview'
                };
            } else if (jsxMatch) {
                artifactData = {
                    type: 'react',
                    language: 'jsx',
                    content: jsxMatch[2],
                    title: 'React Component'
                };
            } else if (svgMatch) {
                artifactData = {
                    type: 'svg',
                    language: 'svg',
                    content: svgMatch[1],
                    title: 'SVG Graphics'
                };
            }

            // Prepare message metadata with thinking content if available
            const messageMetadata = {};
            if (fullThinking) {
                messageMetadata.thinking = fullThinking;
                messageMetadata.thinkingTokens = thinkingTokens || fullThinking.length;
                messageMetadata.duration = duration;
            }

            if (artifactData) {
                const newId = addArtifact(artifactData);
                setIsArtifactOpen(true);

                // Replace the code block with a placeholder
                const placeholder = `\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}\n\n`;
                const cleanResponse = fullResponse.replace(/```(html|jsx|react|svg)\n[\s\S]*?```/, placeholder);

                addMessage('assistant', cleanResponse, messageMetadata);
            } else {
                addMessage('assistant', fullResponse, messageMetadata);
            }

        } catch (error) {
            console.error(error);
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');
            addMessage('assistant', `Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleNewChat = () => {
        createNewChat();
    };

    const currentModelName = availableModels[selectedProvider]?.find(m => m.id === selectedModel)?.name || 'Select model';

    return (
        <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Sidebar */}
            <aside className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col hidden md:flex">
                <div className="p-4 flex items-center justify-between border-b border-[var(--border)]">
                    <div className="flex items-center gap-2.5">
                        <img src="/claude-logo.svg" alt="Claude" className="w-7 h-7" />
                        <h1 className="text-lg font-medium text-[var(--text-primary)]">Open Claude</h1>
                    </div>
                    <button
                        onClick={handleNewChat}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                        title="New Chat"
                    >
                        <Plus size={18} className="text-[var(--text-secondary)]" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    <div className="text-xs font-medium text-[var(--text-tertiary)] px-2 mb-2">Recents</div>

                    {/* Chat History */}
                    <div className="space-y-1">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                className={`group flex items-center gap-2 p-2.5 rounded-md cursor-pointer text-sm transition-colors ${chat.id === currentChatId
                                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <div
                                    className="flex-1 flex items-center gap-2.5 min-w-0"
                                    onClick={() => switchToChat(chat.id)}
                                >
                                    <MessageSquare size={16} className="shrink-0" />
                                    <span className="truncate">{chat.title}</span>
                                </div>
                                {chats.length > 1 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteChat(chat.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-tertiary)] rounded transition-opacity"
                                        title="Delete chat"
                                    >
                                        <Trash2 size={14} className="text-[var(--text-tertiary)]" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                        <div
                            onClick={() => setActiveTab('artifacts')}
                            className={`p-2.5 rounded-md cursor-pointer text-sm transition-colors ${activeTab === 'artifacts'
                                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                                : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <Code size={16} />
                                <span className="truncate">Artifacts</span>
                            </div>
                        </div>

                        {activeTab === 'artifacts' && (
                            <div className="mt-3 space-y-1">
                                {artifacts.map(art => (
                                    <div
                                        key={art.id}
                                        onClick={() => {
                                            setCurrentArtifactId(art.id);
                                            setIsArtifactOpen(true);
                                        }}
                                        className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                                    >
                                        <div className="font-medium text-xs truncate">{art.title}</div>
                                        <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 flex justify-between">
                                            <span>{art.language}</span>
                                            <span>{new Date(art.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {artifacts.length === 0 && (
                                    <div className="text-xs text-[var(--text-tertiary)] text-center py-6">
                                        No artifacts yet
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-3 border-t border-[var(--border)]">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2.5 p-2 hover:bg-[var(--bg-hover)] rounded-md cursor-pointer w-full transition-colors group"
                    >
                        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center text-white text-sm font-medium">U</div>
                        <div className="flex-1 text-sm text-left text-[var(--text-secondary)]">Settings</div>
                        <Settings size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col relative min-w-0">
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 md:py-8 flex flex-col gap-4 max-w-3xl mx-auto w-full">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                            <div className="w-14 h-14 bg-[var(--bg-secondary)] rounded-2xl flex items-center justify-center">
                                <img src="/claude-logo.svg" alt="Claude" className="w-9 h-9" />
                            </div>
                            <h2 className="text-2xl font-normal text-[var(--text-primary)]">How can I help you today?</h2>
                            <p className="text-[var(--text-secondary)] max-w-md text-sm">I'm Open Claude, an AI assistant. I can help with writing, analysis, coding, and more.</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <ChatMessage key={idx} message={msg} />
                        ))
                    )}
                    {isStreaming && (streamingMessage || streamingThinking) && (
                        <div className="flex gap-3 md:gap-4 py-6 px-4 bg-[var(--bg-secondary)] rounded-lg">
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center shrink-0">
                                <img src="/claude-logo.svg" alt="Claude" className="w-full h-full" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="font-medium text-sm mb-1.5 text-[var(--text-primary)]">Open Claude</div>

                                {/* Show thinking display if streaming or has thinking content */}
                                {(streamingThinking || isStreaming) && (
                                    <ThinkingDisplay
                                        thinking={streamingThinking || null}
                                        isStreaming={!streamingThinking && isStreaming}
                                    />
                                )}

                                {streamingMessage && (
                                    <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                                        {streamingMessage}
                                        <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-1 animate-pulse-subtle"></span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {isLoading && !isStreaming && (
                        <div className="flex gap-3 md:gap-4 py-6 px-4 bg-[var(--bg-secondary)] rounded-lg">
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center shrink-0">
                                <img src="/claude-logo.svg" alt="Claude" className="w-full h-full opacity-60 animate-pulse-subtle" />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-sm text-[var(--text-secondary)]">Thinking</div>
                                <div className="flex gap-1">
                                    <div className="w-1 h-1 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-1 h-1 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-1 h-1 bg-[var(--text-tertiary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-3 md:p-4 focus-within:border-[var(--accent)] transition-colors">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Reply to Open Claude..."
                            className="w-full bg-transparent border-none outline-none resize-none min-h-[56px] max-h-[200px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed"
                        />
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-[var(--border-light)]">
                            <div className="flex gap-1 items-center relative">
                                <button className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors">
                                    <Paperclip size={18} />
                                </button>

                                {/* Model Selector */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                                        className="flex items-center gap-1.5 px-2.5 py-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors text-sm max-w-[140px]"
                                        title="Select Model"
                                    >
                                        <Cpu size={16} className="shrink-0" />
                                        <span className="truncate text-xs">{currentModelName}</span>
                                        <ChevronDown size={14} className="shrink-0" />
                                    </button>

                                    {showModelDropdown && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setShowModelDropdown(false)}
                                            />
                                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg max-h-80 overflow-y-auto z-20">
                                                {Object.entries(availableModels).map(([provider, models]) => {
                                                    if (!models || models.length === 0) return null;
                                                    return (
                                                        <div key={provider} className="border-b border-[var(--border)] last:border-0">
                                                            <div className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide bg-[var(--bg-secondary)]">
                                                                {provider}
                                                            </div>
                                                            {models.map(model => (
                                                                <button
                                                                    key={model.id}
                                                                    onClick={() => {
                                                                        updateModel(model.id);
                                                                        setShowModelDropdown(false);
                                                                    }}
                                                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)] transition-colors ${model.id === selectedModel ? 'bg-[var(--accent)]/5 text-[var(--accent)]' : 'text-[var(--text-primary)]'
                                                                        }`}
                                                                >
                                                                    <div className="font-medium">{model.name}</div>
                                                                    {model.contextWindow && (
                                                                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                                                            {(model.contextWindow / 1000).toFixed(0)}K context
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                    className={`p-2 rounded-md transition-colors ${isSearchEnabled
                                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                        }`}
                                    title="Toggle Web Search"
                                >
                                    <Globe size={18} />
                                </button>
                            </div>
                            <button
                                onClick={handleSendMessage}
                                disabled={isLoading || !input.trim()}
                                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                <Send size={16} />
                                Send
                            </button>
                        </div>
                    </div>
                    <div className="text-center text-xs text-[var(--text-tertiary)] mt-3">
                        Open Claude can make mistakes. Please double-check responses.
                    </div>
                </div>
            </main>

            {/* Artifact Panel */}
            <ArtifactPanel
                isOpen={isArtifactOpen}
                onClose={() => setIsArtifactOpen(false)}
                artifact={getArtifact(currentArtifactId)}
            />

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
}

export default function App() {
    return (
        <ChatProvider>
            <ChatApp />
        </ChatProvider>
    )
}
