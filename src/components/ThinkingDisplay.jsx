import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ThinkingDisplay({ thinking, duration, isStreaming = false }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const scrollContainerRef = useRef(null);
    const isUserScrolledRef = useRef(false);
    const prevThinkingLenRef = useRef(0);
    const wasStreamingRef = useRef(isStreaming);

    // Open live while thinking arrives, then fold away once the answer starts.
    useEffect(() => {
        if (isStreaming && thinking && !isExpanded) setIsExpanded(true);
    }, [isStreaming, thinking]);

    useEffect(() => {
        if (wasStreamingRef.current && !isStreaming) setIsExpanded(false);
        wasStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // Bottom-aware auto-scroll: only scroll if user is near the bottom
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !isExpanded) return;
        if (thinking && thinking.length > prevThinkingLenRef.current) {
            prevThinkingLenRef.current = thinking.length;
            if (!isUserScrolledRef.current) {
                requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
            }
        }
    }, [thinking, isExpanded]);

    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        isUserScrolledRef.current = !isAtBottom;
    }, []);

    useEffect(() => {
        if (isExpanded) {
            isUserScrolledRef.current = false;
            requestAnimationFrame(() => {
                const container = scrollContainerRef.current;
                if (container) container.scrollTop = container.scrollHeight;
            });
        }
    }, [isExpanded]);

    if (!thinking && !isStreaming) return null;

    const seconds = duration ? Math.max(1, Math.round(duration / 1000)) : null;
    const label = isStreaming ? 'Thinking…' : seconds ? `Thought for ${seconds}s` : 'Thought process';

    return (
        <div className="thinking-panel mb-3">
            <button
                onClick={() => setIsExpanded(previous => !previous)}
                className="thinking-panel-header flex items-center gap-1.5 py-1 text-left cursor-pointer"
                aria-expanded={isExpanded}
                aria-controls="thinking-content-panel"
            >
                <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="shrink-0 inline-flex">
                    <ChevronRight size={14} className="thinking-chevron" />
                </motion.span>
                <span className={`thinking-label ${isStreaming ? 'thinking-shimmer' : ''}`}>{label}</span>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && thinking && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div
                            id="thinking-content-panel"
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="thinking-scroll-container"
                            role="region"
                            aria-label="Model reasoning content"
                            aria-live="polite"
                        >
                            <div className="thinking-prose">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown>
                                {isStreaming && <span className="thinking-cursor" aria-hidden="true" />}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}