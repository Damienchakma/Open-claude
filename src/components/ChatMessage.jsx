import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Code, ArrowUpRight, Download, Pencil, ThumbsUp, ThumbsDown, FileText, RefreshCw } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { CitationDisplay } from './CitationDisplay';
import { ThinkingDisplay } from './ThinkingDisplay';
import { downloadText } from '../lib/chat-ui';

function CopyButton({ text, label = 'Copy', className = '' }) {
    const [state, setState] = useState('idle');
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setState('copied');
        } catch {
            setState('unavailable');
        }
        setTimeout(() => setState('idle'), 2000);
    };
    return <button className={className} onClick={copy} aria-label={state === 'copied' ? 'Copied' : label} title={state === 'unavailable' ? 'Clipboard unavailable in this browser' : label}>
        {state === 'copied' ? <Check size={15} /> : <Copy size={15} />}<span>{state === 'copied' ? 'Copied' : state === 'unavailable' ? 'Copy unavailable' : label}</span>
    </button>;
}

function CodeBlock({ children }) {
    const { isDarkMode } = useTheme();
    const child = Array.isArray(children) ? children[0] : children;
    const language = /language-([\w+-]+)/.exec(child?.props?.className || '')?.[1] || 'text';
    const code = String(child?.props?.children || '').replace(/\n$/, '');
    return <div className="code-block"><div className="code-heading">{language !== 'text' ? <span>{language}</span> : <span />}<div><button aria-label="Download code" title="Download code" onClick={() => downloadText(`snippet.${language === 'text' ? 'txt' : language}`, code, 'text/plain')}><Download size={14} /></button><CopyButton text={code} label="Copy code" /></div></div>
        <SyntaxHighlighter language={language} style={isDarkMode ? vscDarkPlus : oneLight} PreTag="div" customStyle={{ margin: 0, background: 'transparent', padding: '18px 20px', fontSize: '13px', lineHeight: 1.65 }} codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}>{code}</SyntaxHighlighter>
    </div>;
}

const markdownComponents = {
    pre: CodeBlock,
    code: ({ children }) => <code>{children}</code>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    img: ({ src, alt }) => <img src={src} alt={alt || 'Image in response'} loading="lazy" />
};

export function MarkdownContent({ content }) {
    return <div className="oc-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content || ''}</ReactMarkdown></div>;
}

export function ChatMessage({ message, onEdit, onRetry, streaming = false }) {
    const isUser = message.role === 'user';
    const [feedback, setFeedback] = useState(null);
    const { setCurrentArtifactId, setIsArtifactOpen } = useChat();
    const segments = [];
    const pattern = /:::artifact\{id="([^"]+)" title="([^"]+)" type="([^"]+)"\}/g;
    let previous = 0;
    for (const match of message.content.matchAll(pattern)) {
        if (match.index > previous) segments.push(<MarkdownContent key={`text-${previous}`} content={message.content.slice(previous, match.index)} />);
        segments.push(<button key={`artifact-${match.index}`} className="artifact-card" onClick={() => { setCurrentArtifactId(match[1]); setIsArtifactOpen(true); }}>
            <span className="artifact-icon"><Code size={21} /></span><span><strong>{match[2]}</strong><small>Click to open</small></span><ArrowUpRight size={17} />
        </button>);
        previous = match.index + match[0].length;
    }
    if (previous < message.content.length || !segments.length) segments.push(<MarkdownContent key={`text-${previous}`} content={message.content.slice(previous)} />);
    return <article className={`oc-message ${isUser ? 'message-user' : 'message-assistant'} ${streaming ? 'is-streaming' : ''}`} aria-label={isUser ? 'Your message' : 'Open Claude response'}>
        <div className="message-body">
            {!!message.images?.length && <div className="message-images">{message.images.map((image, index) => <img key={index} src={image.dataUrl} alt={image.name || 'Attached image'} />)}</div>}
            {!!message.metadata?.attachments?.length && <div className="message-files">{message.metadata.attachments.map((file, index) => <span key={index}><FileText size={16} />{file.name}</span>)}</div>}
            {!isUser && message.metadata?.thinking?.trim() && <ThinkingDisplay thinking={message.metadata.thinking} duration={message.metadata.duration} isStreaming={streaming && !message.content?.trim()} />}
            {isUser ? <p className="user-text">{message.content}</p> : segments}
            {!isUser && !!message.metadata?.searchSources?.length && <CitationDisplay sources={message.metadata.searchSources} searchQuery={message.metadata.searchQuery} />}
        </div>
        {!streaming && <div className="message-actions">
            {!isUser && <img className="response-mark" src="/claude-logo.svg" alt="" />}
            <CopyButton text={message.content} label="Copy message" className="icon-button action-copy" />
            {isUser && onEdit && <button className="icon-button" aria-label="Edit and resend message" title="Edit and resend" onClick={() => onEdit(message.content)}><Pencil size={15} /></button>}
            {!isUser && <>
                <button className={`icon-button ${feedback === 'up' ? 'is-selected' : ''}`} aria-label="Mark helpful (local only)" aria-pressed={feedback === 'up'} title="Helpful — saved for this session only" onClick={() => setFeedback(feedback === 'up' ? null : 'up')}><ThumbsUp size={15} /></button>
                <button className={`icon-button ${feedback === 'down' ? 'is-selected' : ''}`} aria-label="Mark unhelpful (local only)" aria-pressed={feedback === 'down'} title="Not helpful — saved for this session only" onClick={() => setFeedback(feedback === 'down' ? null : 'down')}><ThumbsDown size={15} /></button>
                {onRetry && <button className="icon-button" aria-label="Retry response" title="Retry" onClick={onRetry}><RefreshCw size={15} /></button>}
            </>}
        </div>}
    </article>;
}
