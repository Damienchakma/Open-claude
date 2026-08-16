import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Code, Eye, X, Copy, Check, Download, RefreshCw, ExternalLink } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { buildReactArtifactHtml, buildHtmlArtifactHtml } from '../utils/artifact-runner';

/**
 * Writes HTML into a sandboxed iframe via srcdoc.
 * Using srcdoc avoids the need for same-origin and is more secure than doc.write().
 */
function ArtifactIframe({ html, title = 'Artifact Preview' }) {
    const iframeRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [key, setKey] = useState(0); // bump to force remount/refresh

    // When the HTML content changes, bump key to remount the iframe cleanly
    const htmlRef = useRef(html);
    useEffect(() => {
        if (htmlRef.current !== html) {
            htmlRef.current = html;
            setKey(k => k + 1);
            setIsLoading(true);
        }
    }, [html]);

    const refresh = useCallback(() => {
        setKey(k => k + 1);
        setIsLoading(true);
    }, []);

    const openInTab = useCallback(() => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Revoke after a short delay to let the tab load
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, [html]);

    return (
        <div className="w-full h-full flex flex-col">
            {/* Mini toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-tertiary)] border-b border-[var(--border)] shrink-0">
                <div className="flex items-center gap-1.5">
                    {isLoading && (
                        <span className="text-[11px] text-[var(--text-tertiary)] animate-pulse">Loading…</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={refresh}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Refresh preview"
                    >
                        <RefreshCw size={13} />
                    </button>
                    <button
                        onClick={openInTab}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Open in new tab"
                    >
                        <ExternalLink size={13} />
                    </button>
                </div>
            </div>

            {/* The iframe itself */}
            <iframe
                key={key}
                ref={iframeRef}
                srcDoc={html}
                className="w-full flex-1 border-0 bg-white"
                title={title}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                onLoad={() => setIsLoading(false)}
            />
        </div>
    );
}

export function ArtifactPanel({ isOpen, onClose, artifact }) {
    const [view, setView] = useState('preview');
    const [copied, setCopied] = useState(false);

    // Reset to preview whenever a new artifact is opened
    useEffect(() => {
        if (artifact) setView('preview');
    }, [artifact?.id]);

    if (!isOpen || !artifact) return null;

    const copyCode = () => {
        navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const canPreview = ['html', 'svg', 'react', 'research_paper'].includes(artifact.type);

    // Build the HTML to feed the iframe based on artifact type
    const buildPreviewHtml = () => {
        if (artifact.type === 'react') {
            return buildReactArtifactHtml(artifact.content);
        }
        if (artifact.type === 'html') {
            return buildHtmlArtifactHtml(artifact.content);
        }
        return null;
    };

    const previewHtml = buildPreviewHtml();

    // ── PDF download for research papers ────────────────────────────────────
    const downloadPdf = async () => {
        if (!artifact) return;
        const element = document.getElementById('artifact-pdf-content');
        if (!element) return;
        try {
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            await pdf.html(element, {
                callback: (doc) => {
                    doc.save(`${artifact.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.pdf`);
                },
                x: 40,
                y: 40,
                width: pdfWidth - 80,
                windowWidth: 800,
                html2canvas: { scale: 0.57, logging: false, useCORS: true },
                autoPaging: 'text',
            });
        } catch (error) {
            console.error('PDF generation failed:', error);
            try {
                const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/jpeg', 0.8);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const w = pdf.internal.pageSize.getWidth();
                const h = (canvas.height * w) / canvas.width;
                pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
                pdf.save(`${artifact.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
            } catch (e) {
                console.error('Fallback PDF failed:', e);
            }
        }
    };

    return (
        <div className="w-full md:w-[520px] border-l border-[var(--border)] bg-[var(--bg-primary)] flex flex-col h-full shrink-0 absolute md:relative right-0 top-0 bottom-0 z-20">
            {/* ── Header ── */}
            <div className="p-3 md:pt-14 md:pb-4 md:px-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center shrink-0">
                        <Code size={16} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate block">
                            {artifact.title}
                        </span>
                        <div className="text-xs text-[var(--text-tertiary)] uppercase">{artifact.language}</div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* PDF download for research papers */}
                    {artifact.type === 'research_paper' && (
                        <button
                            onClick={downloadPdf}
                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <Download size={14} className="inline mr-1" />
                            PDF
                        </button>
                    )}

                    {/* Preview / Source tabs */}
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
                                Source
                            </button>
                        </>
                    )}

                    <button
                        onClick={copyCode}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                        title="Copy code"
                    >
                        {copied
                            ? <Check size={16} className="text-green-500" />
                            : <Copy size={16} className="text-[var(--text-tertiary)]" />
                        }
                    </button>

                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                    >
                        <X size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {view === 'preview' && canPreview ? (
                    <div className="w-full h-full">

                        {/* ── React & HTML → sandboxed iframe ── */}
                        {(artifact.type === 'react' || artifact.type === 'html') && previewHtml && (
                            <ArtifactIframe html={previewHtml} title={artifact.title} />
                        )}

                        {/* ── SVG ── */}
                        {artifact.type === 'svg' && (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 p-8 overflow-auto">
                                <div dangerouslySetInnerHTML={{ __html: artifact.content }} />
                            </div>
                        )}

                        {/* ── Research paper / markdown ── */}
                        {artifact.type === 'research_paper' && (
                            <div className="w-full h-full overflow-auto bg-white">
                                <div
                                    id="artifact-pdf-content"
                                    className="max-w-[800px] mx-auto p-12 bg-white min-h-full prose prose-sm md:prose-base prose-slate"
                                    style={{ fontFamily: 'Times New Roman, serif', color: '#000' }}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        components={{
                                            h1: ({ node, ...props }) => (
                                                <h1 style={{ fontSize: '28px', borderBottom: '2px solid #000', paddingBottom: '10px', marginTop: '0', marginBottom: '24px', fontWeight: 'bold', color: '#000' }} {...props} />
                                            ),
                                            h2: ({ node, ...props }) => (
                                                <h2 style={{ fontSize: '20px', borderBottom: '1px solid #ddd', paddingBottom: '6px', marginTop: '24px', marginBottom: '16px', fontWeight: 'bold', color: '#000' }} {...props} />
                                            ),
                                            h3: ({ node, ...props }) => (
                                                <h3 style={{ fontSize: '16px', marginTop: '18px', marginBottom: '12px', fontWeight: 'bold', color: '#000' }} {...props} />
                                            ),
                                            p: ({ node, ...props }) => (
                                                <p style={{ lineHeight: '1.6', marginBottom: '16px', textAlign: 'justify', color: '#000' }} {...props} />
                                            ),
                                            li: ({ node, ...props }) => (
                                                <li style={{ marginBottom: '4px', color: '#000' }} {...props} />
                                            ),
                                            a: ({ node, ...props }) => (
                                                <a style={{ color: '#2563eb', textDecoration: 'underline' }} {...props} />
                                            ),
                                        }}
                                    >
                                        {artifact.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── Source / Code view ── */
                    <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
                        <SyntaxHighlighter
                            language={artifact.language === 'jsx' ? 'jsx' : artifact.language}
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0,
                                height: '100%',
                                fontSize: '0.875rem',
                                background: 'var(--bg-secondary)',
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
