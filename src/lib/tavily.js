export class TavilyClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async search(query) {
        if (!this.apiKey) throw new Error('Tavily API Key missing');

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: this.apiKey,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 5
            })
        });

        if (!response.ok) {
            throw new Error('Tavily Search Failed');
        }

        return await response.json();
    }
}
