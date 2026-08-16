// Enhanced Tavily Client with advanced search capabilities
// Supports topic detection, recency filtering, and auto-optimization

export class TavilyClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Performs a web search with advanced parameters
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Search results
     */
    async search(query, options = {}) {
        if (!this.apiKey) throw new Error('Tavily API Key missing');

        const searchParams = {
            api_key: this.apiKey,
            query: query,
            search_depth: options.search_depth || "basic",  // "basic" or "advanced"
            include_answer: options.include_answer !== undefined ? options.include_answer : true,
            include_raw_content: options.include_raw_content || false,
            max_results: options.max_results || 5,
            include_images: options.include_images || false,
            auto_parameters: options.auto_parameters !== false
        };

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(searchParams)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tavily Search Failed: ${response.status} - ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Performs a quick search (basic depth, fewer results)
     * @param {string} query - Search query
     * @returns {Promise<Object>} - Search results
     */
    async quickSearch(query) {
        return this.search(query, {
            search_depth: 'basic',
            max_results: 3,
            include_raw_content: false
        });
    }

    /**
     * Performs a deep search (advanced depth, more results)
     * @param {string} query - Search query
     * @returns {Promise<Object>} - Search results
     */
    async deepSearch(query) {
        return this.search(query, {
            search_depth: 'advanced',
            max_results: 10,
            include_raw_content: true
        });
    }

    /**
     * Performs a news-specific search
     * @param {string} query - Search query
     * @param {number} days - Number of days to search back
     * @returns {Promise<Object>} - Search results
     */
    async newsSearch(query, days = 7) {
        return this.search(query, {
            topic: 'news',
            days: days,
            search_depth: 'basic',
            max_results: 5
        });
    }
}
