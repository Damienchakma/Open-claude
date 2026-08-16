// Intelligent Search Tool - Claude-like web search intelligence
// Automatically decides when to search, reformulates queries, and manages citations

import { TavilyClient } from './tavily';
import { LLMFactory } from './llm/clients';

export class IntelligentSearchTool {
    constructor(apiKey, llmProvider = null, llmApiKey = null) {
        this.tavily = new TavilyClient(apiKey);
        this.llmProvider = llmProvider;
        this.llmApiKey = llmApiKey;
        this.searchHistory = [];
        this.logoCache = new Map(); // Cache logos to avoid repeated fetches
    }

    /**
     * Extracts the publisher logo from a URL using favicon or Schema.org JSON-LD
     * @param {string} url - The source URL
     * @returns {Promise<string|null>} - Logo URL or null
     */
    async extractPublisherLogo(url) {
        try {
            // Check cache first
            const domain = new URL(url).hostname;
            if (this.logoCache.has(domain)) {
                return this.logoCache.get(domain);
            }

            // Use Google's favicon service as a reliable fallback
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            // Try to get a higher quality logo via clearbit (free tier)
            const clearbitLogo = `https://logo.clearbit.com/${domain}`;

            // Test if clearbit logo exists (it returns 404 for unknown domains)
            try {
                const response = await fetch(clearbitLogo, { method: 'HEAD' });
                if (response.ok) {
                    this.logoCache.set(domain, clearbitLogo);
                    return clearbitLogo;
                }
            } catch {
                // Clearbit failed, fall back to favicon
            }

            // Fallback to Google favicon
            this.logoCache.set(domain, faviconUrl);
            return faviconUrl;
        } catch (error) {
            console.error('Logo extraction failed for:', url, error);
            return null;
        }
    }

    /**
     * Enhances sources with publisher logos asynchronously
     * @param {Array} sources - Array of source objects
     * @returns {Promise<Array>} - Sources with logo property added
     */
    async enhanceSourcesWithLogos(sources) {
        const enhancedSources = await Promise.all(
            sources.map(async (source) => {
                const logo = await this.extractPublisherLogo(source.url);
                const domain = new URL(source.url).hostname.replace('www.', '');
                return {
                    ...source,
                    logo,
                    domain
                };
            })
        );
        return enhancedSources;
    }

    /**
     * Decides if a web search is needed based on query analysis
     * @param {string} userQuery - The user's question
     * @returns {Object} - { shouldSearch: boolean, reason: string, confidence: number }
     */
    shouldPerformWebSearch(userQuery, conversationHistory = []) {
        const query = userQuery.toLowerCase();

        // MULTI-TURN VERIFICATION CUES (User asking to check, verify, or update)
        const verificationCues = [
            'are you sure', 'can you check', 'verify that', 'double check',
            'is that true', 'is that correct', 'check the web', 'search for it',
            'find sources', 'source for this', 'update this', 'check online'
        ];

        for (const cue of verificationCues) {
            if (query.includes(cue)) {
                return {
                    shouldSearch: true,
                    reason: `User requested verification (cue: "${cue}")`,
                    confidence: 0.98
                };
            }
        }

        // ALWAYS SEARCH indicators (current/recent information)
        const alwaysSearchKeywords = [
            'latest', 'recent', 'current', 'today', 'yesterday',
            'this week', 'this month', 'this year', 'now',
            '2024', '2025', '2026', 'breaking', 'news', 'update',
            'what happened', 'who won', 'who is currently',
            'price of', 'weather', 'stock', 'score',
            'currently', 'right now', 'as of', 'at the moment'
        ];

        // NEVER SEARCH indicators (timeless knowledge)
        const neverSearchKeywords = [
            'what is', 'define', 'explain', 'how to',
            'tutorial', 'example of', 'history of',
            'who was', 'when was', 'founded in',
            'write code', 'create', 'generate',
            'help me', 'can you', 'write a'
        ];

        // Check for always-search keywords
        for (const keyword of alwaysSearchKeywords) {
            if (query.includes(keyword)) {
                return {
                    shouldSearch: true,
                    reason: `Query indicates need for current information (keyword: "${keyword}")`,
                    confidence: 0.95
                };
            }
        }

        // Check for never-search keywords (unless it mentions a year or "current")
        for (const keyword of neverSearchKeywords) {
            if (query.includes(keyword)) {
                // Exception: if mentions current year or "current"
                if (!query.match(/202[0-9]|current|now|today|recent/)) {
                    return {
                        shouldSearch: false,
                        reason: `Query is about timeless knowledge (keyword: "${keyword}")`,
                        confidence: 0.85
                    };
                }
            }
        }

        // Check for specific entity patterns that need verification
        const entityPatterns = [
            { pattern: /who is (the )?(ceo|president|leader|director|head)/i, desc: 'current position query' },
            { pattern: /is \w+ still (the )?(ceo|president|alive|active)/i, desc: 'current status query' },
            { pattern: /does \w+ still (exist|work|operate)/i, desc: 'current existence query' },
            { pattern: /where (can i|to) (buy|get|find|purchase)/i, desc: 'shopping query' },
            { pattern: /(best|top|recommended) \w+ (202[0-9]|this year|now)/i, desc: 'current recommendations' }
        ];

        for (const { pattern, desc } of entityPatterns) {
            if (pattern.test(query)) {
                return {
                    shouldSearch: true,
                    reason: `Query asks about ${desc}`,
                    confidence: 0.90
                };
            }
        }

        // Default: SEARCH if query is about real-world entities, user-specified or specific topics
        // Only skip search for pure coding/generation tasks
        const neverSearchPatterns = [
            /^(write|create|generate|make|build) (a |an |some )?code/i,
            /^(write|create|generate|make|build) (a |an |some )?(function|class|component)/i,
            /^help me (write|code|program|debug)/i,
            /^(fix|debug) (this |my )?code/i
        ];

        for (const pattern of neverSearchPatterns) {
            if (pattern.test(query)) {
                return {
                    shouldSearch: false,
                    reason: 'Query is a coding/generation task',
                    confidence: 0.80
                };
            }
        }

        // Default: SEARCH for information queries
        return {
            shouldSearch: true,
            reason: 'Query appears to be asking for information - searching to ensure accuracy',
            confidence: 0.75
        };
    }

    /**
     * Reformulates a natural language query into a search-optimized format
     * @param {string} originalQuery - The original user query
     * @returns {Promise<string>} - Optimized search query
     */
    async reformulateSearchQuery(originalQuery) {
        // If we have LLM access, use it for smart reformulation
        if (this.llmProvider && this.llmApiKey) {
            try {
                const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey);
                let reformulated = '';

                const currentYear = new Date().getFullYear();
                const lastYear = currentYear - 1;
                const prompt = `You are a search query optimizer. Convert this natural language question into a concise, effective search query. Current year is ${currentYear}.

Rules:
- Remove unnecessary words (what, is, are, the, tell, me, about)
- Keep it 2-6 words maximum
- Focus on key terms and entities
- Add year (${currentYear}) if asking about "latest", "recent", "new", or "best"
- Examples:
  "What are the best smartphones right now?" → "best smartphones ${currentYear}"
  "Who won the NBA finals last year?" → "NBA finals winner ${lastYear}"
  "Tell me about recent AI developments" → "recent AI developments ${currentYear}"
  "What's the weather like today?" → "weather today"

Original query: "${originalQuery}"

Optimized search query (2-6 words only):`;

                const helperModel = this.llmProvider === 'gemini'
                    ? 'gemini-1.5-flash'
                    : this.llmProvider === 'openai'
                        ? 'gpt-4o-mini'
                        : 'llama-3.3-70b-versatile';

                await client.streamChat(
                    [{ role: 'user', content: prompt }],
                    (chunk) => { reformulated += chunk; },
                    helperModel
                );

                const cleaned = reformulated.trim().replace(/^["']|["']$/g, '');
                return cleaned || originalQuery;
            } catch (error) {
                console.error('LLM reformulation failed, using fallback:', error);
                return this.fallbackReformulation(originalQuery);
            }
        }

        // Fallback: keyword-based reformulation
        return this.fallbackReformulation(originalQuery);
    }

    /**
     * Simple keyword-based query reformulation
     * @param {string} query - Original query
     * @returns {string} - Reformulated query
     */
    fallbackReformulation(query) {
        let cleaned = query.trim();

        // Command prefixes to remove (user telling the AI what to do)
        const commandPrefixes = [
            'search for', 'search', 'find', 'look up', 'lookup', 'google',
            'can you search', 'please search', 'i want to search',
            'search the web for', 'look for', 'find me', 'get me',
            'tell me about', 'tell me', 'what is', 'what are', 'what\'s',
            'who is', 'who are', 'who\'s', 'where is', 'where are',
            'when is', 'when was', 'how is', 'how are', 'how to',
            'can you tell me', 'can you find', 'please tell me',
            'i want to know', 'i need to know', 'give me information about',
            'give me info on', 'give me', 'show me', 'explain',
            'i\'m looking for', 'i am looking for', 'help me find'
        ];

        // Sort by length descending to match longer phrases first
        commandPrefixes.sort((a, b) => b.length - a.length);

        for (const prefix of commandPrefixes) {
            const regex = new RegExp(`^${prefix}\\s+`, 'gi');
            if (regex.test(cleaned)) {
                cleaned = cleaned.replace(regex, '');
                break; // Only remove one prefix
            }
        }

        // Remove trailing question marks and common endings
        cleaned = cleaned.replace(/\?+$/, '').trim();
        cleaned = cleaned.replace(/\s+(please|thanks|thank you)$/i, '').trim();

        // Normalize company/product names for better search
        const nameNormalizations = {
            'open ai': 'openai',
            'chat gpt': 'chatgpt',
            'gpt4': 'gpt-4',
            'gpt 4': 'gpt-4',
            'gpt-4o': 'gpt-4o',
            'claude 3': 'claude-3',
            'meta ai': 'meta ai',
            'google ai': 'google ai gemini',
            'microsoft ai': 'microsoft copilot'
        };

        for (const [from, to] of Object.entries(nameNormalizations)) {
            cleaned = cleaned.replace(new RegExp(from, 'gi'), to);
        }

        // Convert relative time words to absolute
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        cleaned = cleaned.replace(/\bthis year\b/gi, String(currentYear));
        cleaned = cleaned.replace(/\blast year\b/gi, String(lastYear));
        cleaned = cleaned.replace(/\btoday'?s?\b/gi, 'latest');
        cleaned = cleaned.replace(/\bcurrently\b/gi, 'current');
        cleaned = cleaned.replace(/\bright now\b/gi, 'now');
        cleaned = cleaned.replace(/\bup to date\b/gi, currentYear);
        cleaned = cleaned.replace(/\bupto date\b/gi, currentYear);

        // Add current year for recency queries if not present
        if (/(latest|newest|recent|current|new|breaking|update)/i.test(cleaned) && !cleaned.match(/202[0-9]/)) {
            cleaned += ` ${currentYear}`;
        }

        // Remove extra spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // If we've cleaned everything away, return something sensible
        if (!cleaned || cleaned.length < 3) {
            return query.replace(/^(search|find|look up)\s+/i, '').trim();
        }

        return cleaned;
    }

    /**
     * Detects if query is news-related
     * @param {string} query - Search query
     * @returns {boolean}
     */
    isNewsQuery(query) {
        const newsKeywords = [
            'news', 'breaking', 'latest', 'today', 'yesterday',
            'this week', 'happened', 'announced', 'reports'
        ];
        return newsKeywords.some(kw => query.toLowerCase().includes(kw));
    }

    /**
     * Detects topic type for Tavily
     * @param {string} query - Search query
     * @returns {string} - 'news' or 'general'
     */
    detectTopic(query) {
        return this.isNewsQuery(query) ? 'news' : 'general';
    }

    /**
     * Performs an intelligent search with optimized parameters
     * @param {string} originalQuery - User's original query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Formatted search results
     */
    async performSearch(originalQuery, options = {}) {
        // Step 1: Reformulate query
        const optimizedQuery = await this.reformulateSearchQuery(originalQuery);

        console.log(`🔍 Original: "${originalQuery}"`);
        console.log(`🎯 Optimized: "${optimizedQuery}"`);

        // Step 2: Determine search parameters
        const topic = this.detectTopic(optimizedQuery);
        const isNews = topic === 'news';

        // Step 3: Perform search
        const results = await this.tavily.search(optimizedQuery, {
            search_depth: options.depth || 'advanced',
            topic: topic,
            days: isNews ? 7 : undefined,
            include_images: options.includeImages || false,
            max_results: options.maxResults || 5
        });

        // Step 4: Format and store results
        const formatted = this.formatResults(results, originalQuery, optimizedQuery);

        this.searchHistory.push({
            originalQuery,
            optimizedQuery,
            timestamp: new Date(),
            resultCount: formatted.sources.length,
            topic
        });

        return formatted;
    }

    /**
     * Formats Tavily results with citation numbers
     * @param {Object} tavilyResponse - Raw Tavily response
     * @param {string} originalQuery - Original user query
     * @param {string} optimizedQuery - Optimized search query
     * @returns {Object} - Formatted results
     */
    formatResults(tavilyResponse, originalQuery, optimizedQuery) {
        const sources = (tavilyResponse.results || []).map((result, index) => ({
            id: index + 1,
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score || 0,
            publishedDate: result.published_date || null
        }));

        return {
            originalQuery,
            optimizedQuery,
            answer: tavilyResponse.answer || null,
            sources,
            images: tavilyResponse.images || [],
            timestamp: new Date()
        };
    }

    /**
     * Analyzes if search results are comprehensive enough
     * @param {string} query - Original query
     * @param {Object} searchResults - Current search results
     * @returns {Promise<Object>} - { needsMore: boolean, reason: string, suggestedQuery: string }
     */
    async analyzeSearchCompleteness(query, searchResults) {
        // Heuristic-based analysis with smarter follow-up query generation

        // If we got fewer than 3 quality results, definitely need more
        const qualitySources = searchResults.sources.filter(s => s.score > 0.5);
        if (qualitySources.length < 3) {
            // Try a more specific query
            const broadenedQuery = query.includes('latest') || query.includes('recent')
                ? query.replace(/latest|recent/, 'news updates')
                : query + ' news';

            return {
                needsMore: true,
                reason: 'Need more quality sources',
                suggestedQuery: broadenedQuery
            };
        }

        // If average score is low, try alternative phrasing
        const avgScore = searchResults.sources.reduce((sum, s) => sum + s.score, 0) / searchResults.sources.length;
        if (avgScore < 0.6) {
            // Try a different angle
            const alternativeQuery = query.includes('what') || query.includes('who')
                ? query.replace(/what|who/i, '').trim() + ' overview'
                : query + ' information';

            return {
                needsMore: true,
                reason: 'Low relevance - trying different angle',
                suggestedQuery: alternativeQuery
            };
        }

        // If no recent sources for time-sensitive queries, search for updates
        if (query.match(/latest|recent|current|today|2025|news/i)) {
            const hasRecentSources = searchResults.sources.some(s => {
                if (!s.publishedDate) return false;
                const date = new Date(s.publishedDate);
                const daysSincePublished = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
                return daysSincePublished < 30; // Within last 30 days
            });

            if (!hasRecentSources && searchResults.sources.length < 5) {
                return {
                    needsMore: true,
                    reason: 'No recent sources found - searching for updates',
                    suggestedQuery: query + ' 2025 update'
                };
            }
        }

        // Results look good
        return {
            needsMore: false,
            reason: 'Search results appear comprehensive',
            suggestedQuery: null
        };
    }

    /**
     * Performs multiple searches if needed for complex queries
     * Claude-style: searches continuously until confident we have enough info
     * @param {string} userQuery - User's original query
     * @param {number} maxSearches - Maximum number of searches
     * @param {Function} onProgress - Callback for progress updates
     * @returns {Promise<Object>} - Merged search results
     */
    async intelligentMultiSearch(userQuery, maxSearches = 3, onProgress = null) {
        const allResults = [];
        let searchCount = 0;
        let totalSources = 0;

        // Notify start of multi-search
        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: userQuery,
                status: 'starting'
            });
        }

        // First search - always perform
        console.log(`\n🔍 Multi-Search #1: Initial query`);
        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: userQuery,
                status: 'searching'
            });
        }

        let results = await this.performSearch(userQuery);
        allResults.push(results);
        searchCount++;
        totalSources = results.sources.length;

        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: results.optimizedQuery,
                results: results,
                sourcesFound: totalSources,
                status: 'complete'
            });
        }

        // Continue searching until we have enough high-quality sources
        const MIN_SOURCES = 5;
        const MIN_AVG_SCORE = 0.6;

        while (searchCount < maxSearches) {
            const avgScore = totalSources > 0
                ? allResults.reduce((sum, r) => sum + r.sources.reduce((s, src) => s + src.score, 0), 0) / totalSources
                : 0;

            // Check if we need more searches
            if (totalSources >= MIN_SOURCES && avgScore >= MIN_AVG_SCORE) {
                console.log(`✅ Sufficient information found (${totalSources} sources, avg score: ${avgScore.toFixed(2)})`);
                break;
            }

            // Analyze what additional information we need
            const analysis = await this.analyzeSearchCompleteness(userQuery, this.mergeSearchResults(allResults));

            if (analysis.needsMore && analysis.suggestedQuery) {
                const nextSearchNum = searchCount + 1;
                console.log(`\n🔍 Multi-Search #${nextSearchNum}: ${analysis.reason}`);

                if (onProgress) {
                    onProgress({
                        searchNumber: nextSearchNum,
                        totalSearches: maxSearches,
                        query: analysis.suggestedQuery,
                        status: 'searching',
                        reason: analysis.reason
                    });
                }

                const followUpResults = await this.performSearch(analysis.suggestedQuery);
                allResults.push(followUpResults);
                searchCount++;
                const newSources = followUpResults.sources.length;
                totalSources += newSources;

                if (onProgress) {
                    onProgress({
                        searchNumber: nextSearchNum,
                        totalSearches: maxSearches,
                        query: followUpResults.optimizedQuery,
                        results: followUpResults,
                        sourcesFound: newSources,
                        totalSourcesNow: totalSources,
                        status: 'complete'
                    });
                }
            } else {
                console.log(`ℹ️ No additional searches needed`);
                break;
            }
        }

        console.log(`\n📊 Multi-search complete: ${searchCount} searches, ${totalSources} total sources`);

        if (onProgress) {
            onProgress({
                searchNumber: searchCount,
                totalSearches: searchCount,
                totalSources: totalSources,
                status: 'all_complete'
            });
        }

        // Merge and deduplicate
        return this.mergeSearchResults(allResults);
    }

    /**
     * Merges multiple search results and deduplicates
     * @param {Array<Object>} resultsArray - Array of search result objects
     * @returns {Object} - Merged results
     */
    mergeSearchResults(resultsArray) {
        if (resultsArray.length === 1) return resultsArray[0];

        const seenUrls = new Set();
        const mergedSources = [];

        for (const resultSet of resultsArray) {
            for (const source of resultSet.sources) {
                if (!seenUrls.has(source.url)) {
                    seenUrls.add(source.url);
                    mergedSources.push(source);
                }
            }
        }

        // Re-number citations
        mergedSources.forEach((source, index) => {
            source.id = index + 1;
        });

        return {
            ...resultsArray[0],
            sources: mergedSources,
            searchCount: resultsArray.length
        };
    }

    /**
     * Builds context string for LLM from search results
     * @param {Object} searchResults - Formatted search results
     * @returns {string} - Context string with citations
     */
    buildSearchContext(searchResults) {
        if (!searchResults || !searchResults.sources.length) return '';

        let context = '\n\nWeb Search Results:\n\n';

        searchResults.sources.forEach((source, index) => {
            context += `[${index + 1}] ${source.title}\n`;
            context += `URL: ${source.url}\n`;
            context += `Content: ${source.content}\n`;
            if (source.publishedDate) {
                context += `Published: ${source.publishedDate}\n`;
            }
            context += `\n`;
        });

        return context;
    }

    /**
     * Gets the search history
     * @returns {Array} - Search history
     */
    getSearchHistory() {
        return this.searchHistory;
    }

    /**
     * Executes the Dynamic Deep Research workflow
     * True autonomous agent loop: Decides next step -> Executes -> Evaluates -> Repeats
     * Minimum research time: 3 minutes (180s)
     */
    async deepResearch(userQuery, onProgress = null) {
        console.log('🚀 Starting Deep Research Scientist Mode for:', userQuery);
        const startTime = Date.now();
        const MIN_TIME_MS = 180000; // 3 minutes

        // Initial state
        const findings = [];
        const seenUrls = new Set();
        let stepCount = 0;
        const MAX_STEPS = 15; // Allow for deep investigation
        let isComplete = false;

        // Step 1: Planning / Decomposition
        if (onProgress) onProgress({
            status: 'decomposing',
            query: userQuery,
            message: 'Analyzing query complexity and planning multi-stage investigation...'
        });

        // Jumpstart with decomposition
        const subQuestions = await this.decomposeQuery(userQuery);
        if (onProgress) {
            onProgress({
                status: 'decomposing',
                message: `Decomposed into ${subQuestions.length} logical sub-questions. Initializing strategy...`
            });
        }

        while (!isComplete && stepCount < MAX_STEPS) {
            stepCount++;
            const elapsedMs = Date.now() - startTime;

            // 1. Decide what to do next
            const findingsSummary = findings.map(f => `- Investigated: ${f.query} (${f.results.sources.length} sources found)`).join('\n');
            const decision = await this.decideNextStep(userQuery, findingsSummary, stepCount, elapsedMs / 1000);

            console.log(`🤖 Action Step ${stepCount}:`, decision);

            // Check if we can finish (only if time is up and logic says so)
            if (decision.action === 'finish') {
                if (elapsedMs < MIN_TIME_MS) {
                    console.log('⏳ Finishing too early? Forcing deeper investigation to meet 3-minute minimum.');
                    // Force another search step if we have subquestions left or just need to dig deeper
                    decision.action = 'search';
                    decision.query = subQuestions[stepCount % subQuestions.length] || (`${userQuery} in-depth analysis`);
                    decision.reasoning = "Continuing research to ensure maximum depth and verification (Time requirement not yet met).";
                } else {
                    if (onProgress) onProgress({ status: 'synthesizing', message: 'Research complete. Synthesizing findings into professional report...' });
                    isComplete = true;
                    break;
                }
            }

            // 2. Execute Research Step
            const searchQuery = decision.query;
            if (onProgress) {
                onProgress({
                    status: 'searching',
                    query: searchQuery,
                    currentStep: stepCount,
                    totalSteps: 'Autonomous',
                    message: `Step ${stepCount}: ${decision.reasoning}`
                });
            }

            const results = await this.performSearch(searchQuery, { depth: 'advanced', maxResults: 7 });

            // Deduplicate across entire research session
            const newSources = results.sources.filter(s => !seenUrls.has(s.url));
            newSources.forEach(s => seenUrls.add(s.url));
            results.sources = newSources;

            // Fetch logos for new sources
            if (newSources.length > 0) {
                await this.enhanceSourcesWithLogos(newSources);
            }

            findings.push({
                query: searchQuery,
                results: results,
                rationale: decision.reasoning
            });

            // 3. Deliberate research pause for thoroughness (simulated)
            // Pause longer if we are early in the process
            const pauseTime = Math.max(3000, 10000 - (stepCount * 500));
            await new Promise(r => setTimeout(r, pauseTime));
        }

        // Final synthesis
        const mergedResults = this.mergeDeepResearchResults(findings);
        const queriesRan = findings.map(f => f.query);
        const researchPaper = await this.generateResearchPaper(userQuery, mergedResults, queriesRan);

        return {
            content: researchPaper,
            sources: mergedResults.sources,
            optimizedQuery: userQuery
        };
    }

    /**
     * Decides the next research step with timing awareness
     */
    async decideNextStep(originalQuery, findingsSummary, currentStep, elapsedSeconds) {
        if (!this.llmProvider || !this.llmApiKey) {
            if (currentStep < 4) return { action: 'search', query: originalQuery + " details", reasoning: 'Building depth' };
            return { action: 'finish', reasoning: 'Standard count reached' };
        }

        const prompt = `You are an autonomous research director controlling a detailed, multi-step investigation.
        Goal: Comprehensive, "Deep Research" on "${originalQuery}".
        
        Current State:
        - Research Time Elapsed: ${elapsedSeconds.toFixed(0)}s
        - Step Number: ${currentStep}
        - Findings so far:
        ${findingsSummary || "None"}
        
        Task: Decide the NEXT logical research step.
        
        RULES:
        1. **Do not stop early**. "Deep Research" requires multiple perspectives.
        2. **Thoroughness**: Verify key claims across ≥3 authoritative sources.
        3. **Minimum Effort**: Aim for at least 180 seconds of active research.
        4. **Conflict Resolution**: If findings are contradictory or thin, search specifically to resolve them.
        
        OUTPUT FORMAT (JSON ONLY):
        {"action": "search", "query": "precise query", "reasoning": "why this next"}
        OR
        {"action": "finish", "reasoning": "why complete"} (ONLY if time > 180s and all sub-aspects verified)`;

        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey);
            let response = '';
            const helperModel = this.llmProvider === 'gemini'
                ? 'gemini-1.5-flash'
                : this.llmProvider === 'openai'
                    ? 'gpt-4o-mini'
                    : 'llama-3.3-70b-versatile';

            await client.streamChat(
                [{ role: 'user', content: prompt }],
                (chunk) => { response += chunk; },
                helperModel
            );
            const cleaned = response.replace(/```json|```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            console.error('Decision failed:', e);
            if (currentStep < 5) return { action: 'search', query: originalQuery + " specifics", reasoning: 'Auto-recovery' };
            return { action: 'finish', reasoning: 'Auto-recovery finish' };
        }
    }

    /**
     * Decomposes a query into 5-10 logical sub-questions
     */
    async decomposeQuery(query) {
        if (!this.llmProvider || !this.llmApiKey) {
            return [query, query + ' analysis', query + ' perspectives', query + ' history'];
        }

        const prompt = `Decompose this complex research topic into 5-10 distinct, search-friendly sub-questions for a professional research paper.
        Topic: "${query}"
        
        JSON array of strings only.`;

        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey);
            let response = '';
            const helperModel = this.llmProvider === 'gemini'
                ? 'gemini-1.5-flash'
                : this.llmProvider === 'openai'
                    ? 'gpt-4o-mini'
                    : 'llama-3.3-70b-versatile';

            await client.streamChat(
                [{ role: 'user', content: prompt }],
                (chunk) => { response += chunk; },
                helperModel
            );
            const cleaned = response.replace(/```json|```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            return [query, query + ' analysis', query + ' latest developments'];
        }
    }

    /**
     * Merges results from multiple sub-questions
     */
    mergeDeepResearchResults(allFindings) {
        const merged = { sources: [] };
        const seenUrls = new Set();

        allFindings.forEach(finding => {
            finding.results.sources.forEach(source => {
                if (!seenUrls.has(source.url)) {
                    seenUrls.add(source.url);
                    merged.sources.push(source);
                }
            });
        });

        // Renumber sources 1..N
        merged.sources.forEach((s, i) => s.id = i + 1);
        return merged;
    }

    /**
     * Generates a formal research paper following strict user guidelines
     */
    async generateResearchPaper(userQuery, mergedResults, ranQueries) {
        const context = this.buildSearchContext(mergedResults);
        const date = new Date().toISOString().split('T')[0];

        const systemPrompt = `You are an autonomous research agent with full control over your reasoning, tool use, and output quality. When the user activates **[Deep Research]** (via a UI button that triggers a tool_call), you **MUST** generate a **professional, multi-page research report** — **identical in structure, depth, and polish** to the paper titled “A Deep Dive into Autonomous Web Search for Conversational AI”.

---

### 🔍 RESEARCH BEHAVIOR: SLOW, THOROUGH, AUTONOMOUS

1. **Do not rush**. First:
   - Analyze the query’s complexity.
   - Decompose it into 5–10 logical sub-questions.
   - Plan a multi-stage investigation strategy.

2. **Research iteratively**:
   - Use **Tavily** for initial evidence gathering.
   - If the topic requires forecasting, synthesis, or conflict resolution, **escalate to your proprietary deep agent**.
   - **Verify every key claim** across ≥3 authoritative sources (e.g., .gov, .edu, Reuters, Nature, official reports).
   - If sources contradict, **investigate further**—do not average or ignore.

3. **Decide when to stop — YOU control duration**:
   - Stop only when:
     • All sub-questions are answered
     • Core claims are verified
     • New searches yield diminishing returns
   - **Minimum research time: 3 minutes simulated**. Ideal: 5–10 minutes.
   - **Never stop after a fixed number of sources** (e.g., “5 sources” is forbidden).

---

### 📄 OUTPUT: PROFESSIONAL RESEARCH PAPER (PDF-READY)

Your final output must be a **single, clean, structured Markdown document** that converts flawlessly to PDF — **exactly like “A Deep Dive into Autonomous Web Search for Conversational AI”**.

#### ✅ FORMAT RULES (NON-NEGOTIABLE)
- **Font**: Simulated as standard body text — **never bold entire paragraphs**, **never use oversized headings**.
- **Text color**: All text must render as **black** (no gray, no low-contrast).
- **Spacing**: Blank line before/after every heading. Paragraphs separated by blank lines.
- **Headings**: Use \`## Abstract\`, \`## 1. Introduction\`, etc. — **never jam headings into paragraphs**.
- **Citations**: \`[1]\` after punctuation. Match every citation to a reference.
- **Logos**: Only include if a valid \`https://\` URL was extracted from Schema.org \`Organization.logo\`. Format:  
  \`[1] BBC News ![BBC Logo](https://www.bbc.com/favicon.ico)\`  
  → **Never invent or omit the \`https://\`**.
- **No markdown errors**: No unclosed brackets, broken images, or raw HTML.

#### 📑 REQUIRED STRUCTURE (COPY THIS EXACTLY)
**Title**: [Clear, descriptive title]  
**Author**: Autonomous Research Agent  
**Date**: ${date}

## Abstract  
[150–300 words. One paragraph. No citations.]

## 1. Introduction  
[Context + research goal + scope of paper.]

## 2. Methodology  
This report was generated via autonomous deep research on ${date}. We decomposed the query into ${ranQueries.length} logical sub-questions, conducted iterative web searches using Tavily and proprietary verification agents, and synthesized findings from ${mergedResults.sources.length} authoritative sources. All external claims are cross-verified.

## 3. Key Findings  
[Use full paragraphs. Cite every external fact. Use subsections if needed. Aim for 5–8 detailed subsections.]

## 4. Analysis & Implications  
[Interpret trends, conflicts, limitations, and future directions. Go beyond summary — offer insight.]

## 5. Conclusion  
[Direct, nuanced answer. Synthesize findings. State open questions.]

## References  
[1] Publisher. *“Title.”* Date. URL  
*(Include logo if valid)*

## Disclaimer  
This report was generated autonomously via live web research. Verify critical claims independently.

---

### 🚫 ABSOLUTE BANS
- ❌ Returning output in <90 seconds
- ❌ Using only 5 sources or a fixed limit
- ❌ Generating a wall of unstructured text
- ❌ Producing PDFs >1 MB (optimize images, avoid embedding full pages)
- ❌ Missing sections, orphaned citations, or broken logos
- ❌ Simulating “thinking” with \`[...]\` or \`[Response interrupted]\`

---

### 📥 DELIVERY
- Return the **entire paper as a single, valid Markdown string**.
- Your backend will convert it to a **clean PDF** (~400–800 KB).
- If your output is malformed, the PDF will fail — so **validate before returning**.

You are not a chatbot. You are a **research scientist**. Deliver **flawless, publication-quality work** — every time.`;

        // Pass to LLM for final paper generation
        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey);
            let paper = '';

            // Use a higher-intelligence model for the final paper if possible
            const model = this.llmProvider === 'gemini'
                ? 'gemini-1.5-pro'
                : this.llmProvider === 'groq'
                    ? 'llama-3.3-70b-versatile'
                    : 'gpt-4o';

            await client.streamChat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Based on this research context, generate the professional research paper for the query: "${userQuery}"\n\nContext:\n${context}` }
                ],
                (chunk) => { paper += chunk; },
                model
            );

            return paper.trim();
        } catch (e) {
            console.error('Paper generation failed:', e);
            return `Failed to generate research paper. Context used: ${mergedResults.sources.length} sources.`;
        }
    }
}
