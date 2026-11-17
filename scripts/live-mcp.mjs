// Live MCP round-trip: a real local Streamable HTTP MCP server plus real Groq tool calling.
// Requires GROQ_API_KEY in the environment; the key is never written to disk.
// Usage: node scripts/live-mcp.mjs <playwright-core entry> <chrome executable>
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const runtime = process.argv[2] || process.env.PLAYWRIGHT_CORE_PATH;
if (!runtime) throw new Error('Pass the path to an installed playwright-core entry point. No packages are downloaded.');
const module = await import(pathToFileURL(path.resolve(runtime)).href);
const { chromium } = module.default || module;

const key = process.env.GROQ_API_KEY;
if (!key) { console.error('GROQ_API_KEY is not set'); process.exit(1); }

const calls = [];
const server = http.createServer((request, response) => {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, accept, mcp-session-id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id'
    };
    if (request.method === 'OPTIONS') { response.writeHead(204, cors); response.end(); return; }
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
        const body = JSON.parse(raw || '{}');
        calls.push({ method: body.method, params: body.params, session: request.headers['mcp-session-id'] });
        const send = (status, value, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...headers }); response.end(value === undefined ? '' : JSON.stringify(value)); };
        if (body.method === 'initialize') return send(200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'live-fixture', version: '1' } } }, { 'Mcp-Session-Id': 'live-sess' });
        if (body.method === 'notifications/initialized') return send(202);
        if (body.method === 'tools/list') return send(200, { jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'add_numbers', description: 'Add two numbers and return the sum.', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } }] } });
        if (body.method === 'tools/call') return send(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: String(body.params.arguments.a + body.params.arguments.b) }] } });
        send(404, { jsonrpc: '2.0', id: body.id, error: { message: 'Unknown method' } });
    });
});
await new Promise(resolve => server.listen(8788, '127.0.0.1', resolve));

const browser = await chromium.launch({ executablePath: process.argv[3] || process.env.CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); };

try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(k => {
        localStorage.setItem('groq_key', k);
        localStorage.setItem('selected_provider', 'groq');
        localStorage.setItem('selected_model', 'openai/gpt-oss-120b');
        localStorage.setItem('mcp_servers', JSON.stringify([{ id: 'live', name: 'Live Fixture', url: 'http://127.0.0.1:8788/mcp', enabled: true }]));
    }, key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Message Open Claude').waitFor();
    await page.getByLabel('Message Open Claude').fill('Use the add_numbers tool to add 3 and 4. Reply with just the resulting number.');
    await page.getByLabel('Send message', { exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('article.message-assistant:not(.is-streaming)').length >= 1 && !document.querySelector('.generation-status'), null, { timeout: 90000 });
    const answer = await page.locator('article.message-assistant:not(.is-streaming)').last().innerText();
    check('model called the MCP tool and answered from its result', /\b7\b/.test(answer), answer.slice(0, 120));
    check('server saw initialize, tools/list and tools/call', ['initialize', 'tools/list', 'tools/call'].every(method => calls.some(call => call.method === method)));
    const toolCall = calls.find(call => call.method === 'tools/call');
    check('tool arguments arrived intact', toolCall?.params?.name === 'add_numbers' && toolCall?.params?.arguments?.a === 3 && toolCall?.params?.arguments?.b === 4);
    check('session header reused after initialize', calls.find(call => call.method === 'tools/list')?.session === 'live-sess');
    await page.screenshot({ path: 'screenshots/live-mcp.png' });
} catch (error) {
    failures.push(`unexpected error: ${error.message}`);
    await page.screenshot({ path: 'screenshots/live-mcp-failure.png' }).catch(() => {});
} finally {
    await browser.close();
    server.close();
}
console.log(failures.length ? `${failures.length} live MCP checks failed` : 'All live MCP checks passed.');
process.exit(failures.length ? 1 : 0);