import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Brain, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ThinkingDisplay({ thinking, tokens, duration, isStreaming = false }) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Don't render if no thinking content
    if (!thinking && !isStreaming) return null;

    // Calculate character count if tokens not provided
    const displayCount = tokens || thinking?.length || 0;
    const countLabel = tokens ? `${tokens} tokens` : `${displayCount} chars`;
    const previewText = thinking
        ? thinking.trim().replace(/\s+/g, ' ').slice(0, 140)
        : '';
    const previewLabel = previewText ? `${previewText}${thinking.length > 140 ? '…' : ''}` : '';

    // Format duration (milliseconds to seconds)
    const formatDuration = (ms) => {
        if (!ms) return null;
        const seconds = (ms / 1000).toFixed(1);
        return `${seconds}s`;
    };

    const handleToggle = () => {
        setIsExpanded(!isExpanded);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
        }
    };

    return (
        <div className="thinking-container mb-3 rounded-lg overflow-hidden border border-purple-200 dark:border-purple-900/30 bg-gradient-to-br from-indigo-50/60 via-purple-50/40 to-pink-50/30 dark:from-indigo-950/30 dark:via-purple-950/25 dark:to-pink-950/20 shadow-sm">
            <button
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                className="thinking-header w-full flex items-center gap-2.5 p-3 hover:bg-purple-100/40 dark:hover:bg-purple-900/20 transition-all duration-200 text-left group"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Hide thinking process' : 'Show thinking process'}
                disabled={isStreaming && !thinking}
            >
                <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="shrink-0"
                >
                    <ChevronRight size={16} className="text-purple-600 dark:text-purple-400" />
                </motion.div>

                {isStreaming && !thinking ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="shrink-0"
                    >
                        <Sparkles size={16} className="text-purple-500 dark:text-purple-400" />
                    </motion.div>
                ) : (
                    <Brain size={16} className="text-purple-500 dark:text-purple-400 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-200">
                        {isStreaming && !thinking ? 'Reasoning in progress…' : 'Reasoning'}
                    </span>
                    {!isExpanded && thinking && (
                        <div className="text-xs text-purple-600/70 dark:text-purple-400/70 truncate mt-0.5">
                            {previewLabel || 'Click to expand reasoning'}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {!isStreaming && (
                        <span className="text-xs text-purple-600/70 dark:text-purple-400/70">
                            {isExpanded ? 'Hide' : 'Show'}
                        </span>
                    )}
                    {thinking && displayCount > 0 && (
                        <span className="px-2 py-0.5 bg-purple-200/60 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                            {countLabel}
                        </span>
                    )}
                    {duration && (
                        <span className="text-xs text-purple-600/70 dark:text-purple-400/70">
                            {formatDuration(duration)}
                        </span>
                    )}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && thinking && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="thinking-content border-t border-purple-200/60 dark:border-purple-800/30 p-4 bg-white/40 dark:bg-gray-900/20">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {thinking}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
