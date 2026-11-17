import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Code, Eye, X, Copy, Check, Download, RefreshCw, ExternalLink, FileText } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { buildReactArtifactHtml, buildHtmlArtifactHtml } from '../utils/artifact-runner';
import { downloadText } from '../lib/chat-ui';
import { useTheme } from '../context/ThemeContext';

function ArtifactIframe({ html, title = 'Artifact preview' }) {
    const [isLoading, setIsLoading] = useState(true);
    const [key, setKey] = useState(0);
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
        const escaped = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const preview = `<!DOCTYPE html><html><body style="margin:0"><iframe title="Artifact preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcdoc="${escaped}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`;
        const url = URL.createObjectURL(new Blob([preview], { type: 'text/html' }));
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, [html]);

    return (
        <div className="artifact-frame-wrap">
            <div className="artifact-frame-toolbar">
                <span className="artifact-frame-status">{isLoading ? 'Loading…' : ''}</span>
                <div>
                    <button className="icon-button" onClick={refresh} aria-label="Refresh preview" title="Refresh preview"><RefreshCw size={14} /></button>
                    <button className="icon-button" onClick={openInTab} aria-label="Open in new tab" title="Open in new tab"><ExternalLink size={14} /></button>
                </div>
            </div>
            <iframe
                key={key}
                srcDoc={html}
                className="artifact-frame"
                title={title}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                onLoad={() => setIsLoading(false)}
            />
        </div>
    );
}

const typeLabel = artifact =>
    artifact.type === 'react' ? 'Code · JSX'
        : artifact.type === 'html' ? `Code · ${(artifact.language || 'html').toUpperCase()}`
            : artifact.type === 'svg' ? 'Image · SVG'
                : 'Document · Markdown';

const extensionFor = artifact =>
    artifact.type === 'react' ? 'jsx' : artifact.type === 'svg' ? 'svg' : artifact.type === 'html' ? 'html' : 'md';

export function ArtifactPanel({ isOpen, onClose, artifact }) {
    const [view, setView] = useState('preview');
    const [copied, setCopied] = useState(false);
    const { isDarkMode } = useTheme();

    useEffect(() => {
        if (artifact) setView('preview');
    }, [artifact?.id]);

    if (!isOpen || !artifact) return null;

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(artifact.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
    };

    const canPreview = ['html', 'svg', 'react', 'markdown', 'research_paper'].includes(artifact.type);
    const previewHtml = artifact.type === 'react' ? buildReactArtifactHtml(artifact.content)
        : artifact.type === 'html' ? buildHtmlArtifactHtml(artifact.content)
            : null;
    const fileName = `${artifact.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'artifact'}.${extensionFor(artifact)}`;

    const downloadPdf = async () => {
        const element = document.getElementById('artifact-pdf-content');
        if (!element) return;
        const safeName = artifact.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        try {
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            await pdf.html(element, {
                callback: doc => doc.save(`${safeName}.pdf`),
                x: 40, y: 40, width: pdfWidth - 80, windowWidth: 800,
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
                pdf.save(`${safeName}.pdf`);
            } catch (e) {
                console.error('Fallback PDF failed:', e);
            }
        }
    };

    return (
        <section className="artifact-panel" aria-label={`Artifact: ${artifact.title}`}>
            <header className="artifact-panel-header">
                <div className="artifact-panel-heading">
                    <strong>{artifact.title}</strong>
                    <small>{typeLabel(artifact)}</small>
                </div>
                <div className="artifact-panel-controls">
                    {canPreview && (
                        <div className="artifact-tabs" role="tablist" aria-label="Artifact view">
                            <button role="tab" aria-selected={view === 'preview'} className={view === 'preview' ? 'is-active' : ''} onClick={() => setView('preview')}><Eye size={14} />Preview</button>
                            <button role="tab" aria-selected={view === 'code'} className={view === 'code' ? 'is-active' : ''} onClick={() => setView('code')}><Code size={14} />Code</button>
                        </div>
                    )}
                    {artifact.type === 'research_paper' && (
                        <button className="artifact-pdf-button" onClick={downloadPdf}><Download size={14} />PDF</button>
                    )}
                    <button className="icon-button" onClick={copyCode} aria-label={copied ? 'Copied' : 'Copy artifact code'} title="Copy">
                        {copied ? <Check size={16} className="artifact-copied" /> : <Copy size={16} />}
                    </button>
                    {artifact.type !== 'research_paper' && (
                        <button className="icon-button" onClick={() => downloadText(fileName, artifact.content, 'text/plain')} aria-label="Download artifact" title="Download"><Download size={16} /></button>
                    )}
                    <button className="icon-button" onClick={onClose} aria-label="Close artifact panel" title="Close"><X size={17} /></button>
                </div>
            </header>

            <div className="artifact-panel-body">
                {view === 'preview' && canPreview ? (
                    <>
                        {(artifact.type === 'react' || artifact.type === 'html') && previewHtml && (
                            <ArtifactIframe html={previewHtml} title={artifact.title} />
                        )}
                        {artifact.type === 'svg' && (
                            <div className="artifact-svg-view">
                                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`} alt={artifact.title} />
                            </div>
                        )}
                        {(artifact.type === 'markdown' || artifact.type === 'research_paper') && (
                            <div className="artifact-doc-view">
                                <div
                                    id={artifact.type === 'research_paper' ? 'artifact-pdf-content' : undefined}
                                    className="artifact-doc-page oc-markdown"
                                    style={artifact.type === 'research_paper' ? { fontFamily: 'Times New Roman, serif', color: '#000' } : undefined}
                                >
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="artifact-code-view">
                        <SyntaxHighlighter
                            language={artifact.language === 'jsx' ? 'jsx' : artifact.language}
                            style={isDarkMode ? vscDarkPlus : oneLight}
                            customStyle={{ margin: 0, minHeight: '100%', fontSize: '13px', lineHeight: 1.65, background: 'transparent' }}
                            codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
                            showLineNumbers
                        >
                            {artifact.content}
                        </SyntaxHighlighter>
                    </div>
                )}
            </div>
            <footer className="artifact-panel-footer"><FileText size={13} />{fileName}</footer>
        </section>
    );
}