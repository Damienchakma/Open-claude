
import React, { useState, useEffect, useRef } from 'react';
import { Send, FileCode, Play, Terminal, Code, Monitor, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useBuild } from '../context/BuildContext';
import { useChat } from '../context/ChatContext';
import { LLMFactory } from '../lib/llm/clients';
import { providerInfo, providerName } from '../lib/llm/providers';
import { generatePreviewHTML } from '../utils/preview-generator';
import MonacoEditor from '@monaco-editor/react';


export default function BuildMode() {
    const {
        buildMessages,
        addBuildMessage,
        buildFiles,
        updateBuildFiles,
        activeFile,
        setActiveFile,
        isGenerating,
        setIsGenerating,
        clearBuild
    } = useBuild();

    const {
        selectedProvider,
        selectedModel,
        apiKeys,
        customBaseUrl
    } = useChat();

    const [input, setInput] = useState('');
    const [previewHTML, setPreviewHTML] = useState('');
    const messagesEndRef = useRef(null);
    const [viewMode, setViewMode] = useState('preview'); // 'preview' or 'code'

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [buildMessages, isGenerating]);

    // Regenerate preview when files change
    useEffect(() => {
        const html = generatePreviewHTML(buildFiles);
        setPreviewHTML(html);
    }, [buildFiles]);

    const handleSendMessage = async () => {
        if (!input.trim() || isGenerating) return;

        const userMessage = input;
        setInput('');
        addBuildMessage({ role: 'user', content: userMessage });
        setIsGenerating(true);

        try {
            // Get client
            if (providerInfo(selectedProvider)?.key && !apiKeys[selectedProvider]) {
                throw new Error(`Please set your ${providerName(selectedProvider)} API key in settings`);
            }
            if (selectedProvider === 'custom' && !customBaseUrl) {
                throw new Error('Set a base URL for the custom provider in settings');
            }
            const client = LLMFactory.getClient(selectedProvider, apiKeys[selectedProvider], { baseUrl: customBaseUrl });

            // Construct System Prompt
            const systemPrompt = `You are a code generation AI. Generate React components based on user requests.

CRITICAL RULES:
1. Return a JSON object with file paths as keys and code as values
2. Use React with TypeScript (tsx) or JavaScript (jsx)
3. Use Tailwind CSS for styling
4. Include proper imports (React, etc)
5. Make components functional and complete
6. The main entry point is typically src/App.tsx
7. DO NOT use markdown formatting (no \`\`\`). Just return raw JSON.

Format your response as valid JSON ONLY:
{
  "src/App.tsx": "import React from 'react'...",
  "src/components/Header.tsx": "export default function Header()..."
}

Existing files:
${JSON.stringify(Object.keys(buildFiles))}

User request: ${userMessage}`;

            // We use a non-streaming call for JSON generation to ensure we get valid JSON
            // For providers that don't support non-streaming easily via this client, we might need to adjust
            // But usually streamChat can be used and we just accumulate.
            // Let's accumulate.

            let fullResponse = "";

            // Create a temporary message for "Generating..."
            // We won't add it to history yet, just show loading state.

            await client.streamChat([{ role: 'user', content: systemPrompt }], (chunk) => {
                fullResponse += chunk;
            }, selectedModel);

            // Clean up code blocks if present (LLMs often ignore "no markdown" rules)
            let jsonStr = fullResponse;
            if (jsonStr.includes('```json')) {
                jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```/, '');
            } else if (jsonStr.includes('```')) {
                jsonStr = jsonStr.replace(/```\n?/, '').replace(/```/, '');
            }

            // Parse JSON
            try {
                const generatedFiles = JSON.parse(jsonStr);

                // Update files
                updateBuildFiles(generatedFiles);

                // Add Assistant Message
                addBuildMessage({
                    role: 'assistant',
                    content: `Generated ${Object.keys(generatedFiles).length} files.`,
                    files: generatedFiles
                });

                // If App.tsx was modified, ensure it's active or we stay on current
                if (generatedFiles['src/App.tsx']) {
                    // Maybe don't switch active file automatically to be less jarring, 
                    // or switch to the main modified file.
                }

            } catch (e) {
                console.error("Failed to parse JSON", e);
                // Fallback: just show the text
                addBuildMessage({
                    role: 'assistant',
                    content: "I created some code but couldn't apply it automatically. Here is the response:\n\n" + fullResponse
                });
            }

        } catch (error) {
            addBuildMessage({ role: 'assistant', content: `Error: ${error.message}` });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="build-mode h-full flex bg-gray-50 border-t border-[var(--border)]">
            {/* LEFT SIDE: Chat Interface */}
            <div className="chat-panel w-96 border-r border-[var(--border)] flex flex-col bg-white">
                <div className="chat-header p-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50/50">
                    <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                        <Terminal size={16} />
                        Build Assistant
                    </h2>
                    <button
                        onClick={clearBuild}
                        className="p-1.5 hover:bg-gray-200 rounded-md transition-colors text-[var(--text-secondary)]"
                        title="New Chat (Reset Build)"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                <div className="chat-messages flex-1 overflow-y-auto p-4 space-y-4">
                    {buildMessages.length === 0 && (
                        <div className="text-center text-gray-400 mt-10 text-sm">
                            <p>Describe what you want to build.</p>
                            <p className="text-xs mt-2">Example: "Create a todo list app"</p>
                        </div>
                    )}

                    {buildMessages.map((msg, idx) => (
                        <div key={idx} className={`build-message ${msg.role === 'user' ? 'ml-auto' : ''} max-w-[85%]`}>
                            <div className={`p-3 rounded-lg text-sm ${msg.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-[var(--text-primary)] border border-gray-200'
                                }`}>
                                <div className="whitespace-pre-wrap">{msg.content}</div>

                                {msg.files && (
                                    <div className="mt-3 pt-2 border-t border-gray-200/50">
                                        <div className="text-xs font-mono opacity-70 mb-1">Modified files:</div>
                                        <div className="flex flex-col gap-1">
                                            {Object.keys(msg.files).map(path => (
                                                <button
                                                    key={path}
                                                    onClick={() => {
                                                        setActiveFile(path);
                                                        setViewMode('code');
                                                    }}
                                                    className="text-xs text-left font-mono hover:underline flex items-center gap-1"
                                                >
                                                    <FileCode size={10} />
                                                    {path}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {isGenerating && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 p-2">
                            <Loader2 size={14} className="animate-spin" />
                            Calculating...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="chat-input p-4 border-t border-[var(--border)] bg-gray-50/30">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Descibe your app..."
                            className="w-full bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px] resize-none"
                            disabled={isGenerating}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isGenerating}
                            className="absolute bottom-2 right-2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: Preview & Code */}
            <div className="preview-panel flex-1 flex flex-col bg-white overflow-hidden">
                <div className="preview-header p-2 border-b border-[var(--border)] flex items-center justify-between bg-gray-50">
                    <div className="flex gap-1 bg-gray-200/50 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('preview')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-colors ${viewMode === 'preview'
                                ? 'bg-white text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-secondary)] hover:bg-gray-200'
                                }`}
                        >
                            <Monitor size={14} />
                            Preview
                        </button>
                        <button
                            onClick={() => setViewMode('code')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-colors ${viewMode === 'code'
                                ? 'bg-white text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-secondary)] hover:bg-gray-200'
                                }`}
                        >
                            <Code size={14} />
                            Code
                        </button>
                    </div>

                    {viewMode === 'code' && (
                        <select
                            value={activeFile}
                            onChange={(e) => setActiveFile(e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white outline-none focus:border-blue-500"
                        >
                            {Object.keys(buildFiles).map(file => (
                                <option key={file} value={file}>{file}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex-1 relative bg-gray-100">
                    {viewMode === 'preview' ? (
                        <iframe
                            className="w-full h-full bg-white border-none"
                            srcDoc={previewHTML}
                            sandbox="allow-scripts allow-same-origin allow-forms"
                            title="Preview"
                        />
                    ) : (
                        <MonacoEditor
                            height="100%"
                            language={activeFile.endsWith('.css') ? 'css' : 'typescript'}
                            value={buildFiles[activeFile] || ''}
                            theme="vs-light"
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                readOnly: true, // For now read-only in build mode
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 16 }
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
