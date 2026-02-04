import React, { useState, useRef, useEffect } from 'react';
import { Settings, Plus, MessageSquare, Code, Send, Paperclip, Bot, Globe, Cpu, ChevronDown, Trash2, ArrowUp, ArrowDown, Clock, Sparkles, Download, X, Eye } from 'lucide-react';
import { ChatProvider, useChat } from '../context/ChatContext';
import { SettingsModal } from './SettingsModal';
import { ChatMessage } from './ChatMessage';
import { ArtifactPanel } from './ArtifactPanel';
import { ThinkingDisplay } from './ThinkingDisplay';
import { ImageUpload } from './ImageUpload';
import { LLMFactory } from '../lib/llm/clients';
import { IntelligentSearchTool } from '../lib/IntelligentSearchTool';
import { SearchProgress } from './SearchProgress';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

// Helper function for time-based greeting
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function ChatMode() {
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
        deleteChat,
        // Artifact panel state
        isArtifactOpen,
        setIsArtifactOpen,
        // Model capabilities
        supportsImages,
        // User settings
        userName
    } = useChat();
    const [input, setInput] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'artifacts'
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchSteps, setSearchSteps] = useState([]);
    const [currentSearchQuery, setCurrentSearchQuery] = useState('');
    const [searchSources, setSearchSources] = useState([]);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [streamingThinking, setStreamingThinking] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(260); // Default width
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isResizing, setIsResizing] = useState(false);
    const messagesEndRef = useRef(null);
    const thinkingStartTime = useRef(null);
    const sidebarRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage]);

    const createImagePayload = (dataUrl) => {
        if (!dataUrl) return null;
        const [meta, base64] = dataUrl.split(',');
        const typeMatch = meta?.match(/data:(.*?);base64/);
        return {
            dataUrl,
            base64: base64 || '',
            type: typeMatch ? typeMatch[1] : 'image/png'
        };
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        const imageToSend = selectedImage;
        setInput('');
        setSelectedImage(null); // Clear image after sending
        const imagePayload = createImagePayload(imageToSend);
        const images = imagePayload && supportsImages ? [imagePayload] : [];
        addMessage('user', userMessage, {}, null, images);
        setIsLoading(true);
        thinkingStartTime.current = Date.now();

        try {
            let context = "";
            let searchResults = null;

            // Check for Deep Research intent at a higher scope
            const isDeepResearch = userMessage.toLowerCase().startsWith('deep research:') ||
                userMessage.toLowerCase().includes('write a research paper');

            // Perform intelligent search if enabled and Tavily key exists
            if (isSearchEnabled && apiKeys.tavily) {
                try {
                    setIsSearching(true);
                    setSearchSteps([]);
                    setSearchSources([]);

                    const searchTool = new IntelligentSearchTool(
                        apiKeys.tavily,
                        selectedProvider,
                        apiKeys[selectedProvider]
                    );

                    // Check if we should search
                    const decision = isDeepResearch
                        ? { shouldSearch: true, reason: 'Deep Research requested' }
                        : searchTool.shouldPerformWebSearch(userMessage);

                    console.log('🤔 Search decision:', decision);

                    if (decision.shouldSearch) {
                        if (isDeepResearch) {
                            const query = userMessage.replace(/^deep research:/i, '').trim();
                            searchResults = await searchTool.deepResearch(query, (p) => {
                                if (p.status === 'decomposing') setCurrentSearchQuery('Decomposing query...');
                                else if (p.status === 'searching') {
                                    setCurrentSearchQuery(`Researching: ${p.query}`);
                                    setSearchSteps(prev => [...prev, { query: p.query, status: 'searching', reason: `Step ${p.currentStep}/${p.totalSteps}` }]);
                                }
                                else if (p.status === 'synthesizing') {
                                    setCurrentSearchQuery('Synthesizing paper...');
                                    setSearchSteps(prev => [...prev, { query: 'Synthesis', reason: 'Drafting paper' }]);
                                }
                            });
                            context = searchResults.content;
                            if (searchResults.sources) setSearchSources(searchResults.sources);

                            // AUTO-ARTIFACT for Deep Research: Skip the secondary LLM call if we have a full paper
                            if (context && context.includes('## Abstract')) {
                                const artifactData = {
                                    type: 'research_paper',
                                    language: 'markdown',
                                    content: context,
                                    title: 'Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)
                                };

                                const newId = addArtifact(artifactData);
                                setIsArtifactOpen(true);

                                const messageMetadata = {
                                    searchSources: searchResults.sources,
                                    searchQuery: userMessage
                                };

                                const finalResponse = `I have completed the deep research. You can view and download the formal research paper in the artifact panel.\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                                addMessage('assistant', finalResponse, messageMetadata);
                                setIsLoading(false);
                                return;
                            }
                        } else {
                            // Perform intelligent multi-search with progress callback
                            searchResults = await searchTool.intelligentMultiSearch(
                                userMessage,
                                3, // max searches
                                (progress) => {
                                    // Update search progress UI
                                    console.log('📍 Search progress:', progress);
                                    setCurrentSearchQuery(progress.query || '');

                                    if (progress.status === 'complete') {
                                        setSearchSteps(prev => [...prev, {
                                            query: progress.query,
                                            sourcesFound: progress.sourcesFound || 0,
                                            reason: progress.reason
                                        }]);
                                    }
                                }
                            );

                            // Enhance sources with logos asynchronously - verify result used in metadata
                            if (searchResults && searchResults.sources) {
                                // Create promise and attach to local scope to use later
                                const logoPromise = searchTool.enhanceSourcesWithLogos(searchResults.sources)
                                    .then(enhanced => {
                                        setSearchSources(enhanced);
                                        return enhanced;
                                    });

                                // Attach to searchResults for easy access later if needed, though we will use the promise result
                                searchResults.logoPromise = logoPromise;

                                // Build context for LLM
                                context = searchTool.buildSearchContext(searchResults);

                                // Add instruction for citing sources
                                context += '\n\nIMPORTANT: When using information from the search results above, cite sources using [1], [2], etc. inline with your response.';
                            }
                        }
                    }
                } catch (e) {
                    console.error("Search failed:", e);
                } finally {
                    setIsSearching(false);
                    setCurrentSearchQuery('');
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

            // Build system prompt with user's name if available
            const systemPrompt = userName
                ? `You are a helpful AI assistant. The user's name is ${userName}. Address them by name when appropriate.`
                : 'You are a helpful AI assistant.';

            const messagesWithContext = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];

            const userContent = userMessage + (context ? "\n\nContext from Web Search:" + context : '');

            messagesWithContext.push({
                role: 'user',
                content: userContent,
                images
            });

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

            // Extract thinking content from <think> or <thinking> tags in the response
            let extractedThinking = '';
            const thinkTagMatch = fullResponse.match(/<think>([\s\S]*?)<\/think>/i);
            const thinkingTagMatch = fullResponse.match(/<thinking>([\s\S]*?)<\/thinking>/i);

            if (thinkTagMatch) {
                extractedThinking = thinkTagMatch[1].trim();
            } else if (thinkingTagMatch) {
                extractedThinking = thinkingTagMatch[1].trim();
            }

            // Combine stream-based thinking with tag-based thinking
            const combinedThinking = fullThinking || extractedThinking;

            // Clean the response - remove thinking tags (we'll show them in ThinkingDisplay)
            let cleanedResponse = fullResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .trim();

            // Check for artifacts (HTML, React, SVG)
            const htmlMatch = cleanedResponse.match(/```html\n([\s\S]*?)```/);
            const jsxMatch = cleanedResponse.match(/```(jsx|react)\n([\s\S]*?)```/);
            const svgMatch = cleanedResponse.match(/```svg\n([\s\S]*?)```/);

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
            } else if (isDeepResearch) {
                // Deep Research - treat the entire output as a research paper artifact
                artifactData = {
                    type: 'research_paper',
                    language: 'markdown',
                    content: cleanedResponse,
                    title: 'Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)
                };
            }

            // Prepare message metadata with thinking content if available
            const messageMetadata = {};
            if (combinedThinking) {
                messageMetadata.thinking = combinedThinking;
                messageMetadata.thinkingTokens = thinkingTokens || combinedThinking.length;
                messageMetadata.duration = duration;
            }

            // Add search sources to metadata - WAIT for logo enhancement if needed
            if (searchResults && searchResults.sources && searchResults.sources.length > 0) {
                let finalSources = searchResults.sources;

                // If we have a pending logo promise, wait for it
                if (searchResults.logoPromise) {
                    try {
                        finalSources = await searchResults.logoPromise;
                    } catch (e) {
                        console.warn("Logo enhancement failed, using raw sources", e);
                    }
                }

                messageMetadata.searchSources = finalSources;
                messageMetadata.searchQuery = searchResults.optimizedQuery || userMessage;
            }

            if (artifactData) {
                const newId = addArtifact(artifactData);
                setIsArtifactOpen(true);

                // Replace the code block with a placeholder, OR for research paper, use a custom message
                let finalResponse;

                if (artifactData.type === 'research_paper') {
                    finalResponse = `I have completed the deep research. You can view and download the formal research paper in the artifact panel.\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                } else {
                    const placeholder = `\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}\n\n`;
                    finalResponse = cleanedResponse.replace(/```(html|jsx|react|svg)\n[\s\S]*?```/, placeholder);
                }

                addMessage('assistant', finalResponse, messageMetadata);
            } else {
                addMessage('assistant', cleanedResponse, messageMetadata);
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

    // Sidebar resize handlers
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            // Limit width between 200px and 400px
            const newWidth = Math.min(Math.max(200, e.clientX), 400);
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div className="flex h-full w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Sidebar */}
            <aside
                ref={sidebarRef}
                className={`bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col hidden md:flex relative transition-all duration-300 ease-in-out ${isSidebarOpen ? '' : '-ml-[100%] w-0 border-none overflow-hidden'}`}
                style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px', minWidth: isSidebarOpen ? '200px' : '0px', maxWidth: '400px' }}
            >
                {/* Spacing to clear the top area since redundant branding was removed */}
                <div className="h-4" />

                {/* New Chat Button - Prominent (No Plus Icon as requested) */}
                <div className="px-4 pb-6 mt-2">
                    <button
                        onClick={handleNewChat}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm hover:shadow-md hover:border-[var(--accent)] rounded-lg transition-all text-[var(--text-primary)] group"
                    >
                        <span className="text-sm font-medium">New chat</span>
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
                        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {userName ? userName.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="flex-1 text-sm text-left">
                            <div className="text-[var(--text-primary)] font-medium">{userName || 'User'}</div>

                        </div>
                        <Settings size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>

                {/* Resize handle */}
                {isSidebarOpen && (
                    <div
                        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-[var(--accent)] transition-colors z-20"
                        onMouseDown={handleMouseDown}
                    />
                )}
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col relative min-w-0 transition-all duration-300">
                {/* Mobile/Toggle Header */}
                <div className="md:hidden p-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-primary)]">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-[var(--bg-hover)] rounded-md">
                        <MessageSquare size={20} />
                    </button>
                    <span className="font-medium">Open Claude</span>
                    <button onClick={handleNewChat} className="p-2 hover:bg-[var(--bg-hover)] rounded-md">
                        <Plus size={20} />
                    </button>
                </div>

                {/* Desktop Toggle Button (when sidebar closed or overlapping) */}
                <div className="absolute top-4 left-4 z-20 hidden md:block">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`p-2 rounded-lg transition-colors ${!isSidebarOpen ? 'bg-[var(--bg-secondary)] border border-[var(--border)] shadow-sm' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] opacity-0 hover:opacity-100'}`}
                        title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                    >
                        {/* Use a simple menu icon or sidebar icon */}
                        <div className="flex flex-col gap-1 w-4">
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                        </div>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 md:py-8 flex flex-col gap-4 max-w-3xl mx-auto w-full">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                            <h2 className="text-3xl md:text-4xl font-light text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Tiempos Text', serif" }}>
                                <span className="text-[var(--accent)] mr-2">🌸</span>
                                {getGreeting()}{userName ? `, ${userName}` : ''}
                            </h2>
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

                                {/* Show thinking display ONLY if there is actual thinking content */}
                                {streamingThinking && streamingThinking.trim() !== '' && (
                                    <ThinkingDisplay
                                        thinking={streamingThinking}
                                        isStreaming={true}
                                    />
                                )}

                                {streamingMessage && (
                                    <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeRaw]}
                                            components={{
                                                code({ node, inline, className, children, ...props }) {
                                                    const match = /language-(\w+)/.exec(className || '');
                                                    const codeString = String(children).replace(/\n$/, '');

                                                    return !inline && match ? (
                                                        <div className="relative group my-3">
                                                            <div className="flex items-center justify-between bg-[var(--bg-tertiary)] px-3 py-2 rounded-t-md border-b border-[var(--border)]">
                                                                <span className="text-xs font-mono text-[var(--text-secondary)]">
                                                                    {match[1]}
                                                                </span>
                                                            </div>
                                                            <SyntaxHighlighter
                                                                style={vscDarkPlus}
                                                                language={match[1]}
                                                                PreTag="div"
                                                                customStyle={{
                                                                    margin: 0,
                                                                    borderRadius: '0 0 0.375rem 0.375rem',
                                                                    fontSize: '0.875rem',
                                                                    background: 'var(--bg-tertiary)'
                                                                }}
                                                                {...props}
                                                            >
                                                                {codeString}
                                                            </SyntaxHighlighter>
                                                        </div>
                                                    ) : (
                                                        <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-sm font-mono border border-[var(--border-light)]" {...props}>
                                                            {children}
                                                        </code>
                                                    );
                                                },
                                                p({ children }) {
                                                    return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
                                                },
                                                ul({ children }) {
                                                    return <ul className="list-disc pl-6 mb-3 space-y-1.5">{children}</ul>;
                                                },
                                                ol({ children }) {
                                                    return <ol className="list-decimal pl-6 mb-3 space-y-1.5">{children}</ol>;
                                                },
                                                li({ children }) {
                                                    return <li className="leading-7">{children}</li>;
                                                },
                                                h1({ children }) {
                                                    return <h1 className="text-2xl font-semibold mb-3 mt-4">{children}</h1>;
                                                },
                                                h2({ children }) {
                                                    return <h2 className="text-xl font-semibold mb-2.5 mt-4">{children}</h2>;
                                                },
                                                h3({ children }) {
                                                    return <h3 className="text-lg font-semibold mb-2 mt-3">{children}</h3>;
                                                },
                                                blockquote({ children }) {
                                                    return (
                                                        <blockquote className="border-l-3 border-[var(--accent)] pl-4 my-3 text-[var(--text-secondary)]">
                                                            {children}
                                                        </blockquote>
                                                    );
                                                },
                                                a({ children, href }) {
                                                    return (
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[var(--accent)] hover:underline"
                                                        >
                                                            {children}
                                                        </a>
                                                    );
                                                },
                                                table({ children }) {
                                                    return (
                                                        <div className="overflow-x-auto my-4">
                                                            <table className="min-w-full border border-[var(--border)] rounded-lg">
                                                                {children}
                                                            </table>
                                                        </div>
                                                    );
                                                },
                                                th({ children }) {
                                                    return (
                                                        <th className="border border-[var(--border)] px-4 py-2 bg-[var(--bg-tertiary)] text-left font-semibold">
                                                            {children}
                                                        </th>
                                                    );
                                                },
                                                td({ children }) {
                                                    return (
                                                        <td className="border border-[var(--border)] px-4 py-2">
                                                            {children}
                                                        </td>
                                                    );
                                                }
                                            }}
                                        >
                                            {streamingMessage}
                                        </ReactMarkdown>
                                        <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-1 animate-pulse-subtle"></span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {isLoading && !isStreaming && (
                        <div className="flex gap-3 md:gap-4 py-6 px-4 bg-[var(--bg-secondary)] rounded-lg animate-fade-in">
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center shrink-0 relative">
                                <img src="/claude-logo.svg" alt="Claude" className="w-full h-full" />
                                {/* Pulsing glow effect */}
                                <div className="absolute inset-0 rounded-lg bg-[var(--accent)]/20 animate-ping-slow" />
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-sm mb-2 text-[var(--text-primary)]">Open Claude</div>

                                {/* Show SearchProgress when searching */}
                                {isSearching && (
                                    <SearchProgress
                                        isSearching={isSearching}
                                        searchSteps={searchSteps}
                                        totalSources={searchSources.length}
                                        currentQuery={currentSearchQuery}
                                    />
                                )}

                                {/* Show Thinking Bubble when not searching or after search completes */}
                                {!isSearching && (
                                    <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-pink-500/20 border border-purple-200/50 dark:border-purple-700/30">
                                        {/* Animated Brain Icon */}
                                        <div className="relative">
                                            <svg
                                                className="w-5 h-5 text-purple-500 dark:text-purple-400 animate-pulse"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                            >
                                                <path d="M12 4.5c-3.5 0-6 2.5-6 5.5 0 2 1 3.5 2.5 4.5v2a1.5 1.5 0 001.5 1.5h4a1.5 1.5 0 001.5-1.5v-2c1.5-1 2.5-2.5 2.5-4.5 0-3-2.5-5.5-6-5.5z" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M9 18.5v1a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-1" strokeLinecap="round" />
                                                <path d="M10 10h.01M14 10h.01M12 10v3" strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute -top-1 -right-1">
                                                <div className="w-2 h-2 text-yellow-400 animate-spin-slow">✨</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                                                Thinking
                                            </span>
                                            <div className="flex gap-1 items-center">
                                                <span className="w-1.5 h-1.5 bg-purple-500 dark:bg-purple-400 rounded-full animate-thinking-dot-1" />
                                                <span className="w-1.5 h-1.5 bg-purple-500 dark:bg-purple-400 rounded-full animate-thinking-dot-2" />
                                                <span className="w-1.5 h-1.5 bg-purple-500 dark:bg-purple-400 rounded-full animate-thinking-dot-3" />
                                            </div>
                                        </div>

                                        <ThinkingTimer startTime={thinkingStartTime.current} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area - Claude style */}
                <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-3 md:p-4 focus-within:border-[var(--text-tertiary)] transition-colors">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="How can I help you today?"
                            className="w-full bg-transparent border-none outline-none resize-none min-h-[40px] max-h-[200px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed text-base"
                        />
                        <div className="flex justify-between items-center mt-3">
                            {/* Left side toolbar */}
                            <div className="flex gap-0.5 items-center">
                                <button
                                    className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                                    title="Add attachments"
                                >
                                    <Plus size={20} />
                                </button>
                                <button
                                    className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                                    title="Navigate messages"
                                >
                                    <div className="flex flex-col -space-y-1">
                                        <ArrowUp size={12} />
                                        <ArrowDown size={12} />
                                    </div>
                                </button>
                                <button
                                    className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                                    title="Recent prompts"
                                >
                                    <Clock size={18} />
                                </button>
                                {supportsImages && (
                                    <ImageUpload
                                        onImageSelect={(base64) => setSelectedImage(base64)}
                                        onImageRemove={() => setSelectedImage(null)}
                                        disabled={isLoading}
                                    />
                                )}
                            </div>

                            {/* Right side - Model selector and Send */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                    className={`p-2 rounded-lg transition-colors ${isSearchEnabled
                                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                        }`}
                                    title="Toggle Web Search"
                                >
                                    <Globe size={18} />
                                </button>
                                <button
                                    onClick={() => {
                                        if (!input.toLowerCase().startsWith('deep research:')) {
                                            setInput(prev => `Deep Research: ${prev}`);
                                        }
                                        if (!isSearchEnabled) setIsSearchEnabled(true);
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${input.toLowerCase().startsWith('deep research:')
                                        ? 'bg-purple-500/10 text-purple-500'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                        }`}
                                    title="Deep Research Mode"
                                >
                                    <Sparkles size={18} />
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-sm"
                                        title="Select Model"
                                    >
                                        <span className="text-sm">{currentModelName}</span>
                                        <ChevronDown size={14} />
                                    </button>
                                    {showModelDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowModelDropdown(false)} />
                                            <div className="absolute bottom-full right-0 mb-2 w-64 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg max-h-80 overflow-y-auto z-20">
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
                                                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)] transition-colors ${model.id === selectedModel ? 'bg-[var(--accent)]/5 text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}
                                                                >
                                                                    <div className="font-medium flex items-center gap-2">
                                                                        {model.name}
                                                                        {model.capabilities?.image && <span className="text-xs" title="Supports images">📷</span>}
                                                                    </div>
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
                                    onClick={handleSendMessage}
                                    disabled={isLoading || !input.trim()}
                                    className="w-8 h-8 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <ArrowUp size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <ArtifactPanel
                isOpen={isArtifactOpen}
                onClose={() => setIsArtifactOpen(false)}
                artifact={getArtifact(currentArtifactId)}
            />

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
}

function ThinkingTimer({ startTime }) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!startTime) return;
        const interval = setInterval(() => setElapsed(Date.now() - startTime), 100);
        return () => clearInterval(interval);
    }, [startTime]);
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const tenths = Math.floor((ms % 1000) / 100);
        return `${seconds}.${tenths}s`;
    };
    return <span className="text-xs text-purple-500/70 dark:text-purple-400/60 font-mono tabular-nums">{formatTime(elapsed)}</span>;
}

export default ChatMode;
