import { useState, useRef, useEffect } from "react";
import { useChat } from "../context/ChatContext";
import { ChatWorkspace } from "./ChatWorkspace";
import { LLMFactory } from "../lib/llm/clients";
import { IntelligentSearchTool } from "../lib/IntelligentSearchTool";
import { providerMessage, validateAttachment, extractArtifact, normalizeArtifactFences } from "../lib/chat-ui";
import { providerInfo, providerName } from "../lib/llm/providers";
import { loadMcpServers, collectMcpTools } from "../lib/mcp";
function ChatMode() {
    const { messages, addMessage, updateCurrentChat, isLoading, setIsLoading, apiKeys, customBaseUrl, selectedProvider, selectedModel, availableModels, addArtifact, setCurrentArtifactId, createNewChat, setIsArtifactOpen, supportsImages, userName, customSystemPrompt } = useChat();
    const [input, setInput] = useState('');

    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchSteps, setSearchSteps] = useState([]);
    const [currentSearchQuery, setCurrentSearchQuery] = useState('');
    const [searchSources, setSearchSources] = useState([]);
    const [toolActivity, setToolActivity] = useState('');

    const [streamingMessage, setStreamingMessage] = useState('');
    const [streamingThinking, setStreamingThinking] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [composerError, setComposerError] = useState('');



    // Artifacts toggle — persisted to localStorage
    const [isArtifactsEnabled, setIsArtifactsEnabled] = useState(() => {
        return localStorage.getItem('artifacts_enabled') !== 'false'; // default ON
    });

    const toggleArtifacts = () => {
        setIsArtifactsEnabled(prev => {
            const next = !prev;
            localStorage.setItem('artifacts_enabled', String(next));
            return next;
        });
    };

    const thinkingStartTime = useRef(null);

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
        setToolActivity('');
        setSearchSteps([]);
        setSearchSources([]);
    };





    useEffect(() => () => abortControllerRef.current?.abort(), []);

    const handlePaste = (e) => {
        if (isLoading) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const issue = validateAttachment(file);
                    if (issue) { setComposerError(issue); e.preventDefault(); return; }
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

    const handleSendMessage = async (textOverride) => {
        const draft = typeof textOverride === 'string' ? textOverride : input;
        if ((!draft.trim() && !selectedImage && !selectedFiles.length) || isLoading || abortControllerRef.current) return;
        if (!selectedProvider || !selectedModel) { setComposerError('Choose a model in Settings before sending. Your draft has been kept.'); return; }
        if (providerInfo(selectedProvider)?.key && !apiKeys[selectedProvider]) { setComposerError(`Add your ${providerName(selectedProvider)} API key in Settings. Your draft has been kept.`); return; }
        if (selectedProvider === 'custom' && !customBaseUrl) { setComposerError('Add your custom endpoint base URL in Settings › Connections. Your draft has been kept.'); return; }
        if ((selectedImage || messages.some(message => message.images?.length)) && !supportsImages) { setComposerError('Choose an image-capable model for this conversation, or remove the image and start a new chat.'); return; }
        if (isSearchEnabled && !apiKeys.tavily) { setComposerError('Web search needs a Tavily API key. Configure it or turn off web search.'); return; }

        const userMessage = draft.trim() || (selectedImage ? "What's in this image?" : 'Please review the attached files.');
        const imageToSend = selectedImage;
        const filesToSend = selectedFiles;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setComposerError('');
        setInput('');
        setSelectedImage(null);
        setSelectedFiles([]);
        setStreamingMessage('');
        setStreamingThinking('');
        const imagesList = imageToSend ? [{ dataUrl: imageToSend }] : [];
        addMessage('user', userMessage, { attachments: filesToSend }, null, imagesList);
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
                        apiKeys[selectedProvider],
                        controller.signal,
                        selectedModel,
                        { baseUrl: customBaseUrl }
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
                                if (controller.signal.aborted) return;
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
                            controller.signal.throwIfAborted();
                            context = searchResults.content;
                            if (searchResults.sources) setSearchSources(searchResults.sources);

                            // AUTO-ARTIFACT for Deep Research: Skip the secondary LLM call if we have a full paper
                            if (context && context.includes('## Abstract')) {
                                const artifactData = {
                                    type: 'research_paper',
                                    language: 'markdown',
                                    content: context,
                                    title: ('Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)).replace(/["'`]/g, '')
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
                                    if (controller.signal.aborted) return;
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

                            controller.signal.throwIfAborted();
                            // Enhance sources with logos asynchronously - verify result used in metadata
                            if (searchResults && searchResults.sources) {
                                // Create promise and attach to local scope to use later
                                const logoPromise = searchTool.enhanceSourcesWithLogos(searchResults.sources)
                                    .then(enhanced => {
                                        if (!controller.signal.aborted) setSearchSources(enhanced);
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
                    if (controller.signal.aborted) throw e;
                    setComposerError(`Web search failed: ${e.message}. The response will not use web results.`);
                    console.error("Search failed:", e);
                } finally {
                    if (!controller.signal.aborted) { setIsSearching(false); setCurrentSearchQuery(''); }
                }
            }

            controller.signal.throwIfAborted();

            const client = LLMFactory.getClient(selectedProvider, apiKeys[selectedProvider], { baseUrl: customBaseUrl });

            const mcpServers = loadMcpServers();
            let mcp = { tools: [], errors: [], clients: new Map() };
            if (mcpServers.some(server => server.enabled !== false)) {
                setToolActivity('Connecting MCP servers…');
                mcp = await collectMcpTools(mcpServers, controller.signal);
                setToolActivity('');
            }
            if (mcp.errors.length) setComposerError(`MCP: ${mcp.errors.join(' · ')}`);
            const toolDefs = mcp.tools.map(tool => selectedProvider === 'anthropic'
                ? { name: tool.functionName, description: tool.description, input_schema: tool.inputSchema }
                : { type: 'function', function: { name: tool.functionName, description: tool.description, parameters: tool.inputSchema } });

            // One fence-based artifact contract for every model: fences are the only format
            // all providers follow reliably; antArtifact output is still parsed if it appears.
            const systemPrompt = `You are Open Claude, a helpful AI assistant with a live interactive artifact preview. The user's name is ${userName || 'User'}.

## Artifacts
When you build a game, app, UI, animation, chart, simulation, or any interactive or visual piece, output it as ONE complete fenced code block that runs on its own:
- Games, apps, simulations, canvas or DOM code → \`\`\`html (a full self-contained HTML page, ALL CSS and JS inline, no external files)
- React components or data charts → \`\`\`jsx (a single function App() { ... } — NO import statements, NO export; Tailwind classes, lucide-react icons and Recharts are available as globals)
- Vector graphics → \`\`\`svg

## Rules — never break these
1. The language tag goes on the SAME line as the opening backticks: \`\`\`html
2. Output exactly ONE code block for the artifact. Never split it across blocks.
3. The code must be COMPLETE and runnable. No placeholders, no TODOs, no "add logic here".
4. Give the artifact a short descriptive title: a <title> tag for HTML, or a first-line comment for JSX/SVG.
5. Write one sentence describing what you built BEFORE the code block, and nothing after it.

For ordinary questions, explanations, or short code snippets, answer normally in markdown without an artifact.`;

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

            const finalSystemPrompt = systemPrompt + timeAndDateContext + userCustomSection + (toolDefs.length ? `\n\n## MCP tools\nThese tools come from the user's connected MCP servers: ${mcp.tools.map(tool => tool.functionName).join(', ')}. Call them when they help answer the request, and ground your reply in their results.` : '');

            const messagesWithContext = [
                { role: 'system', content: isArtifactsEnabled ? finalSystemPrompt : `You are a helpful AI assistant. Answer in markdown without artifact tags.${timeAndDateContext}${userCustomSection}` },
                ...messages.map(providerMessage),
                providerMessage({ role: 'user', content: userMessage + (context ? '\n\nContext from Web Search:' + context : ''), images: imagesList, metadata: { attachments: filesToSend } })
            ];

            setIsStreaming(true);
            setStreamingMessage('');
            setStreamingThinking('');
            let fullResponse = "";
            let fullThinking = "";
            let thinkingTokens = null;
            let thinkingEnd = null;

            let conversation = messagesWithContext;
            let roundText = '';
            const handleChunk = (chunk, metadata) => {
                // If aborted, ignore all further chunks
                if (controller.signal.aborted) return;

                if (metadata?.isThinking) {
                    fullThinking += chunk;
                    setStreamingThinking(fullThinking);
                } else {
                    if (chunk && fullThinking && !thinkingEnd) thinkingEnd = Date.now();
                    fullResponse += chunk;
                    roundText += chunk;
                    setStreamingMessage(fullResponse);
                }

                if (metadata?.thinkingTokens) {
                    thinkingTokens = metadata.thinkingTokens;
                }
            };
            const runTool = async call => {
                const tool = mcp.tools.find(item => item.functionName === call.name);
                if (!tool) return `Unknown tool: ${call.name}`;
                setToolActivity(`Using ${tool.serverName}: ${tool.name}…`);
                try {
                    const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : (call.arguments || {});
                    return await mcp.clients.get(tool.serverId).callTool(tool.name, args, controller.signal);
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    return `Tool error: ${error.message}`;
                } finally {
                    setToolActivity('');
                }
            };
            for (let round = 0; ; round++) {
                roundText = '';
                const result = await client.streamChat(conversation, handleChunk, selectedModel, { signal: controller.signal, tools: toolDefs });
                const calls = (result?.toolCalls || []).map(call => call.function ? { id: call.id, name: call.function.name, arguments: call.function.arguments } : call);
                if (!calls.length || round >= 5 || controller.signal.aborted) break;
                if (selectedProvider === 'anthropic') {
                    const parseArgs = text => { try { return JSON.parse(text || '{}'); } catch { return {}; } };
                    conversation = [...conversation, { role: 'assistant', content: [...(roundText.trim() ? [{ type: 'text', text: roundText }] : []), ...calls.map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: parseArgs(call.arguments) }))] }];
                    const results = [];
                    for (const call of calls) results.push({ type: 'tool_result', tool_use_id: call.id, content: await runTool(call) });
                    conversation = [...conversation, { role: 'user', content: results }];
                } else {
                    conversation = [...conversation, { role: 'assistant', content: roundText, tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) }];
                    for (const call of calls) conversation = [...conversation, { role: 'tool', tool_call_id: call.id, content: await runTool(call) }];
                }
            }

            // If aborted during streaming, bail out without saving
            if (controller.signal.aborted) return;

            // Calculate duration
            const duration = thinkingStartTime.current ? (thinkingEnd || Date.now()) - thinkingStartTime.current : null;

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

            // Artifact detection is shared with the streaming cleaner and unit-tested in chat-ui.js
            const extracted = isArtifactsEnabled ? extractArtifact(cleanedResponse) : null;
            let artifactData = extracted?.artifact || null;
            if (!artifactData && isArtifactsEnabled && isDeepResearch) {
                artifactData = {
                    type: 'research_paper',
                    language: 'markdown',
                    content: cleanedResponse,
                    title: ('Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)).replace(/["'`]/g, '')
                };
            }

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

            controller.signal.throwIfAborted();
            if (artifactData) {
                const newId = addArtifact(artifactData);
                setCurrentArtifactId(newId);
                setIsArtifactOpen(true);

                const marker = `:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                const finalResponse = artifactData.type === 'research_paper'
                    ? `I have completed the deep research. You can view and download the formal research paper in the artifact panel.\n\n${marker}`
                    : extracted
                        ? `${extracted.before}\n\n${marker}\n\n${extracted.after}`
                        : marker;
                addMessage('assistant', finalResponse.trim(), messageMetadata);
            } else {
                addMessage('assistant', cleanedResponse, messageMetadata);
            }
        } catch (error) {
            // If the stream was aborted by user (New Chat, switch chat, stop button), exit silently
            if (error.name === 'AbortError' || controller.signal.aborted) {
                console.log('Stream cancelled by user');
                return;
            }
            console.error(error);
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');
            setComposerError(`The provider request failed: ${error.message}`);
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setIsLoading(false);
                setIsStreaming(false);
                setStreamingMessage('');
                setStreamingThinking('');
                setToolActivity('');
            }
        }
    };



    const handleRetry = () => {
        if (isLoading || abortControllerRef.current) return;
        const lastUserIndex = messages.map(message => message.role).lastIndexOf('user');
        if (lastUserIndex === -1) return;
        const lastUser = messages[lastUserIndex];
        updateCurrentChat(chat => ({ ...chat, messages: chat.messages.slice(0, lastUserIndex) }));
        handleSendMessage(typeof lastUser.content === 'string' ? lastUser.content : '');
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

        // Same normalisation as the final parser so streaming and saved views agree
        let text = normalizeArtifactFences(raw);

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

    return <ChatWorkspace input={input} setInput={setInput} onSend={handleSendMessage} onRetry={handleRetry} onStop={stopGeneration} onPaste={handlePaste} selectedImage={selectedImage} setSelectedImage={setSelectedImage} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} busy={isLoading} isStreaming={isStreaming} streamingMessage={streamingMessage} streamingThinking={streamingThinking} isSearchEnabled={isSearchEnabled} setIsSearchEnabled={setIsSearchEnabled} isArtifactsEnabled={isArtifactsEnabled} toggleArtifacts={toggleArtifacts} onNewChat={handleNewChat} cleanStreamingMessage={cleanStreamingMessage} composerError={composerError} setComposerError={setComposerError} isSearching={isSearching} searchSteps={searchSteps} searchSources={searchSources} currentSearchQuery={currentSearchQuery} toolActivity={toolActivity} />;
}



export default ChatMode;
