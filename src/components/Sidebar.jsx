import { useEffect, useRef, useState } from 'react';
import { PanelLeft, SquarePen, Search, MessageSquare, Shapes, MoreHorizontal, Pencil, Trash2, Settings, ChevronDown, EyeOff, Download, FlaskConical } from 'lucide-react';
import { Menu } from './Menu';
import { Dialog } from './Dialog';
import { useChat } from '../context/ChatContext';
import { conversationMarkdown, downloadText } from '../lib/chat-ui';

export function Sidebar({ open, onToggle, view, onNavigate, onNewChat, onCancelGeneration, onSelectChat, onSettings, onExample, onPrivateChat }) {
    const { chats, currentChatId, userName, renameChat, deleteChat, isIncognitoMode } = useChat();
    const [editing, setEditing] = useState(null);
    const [title, setTitle] = useState('');
    const [deleting, setDeleting] = useState(null);
    const sidebar = useRef(null);
    useEffect(() => {
        if (!open || !window.matchMedia('(max-width: 767px)').matches) return;
        const previous = document.activeElement;
        sidebar.current.querySelector('button')?.focus();
        const trap = event => {
            if (event.key !== 'Tab' || document.querySelector('dialog[open], [role="menu"]')) return;
            const items = [...sidebar.current.querySelectorAll('button:not(:disabled)')].filter(item => item.getClientRects().length);
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
        };
        document.addEventListener('keydown', trap);
        return () => { document.removeEventListener('keydown', trap); if (previous.isConnected && !document.querySelector('dialog[open]')) previous.focus(); };
    }, [open]);
    const recents = chats.filter(chat => chat.messages.length > 0).slice(0, 30);
    return <>
        {open && <button className="sidebar-scrim" onClick={onToggle} aria-label="Close navigation" />}
        <aside ref={sidebar} className={`oc-sidebar ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Main navigation">
            <div className="sidebar-heading">
                <button className="wordmark" onClick={onNewChat} aria-label="Open Claude home">Open Claude</button>
                <button className="icon-button" onClick={onToggle} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'} title={open ? 'Collapse sidebar' : 'Expand sidebar'}><PanelLeft size={19} /></button>
            </div>
            <nav className="sidebar-nav">
                <button className="nav-item nav-new" onClick={onNewChat} title="New chat"><SquarePen size={18} /><span>New chat</span><kbd>Ctrl K</kbd></button>
                <button className={`nav-item ${view === 'chats' ? 'is-active' : ''}`} onClick={() => onNavigate('chats')} title="Search chats"><Search size={18} /><span>Search chats</span></button>
                <button className={`nav-item ${view === 'history' ? 'is-active' : ''}`} onClick={() => onNavigate('history')} title="Chats"><MessageSquare size={18} /><span>Chats</span></button>
                <button className={`nav-item ${view === 'artifacts' ? 'is-active' : ''}`} onClick={() => onNavigate('artifacts')} title="Artifacts"><Shapes size={18} /><span>Artifacts</span></button>
            </nav>
            <div className="sidebar-recents"><h2>Recents</h2>
                <div className="recent-list">{recents.map(chat => <div key={chat.id} className={`recent-row ${!isIncognitoMode && chat.id === currentChatId && view === 'chat' ? 'is-active' : ''}`}>
                    <button className="recent-title" onClick={() => onSelectChat(chat.id)} title={chat.title}>{chat.title}</button>
                    <Menu label={`Options for ${chat.title}`} trigger={<MoreHorizontal size={17} />} align="right" className="recent-menu">
                        <button role="menuitem" onClick={() => { setEditing(chat); setTitle(chat.title); }}><Pencil size={16} />Rename</button>
                        <button role="menuitem" onClick={() => downloadText('conversation.md', conversationMarkdown(chat))}><Download size={16} />Export conversation</button>
                        <div className="menu-separator" />
                        <button role="menuitem" className="danger-text" onClick={() => setDeleting(chat)}><Trash2 size={16} />Delete</button>
                    </Menu>
                </div>)}{!recents.length && <p className="sidebar-empty">Your conversations will appear here.</p>}</div>
            </div>
            <div className="sidebar-profile">
                <Menu label="Account menu" placement="top" trigger={<><span className="avatar">{(userName || 'You').slice(0, 2).toUpperCase()}</span><span className="profile-name">{userName || 'Your workspace'}<small>Local workspace</small></span><ChevronDown size={15} /></>}>
                    <div className="menu-heading">Open Claude</div>
                    <button role="menuitem" onClick={onSettings}><Settings size={17} />Settings</button>
                    <button role="menuitem" onClick={onPrivateChat}><EyeOff size={17} />{isIncognitoMode ? 'Leave incognito chat' : 'Start incognito chat'}</button>
                    <button role="menuitem" onClick={onExample}><FlaskConical size={17} />View example conversation</button>
                    <div className="menu-separator" /><p className="menu-note">Independent open-source interface.<br />Not affiliated with Anthropic.</p>
                </Menu>
            </div>
        </aside>
        <Dialog open={!!editing} onClose={() => setEditing(null)} title="Rename chat" className="small-dialog">
            <form className="dialog-content" onSubmit={event => { event.preventDefault(); renameChat(editing.id, title); setEditing(null); }}>
                <label className="field-label" htmlFor="chat-title">Chat name</label><input autoFocus id="chat-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} />
                <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={!title.trim()}>Save</button></div>
            </form>
        </Dialog>
        <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete chat?" className="small-dialog">
            <div className="dialog-content"><p>“{deleting?.title}” will be removed from this browser. This cannot be undone.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button><button className="danger-button" onClick={() => { if (deleting.id === currentChatId) onCancelGeneration(); deleteChat(deleting.id); setDeleting(null); }}>Delete chat</button></div></div>
        </Dialog>
    </>;
}
