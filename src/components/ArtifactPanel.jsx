import React, { useState, useRef, useEffect } from 'react';
import { Code, Eye, Maximize2, X, Copy, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function ArtifactPanel({ isOpen, onClose, artifact }) {
    const [view, setView] = useState('preview'); // 'preview' or 'code'
    const [copied, setCopied] = useState(false);
    const iframeRef = useRef(null);

    useEffect(() => {
        if (artifact && artifact.type === 'html' && view === 'preview' && iframeRef.current) {
            const doc = iframeRef.current.contentDocument;
            doc.open();
            doc.write(artifact.content);
            doc.close();
        }
    }, [artifact, view]);

    if (!isOpen || !artifact) return null;

    const copyCode = () => {
        navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const canPreview = ['html', 'svg', 'react'].includes(artifact.type);

    return (
        <div className="w-full md:w-[500px] border-l border-[var(--border)] bg-[var(--bg-primary)] flex flex-col h-full fixed md:relative right-0 top-0 bottom-0 z-20">
            {/* Header */}
            <div className="p-3 md:p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center">
                        <Code size={16} className="text-white" />
                    </div>
                    <div>
                        <span className="font-medium text-sm text-[var(--text-primary)]">{artifact.title}</span>
                        <div className="text-xs text-[var(--text-tertiary)]">{artifact.language}</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {canPreview && (
                        <>
                            <button
                                onClick={() => setView('preview')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'preview'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Eye size={14} className="inline mr-1" />
                                Preview
                            </button>
                            <button
                                onClick={() => setView('code')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'code'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Code size={14} className="inline mr-1" />
                                Code
                            </button>
                        </>
                    )}
                    <button
                        onClick={copyCode}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                        title="Copy code"
                    >
                        {copied ? (
                            <Check size={16} className="text-green-500" />
                        ) : (
                            <Copy size={16} className="text-[var(--text-tertiary)]" />
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                    >
                        <X size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'preview' && canPreview ? (
                    <div className="w-full h-full bg-white">
                        {artifact.type === 'html' && (
                            <iframe
                                ref={iframeRef}
                                className="w-full h-full border-0"
                                sandbox="allow-scripts allow-same-origin"
                                title="HTML Preview"
                            />
                        )}
                        {artifact.type === 'svg' && (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 p-8">
                                <div dangerouslySetInnerHTML={{ __html: artifact.content }} />
                            </div>
                        )}
                        {artifact.type === 'react' && (
                            <div className="w-full h-full flex items-center justify-center p-8 bg-gray-50">
                                <div className="text-center text-gray-600">
                                    <Code size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>React component preview requires a build step.</p>
                                    <p className="text-sm mt-2">Switch to Code view to see the component.</p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
                        <SyntaxHighlighter
                            language={artifact.language}
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0,
                                height: '100%',
                                fontSize: '0.875rem',
                                background: 'var(--bg-secondary)'
                            }}
                            showLineNumbers
                        >
                            {artifact.content}
                        </SyntaxHighlighter>
                    </div>
                )}
            </div>
        </div>
    );
}
