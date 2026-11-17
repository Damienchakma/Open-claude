// MCP client for the browser: Streamable HTTP transport only (JSON-RPC over POST,
// responses as JSON or SSE). stdio servers cannot run in a browser tab.
import { readStreamLines } from './llm/clients.js';

const slug = value => String(value).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '') || 'server';

export const mcpFunctionName = (server, toolName) => `${slug(server.name)}__${slug(toolName)}`.slice(0, 64);

export function loadMcpServers() {
    try {
        const value = JSON.parse(localStorage.getItem('mcp_servers') || '[]');
        return Array.isArray(value) ? value.filter(server => server && typeof server.id === 'string' && typeof server.name === 'string' && /^https?:\/\//i.test(server.url || '')) : [];
    } catch { return []; }
}

export function saveMcpServers(servers) {
    localStorage.setItem('mcp_servers', JSON.stringify(servers));
}

export class McpClient {
    constructor(url, { headers = {} } = {}) {
        this.url = url;
        this.headers = headers;
        this.sessionId = null;
        this.nextId = 1;
        this.serverInfo = null;
    }

    async rpc(method, params, { signal, notification = false } = {}) {
        const id = notification ? undefined : this.nextId++;
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
                ...this.headers
            },
            body: JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }), ...(id === undefined ? {} : { id }) }),
            signal
        });
        const session = response.headers.get('Mcp-Session-Id');
        if (session) this.sessionId = session;
        if (notification) {
            if (!response.ok) throw new Error(`MCP server returned ${response.status} for ${method}`);
            return null;
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`MCP server returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
            for await (const lines of readStreamLines(response.body)) {
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    let message;
                    try { message = JSON.parse(line.slice(5).trim()); } catch { continue; }
                    if (message.id === id) return message;
                }
            }
            throw new Error('MCP stream closed before answering the request');
        }
        return response.json();
    }

    async connect(signal) {
        const init = await this.rpc('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'open-claude', version: '1.0.0' }
        }, { signal });
        if (init?.error) throw new Error(init.error.message || 'MCP initialize failed');
        this.serverInfo = init?.result?.serverInfo || null;
        await this.rpc('notifications/initialized', undefined, { signal, notification: true });
        return init?.result;
    }

    async listTools(signal) {
        const result = await this.rpc('tools/list', {}, { signal });
        if (result?.error) throw new Error(result.error.message || 'MCP tools/list failed');
        return result?.result?.tools || [];
    }

    async callTool(name, args, signal) {
        const result = await this.rpc('tools/call', { name, arguments: args }, { signal });
        if (result?.error) throw new Error(result.error.message || 'MCP tools/call failed');
        const text = (result?.result?.content || []).map(part => part.type === 'text' ? part.text : `[${part.type} content]`).join('\n');
        if (result?.result?.isError) throw new Error(text || 'The tool reported an error');
        return text;
    }
}

// Connects every enabled server and flattens its tools into one callable list.
export async function collectMcpTools(servers, signal) {
    const tools = [];
    const errors = [];
    const clients = new Map();
    for (const server of servers.filter(item => item.enabled !== false)) {
        try {
            const client = new McpClient(server.url, { headers: server.headers || {} });
            await client.connect(signal);
            for (const tool of await client.listTools(signal)) {
                if (!tool?.name) continue;
                tools.push({
                    serverId: server.id,
                    serverName: server.name,
                    name: tool.name,
                    functionName: mcpFunctionName(server, tool.name),
                    description: tool.description || '',
                    inputSchema: tool.inputSchema || { type: 'object', properties: {} }
                });
            }
            clients.set(server.id, client);
        } catch (error) {
            if (signal?.aborted) throw error;
            errors.push(`${server.name}: ${error.message}`);
        }
    }
    return { tools, errors, clients };
}