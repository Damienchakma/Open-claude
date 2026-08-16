import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, CheckCircle, Loader2, Globe, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * StitchMCP Style Search Progress component ("Claude - Refined Search Progress UI")
 * Displays search steps in a clean paper card with step indicators and step line connector.
 */
export function SearchProgress({
    isSearching,
    searchSteps = [],
    totalSources = 0,
    currentQuery = '',
    onComplete
}) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!isSearching && searchSteps.length === 0) return null;

    const isComplete = !isSearching && searchSteps.length > 0;
    const stepCount = searchSteps.length + (isSearching && currentQuery ? 1 : 0);

    return (
        <div className="search-progress-container my-4 font-serif">
            <div className="border border-[var(--border-light)] rounded-2xl bg-[var(--bg-secondary)] overflow-hidden shadow-sm transition-all">
                {/* Expandable Header */}
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]/60 cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors text-left"
                >
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                        {isSearching ? (
                            <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                        ) : (
                            <CheckCircle size={16} className="text-[var(--accent)]" />
                        )}
                        <span className="font-serif text-[15px] font-medium text-[var(--text-primary)]">
                            {isSearching
                                ? `Searching web... (${stepCount} ${stepCount === 1 ? 'step' : 'steps'})`
                                : `${stepCount} ${stepCount === 1 ? 'step' : 'steps'} completed`}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs font-sans">
                        {totalSources > 0 && (
                            <span className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2.5 py-0.5 rounded-full font-medium">
                                {totalSources} {totalSources === 1 ? 'result' : 'results'}
                            </span>
                        )}
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </button>

                {/* Steps Details */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="px-6 py-4 space-y-4 font-serif">
                                {searchSteps.map((step, index) => (
                                    <div
                                        key={index}
                                        className={`flex flex-col gap-1 ${index > 0 ? 'pl-6 relative border-t border-[var(--border)]/40 pt-3' : ''}`}
                                    >
                                        {/* Step connecting line indicator */}
                                        {index > 0 && (
                                            <div className="absolute left-2 top-0 bottom-3 w-px bg-[var(--border)]" />
                                        )}

                                        <div className="flex items-center justify-between group">
                                            <div className="flex items-center gap-3 text-[var(--text-primary)] relative">
                                                {index > 0 && (
                                                    <div className="absolute left-[-21px] w-2 h-2 rounded-full bg-[var(--accent)]/60" />
                                                )}
                                                <Search size={16} className="text-[var(--accent)] shrink-0" />
                                                <span className="text-[15px] font-medium leading-snug">
                                                    "{step.query || step.optimizedQuery}"
                                                </span>
                                            </div>

                                            {step.sourcesFound !== undefined && (
                                                <span className="text-xs font-sans text-[var(--text-tertiary)] bg-[var(--bg-primary)] px-2 py-0.5 rounded border border-[var(--border)]">
                                                    {step.sourcesFound} {step.sourcesFound === 1 ? 'source' : 'sources'}
                                                </span>
                                            )}
                                        </div>

                                        {step.reason && (
                                            <p className="text-xs text-[var(--text-secondary)] pl-7 italic font-sans">
                                                {step.reason}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                {/* Currently active searching step */}
                                {isSearching && currentQuery && (
                                    <div className="flex items-center gap-3 text-[var(--accent)] font-serif text-[15px] pl-6 relative border-t border-[var(--border)]/40 pt-3">
                                        <div className="absolute left-2 top-0 bottom-3 w-px bg-[var(--border)]" />
                                        <div className="absolute left-[-21px] w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                                        <Loader2 size={16} className="animate-spin shrink-0" />
                                        <span>Analyzing "{currentQuery}"...</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default SearchProgress;
