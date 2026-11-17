import test from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, collectMcpTools, loadMcpServers, saveMcpServers, mcpFunctionName } from './mcp.js';

const json = (value, headers = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });
const sse = text => new Response(new ReadableStream({ start(controller) {
    const bytes = new TextEncoder().encode(text);
    for (let index = 0; index < bytes.length; index += 4) controller.enqueue(bytes.slice(index, index + 4));
    controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

test('McpClient speaks JSON-RPC over Streamable HTTP and keeps the session header', async () => {
    const fetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, headers: options.headers, body });
        if (body.method === 'initialize') return json(rpcResult(body.id, { protocolVersion: '2025-06-18', serverInfo: { name: 'fixture', version: '1' } }), { 'Mcp-Session-Id': 'sess-1' });
        if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
        return json(rpcResult(body.id, { tools: [{ name: 'add_numbers', inputSchema: { type: 'object' } }] }));
    };
    try {
        const client = new McpClient('http://mcp.test/mcp');
        const info = await client.connect();
        assert.equal(info.serverInfo.name, 'fixture');
        const tools = await client.listTools();
        assert.equal(tools[0].name, 'add_numbers');
        assert.equal(calls[0].body.params.protocolVersion, '2025-06-18');
        assert.equal(calls[0].headers.Accept, 'application/json, text/event-stream');
        assert.equal(calls[1].body.method, 'notifications/initialized');
        assert.equal(calls[1].body.id, undefined);
        assert.equal(calls[2].headers['Mcp-Session-Id'], 'sess-1');
    } finally { globalThis.fetch = fetch; }
});

test('McpClient parses SSE responses and ignores unrelated messages', async () => {
    const fetch = globalThis.fetch;
    globalThis.fetch = async () => sse('data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\ndata: {"jsonrpc":"2.0","id":99,"result":{"wrong":true}}\n\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"ok"}]}}\n\n');
    try {
        const result = await new McpClient('http://mcp.test/mcp').rpc('tools/list', {});
        assert.deepEqual(result.result.tools, [{ name: 'ok' }]);
    } finally { globalThis.fetch = fetch; }
});

test('McpClient surfaces HTTP, JSON-RPC and tool-level errors', async () => {
    const fetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('nope', { status: 500 });
        await assert.rejects(() => new McpClient('http://mcp.test/mcp').rpc('tools/list', {}), /500/);
        globalThis.fetch = async (url, options) => json({ jsonrpc: '2.0', id: JSON.parse(options.body).id, error: { message: 'bad init' } });
        await assert.rejects(() => new McpClient('http://mcp.test/mcp').connect(), /bad init/);
        globalThis.fetch = async (url, options) => json(rpcResult(JSON.parse(options.body).id, { isError: true, content: [{ type: 'text', text: 'tool exploded' }] }));
        await assert.rejects(() => new McpClient('http://mcp.test/mcp').callTool('x', {}), /tool exploded/);
        globalThis.fetch = async (url, options) => json(rpcResult(JSON.parse(options.body).id, { content: [{ type: 'text', text: '7' }, { type: 'image' }] }));
        assert.equal(await new McpClient('http://mcp.test/mcp').callTool('x', {}), '7\n[image content]');
    } finally { globalThis.fetch = fetch; }
});

test('collectMcpTools skips disabled servers, reports failures and rethrows aborts', async () => {
    const fetch = globalThis.fetch;
    const servers = [
        { id: 'off', name: 'Off', url: 'http://off.test/mcp', enabled: false },
        { id: 'bad', name: 'Bad Server', url: 'http://bad.test/mcp' }
    ];
    try {
        globalThis.fetch = async () => { throw new Error('boom'); };
        const failed = await collectMcpTools(servers);
        assert.deepEqual(failed.tools, []);
        assert.deepEqual(failed.errors, ['Bad Server: boom']);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(() => collectMcpTools(servers, controller.signal));
        globalThis.fetch = async (url, options) => {
            const body = JSON.parse(options.body);
            if (body.method === 'initialize') return json(rpcResult(body.id, { serverInfo: { name: 'fixture' } }));
            if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
            return json(rpcResult(body.id, { tools: [{ name: 'add_numbers', description: 'Add', inputSchema: { type: 'object' } }] }));
        };
        const ok = await collectMcpTools([{ id: 'a', name: 'Fixture', url: 'http://ok.test/mcp' }]);
        assert.deepEqual(ok.errors, []);
        assert.equal(ok.tools[0].functionName, 'fixture__add_numbers');
        assert.equal(ok.tools[0].serverId, 'a');
        assert.ok(ok.clients.has('a'));
    } finally { globalThis.fetch = fetch; }
});

test('mcpFunctionName slugs names and caps provider-safe length', () => {
    assert.equal(mcpFunctionName({ name: 'My Server!' }, 'Add Numbers'), 'my-server__add-numbers');
    assert.equal(mcpFunctionName({ name: 'x'.repeat(80) }, 'y'.repeat(80)).length, 64);
});

test('MCP server storage validates entries and survives corrupt JSON', () => {
    const localStorage = globalThis.localStorage;
    const store = {};
    globalThis.localStorage = { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); } };
    try {
        saveMcpServers([{ id: 'a', name: 'Fixture', url: 'http://ok.test/mcp' }, { id: 'b', name: 'Bad', url: 'ftp://nope' }, null]);
        assert.deepEqual(loadMcpServers(), [{ id: 'a', name: 'Fixture', url: 'http://ok.test/mcp' }]);
        store.mcp_servers = '{corrupt';
        assert.deepEqual(loadMcpServers(), []);
    } finally {
        if (localStorage) globalThis.localStorage = localStorage; else delete globalThis.localStorage;
    }
});