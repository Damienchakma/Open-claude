import React, { useState, useRef, useEffect } from 'react';
import { Settings, Plus, MessageSquare, Code, Send, Paperclip, Bot, Globe, Cpu, ChevronDown, Trash2, ArrowUp, ArrowDown, Clock, Sparkles, Download, X, Eye, Square, LayoutTemplate } from 'lucide-react';
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

// Claude-like creative, contextual greeting generator
function getGreeting(userName) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday

    const isWeekend = day === 0 || day === 6;
    const isFriday = day === 5;
    const isMonday = day === 1;

    let timeGreetings = [];

    if (hour >= 4 && hour < 8) {
        timeGreetings = [
            "Good early morning",
            "Rise and shine",
            "Starting fresh today",
            "A quiet morning to create",
            "Ready for a fresh start"
        ];
    } else if (hour >= 8 && hour < 12) {
        timeGreetings = [
            "Good morning",
            "Ready to explore today?",
            "What shall we build this morning?",
            "Hope your morning is off to a great start",
            "Wishing you a focused morning"
        ];
    } else if (hour >= 12 && hour < 17) {
        timeGreetings = [
            "Good afternoon",
            "Hope your day is flowing well",
            "How can I assist you this afternoon?",
            "What are you working on today?",
            "Let's make this afternoon productive"
        ];
    } else if (hour >= 17 && hour < 22) {
        timeGreetings = [
            "Good evening",
            "Winding down, or just getting started?",
            "Hope you had a fruitful day",
            "Good evening — let's create something",
            "How can I help you this evening?"
        ];
    } else {
        // Late Night (22 - 4)
        timeGreetings = [
            "Burning the midnight oil?",
            "Late night inspiration?",
            "Good evening",
            "Working under the stars tonight?",
            "Deep focus hours"
        ];
    }

    const specialGreetings = [];
    if (isFriday && hour >= 14) {
        specialGreetings.push("Happy Friday afternoon", "Heading into the weekend?");
    } else if (isWeekend) {
        specialGreetings.push("Happy weekend", "Hope you're having a relaxing weekend", "Enjoying your weekend?");
    } else if (isMonday && hour < 13) {
        specialGreetings.push("Happy Monday", "Starting the week strong");
    }

    const pool = specialGreetings.length > 0 && Math.random() > 0.4 ? specialGreetings : timeGreetings;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    return userName ? `${chosen}, ${userName}` : chosen;
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
        userName,
        customSystemPrompt
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

    // Artifacts toggle — persisted to localStorage
    const [isArtifactsEnabled, setIsArtifactsEnabled] = useState(() => {
        return localStorage.getItem('artifacts_enabled') !== 'false'; // default ON
    });

    // Stable, contextual greeting per chat/session
    const greeting = React.useMemo(() => getGreeting(userName), [userName, currentChatId]);
    const toggleArtifacts = () => {
        setIsArtifactsEnabled(prev => {
            const next = !prev;
            localStorage.setItem('artifacts_enabled', String(next));
            return next;
        });
    };
    const messagesEndRef = useRef(null);
    const thinkingStartTime = useRef(null);
    const sidebarRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Stop any active generation (abort fetch stream + reset UI state)
    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingThinking('');
        setIsLoading(false);
        setIsSearching(false);
        setSearchSteps([]);
        setSearchSources([]);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage]);

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setSelectedImage(reader.result);
                    };
                    reader.readAsDataURL(file);
                    e.preventDefault();
                    break;
                }
            }
        }
    };

    const handleSendMessage = async () => {
        if ((!input.trim() && !selectedImage) || isLoading) return;

        const userMessage = input.trim() || (selectedImage ? "What's in this image?" : "");
        const imageToSend = selectedImage;
        setInput('');
        setSelectedImage(null); // Clear image after sending
        
        const imagesList = imageToSend ? [{ dataUrl: imageToSend }] : [];
        addMessage('user', userMessage, {}, null, imagesList);
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
                        : searchTool.shouldPerformWebSearch(userMessage, messages);

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
                                setCurrentArtifactId(newId);
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

            // Detect model family — open-source models ignore XML tags and do better
            // with explicit, example-driven instructions using plain code fences.
            const modelId = (selectedModel || '').toLowerCase();
            const isOpenSourceModel =
                modelId.includes('qwen') ||
                modelId.includes('llama') ||
                modelId.includes('mistral') ||
                modelId.includes('mixtral') ||
                modelId.includes('deepseek') ||
                modelId.includes('gemma') ||
                modelId.includes('phi') ||
                modelId.includes('falcon') ||
                modelId.includes('vicuna') ||
                modelId.includes('wizard') ||
                modelId.includes('dolphin') ||
                modelId.includes('openchat') ||
                modelId.includes('nous') ||
                modelId.includes('solar') ||
                modelId.includes('yi-') ||
                modelId.includes('command-r') ||
                selectedProvider === 'ollama' ||
                selectedProvider === 'lmstudio';

            const systemPrompt = isOpenSourceModel
                ? `You are Open Claude, a helpful AI assistant with a live interactive code preview system. The user's name is ${userName || 'User'}.

## CRITICAL OUTPUT RULE
Whenever you write ANY code that is a game, app, UI, animation, chart, tool, or interactive component — you MUST output it as a SINGLE fenced code block with the language on the SAME LINE as the backticks, like this:

\`\`\`html
<!DOCTYPE html>...full code here...
\`\`\`

## LANGUAGE TO USE
- Games, apps, simulations, canvas, DOM-based code → \`\`\`html (self-contained HTML page with all CSS+JS inline)
- Data charts, React UI components → \`\`\`jsx (function App() { ... } — NO import statements)
- Vector graphics → \`\`\`svg

## ABSOLUTE RULES — NEVER BREAK THESE
1. Language tag MUST be on the same line as the opening backticks: \`\`\`html NOT \`\`\` then html on next line
2. Output exactly ONE code block. Never split code across multiple blocks.
3. The code block must be COMPLETE and runnable. No placeholders, no "// add logic here", no TODOs.
4. For HTML: inline ALL styles and scripts. No external file references.
5. For JSX: never write import statements. Do not use export default. Just write: function App() { ... }
6. Write 1 sentence describing what you built BEFORE the code block. Nothing after it.

## EXAMPLE — correct format for a game request:
Here's a Flappy Bird game:
\`\`\`html
<!DOCTYPE html><html>...complete self-contained game...</html>
\`\`\``
                : `You are Open Claude, an advanced AI assistant with live interactive Artifact capabilities. The user's name is ${userName || 'User'}.

## When to create an artifact
Create an artifact for: self-contained code (>15 lines), interactive React components, HTML pages/games/apps, SVG graphics, or research papers the user will preview or download.

## Artifact format
Wrap code in antArtifact XML tags:
<antArtifact identifier="unique-id-slug" type="application/vnd.ant.react" title="Descriptive Title">
...complete self-contained code...
</antArtifact>

## Supported types
- application/vnd.ant.react — JSX component with Tailwind CSS, Lucide icons, Recharts. Must be: function App() { ... } with NO import statements.
- text/html — Fully self-contained HTML/CSS/JS page. All assets inline.
- image/svg+xml — Valid SVG.
- text/markdown — Markdown document or research paper.`;

            // Inject real-time local date, time, timezone, and custom system prompt
            const now = new Date();
            const formattedDate = new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                timeZoneName: 'short'
            }).format(now);
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

            const timeAndDateContext = `\n\n## CURRENT USER DATE, TIME & TIMEZONE\n- Current Local Date & Time: ${formattedDate}\n- User Timezone: ${userTimezone}\n- Year: ${now.getFullYear()}\n- Note: Always use this real-world time reference for queries about "today", "now", "latest news", "current events", or recent developments.`;

            const userCustomSection = customSystemPrompt && customSystemPrompt.trim()
                ? `\n\n## USER CUSTOM INSTRUCTIONS\n${customSystemPrompt.trim()}`
                : '';

            const finalSystemPrompt = systemPrompt + timeAndDateContext + userCustomSection;

            const messagesWithContext = [
                { role: 'system', content: finalSystemPrompt },
                ...messages
            ];

            // Build multimodal content if image is present
            let userContent;
            if (imageToSend) {
                userContent = [
                    { type: 'text', text: userMessage + (context ? "\n\nContext from Web Search:" + context : '') },
                    { type: 'image_url', image_url: { url: imageToSend } }
                ];
            } else {
                userContent = userMessage + (context ? "\n\nContext from Web Search:" + context : '');
            }

            messagesWithContext.push({
                role: 'user',
                content: userContent
            });

            // Start streaming with abort controller
            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsStreaming(true);
            setStreamingMessage('');
            setStreamingThinking('');
            let fullResponse = "";
            let fullThinking = "";
            let thinkingTokens = null;

            await client.streamChat(messagesWithContext, (chunk, metadata) => {
                // If aborted, ignore all further chunks
                if (controller.signal.aborted) return;

                if (metadata?.isThinking) {
                    fullThinking += chunk;
                    setStreamingThinking(fullThinking);
                } else {
                    fullResponse += chunk;
                    setStreamingMessage(fullResponse);
                }

                if (metadata?.thinkingTokens) {
                    thinkingTokens = metadata.thinkingTokens;
                }
            }, selectedModel, { signal: controller.signal });

            // If aborted during streaming, bail out without saving
            if (controller.signal.aborted) return;

            // Calculate duration
            const duration = thinkingStartTime.current ? Date.now() - thinkingStartTime.current : null;

            setIsStreaming(false);

            // Safely separate thinking content from main response text
            const separateThinkingAndResponse = (rawThinking, rawResponse) => {
                let thinking = rawThinking || '';
                let response = rawResponse || '';

                // Case 1: Model streamed <think>...</think> inside fullResponse
                if (response.includes('<think>') || response.includes('<thinking>')) {
                    const tagPatterns = [
                        { open: /<think>/i, close: /<\/think>/i },
                        { open: /<thinking>/i, close: /<\/thinking>/i }
                    ];

                    for (const { open, close } of tagPatterns) {
                        if (open.test(response)) {
                            if (close.test(response)) {
                                const parts = response.split(close);
                                const thinkMatch = parts[0].match(/<think>([\s\S]*)/i) || parts[0].match(/<thinking>([\s\S]*)/i);
                                if (thinkMatch && thinkMatch[1]) {
                                    thinking += (thinking ? '\n' : '') + thinkMatch[1].trim();
                                }
                                response = parts.slice(1).join('').trim();
                            } else {
                                // Unclosed tag — everything inside it is thinking
                                const thinkMatch = response.match(/<think>([\s\S]*)/i) || response.match(/<thinking>([\s\S]*)/i);
                                if (thinkMatch && thinkMatch[1]) {
                                    thinking += (thinking ? '\n' : '') + thinkMatch[1].trim();
                                    response = '';
                                }
                            }
                        }
                    }
                }

                // Case 2: fullResponse empty but thinking buffer has everything
                if (!response && thinking) {
                    // Try to split on closing think tag
                    const closePatterns = [/<\/think>/i, /<\/thinking>/i];
                    for (const close of closePatterns) {
                        if (close.test(thinking)) {
                            const parts = thinking.split(close);
                            thinking = parts[0].replace(/<think>|<thinking>|\[THINKING\]|\[REASONING\]/gi, '').trim();
                            response = parts.slice(1).join('').trim();
                            break;
                        }
                    }

                    // Still no response — look for a natural break (double newline after 40 chars)
                    if (!response && thinking) {
                        const doubleNL = thinking.indexOf('\n\n');
                        if (doubleNL !== -1 && doubleNL > 40) {
                            response = thinking.substring(doubleNL).trim();
                            thinking = thinking.substring(0, doubleNL).trim();
                        } else {
                            // Can't split — treat entire content as response, no separate thinking
                            response = thinking;
                            thinking = '';
                        }
                    }
                }

                // Final cleanup: strip any leftover think tags from response text
                response = response
                    .replace(/<\/?think>/gi, '')
                    .replace(/<\/?thinking>/gi, '')
                    .replace(/\[THINKING\]|\[REASONING\]|\[\/THINKING\]|\[\/REASONING\]/gi, '')
                    .trim();

                return { thinking, response };
            };

            const { thinking: combinedThinking, response: cleanedResponse } = separateThinkingAndResponse(fullThinking, fullResponse);

            // Comprehensive Artifact Parsing (XML antArtifact, :::artifact, or code block)
            let artifactData = null;
            let antMatch = null;

            // Helper function to flexibly parse <antArtifact> tags from any model
            function parseAntArtifact(text) {
                if (!text) return null;
                // Strip markdown code fences if wrapped around antArtifact (e.g. ```xml <antArtifact...> </antArtifact> ``` or xmlCopy)
                const unwrapped = text
                    .replace(/```[ \t]*(?:xml|html)?[ \t]*Copy?[ \t]*[\r\n]+(<antArtifact[\s\S]*?<\/antArtifact>)[\s\S]*?```/gi, '$1')
                    .replace(/xmlCopy[ \t]*[\r\n]+(<antArtifact[\s\S]*?<\/antArtifact>)/gi, '$1');

                const match = unwrapped.match(/<antArtifact\s+([^>]+)>([\s\S]*?)<\/antArtifact>/i) ||
                              text.match(/<antArtifact\s+([^>]+)>([\s\S]*?)<\/antArtifact>/i);
                if (!match) return null;

                const attrString = match[1];
                const rawContent = match[2].trim();

                // Extract attributes in any order with single/double quotes or unquoted
                const idMatch = attrString.match(/identifier=["']?([^"'\s>]+)["']?/i);
                const typeMatch = attrString.match(/type=["']?([^"'\s>]+)["']?/i);
                const titleMatch = attrString.match(/title=["']([^"']+)["']/i) || attrString.match(/title=["']?([^"'\s>]+)["']?/i);

                const id = idMatch ? idMatch[1] : 'artifact-' + Date.now();
                const rawType = typeMatch ? typeMatch[1].toLowerCase() : 'html';
                const title = titleMatch ? titleMatch[1] : 'Interactive Artifact';

                // Content-aware type resolution:
                let type = 'html';
                if (rawType.includes('react') || rawType.includes('jsx')) {
                    if (rawContent.startsWith('<!DOCTYPE') || rawContent.startsWith('<!doctype') || rawContent.startsWith('<html')) {
                        type = 'html';
                    } else {
                        type = 'react';
                    }
                } else if (rawType.includes('svg')) {
                    type = 'svg';
                } else if (rawType.includes('markdown') || rawType.includes('md') || rawType.includes('paper')) {
                    type = 'markdown';
                } else {
                    if (
                        (rawContent.includes('import React') || rawContent.includes('export default function') || rawContent.includes('useState(')) &&
                        !rawContent.includes('<canvas') && !rawContent.startsWith('<!DOCTYPE')
                    ) {
                        type = 'react';
                    } else {
                        type = 'html';
                    }
                }

                const language = type === 'react' ? 'jsx' : type === 'html' ? 'html' : type === 'svg' ? 'svg' : 'markdown';

                return {
                    id,
                    type,
                    language,
                    title,
                    content: rawContent,
                    rawMatch: match[0]
                };
            }

            // Only parse artifacts when the feature is enabled
            if (isArtifactsEnabled) {
                // First: Check for <antArtifact> tags (from Claude, GPT, Gemini, Groq)
                const parsedAnt = parseAntArtifact(cleanedResponse);

                if (parsedAnt) {
                    antMatch = parsedAnt;
                    artifactData = {
                        id: parsedAnt.id,
                        type: parsedAnt.type,
                        language: parsedAnt.language,
                        title: parsedAnt.title,
                        content: parsedAnt.content
                    };
                } else {
                    // Fallback to code fences
                    let normResponse = cleanedResponse
                        .replace(/```[ \t]*[\r\n]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*[\r\n]+/gi, '```$1\n')
                        .replace(/```[ \t]*(html|jsx|react|tsx|svg|javascript|js|typescript|ts)Copy[ \t]*[\r\n]+/gi, '```$1\n')
                        .replace(/```[ \t]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]+[\r\n]+/gi, '```$1\n')
                        .replace(/```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*\r\n/gi, '```$1\n');

                    const htmlMatch  = normResponse.match(/```html[\s\r\n]+([\s\S]*?)```/i);
                    const jsxMatch   = normResponse.match(/```(jsx|react|tsx)[\s\r\n]+([\s\S]*?)```/i);
                    const svgMatch   = normResponse.match(/```svg[\s\r\n]+([\s\S]*?)```/i);
                    const jsMatch    = normResponse.match(/```(javascript|js|typescript|ts)[\s\r\n]+([\s\S]*?)```/i);
                    const jsContent  = jsMatch ? jsMatch[2].trim() : '';
                    const jsIsLarge  = jsContent.split('\n').length > 15;
                    const noLangMatch   = normResponse.match(/^```\r?\n([\s\S]*?)```/m);
                    const noLangContent = noLangMatch ? noLangMatch[1].trim() : '';
                    const noLangIsLarge = noLangContent.split('\n').length > 30;

                    if (htmlMatch) {
                        artifactData = { type: 'html', language: 'html', content: htmlMatch[1].trim(), title: 'HTML Application' };
                    } else if (jsxMatch) {
                        artifactData = { type: 'react', language: 'jsx', content: jsxMatch[2].trim(), title: 'Interactive React Component' };
                    } else if (svgMatch) {
                        artifactData = { type: 'svg', language: 'svg', content: svgMatch[1].trim(), title: 'SVG Graphic' };
                    } else if (jsMatch && jsIsLarge) {
                        const looksLikeHTML = jsContent.includes('document.') || jsContent.includes('canvas') || jsContent.includes('getElementById') || jsContent.includes('addEventListener');
                        if (looksLikeHTML) {
                            const wrappedHtml = `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#111;}</style></head>\n<body>\n<script>\n${jsContent}\n<\/script>\n</body>\n</html>`;
                            const langLabel = jsMatch[1] === 'typescript' || jsMatch[1] === 'ts' ? 'typescript' : 'javascript';
                            artifactData = { type: 'html', language: langLabel, content: wrappedHtml, title: 'Interactive Application' };
                        } else {
                            artifactData = { type: 'react', language: 'jsx', content: jsContent, title: 'Interactive Component' };
                        }
                    } else if (noLangMatch && noLangIsLarge) {
                        const looksLikeReact = noLangContent.includes('export default') || noLangContent.includes('useState') || noLangContent.includes('function App');
                        const looksLikeHTML  = noLangContent.includes('<!DOCTYPE') || noLangContent.includes('<html') || (noLangContent.includes('document.') && noLangContent.includes('canvas'));
                        if (looksLikeHTML) {
                            artifactData = { type: 'html', language: 'html', content: noLangContent, title: 'Application' };
                        } else if (looksLikeReact) {
                            artifactData = { type: 'react', language: 'jsx', content: noLangContent, title: 'Interactive Component' };
                        }
                    } else if (isDeepResearch) {
                        artifactData = {
                            type: 'research_paper',
                            language: 'markdown',
                            content: cleanedResponse,
                            title: 'Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)
                        };
                    }
                }
            } // end isArtifactsEnabled

            // Prepare message metadata with thinking content if available
            const messageMetadata = {
                modelName: currentModelName
            };
            if (combinedThinking) {
                messageMetadata.thinking = combinedThinking;
                messageMetadata.thinkingTokens = thinkingTokens || combinedThinking.length;
                messageMetadata.duration = duration;
            }

            // Add search sources to metadata if present
            if (searchResults && searchResults.sources && searchResults.sources.length > 0) {
                let finalSources = searchResults.sources;
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
                setCurrentArtifactId(newId);    // ← always set before opening panel
                setIsArtifactOpen(true);

                const artifactPlaceholder = `\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}\n\n`;
                let finalResponse;
                if (artifactData.type === 'research_paper') {
                    finalResponse = `I have completed the deep research. You can view and download the formal research paper in the artifact workspace.\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                } else if (antMatch) {
                    finalResponse = cleanedResponse
                        .replace(/```[ \t]*(?:xml|html)?[ \t]*Copy?[ \t]*[\r\n]+<antArtifact[\s\S]*?<\/antArtifact>[\s\S]*?```/gi, artifactPlaceholder)
                        .replace(/xmlCopy[ \t]*[\r\n]+<antArtifact[\s\S]*?<\/antArtifact>/gi, artifactPlaceholder)
                        .replace(/<antArtifact[\s\S]*?<\/antArtifact>/gi, artifactPlaceholder);
                } else {
                    const normForReplace = cleanedResponse
                        .replace(/```[ \t]*[\r\n]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*[\r\n]+/gi, '```$1\n')
                        .replace(/```[ \t]*(html|jsx|react|tsx|svg|javascript|js|typescript|ts)Copy[ \t]*[\r\n]+/gi, '```$1\n')
                        .replace(/```[ \t]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]+[\r\n]+/gi, '```$1\n')
                        .replace(/```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*\r\n/gi, '```$1\n');

                    finalResponse = normForReplace.replace(
                        /```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[\s\S]*?```/i,
                        artifactPlaceholder
                    );

                    if (finalResponse === normForReplace) {
                        finalResponse = normForReplace
                            .replace(/```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[\s\S]*?```/gi, artifactPlaceholder)
                            || normForReplace;
                    }
                }

                addMessage('assistant', finalResponse.trim(), messageMetadata);
            } else {
                addMessage('assistant', cleanedResponse, messageMetadata);
            }
        } catch (error) {
            // If the stream was aborted by user (New Chat, switch chat, stop button), exit silently
            if (error.name === 'AbortError' || abortControllerRef.current?.signal?.aborted) {
                console.log('Stream cancelled by user');
                return;
            }
            console.error(error);
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');
            addMessage('assistant', `Error: ${error.message}`);
        } finally {
            abortControllerRef.current = null;
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
        stopGeneration();
        createNewChat();
    };

    const currentModelName = availableModels[selectedProvider]?.find(m => m.id === selectedModel)?.name || 'Select model';

    /**
     * Cleans the streaming message for display.
     * - Replaces completed artifact blocks/fences with a short placeholder
     * - Hides everything from an unclosed (still-streaming) fence onwards
     * - Regular code blocks (short, non-artifact languages) are left untouched
     */
    const cleanStreamingMessage = (raw) => {
        if (!raw) return { text: raw, artifactInFlight: false };

        // Aggressive normalisation — same as final parsing
        let text = raw
            .replace(/```[ \t]*[\r\n]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*[\r\n]+/gi, '```$1\n')
            .replace(/```[ \t]*(html|jsx|react|tsx|svg|javascript|js|typescript|ts)Copy[ \t]*[\r\n]+/gi, '```$1\n')
            .replace(/```[ \t]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]+[\r\n]+/gi, '```$1\n')
            .replace(/```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*\r\n/gi, '```$1\n');

        let artifactInFlight = false;

        // 1. Replace completed <antArtifact> blocks (including xmlCopy or ```xml wrappers)
        text = text
            .replace(/```[ \t]*(?:xml|html)?[ \t]*Copy?[ \t]*[\r\n]+<antArtifact[\s\S]*?<\/antArtifact>[\s\S]*?```/gi, '\n\n_✦ Artifact generated — see panel →_\n\n')
            .replace(/xmlCopy[ \t]*[\r\n]+<antArtifact[\s\S]*?<\/antArtifact>/gi, '\n\n_✦ Artifact generated — see panel →_\n\n')
            .replace(/<antArtifact[\s\S]*?<\/antArtifact>/gi, '\n\n_✦ Artifact generated — see panel →_\n\n');

        // 2. Replace completed code fences — only artifact candidates
        //    Use a replacer function so we can check line count for generic languages
        text = text.replace(/```([\w]*)\r?\n([\s\S]*?)```/g, (full, lang, content) => {
            const lcLang = lang.toLowerCase();
            const lineCount = content.split('\n').length;
            const isExplicit = ['html', 'jsx', 'react', 'tsx', 'svg'].includes(lcLang);
            const isJsLike   = ['javascript', 'js', 'typescript', 'ts'].includes(lcLang) && lineCount > 15;
            const isNoLangLg = lcLang === '' && lineCount > 30;
            if (isExplicit || isJsLike || isNoLangLg) {
                return '\n\n_✦ Artifact generated — see panel →_\n\n';
            }
            return full; // keep short/non-artifact code blocks as-is
        });

        // 3. Detect an unclosed (still-streaming) fence that looks like an artifact
        const lines = text.split('\n');
        let inFence = false;
        let fenceLang = '';
        let fenceStartLine = -1;
        let fenceContentLines = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!inFence) {
                const openMatch = line.match(/^```([\w]*)$/);
                if (openMatch) {
                    inFence = true;
                    fenceLang = openMatch[1].toLowerCase();
                    fenceStartLine = i;
                    fenceContentLines = 0;
                }
            } else {
                if (line.trimEnd() === '```') {
                    inFence = false; // closed — already handled by replacer above
                } else {
                    fenceContentLines++;
                }
            }
        }

        if (inFence && fenceStartLine !== -1) {
            const isExplicit = ['html', 'jsx', 'react', 'tsx', 'svg'].includes(fenceLang);
            const isJsLike   = ['javascript', 'js', 'typescript', 'ts'].includes(fenceLang) && fenceContentLines > 8;
            const isNoLangLg = fenceLang === '' && fenceContentLines > 15;
            if (isExplicit || isJsLike || isNoLangLg) {
                artifactInFlight = true;
                text = lines.slice(0, fenceStartLine).join('\n').trimEnd();
            }
        }

        // 4. Detect an unclosed <antArtifact opening tag
        const openTagIdx = text.search(/<antArtifact/i);
        if (openTagIdx !== -1) {
            artifactInFlight = true;
            text = text.slice(0, openTagIdx).trimEnd();
        }

        return { text, artifactInFlight };
    };

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
        <div className="flex h-full w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] font-serif" style={{ minHeight: 0 }}>
            {/* Left SideNavBar */}
            <aside
                ref={sidebarRef}
                className={`bg-[var(--bg-secondary)] border-r border-[var(--border)]/60 flex flex-col hidden md:flex relative transition-all duration-300 ease-in-out font-sans ${isSidebarOpen ? '' : '-ml-[100%] w-0 border-none overflow-hidden'}`}
                style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px', minWidth: isSidebarOpen ? '200px' : '0px', maxWidth: '400px' }}
            >
                {/* Workspace Header */}
                <div className="p-5 pb-4 flex items-center justify-between border-b border-[var(--border)]/40">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[var(--accent)] text-white flex items-center justify-center font-bold text-xs">
                            C
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Open Claude Workspace</h2>
                        </div>
                    </div>
                </div>

                {/* Primary CTA: New Chat */}
                <div className="p-4">
                    <button
                        onClick={handleNewChat}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-sm cursor-pointer"
                    >
                        <Plus size={18} />
                        <span>New Chat</span>
                    </button>
                </div>

                {/* Navigation & Chat History List */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
                    <ul className="space-y-1 text-sm font-medium">
                        <li>
                            <button
                                onClick={() => setActiveTab('chat')}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer text-left ${activeTab === 'chat'
                                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                    }`}
                            >
                                <Clock size={18} className="text-[var(--text-tertiary)]" />
                                <span>Recent Activity</span>
                            </button>
                        </li>
                        <li>
                            <button
                                onClick={() => setActiveTab('artifacts')}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer text-left ${activeTab === 'artifacts'
                                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                    }`}
                            >
                                <Code size={18} className="text-[var(--text-tertiary)]" />
                                <span>Artifacts ({artifacts.length})</span>
                            </button>
                        </li>
                    </ul>

                    {/* Chat History Section */}
                    {activeTab === 'chat' && (
                        <div className="pt-2">
                            <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-2 mb-2">
                                Conversations
                            </div>
                            <div className="space-y-1">
                                {chats.map(chat => (
                                    <div
                                        key={chat.id}
                                        className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${chat.id === currentChatId
                                            ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                            }`}
                                    >
                                        <div
                                            className="flex-1 flex items-center gap-2.5 min-w-0"
                                            onClick={() => {
                                                stopGeneration();
                                                switchToChat(chat.id);
                                            }}
                                        >
                                            <MessageSquare size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                                            <span className="truncate">{chat.title}</span>
                                        </div>
                                        {chats.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    stopGeneration();
                                                    deleteChat(chat.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-tertiary)] rounded transition-opacity"
                                                title="Delete chat"
                                            >
                                                <Trash2 size={13} className="text-[var(--text-tertiary)]" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Artifacts List Section */}
                    {activeTab === 'artifacts' && (
                        <div className="pt-2 space-y-1.5">
                            {artifacts.map(art => (
                                <div
                                    key={art.id}
                                    onClick={() => {
                                        setCurrentArtifactId(art.id);
                                        setIsArtifactOpen(true);
                                    }}
                                    className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                    <div className="font-medium text-xs truncate text-[var(--text-primary)]">{art.title}</div>
                                    <div className="text-[11px] text-[var(--text-tertiary)] mt-1 flex justify-between">
                                        <span className="uppercase">{art.language}</span>
                                        <span>{new Date(art.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            ))}
                            {artifacts.length === 0 && (
                                <div className="text-xs text-[var(--text-tertiary)] text-center py-6">
                                    No artifacts generated yet
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer User Settings & Model Selector Card */}
                <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] font-sans">
                    <div
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl cursor-pointer transition-all duration-200 group shadow-md"
                        role="button"
                        title="Click to change model provider, API keys, or settings"
                    >
                        {/* User Avatar */}
                        <div className="w-10 h-10 bg-gradient-to-br from-[#d97757] via-[#e68364] to-[#b85233] text-white rounded-full flex items-center justify-center text-base font-bold shadow-md shrink-0 ring-2 ring-[#d97757]/40 group-hover:scale-105 transition-transform">
                            {userName ? userName.charAt(0).toUpperCase() : 'U'}
                        </div>

                        {/* User Details & Active Model Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                                    {userName || 'User'}
                                </span>
                                <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent)]/15 px-1.5 py-0.5 rounded border border-[var(--accent)]/30 font-bold uppercase tracking-wider shrink-0 shadow-2xs">
                                    {selectedProvider}
                                </span>
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] truncate font-mono mt-0.5 group-hover:text-[var(--accent)] font-medium transition-colors">
                                {currentModelName}
                            </div>
                        </div>

                        {/* Settings Action Button */}
                        <div className="p-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition-all border border-[var(--border)] shrink-0 shadow-xs">
                            <Settings size={16} />
                        </div>
                    </div>
                </div>

                {/* Resize Handle */}
                {isSidebarOpen && (
                    <div
                        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-[var(--accent)] transition-colors z-20"
                        onMouseDown={handleMouseDown}
                    />
                )}
            </aside>

            {/* Main Stage */}
            <main className="flex-1 flex flex-col relative min-w-0 transition-all duration-300" style={{ minHeight: 0 }}>
                {/* Header Toolbar */}
                <div className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)]/50 bg-[var(--bg-primary)]/80 backdrop-blur-sm z-30 font-sans">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors cursor-pointer"
                            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                        >
                            <MessageSquare size={18} />
                        </button>
                        <h1 className="text-lg font-serif font-semibold text-[var(--text-primary)]">Open Claude</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleArtifacts}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                isArtifactsEnabled
                                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                            title={isArtifactsEnabled ? 'Artifacts ON — click to disable' : 'Artifacts OFF — click to enable'}
                        >
                            <LayoutTemplate size={14} />
                            <span className="hidden sm:inline">Artifacts</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${isArtifactsEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--text-tertiary)]'}`} />
                        </button>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        >
                            Settings
                        </button>
                    </div>
                </div>

                {/* Scrollable Stage Content */}
                <div className="flex-1 overflow-y-auto pb-44 px-4 md:px-8">
                    <div className="max-w-[800px] mx-auto py-8 md:py-12 flex flex-col gap-8">
                        {messages.length === 0 ? (
                            /* Greeting View */
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                {/* Main Greeting */}
                                <h2 className="font-serif text-[32px] md:text-[40px] font-medium text-[var(--text-primary)] mb-10 tracking-tight leading-tight">
                                    {greeting}
                                </h2>

                                {/* Input Container Card & Integrated Suggestions */}
                                <div className="w-full max-w-[720px] text-left">
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.05)] flex flex-col overflow-hidden transition-shadow focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.09)]">
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onPaste={handlePaste}
                                            placeholder="How can Open Claude help you today?"
                                            rows={3}
                                            className="w-full bg-transparent border-none outline-none resize-none px-6 pt-5 pb-2 text-[17px] font-serif text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed focus:ring-0"
                                        />

                                        {/* Model & Attach Toolbar */}
                                        <div className="px-6 py-3 flex justify-between items-center border-t border-[var(--border)]/40 font-sans text-xs">
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                                    className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium cursor-pointer"
                                                >
                                                    <span>{currentModelName}</span>
                                                    {supportsImages && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                            📷 Vision
                                                        </span>
                                                    )}
                                                    <ChevronDown size={14} />
                                                </button>

                                                {showModelDropdown && (
                                                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-2xl max-h-80 overflow-y-auto z-50">
                                                        {Object.entries(availableModels).map(([provider, models]) => {
                                                            if (!models || models.length === 0) return null;
                                                            return (
                                                                <div key={provider} className="border-b border-[var(--border)] last:border-0">
                                                                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider bg-[var(--bg-secondary)] flex items-center justify-between">
                                                                        <span>{provider}</span>
                                                                        <span>{models.filter(m => m.capabilities?.image).length} vision</span>
                                                                    </div>
                                                                    {models.map(model => (
                                                                        <button
                                                                            key={model.id}
                                                                            onClick={() => {
                                                                                updateModel(model.id);
                                                                                setShowModelDropdown(false);
                                                                            }}
                                                                            className={`w-full px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between cursor-pointer ${model.id === selectedModel ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]'}`}
                                                                        >
                                                                            <span className="truncate mr-2">{model.name}</span>
                                                                            {model.capabilities?.image ? (
                                                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                                                    📷 Vision
                                                                                </span>
                                                                            ) : (
                                                                                <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">
                                                                                    Text
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isSearchEnabled
                                                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    title="Toggle Web Search"
                                                >
                                                    <Globe size={16} />
                                                </button>
                                                <ImageUpload
                                                    selectedImage={selectedImage}
                                                    onImageSelect={(base64) => {
                                                        setSelectedImage(base64);
                                                        if (!supportsImages) {
                                                            const providerModels = availableModels[selectedProvider] || [];
                                                            const visionModel = providerModels.find(m => m.capabilities?.image);
                                                            if (visionModel) {
                                                                updateModel(visionModel.id);
                                                            }
                                                        }
                                                    }}
                                                    onImageRemove={() => setSelectedImage(null)}
                                                    disabled={isLoading}
                                                />
                                                {isLoading || isStreaming ? (
                                                    <button
                                                        onClick={stopGeneration}
                                                        className="w-8 h-8 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                                                        title="Stop generating"
                                                    >
                                                        <Square size={14} className="fill-current" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleSendMessage}
                                                        disabled={!input.trim()}
                                                        className="w-8 h-8 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                                                    >
                                                        <ArrowUp size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Integrated Quick Suggestions Panel */}
                                        <div className="bg-[var(--bg-secondary)]/50 border-t border-[var(--border)]/40 py-4 px-6 font-sans">
                                            <div className="text-xs text-[var(--text-tertiary)] mb-3 font-medium">Get started with an example below</div>
                                            <div className="flex flex-wrap gap-2.5">
                                                {[
                                                    "🔍 Search latest AI news 2026",
                                                    "🔬 Deep research: Autonomous AI agents",
                                                    "⚡ Build an interactive React calculator component",
                                                    "💻 Write a Python async data pipeline"
                                                ].map((suggestion, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setInput(suggestion);
                                                        }}
                                                        className="px-3.5 py-2 bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent)]/60 rounded-lg text-xs font-sans font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                                                    >
                                                        {suggestion}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Active Conversation Turns */
                            messages.map((msg, idx) => (
                                <ChatMessage key={idx} message={msg} />
                            ))
                        )}

                        {/* Streaming Message Indicator */}
                        {messages.length > 0 && isStreaming && (streamingMessage || streamingThinking) && (
                            <div className="flex gap-4 py-6 border-t border-[var(--border)]/40">
                                <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-1">
                                    C
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="font-sans font-medium text-xs mb-2 text-[var(--text-tertiary)]">Open Claude</div>

                                    {streamingThinking && streamingThinking.trim() !== '' && (
                                        <ThinkingDisplay
                                            thinking={streamingThinking}
                                            isStreaming={true}
                                            modelName={currentModelName}
                                        />
                                    )}

                                    {streamingMessage && (() => {
                                        // When artifacts are enabled, hide raw artifact code during streaming
                                        const { text: displayText, artifactInFlight } = isArtifactsEnabled
                                            ? cleanStreamingMessage(streamingMessage)
                                            : { text: streamingMessage, artifactInFlight: false };

                                        return (
                                            <>
                                                {displayText && (
                                                    <div className="prose prose-serif max-w-none text-[var(--text-primary)] text-[18px] leading-[1.7]">
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
                                                                a({ children, href }) {
                                                                    return (
                                                                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
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
                                                            {displayText}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}

                                                {/* Artifact loading card — shown while artifact code is streaming */}
                                                {artifactInFlight && (
                                                    <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] font-sans text-sm w-fit">
                                                        <div className="w-6 h-6 rounded-md bg-[var(--accent)] flex items-center justify-center shrink-0">
                                                            <Code size={13} className="text-white" />
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-[var(--text-primary)]">Building artifact</span>
                                                            <span className="text-[var(--text-tertiary)] ml-2 text-xs animate-pulse">generating…</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Loading / Searching State */}
                        {messages.length > 0 && isLoading && !isStreaming && (
                            <div className="flex gap-4 py-6 border-t border-[var(--border)]/40 animate-fade-in">
                                <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-1">
                                    C
                                </div>
                                <div className="flex-1">
                                    <div className="font-sans font-medium text-xs mb-2 text-[var(--text-tertiary)]">Open Claude</div>

                                    {isSearching && (
                                        <SearchProgress
                                            isSearching={isSearching}
                                            searchSteps={searchSteps}
                                            totalSources={searchSources.length}
                                            currentQuery={currentSearchQuery}
                                        />
                                    )}

                                    {!isSearching && (
                                        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] font-sans text-xs">
                                            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                                            <span className="text-[var(--text-primary)] font-medium">Generating response...</span>
                                            <ThinkingTimer startTime={thinkingStartTime.current} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Floating Input Pill (when active messages exist) */}
                {messages.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/90 to-transparent pt-10 pb-6 px-4 flex justify-center pointer-events-none font-sans">
                        <div className="w-full max-w-[720px] pointer-events-auto">
                            <div className="bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-[28px] shadow-[0_8px_30px_rgba(0,0,0,0.07)] p-3 pl-6 pr-4 flex flex-col gap-2 transition-shadow focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    placeholder="Reply..."
                                    rows={1}
                                    className="w-full bg-transparent border-none outline-none resize-none font-serif text-[17px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] min-h-[44px] focus:ring-0 pt-2"
                                />
                                <div className="flex items-center justify-between px-1 pb-1">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                            className={`p-2 rounded-full transition-colors cursor-pointer ${isSearchEnabled ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'}`}
                                            title="Toggle Web Search"
                                        >
                                            <Globe size={18} />
                                        </button>
                                        <ImageUpload
                                            selectedImage={selectedImage}
                                            onImageSelect={(base64) => {
                                                setSelectedImage(base64);
                                                if (!supportsImages) {
                                                    const providerModels = availableModels[selectedProvider] || [];
                                                    const visionModel = providerModels.find(m => m.capabilities?.image);
                                                    if (visionModel) {
                                                        updateModel(visionModel.id);
                                                    }
                                                }
                                            }}
                                            onImageRemove={() => setSelectedImage(null)}
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] font-sans">
                                            <span>{currentModelName}</span>
                                            {supportsImages && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    📷 Vision
                                                </span>
                                            )}
                                        </div>
                                        {isLoading || isStreaming ? (
                                            <button
                                                onClick={stopGeneration}
                                                className="w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                                                title="Stop generating"
                                            >
                                                <Square size={14} className="fill-current" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSendMessage}
                                                disabled={!input.trim()}
                                                className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Slide-out Artifact Panel */}
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
