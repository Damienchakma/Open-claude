import React, { useState, useEffect } from 'react';
import { X, Key, Globe, RefreshCw, ChevronDown, Check, Cpu, Wifi, WifiOff, User, Sparkles, Terminal, Sliders, RotateCcw } from 'lucide-react';
import { useChat } from '../context/ChatContext';

export function SettingsModal({ isOpen, onClose }) {
    const {
        apiKeys,
        updateApiKey,
        selectedProvider,
        selectedModel,
        updateProvider,
        updateModel,
        availableModels,
        isLoadingModels,
        refreshModels,
        userName,
        setUserName,
        customSystemPrompt,
        setCustomSystemPrompt
    } = useChat();

    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [editingName, setEditingName] = useState('');
    const [editingPrompt, setEditingPrompt] = useState('');

    // Sync editing fields when modal opens
    useEffect(() => {
        if (isOpen) {
            setEditingName(userName || '');
            setEditingPrompt(customSystemPrompt || '');
        }
    }, [isOpen, userName, customSystemPrompt]);

    if (!isOpen) return null;

    const providers = [
        { id: 'groq', name: 'Groq', needsKey: true, color: 'orange' },
        { id: 'openai', name: 'OpenAI', needsKey: true, color: 'green' },
        { id: 'gemini', name: 'Gemini', needsKey: true, color: 'blue' },
        { id: 'ollama', name: 'Ollama', needsKey: false, color: 'purple', local: true },
        { id: 'lmstudio', name: 'LM Studio', needsKey: false, color: 'pink', local: true }
    ];

    const currentProviderModels = availableModels[selectedProvider] || [];
    const hasModels = currentProviderModels.length > 0;
    const selectedModelObj = currentProviderModels.find(m => m.id === selectedModel);

    const handleSaveName = () => {
        if (editingName.trim() !== userName) {
            setUserName(editingName.trim());
        }
    };

    const handleSavePrompt = (val) => {
        const valueToSave = val !== undefined ? val : editingPrompt;
        setCustomSystemPrompt(valueToSave);
    };

    const PROMPT_PRESETS = [
        {
            name: 'Default',
            icon: '✨',
            prompt: ''
        },
        {
            name: 'Senior Architect',
            icon: '💻',
            prompt: 'You are a senior software architect. Provide clean, modular, and production-ready code with concise explanations. Point out potential edge cases and performance considerations.'
        },
        {
            name: 'Deep Researcher',
            icon: '🔬',
            prompt: 'You are an objective, thorough research scientist. Provide detailed, well-structured analytical breakdowns with clear citations, nuanced arguments, and critical evaluations.'
        },
        {
            name: 'Concise & Fast',
            icon: '⚡',
            prompt: 'Be extremely concise, direct, and factual. Skip conversational fluff and pleasantries. Use bullet points and direct solutions.'
        }
    ];

    const applyPreset = (presetPrompt) => {
        setEditingPrompt(presetPrompt);
        handleSavePrompt(presetPrompt);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-[var(--bg-primary)] w-full max-w-2xl rounded-2xl border border-[var(--border)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 md:p-6 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-medium text-[var(--text-primary)]">Settings</h2>
                            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Manage your profile and preferences</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-5 md:p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Profile Section */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                            <User size={16} className="text-[var(--accent)]" />
                            Your Name
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={handleSaveName}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveName();
                                        e.target.blur();
                                    }
                                }}
                                className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all duration-200 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                                placeholder="Enter your name..."
                            />
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">This name will be used in greetings and can be referenced by AI models.</p>
                    </div>

                    {/* Provider Selection */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-[var(--text-primary)]">
                                Provider
                            </label>
                            <button
                                onClick={refreshModels}
                                disabled={isLoadingModels}
                                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:opacity-50 transition-colors">
                                <RefreshCw size={14} className={isLoadingModels ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                            {providers.map(provider => {
                                const models = availableModels[provider.id] || [];
                                const isAvailable = provider.needsKey ? !!apiKeys[provider.id] : models.length > 0;
                                const isSelected = selectedProvider === provider.id;

                                return (
                                    <button
                                        key={provider.id}
                                        onClick={() => isAvailable && updateProvider(provider.id)}
                                        disabled={!isAvailable}
                                        className={`p-3.5 rounded-lg border transition-colors relative ${isSelected
                                            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                            : 'border-[var(--border)] hover:border-[var(--accent)]/30'
                                            } ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}>
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`w-9 h-9 rounded-full bg-${provider.color}-500/20 flex items-center justify-center`}>
                                                {provider.local ? (
                                                    isAvailable ? <Wifi size={18} className={`text-${provider.color}-500`} /> : <WifiOff size={18} className="text-gray-500" />
                                                ) : (
                                                    <Globe size={18} className={isAvailable ? `text-${provider.color}-500` : 'text-gray-500'} />
                                                )}
                                            </div>
                                            <span className="font-medium text-sm text-[var(--text-primary)]">{provider.name}</span>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-4 h-4 bg-[var(--accent)] rounded-full flex items-center justify-center">
                                                    <Check size={10} className="text-white" />
                                                </div>
                                            )}
                                            {provider.local && (
                                                <span className="text-xs text-[var(--text-tertiary)]">
                                                    {isAvailable ? `${models.length} models` : 'Offline'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-[var(--text-primary)]">
                            Model
                        </label>

                        {hasModels ? (
                            <div className="relative">
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between hover:border-[var(--accent)] focus:border-[var(--accent)] transition-colors cursor-pointer">
                                    <span className="text-[var(--text-primary)] flex items-center gap-2">
                                        <span>{selectedModelObj ? selectedModelObj.name : 'Select a model'}</span>
                                        {selectedModelObj?.capabilities?.image && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                                📷 Vision
                                            </span>
                                        )}
                                    </span>
                                    <ChevronDown size={20} className="text-[var(--text-secondary)]" />
                                </button>

                                {showModelDropdown && (
                                    <div className="absolute top-full mt-2 w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl max-h-60 overflow-y-auto z-10">
                                        {currentProviderModels.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => {
                                                    updateModel(model.id);
                                                    setShowModelDropdown(false);
                                                }}
                                                className={`w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-between cursor-pointer ${model.id === selectedModel ? 'bg-[var(--accent)]/10' : ''
                                                    }`}
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-[var(--text-primary)]">{model.name}</span>
                                                        {model.capabilities?.image && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                                                📷 Vision
                                                            </span>
                                                        )}
                                                    </div>
                                                    {model.contextWindow && (
                                                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                            Context: {(model.contextWindow / 1000).toFixed(0)}K tokens
                                                        </div>
                                                    )}
                                                </div>
                                                {model.id === selectedModel && (
                                                    <Check size={18} className="text-[var(--accent)]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="px-4 py-8 rounded-xl border border-dashed border-[var(--border)] text-center">
                                <p className="text-sm text-[var(--text-secondary)]">
                                    {selectedProvider === 'ollama' || selectedProvider === 'lmstudio'
                                        ? `Start ${selectedProvider === 'ollama' ? 'Ollama' : 'LM Studio'} to see available models`
                                        : 'Add an API key to see available models'
                                    }
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Custom System Prompt Section */}
                    <div className="space-y-3 pt-4 border-t border-[var(--border)]">
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                <Terminal size={16} className="text-[var(--accent)]" />
                                Custom System Prompt
                            </label>
                            {editingPrompt && (
                                <button
                                    onClick={() => applyPreset('')}
                                    className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                                    title="Reset to default system prompt"
                                >
                                    <RotateCcw size={12} />
                                    <span>Reset to default</span>
                                </button>
                            )}
                        </div>

                        {/* Presets */}
                        <div className="flex flex-wrap gap-2">
                            {PROMPT_PRESETS.map(preset => {
                                const isSelected = editingPrompt.trim() === preset.prompt.trim();
                                return (
                                    <button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset.prompt)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                                            isSelected
                                                ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] font-semibold shadow-2xs'
                                                : 'bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                                        }`}
                                    >
                                        <span>{preset.icon}</span>
                                        <span>{preset.name}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <textarea
                            rows={3}
                            value={editingPrompt}
                            onChange={(e) => {
                                setEditingPrompt(e.target.value);
                                handleSavePrompt(e.target.value);
                            }}
                            onBlur={() => handleSavePrompt()}
                            placeholder="Add custom instructions, persona, tone, or specific formatting rules for the AI..."
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all duration-200 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed resize-y min-h-[90px]"
                        />
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                            These instructions will be prepended to all queries alongside Open Claude's real-time date/time awareness and interactive code tools.
                        </p>
                    </div>

                    {/* API Keys */}
                    <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">API Keys</h3>

                        {/* Show only relevant API key inputs */}
                        {['openai', 'groq', 'gemini', 'tavily'].map(provider => (
                            <div key={provider} className="space-y-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                    <Key size={16} className="text-[var(--accent)]" />
                                    {provider === 'tavily' ? 'Tavily (Web Search)' : provider.charAt(0).toUpperCase() + provider.slice(1)}
                                </label>
                                <input
                                    type="password"
                                    value={apiKeys[provider]}
                                    onChange={(e) => updateApiKey(provider, e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all duration-200 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                                    placeholder={`Enter ${provider} API key...`}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 md:p-6 border-t border-[var(--border)] flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-md font-medium transition-colors">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
