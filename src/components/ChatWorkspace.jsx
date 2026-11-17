import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, Download, EyeOff, Search, MessageSquare, PanelLeft, Shapes, SquarePen, Copy, Pencil, Trash2, X, PenLine, GraduationCap, Code, Coffee, Sparkles } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { Sidebar } from './Sidebar';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';
import { SettingsModal } from './SettingsModal';
import { ArtifactPanel } from './ArtifactPanel';
import { SearchProgress } from './SearchProgress';
import { Dialog } from './Dialog';
import { Menu } from './Menu';
import { exampleConversation } from '../lib/example-conversation';
import { conversationMarkdown, downloadText } from '../lib/chat-ui';

const starters = [
    { name: 'Write', icon: PenLine, prompts: ['Help me find the right words for an important email', 'Turn my rough notes into a clear outline', 'Help me tell a story that draws people in'] },
    { name: 'Learn', icon: GraduationCap, prompts: ['Explain a complex idea in simple terms', 'Make a study plan for something new', 'Help me understand both sides of an argument'] },
    { name: 'Code', icon: Code, prompts: ['Help me debug a piece of code', 'Build a small interactive web page', 'Explain how this code works'] },
    { name: 'Life stuff', icon: Coffee, prompts: ['Help me plan a week that feels manageable', 'Brainstorm ideas for a thoughtful gift', 'Break a big goal into small steps'] },
    { name: 'Explore', icon: Sparkles, prompts: ['Ask me a question that sparks a new idea', 'Help me see a familiar problem differently', 'Tell me about something interesting'] }
];

export function ChatWorkspace(props) {
    const { messages, chats, currentChat, currentChatId, userName, createNewChat, switchToChat, deleteChat, renameChat, artifacts, isArtifactOpen, setIsArtifactOpen, currentArtifactId, setCurrentArtifactId, getArtifact, isIncognitoMode, toggleIncognitoMode, persistenceError } = useChat();
    const [view, setView] = useState('chat');
    const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches && localStorage.getItem('sidebar_open') !== 'false');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState(null);
    const [showJump, setShowJump] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [notice, setNotice] = useState('');
    const scroller = useRef(null);
    const inputRef = useRef(null);
    const follow = useRef(true);
    const empty = messages.length === 0;
    const clearDraft = () => { props.setInput(''); props.setSelectedImage(null); props.setSelectedFiles([]); props.setComposerError(''); };
    const closeMobileSidebar = () => { if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); };
    const navigate = next => {
        if (next === 'chats') { setQuery(''); setSearchOpen(true); }
        else setView(next);
        closeMobileSidebar();
    };
    const newChat = () => { props.onNewChat(); clearDraft(); setView('chat'); setCategory(null); follow.current = true; closeMobileSidebar(); };
    const selectChat = id => { props.onStop(); switchToChat(id); clearDraft(); setView('chat'); setSearchOpen(false); follow.current = true; closeMobileSidebar(); };
    const example = () => { props.onStop(); createNewChat(exampleConversation); clearDraft(); setView('chat'); follow.current = true; closeMobileSidebar(); };
    const privateChat = () => { props.onStop(); toggleIncognitoMode(); setIsArtifactOpen(false); clearDraft(); setView('chat'); closeMobileSidebar(); };
    useEffect(() => {
        const onKey = event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); newChat(); }
            if (event.key === 'Escape' && window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    useEffect(() => {
        if (view !== 'chat') return;
        const element = scroller.current;
        if (element && follow.current) element.scrollTop = element.scrollHeight;
    }, [messages, props.streamingMessage, props.streamingThinking, view, currentChatId]);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 767px)');
        const resize = () => setSidebarOpen(media.matches ? false : localStorage.getItem('sidebar_open') !== 'false');
        media.addEventListener('change', resize);
        return () => media.removeEventListener('change', resize);
    }, []);
    const toggleSidebar = () => setSidebarOpen(previous => {
        const next = !previous;
        if (!window.matchMedia('(max-width: 767px)').matches) localStorage.setItem('sidebar_open', String(next));
        return next;
    });
    const filteredChats = chats.filter(chat => chat.messages.length > 0 && `${chat.title} ${chat.messages.map(message => message.content).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    const allArtifacts = isIncognitoMode ? artifacts.map(artifact => ({ ...artifact, chatId: currentChatId })) : chats.flatMap(chat => chat.artifacts.map(artifact => ({ ...artifact, chatId: chat.id })));
    const renderedStream = props.isArtifactsEnabled ? props.cleanStreamingMessage(props.streamingMessage) : { text: props.streamingMessage, artifactInFlight: false };
    const composer = <ChatComposer input={props.input} setInput={props.setInput} inputRef={inputRef} onSend={() => { follow.current = true; props.onSend(); }} onStop={props.onStop} onPaste={props.onPaste} selectedImage={props.selectedImage} onImageSelect={props.setSelectedImage} selectedFiles={props.selectedFiles} setSelectedFiles={props.setSelectedFiles} busy={props.busy} empty={empty} searchEnabled={props.isSearchEnabled} onToggleSearch={() => props.setIsSearchEnabled(!props.isSearchEnabled)} artifactsEnabled={props.isArtifactsEnabled} onToggleArtifacts={props.toggleArtifacts} onSettings={() => setSettingsOpen(true)} error={props.composerError} setError={props.setComposerError} />;
    const copyConversation = async () => {
        try { await navigator.clipboard.writeText(conversationMarkdown(currentChat)); setNotice('Conversation copied.'); }
        catch { setNotice('Clipboard is unavailable. Use Export conversation instead.'); }
    };
    return <div className="oc-workspace">
        <Sidebar open={sidebarOpen} onToggle={toggleSidebar} view={view} onNavigate={navigate} onNewChat={newChat} onCancelGeneration={props.onStop} onSelectChat={selectChat} onSettings={() => { closeMobileSidebar(); setSettingsOpen(true); }} onExample={example} onPrivateChat={privateChat} />
        <main inert={sidebarOpen && window.matchMedia('(max-width: 767px)').matches ? '' : undefined} className={`oc-main ${!empty && view === 'chat' ? 'has-conversation' : ''}`}>
            <header className="workspace-header"><div className="header-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={toggleSidebar}><PanelLeft size={20} /></button>
                {!empty && view === 'chat' && <Menu label="Conversation options" trigger={<><span className="conversation-title">{currentChat.title}</span><ChevronDown size={15} /></>}>
                    <button role="menuitem" onClick={() => { setNewTitle(currentChat.title); setRenaming(true); }}><Pencil size={16} />Rename</button>
                    <button role="menuitem" onClick={copyConversation}><Copy size={16} />Copy conversation</button>
                    <button role="menuitem" onClick={() => downloadText('conversation.md', conversationMarkdown(currentChat))}><Download size={16} />Export conversation</button>
                    <div className="menu-separator" /><button role="menuitem" className="danger-text" onClick={() => setDeleting(true)}><Trash2 size={16} />Delete chat</button>
                </Menu>}
            </div><div className="header-right">{isIncognitoMode && <span className="incognito-label"><EyeOff size={14} />Incognito</span>}<button className={`icon-button ${isIncognitoMode ? 'is-selected' : ''}`} aria-label={isIncognitoMode ? 'Leave incognito chat' : 'Start incognito chat'} title={isIncognitoMode ? 'Leave incognito chat' : 'Start incognito chat'} onClick={privateChat}><EyeOff size={19} /></button></div></header>
            {persistenceError && <div className="workspace-notice" role="alert">{persistenceError}</div>}
            {notice && <div className="workspace-notice" role="status">{notice}<button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14} /></button></div>}
            {view === 'chat' && <>
                {empty ? <div className="welcome-scroller"><section className="welcome-screen"><h1 className="welcome-greeting"><img src="/claude-logo.svg" alt="" />{userName ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${userName}` : 'What can I help you with?'}</h1>{composer}
                    <div className="starter-chips">{starters.map(item => <button key={item.name} className={category?.name === item.name ? 'is-selected' : ''} onClick={() => setCategory(category?.name === item.name ? null : item)}><item.icon size={16} />{item.name}</button>)}</div>
                    {category && <div className="starter-prompts"><div><span>{category.name}</span><button className="icon-button" aria-label="Close suggestions" onClick={() => setCategory(null)}><X size={14} /></button></div>{category.prompts.map(prompt => <button key={prompt} onClick={() => { props.setInput(prompt); inputRef.current?.focus(); }}><span>{prompt}</span><SquarePen size={15} /></button>)}</div>}
                    {isIncognitoMode && <p className="welcome-note">This conversation won’t be saved in your browser.</p>}
                </section></div> : <>
                    <div ref={scroller} className="conversation-scroller" onScroll={event => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; setShowJump(!follow.current); }}>
                        <div className="conversation-content">{messages.some(message => message.metadata?.example) && <div className="example-label">Example conversation · not an AI response</div>}
                            {messages.map((message, index) => <ChatMessage key={message.id} message={message} onEdit={content => { props.setInput(content); inputRef.current?.focus(); }} onRetry={!props.isStreaming && message.role === 'assistant' && index === messages.length - 1 ? props.onRetry : undefined} />)}
                            {props.isStreaming && (props.streamingMessage || props.streamingThinking) && <ChatMessage streaming message={{ id: 'streaming', role: 'assistant', content: renderedStream.text || '', metadata: { thinking: props.streamingThinking } }} />}
                            {props.busy && <div className="generation-status" role="status"><img src="/claude-logo.svg" alt="" className="thinking-mark" /><span>{props.toolActivity || (renderedStream.artifactInFlight ? 'Creating artifact…' : props.isSearching ? 'Searching the web…' : props.streamingMessage ? 'Responding…' : 'Thinking…')}</span><span className="loading-dots"><i /><i /><i /></span></div>}
                            {props.isSearching && <SearchProgress isSearching searchSteps={props.searchSteps} totalSources={props.searchSources.length} currentQuery={props.currentSearchQuery} />}
                        </div>
                    </div>
                    <footer className="conversation-footer">{showJump && <button className="jump-button" aria-label="Scroll to latest message" onClick={() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); follow.current = true; setShowJump(false); }}><ArrowDown size={17} /></button>}{composer}<p className="composer-footnote">Open Claude can make mistakes. Please double-check responses.</p></footer>
                </>}
            </>}
            {view === 'history' && <div className="library-scroller"><section className="chat-library"><header><h1>Your chats</h1><button className="secondary-button" onClick={newChat}><SquarePen size={16} />New chat</button></header><label className="library-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your chats" aria-label="Search your chats" /></label><div className="chat-library-list">{filteredChats.map(chat => <button key={chat.id} onClick={() => selectChat(chat.id)}><MessageSquare size={19} /><span><strong>{chat.title}</strong><small>{chat.messages.length} messages · {new Date(chat.updatedAt || chat.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span></button>)}{!filteredChats.length && <div className="library-empty"><MessageSquare size={28} /><h2>{query ? 'No matching conversations' : 'A fresh start'}</h2><p>{query ? 'Try another word or phrase.' : 'Your conversations will appear here after you send a message.'}</p></div>}</div></section></div>}
            {view === 'artifacts' && <div className="library-scroller"><section className="chat-library"><header><h1>Artifacts</h1></header><p className="library-description">Things you’ve created in your conversations.</p><div className="artifact-grid">{allArtifacts.map(artifact => <button className="artifact-card" key={`${artifact.chatId}-${artifact.id}`} onClick={() => { props.onStop(); if (!isIncognitoMode) switchToChat(artifact.chatId); setCurrentArtifactId(artifact.id); setIsArtifactOpen(true); }}><span className="artifact-icon"><Shapes size={24} /></span><span><strong>{artifact.title}</strong><small>{artifact.type}</small></span></button>)}</div>{!allArtifacts.length && <div className="library-empty"><Shapes size={32} /><h2>A space for your ideas</h2><p>Generated documents, code, and interactive previews will appear here.</p><button className="secondary-button" onClick={newChat}>Start a conversation</button></div>}</section></div>}
        </main>
        <ArtifactPanel isOpen={isArtifactOpen} onClose={() => setIsArtifactOpen(false)} artifact={getArtifact(currentArtifactId)} />
        <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onExample={example} onDataChange={() => { props.onStop(); clearDraft(); setView('chat'); follow.current = true; }} />
        <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Search chats" className="search-dialog"><div className="search-dialog-content"><label className="library-search"><Search size={19} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title or message" aria-label="Search conversations" /></label><div className="search-results">{filteredChats.map(chat => <button key={chat.id} onClick={() => selectChat(chat.id)}><MessageSquare size={18} /><span>{chat.title}<small>{chat.messages.find(message => message.content.toLowerCase().includes(query.toLowerCase()))?.content.slice(0, 100)}</small></span></button>)}{!filteredChats.length && <p className="menu-note">{query ? 'No conversations found.' : 'No saved conversations yet.'}</p>}</div></div></Dialog>
        <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename chat" className="small-dialog"><form className="dialog-content" onSubmit={event => { event.preventDefault(); renameChat(currentChatId, newTitle); setRenaming(false); }}><label className="field-label" htmlFor="conversation-name">Chat name</label><input autoFocus id="conversation-name" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={120} /><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setRenaming(false)}>Cancel</button><button className="primary-button" disabled={!newTitle.trim()}>Save</button></div></form></Dialog>
        <Dialog open={deleting} onClose={() => setDeleting(false)} title="Delete chat?" className="small-dialog"><div className="dialog-content"><p>This removes “{currentChat.title}” from this browser. It cannot be undone.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleting(false)}>Cancel</button><button className="danger-button" onClick={() => { props.onStop(); deleteChat(currentChatId); setDeleting(false); }}>Delete chat</button></div></div></Dialog>
    </div>;
}
