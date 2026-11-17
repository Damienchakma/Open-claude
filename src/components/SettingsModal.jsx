import { useEffect, useRef, useState } from 'react';
import { User, Palette, SlidersHorizontal, Cable, Database, Info, RefreshCw, Download, Upload, Trash2, Eye, EyeOff, Check, Plug, Plus } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { Dialog } from './Dialog';
import { downloadText } from '../lib/chat-ui';
import { PROVIDERS, providerInfo, providerName, keyProviders } from '../lib/llm/providers';
import { loadMcpServers, saveMcpServers, McpClient } from '../lib/mcp';

const tabs = [
    { id: 'general', label: 'General', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'personalization', label: 'Personalization', icon: SlidersHorizontal },
    { id: 'connections', label: 'Connections', icon: Cable },
    { id: 'mcp', label: 'MCP servers', icon: Plug },
    { id: 'data', label: 'Data controls', icon: Database },
    { id: 'about', label: 'About', icon: Info }
];
const keyUrl = provider => provider === 'tavily' ? 'https://app.tavily.com' : providerInfo(provider)?.keyUrl;

export function SettingsModal({ isOpen, onClose, onExample, onDataChange }) {
    const { apiKeys, updateApiKey, customBaseUrl, setCustomBaseUrl, selectedProvider, selectedModel, updateProvider, updateModel, availableModels, isLoadingModels, refreshModels, userName, setUserName, customSystemPrompt, setCustomSystemPrompt, chats, importChats, deleteAllChats } = useChat();
    const { theme, setTheme } = useTheme();
    const [tab, setTab] = useState('general');
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [keys, setKeys] = useState({});
    const [baseUrl, setBaseUrl] = useState('');
    const [visibleKey, setVisibleKey] = useState(null);
    const [notice, setNotice] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [servers, setServers] = useState([]);
    const [mcpName, setMcpName] = useState('');
    const [mcpUrl, setMcpUrl] = useState('');
    const [mcpStatus, setMcpStatus] = useState({});
    const importRef = useRef(null);
    useEffect(() => {
        if (isOpen) { setName(userName); setPrompt(customSystemPrompt); setKeys(apiKeys); setBaseUrl(customBaseUrl); setNotice(''); setVisibleKey(null); setServers(loadMcpServers()); setMcpStatus({}); setMcpName(''); setMcpUrl(''); }
    }, [isOpen]);
    const persistServers = next => {
        setServers(next);
        try { saveMcpServers(next); } catch { setNotice('Browser storage is unavailable or full. MCP servers could not be saved.'); }
    };
    const addServer = () => {
        const name = mcpName.trim();
        const url = mcpUrl.trim();
        if (!name) { setNotice('Give the MCP server a name.'); return; }
        if (!/^https?:\/\//i.test(url)) { setNotice('The MCP server URL must start with http:// or https://.'); return; }
        persistServers([...servers, { id: `mcp-${Date.now()}`, name: name.slice(0, 40), url, enabled: true }]);
        setMcpName(''); setMcpUrl(''); setNotice('');
    };
    const testServer = async server => {
        setMcpStatus(previous => ({ ...previous, [server.id]: { state: 'testing', message: 'Testing…' } }));
        try {
            const client = new McpClient(server.url, { headers: server.headers || {} });
            const signal = AbortSignal.timeout(15000);
            await client.connect(signal);
            const tools = await client.listTools(signal);
            setMcpStatus(previous => ({ ...previous, [server.id]: { state: 'ok', message: `Connected · ${tools.length} tool${tools.length === 1 ? '' : 's'}${tools.length ? `: ${tools.map(tool => tool.name).join(', ')}` : ''}` } }));
        } catch (error) {
            setMcpStatus(previous => ({ ...previous, [server.id]: { state: 'error', message: error.name === 'TimeoutError' ? 'Timed out after 15 s. Is the server running and reachable from this browser?' : error.message } }));
        }
    };
    const save = () => {
        try {
            const url = baseUrl.trim();
            if (url && !/^https?:\/\//i.test(url)) { setNotice('The custom base URL must start with http:// or https://.'); return; }
            setUserName(name.trim().slice(0, 80));
            setCustomSystemPrompt(prompt);
            if (url !== customBaseUrl) setCustomBaseUrl(url);
            Object.entries(keys).forEach(([provider, key]) => { if (key !== apiKeys[provider]) updateApiKey(provider, key.trim()); });
            setNotice('Changes saved in this browser.');
        } catch { setNotice('Browser storage is unavailable or full. These changes could not be saved.'); }
    };
    const importFile = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            if (file.size > 10 * 1024 * 1024) throw new Error('Choose a chat export under 10 MB.');
            const imported = JSON.parse(await file.text());
            onDataChange?.();
            importChats(imported);
            setNotice('Conversations imported. Existing chats were kept.');
        } catch (error) { setNotice(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message); }
        event.target.value = '';
    };
    return <>
        <Dialog open={isOpen} onClose={onClose} title="Settings" className="settings-dialog">
            <div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'is-active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => { setTab(item.id); setNotice(''); }}><item.icon size={17} />{item.label}</button>)}</nav>
                <div className="settings-content"><h3>{tabs.find(item => item.id === tab).label}</h3>
                    {tab === 'general' && <>
                        <div className="settings-field"><label htmlFor="profile-name">What should Open Claude call you?</label><input id="profile-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="Your name" /><p>This name is used in your greeting and custom conversations.</p></div>
                        <div className="settings-row"><div><strong>Workspace</strong><p>Frontend-only. Your conversations are saved locally in this browser.</p></div><span className="neutral-badge">Local</span></div>
                        <div className="settings-row"><div><strong>Try the interface</strong><p>A labelled example with markdown, code, and realistic message layouts. No generated response.</p></div><button className="secondary-button" onClick={() => { onExample?.(); onClose(); }}>View example</button></div>
                    </>}
                    {tab === 'appearance' && <>
                        <div className="settings-field"><label>Color theme</label><p>Choose how Open Claude looks on your device.</p><div className="theme-options">{['light', 'dark', 'system'].map(mode => <button className={`theme-option ${theme === mode ? 'is-selected' : ''}`} key={mode} aria-pressed={theme === mode} onClick={() => setTheme(mode)}><span className={`theme-preview preview-${mode}`}><i /><i /><i /></span><span>{mode.charAt(0).toUpperCase() + mode.slice(1)}{theme === mode && <Check size={14} />}</span></button>)}</div></div>
                        <p className="settings-hint">Animations respect your device’s reduced-motion preference.</p>
                    </>}
                    {tab === 'personalization' && <div className="settings-field"><label htmlFor="custom-instructions">Custom instructions</label><p>Tell your chosen model about the tone, format, or context you prefer.</p><textarea id="custom-instructions" rows={8} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="For example: keep explanations concise and include practical examples." /><button className="text-button" onClick={() => setPrompt('')}>Reset instructions</button></div>}
                    {tab === 'connections' && <>
                        <div className="settings-field"><label htmlFor="provider">Model provider</label><select id="provider" value={selectedProvider} onChange={event => updateProvider(event.target.value)}>{PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
                        {selectedProvider === 'custom' && <div className="settings-field"><label htmlFor="custom-base-url">Base URL</label><input id="custom-base-url" type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://your-server.example/v1" spellCheck="false" /><p>Any server that implements the OpenAI <code>/chat/completions</code> and <code>/models</code> endpoints and allows browser (CORS) requests.</p></div>}
                        <div className="settings-field"><div className="field-heading"><label htmlFor="settings-model">Model</label><button className="text-button" onClick={refreshModels} disabled={isLoadingModels}><RefreshCw size={14} className={isLoadingModels ? 'animate-spin' : ''} />{isLoadingModels ? 'Refreshing…' : 'Refresh models'}</button></div>
                            {availableModels[selectedProvider]?.length ? <select id="settings-model" value={selectedModel} onChange={event => updateModel(event.target.value)}><option value="" disabled>Select a model</option>{availableModels[selectedProvider].map(model => <option value={model.id} key={model.id}>{model.name}</option>)}</select> : <input id="settings-model" value={selectedModel} onChange={event => updateModel(event.target.value)} placeholder="Enter a model ID" />}
                            <p>Choose an available model, or enter an ID supported by your provider.</p></div>
                        <div className="settings-warning">API keys are stored in this browser. Requests go directly to your selected provider; use credentials appropriate for client-side access. Local providers need to be running with browser access enabled.</div>
                        {[...(keyProviders.includes(selectedProvider) ? [selectedProvider] : []), 'tavily'].map(provider => <div className="settings-field" key={provider}><div className="field-heading"><label htmlFor={`key-${provider}`}>{provider === 'tavily' ? 'Tavily (web search)' : providerName(provider)} API key{provider === 'custom' && ' (optional)'}</label>{keyUrl(provider) && <a className="text-button" href={keyUrl(provider)} target="_blank" rel="noopener noreferrer">Get a key</a>}</div><div className="key-field"><input id={`key-${provider}`} type={visibleKey === provider ? 'text' : 'password'} value={keys[provider] || ''} onChange={event => setKeys(previous => ({ ...previous, [provider]: event.target.value }))} autoComplete="off" spellCheck="false" placeholder="Not configured" /><button className="icon-button" aria-label={`${visibleKey === provider ? 'Hide' : 'Show'} ${provider} key`} onClick={() => setVisibleKey(visibleKey === provider ? null : provider)}>{visibleKey === provider ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>)}
                        <p className="settings-hint">Configured: {keyProviders.filter(provider => apiKeys[provider]).map(providerName).join(', ') || 'none yet'}. Switch providers above to add more keys; each key is saved separately.</p>
                    </>}
                    {tab === 'mcp' && <>
                        <div className="settings-field"><label>Connected servers</label><p>Tools from these servers are offered to your model during chat. A browser can only reach MCP servers that speak Streamable HTTP (or SSE) and allow cross-origin requests; stdio-only servers need an HTTP bridge such as mcp-proxy, or a hosted remote endpoint.</p>
                            {servers.length ? servers.map(server => <div className="settings-row" key={server.id}>
                                <div><strong>{server.name}{server.enabled === false && <span className="neutral-badge">Disabled</span>}</strong><p className="mcp-url">{server.url}</p>{mcpStatus[server.id] && <p className={mcpStatus[server.id].state === 'error' ? 'danger-text' : 'settings-hint'} role="status">{mcpStatus[server.id].message}</p>}</div>
                                <div className="mcp-server-actions">
                                    <button className="text-button" onClick={() => testServer(server)} disabled={mcpStatus[server.id]?.state === 'testing'}>{mcpStatus[server.id]?.state === 'testing' ? 'Testing…' : 'Test'}</button>
                                    <button className="text-button" aria-pressed={server.enabled !== false} onClick={() => persistServers(servers.map(item => item.id === server.id ? { ...item, enabled: item.enabled === false } : item))}>{server.enabled !== false ? 'Disable' : 'Enable'}</button>
                                    <button className="icon-button" aria-label={`Remove ${server.name}`} onClick={() => persistServers(servers.filter(item => item.id !== server.id))}><Trash2 size={16} /></button>
                                </div>
                            </div>) : <p className="settings-hint">No MCP servers yet. Add one below.</p>}
                        </div>
                        <div className="settings-field"><label htmlFor="mcp-name">Add a server</label><input id="mcp-name" value={mcpName} onChange={event => setMcpName(event.target.value)} maxLength={40} placeholder="Server name, e.g. Filesystem" /><input id="mcp-url" type="url" value={mcpUrl} onChange={event => setMcpUrl(event.target.value)} placeholder="https://your-server.example/mcp" spellCheck="false" aria-label="MCP server URL" /><button className="secondary-button" onClick={addServer}><Plus size={16} />Add server</button><p>Saved immediately in this browser. Tool calling is supported with OpenAI-compatible providers and Anthropic; other providers ignore MCP tools.</p></div>
                    </>}
                    {tab === 'data' && <>
                        <div className="settings-row"><div><strong>Export your conversations</strong><p>Download a local backup. API keys are not included.</p></div><button className="secondary-button" onClick={() => downloadText('open-claude-chats.json', JSON.stringify(chats, null, 2), 'application/json')}><Download size={16} />Export</button></div>
                        <div className="settings-row"><div><strong>Import conversations</strong><p>Add chats from an Open Claude JSON export without replacing existing conversations.</p></div><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={16} />Import</button><input ref={importRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Import conversations file" onChange={importFile} /></div>
                        <div className="settings-row"><div><strong>Delete all conversations</strong><p>Permanently remove saved chats from this browser.</p></div><button className="secondary-button danger-text" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />Delete all</button></div>
                    </>}
                    {tab === 'about' && <div className="about-settings"><img src="/claude-logo.svg" alt="" /><h4>Open Claude</h4><p>An independent, open-source chat interface inspired by Claude. Not affiliated with or endorsed by Anthropic.</p><p>No subscription, billing, or artificial usage restrictions. Real responses require a configured provider; provider policies and charges still apply.</p></div>}
                    {notice && <p className="settings-notice" role="status">{notice}</p>}
                </div>
            </div>
            <footer className="settings-footer"><span>Saved on this device</span><button className="primary-button" onClick={save}>Save changes</button></footer>
        </Dialog>
        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all conversations?" className="small-dialog"><div className="dialog-content"><p>This cannot be undone. Export a backup first if you want to keep your conversations.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger-button" onClick={() => { onDataChange?.(); deleteAllChats(); setConfirmDelete(false); setNotice('Saved conversations deleted.'); }}>Delete all</button></div></div></Dialog>
    </>;
}
