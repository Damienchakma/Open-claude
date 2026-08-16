import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Brain, Sparkles, Clock, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ThinkingDisplay({ thinking, tokens, duration, isStreaming = false, modelName }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const scrollContainerRef = useRef(null);
    const isUserScrolledRef = useRef(false);
    const prevThinkingLenRef = useRef(0);

    // Don't render if no thinking content and not streaming
    if (!thinking && !isStreaming) return null;

    // Auto-expand when streaming thinking starts arriving
    useEffect(() => {
        if (isStreaming && thinking && thinking.trim() !== '' && !isExpanded) {
            setIsExpanded(true);
        }
    }, [isStreaming, thinking]);

    // Bottom-aware auto-scroll: only scroll if user is near the bottom
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !isExpanded) return;

        // Only auto-scroll if content actually changed (new thinking arrived)
        if (thinking && thinking.length > prevThinkingLenRef.current) {
            prevThinkingLenRef.current = thinking.length;

            if (!isUserScrolledRef.current) {
                // Use requestAnimationFrame for smooth scroll after DOM update
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        }
    }, [thinking, isExpanded]);

    // Track user scroll position to enable/disable auto-scroll
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const threshold = 50; // px tolerance
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        isUserScrolledRef.current = !isAtBottom;
    }, []);

    // Reset scroll tracking when panel is toggled
    useEffect(() => {
        if (isExpanded) {
            isUserScrolledRef.current = false;
            // Scroll to bottom when first opened
            requestAnimationFrame(() => {
                const container = scrollContainerRef.current;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        }
    }, [isExpanded]);

    // Calculate display metrics
    const displayCount = tokens || thinking?.length || 0;
    const countLabel = tokens ? `${tokens.toLocaleString()} tokens` : `${displayCount.toLocaleString()} chars`;

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
        <div className="thinking-panel mb-4 rounded-xl overflow-hidden border border-[var(--thinking-border)] bg-[var(--thinking-bg)]">
            {/* Header / Toggle Button */}
            <button
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                className="thinking-panel-header w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[var(--thinking-hover)] transition-all duration-200 text-left group cursor-pointer"
                aria-expanded={isExpanded}
                aria-controls="thinking-content-panel"
                aria-label={isExpanded ? 'Hide thinking process' : 'Show thinking process'}
            >
                {/* Chevron */}
                <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="shrink-0"
                >
                    <ChevronRight size={15} className="text-[var(--thinking-accent)]" />
                </motion.div>

                {/* Icon */}
                {isStreaming && thinking ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="shrink-0"
                    >
                        <Sparkles size={15} className="text-[var(--thinking-accent)]" />
                    </motion.div>
                ) : (
                    <Brain size={15} className="text-[var(--thinking-accent)] shrink-0" />
                )}

                {/* Label */}
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--thinking-text)]">
                        {isStreaming && thinking ? 'Thinking...' : (isExpanded ? 'Hide reasoning' : 'Show reasoning')}
                    </span>
                    {!isExpanded && thinking && !isStreaming && (
                        <span className="text-xs text-[var(--thinking-muted)] ml-2">
                            — click to expand
                        </span>
                    )}
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 shrink-0">
                    {modelName && (
                        <span className="thinking-badge text-[var(--thinking-muted)]">
                            {modelName}
                        </span>
                    )}
                    {thinking && displayCount > 0 && !isStreaming && (
                        <span className="thinking-badge text-[var(--thinking-accent)]">
                            <Zap size={11} className="inline -mt-px" />
                            {' '}{countLabel}
                        </span>
                    )}
                    {duration && !isStreaming && (
                        <span className="thinking-badge text-[var(--thinking-muted)]">
                            <Clock size={11} className="inline -mt-px" />
                            {' '}{formatDuration(duration)}
                        </span>
                    )}
                    {isStreaming && thinking && (
                        <span className="thinking-badge text-[var(--thinking-accent)]">
                            <span className="thinking-live-dot" />
                            Live
                        </span>
                    )}
                </div>
            </button>

            {/* Expandable Content Panel */}
            <AnimatePresence initial={false}>
                {isExpanded && thinking && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div
                            id="thinking-content-panel"
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="thinking-scroll-container border-t border-[var(--thinking-border)]"
                            role="region"
                            aria-label="Model reasoning content"
                            aria-live="polite"
                        >
                            <div className="p-4">
                                <div className="prose prose-sm max-w-none thinking-prose">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {thinking}
                                    </ReactMarkdown>
                                </div>
                                {/* Streaming cursor */}
                                {isStreaming && (
                                    <span className="thinking-cursor" aria-hidden="true" />
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
