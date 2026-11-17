import { useEffect, useRef, useState } from 'react';
import { Plus, SlidersHorizontal, ChevronDown, ArrowUp, Square, FileText, X, Globe, Shapes, Check, Image, Settings, Loader2 } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { Menu } from './Menu';
import { validateAttachment } from '../lib/chat-ui';
import { providerName } from '../lib/llm/providers';

export function ChatComposer({ input, setInput, onSend, onStop, onPaste, selectedImage, onImageSelect, selectedFiles, setSelectedFiles, busy, empty, searchEnabled, onToggleSearch, artifactsEnabled, onToggleArtifacts, onSettings, error, setError, inputRef }) {
    const { selectedProvider, selectedModel, updateProvider, updateModel, availableModels, isLoadingModels } = useChat();
    const fileRef = useRef(null);
    const [modelQuery, setModelQuery] = useState('');
    const [dragging, setDragging] = useState(false);
    const current = availableModels[selectedProvider]?.find(model => model.id === selectedModel);
    const modelName = current?.name || selectedModel || 'Select model';
    useEffect(() => {
        const field = inputRef.current;
        if (!field) return;
        field.style.height = 'auto';
        field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
    }, [input, inputRef, empty]);
    const addFiles = async files => {
        setError('');
        for (const file of Array.from(files)) {
            const issue = validateAttachment(file);
            if (issue) { setError(issue); continue; }
            try {
                if (file.type.startsWith('image/')) {
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('Unable to read this image.'));
                        reader.readAsDataURL(file);
                    });
                    onImageSelect(dataUrl);
                } else {
                    const text = await file.text();
                    setSelectedFiles(previous => [...previous, { id: crypto.randomUUID(), name: file.name, size: file.size, text }]);
                }
            } catch (issue) { setError(issue.message); }
        }
        if (fileRef.current) fileRef.current.value = '';
    };
    return <div className={`composer-wrap ${empty ? 'composer-empty' : ''}`}>
        <div className={`oc-composer ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
            onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) addFiles(event.dataTransfer.files); }}>
            {(selectedImage || selectedFiles.length > 0) && <div className="attachment-previews">
                {selectedImage && <div className="image-attachment"><img src={selectedImage} alt="Attached image preview" /><button aria-label="Remove image" onClick={() => onImageSelect(null)}><X size={13} /></button></div>}
                {selectedFiles.map(file => <div className="file-attachment" key={file.id}><FileText size={21} /><span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB · text</small></span><button aria-label={`Remove ${file.name}`} onClick={() => setSelectedFiles(previous => previous.filter(item => item.id !== file.id))}><X size={14} /></button></div>)}
            </div>}
            <textarea ref={inputRef} value={input} onChange={event => { setInput(event.target.value); if (error) setError(''); }} onPaste={onPaste} rows={empty ? 2 : 1} placeholder={empty ? 'How can I help you today?' : 'Reply…'} aria-label="Message Open Claude"
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); } }} />
            <div className="composer-toolbar"><div className="composer-tools">
                <input ref={fileRef} className="sr-only" tabIndex={-1} type="file" aria-label="Attach files" multiple accept="image/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.log,.sql,.sh" onChange={event => addFiles(event.target.files)} disabled={busy} />
                <Menu label="Add attachments" placement={empty ? 'bottom' : 'top'} disabled={busy} trigger={<Plus size={20} />}>
                    <button role="menuitem" onClick={() => fileRef.current?.click()}><Image size={17} />Upload files or images</button><p className="menu-note">Images and text files are read in your browser.</p>
                </Menu>
                <Menu label="Composer tools" placement={empty ? 'bottom' : 'top'} disabled={busy} trigger={<SlidersHorizontal size={18} />}>
                    <button role="menuitemcheckbox" aria-checked={searchEnabled} onClick={onToggleSearch}><Globe size={17} />Web search{searchEnabled && <Check size={15} className="menu-check" />}</button>
                    <button role="menuitemcheckbox" aria-checked={artifactsEnabled} onClick={onToggleArtifacts}><Shapes size={17} />Create artifacts{artifactsEnabled && <Check size={15} className="menu-check" />}</button>
                    <div className="menu-separator" /><button role="menuitem" onClick={onSettings}><Settings size={17} />Configure providers</button>
                </Menu>
                {searchEnabled && <span className="tool-indicator"><Globe size={13} />Search</span>}
            </div><div className="composer-right">
                <Menu label="Choose model" className="model-menu" placement={empty ? 'bottom' : 'top'} align="right" disabled={busy} trigger={<><span className="model-label">{modelName}</span><ChevronDown size={14} /></>}>
                    <div className="model-search"><input autoFocus placeholder="Search models" aria-label="Search models" value={modelQuery} onChange={event => setModelQuery(event.target.value)} /></div>
                    <div className="model-options">
                        {Object.entries(availableModels).map(([provider, models]) => {
                            const filtered = models.filter(model => `${model.name} ${model.id} ${provider}`.toLowerCase().includes(modelQuery.toLowerCase()));
                            return filtered.length > 0 && <section key={provider}><div className="menu-heading">{providerName(provider)}</div>{filtered.map(model => <button role="menuitemradio" aria-checked={selectedProvider === provider && selectedModel === model.id} key={model.id} onClick={() => { updateProvider(provider); updateModel(model.id); setModelQuery(''); }}><span><strong>{model.name}</strong><small>{model.capabilities?.image ? 'Text and images' : 'Text'}{model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}K context` : ''}</small></span>{selectedProvider === provider && selectedModel === model.id && <Check size={16} />}</button>)}</section>;
                        })}
                        {!Object.entries(availableModels).some(([provider, models]) => models.some(model => `${model.name} ${model.id} ${provider}`.toLowerCase().includes(modelQuery.toLowerCase()))) && <p className="menu-note">{isLoadingModels ? 'Loading available models…' : modelQuery ? 'No matching models.' : 'Connect a provider in Settings to see available models.'}</p>}
                    </div>
                    <div className="menu-separator" /><button role="menuitem" onClick={onSettings}><Settings size={16} />Model settings{isLoadingModels && <Loader2 size={14} className="animate-spin" />}</button>
                </Menu>
                <button className={`send-button ${busy ? 'stop-button' : ''}`} onClick={busy ? onStop : onSend} disabled={!busy && !input.trim() && !selectedImage && selectedFiles.length === 0} aria-label={busy ? 'Stop generating' : 'Send message'} title={busy ? 'Stop generating' : 'Send message'}>{busy ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} />}</button>
            </div></div>
        </div>
        {error && <div className="composer-error" role="alert"><span>{error}</span><button onClick={onSettings}>Settings</button><button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
    </div>;
}
