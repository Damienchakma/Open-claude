import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqClient, OpenAIClient, OllamaClient, LMStudioClient, AnthropicClient, OpenAICompatibleClient, LLMFactory, toAnthropicMessages } from './clients.js';

function splitResponse(text) {
    const bytes = new TextEncoder().encode(text);
    return new Response(new ReadableStream({ start(controller) {
        for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3));
        controller.close();
    } }));
}
test('Ollama converts current image content parts into its native request format', async () => {
    const fetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => { request = JSON.parse(options.body); return splitResponse(JSON.stringify({ message: { content: 'Done' } })); };
    try {
        await new OllamaClient().streamChat([{ role: 'user', content: [{ type: 'text', text: 'Review' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] }], () => {}, 'vision-model');
        assert.deepEqual(request.messages[0], { role: 'user', content: 'Review', images: ['eA=='] });
    } finally { globalThis.fetch = fetch; }
});
for (const Client of [GroqClient, OpenAIClient, LMStudioClient, OllamaClient]) {
    test(`${Client.name} retains fragmented JSON and UTF-8 in a real ReadableStream`, async () => {
        const fetch = globalThis.fetch;
        const text = 'A café — working stream.';
        const payload = Client === OllamaClient ? JSON.stringify({ message: { content: text } }) : `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\ndata: [DONE]\r\n`;
        globalThis.fetch = async () => splitResponse(payload);
        try {
            let result = '';
            await new Client('test-only-key').streamChat([{ role: 'user', content: 'Hi' }], (chunk, metadata) => { if (!metadata?.isThinking) result += chunk; }, 'test-model');
            assert.equal(result, text);
        } finally { globalThis.fetch = fetch; }
    });
}

test('GroqClient enables parsed reasoning for Qwen and routes reasoning deltas to thinking', async () => {
    const fetch = globalThis.fetch;
    let request;
    const payload = 'data: {"choices":[{"delta":{"reasoning":"17*20+17*3"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"391"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n';
    globalThis.fetch = async (url, options) => { request = JSON.parse(options.body); return splitResponse(payload); };
    try {
        let thinking = '', content = '';
        await new GroqClient('test-only-key').streamChat([{ role: 'user', content: '17*23?' }], (chunk, metadata) => {
            if (metadata?.isThinking) thinking += chunk; else content += chunk;
        }, 'qwen/qwen3.8-27b');
        assert.equal(request.reasoning_format, 'parsed');
        assert.equal(request.reasoning_effort, 'medium');
        assert.equal(thinking, '17*20+17*3');
        assert.equal(content, '391');
        await new GroqClient('test-only-key').streamChat([{ role: 'user', content: 'Hi' }], () => {}, 'openai/gpt-oss-120b');
        assert.equal(request.reasoning_format, undefined);
    } finally { globalThis.fetch = fetch; }
});

test('toAnthropicMessages extracts system, converts images and drops empty turns', () => {
    const { system, messages } = toAnthropicMessages([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] },
        { role: 'assistant', content: '   ' },
        { role: 'user', content: 'Hi', images: [{ base64: 'eA==', type: 'image/jpeg' }] }
    ]);
    assert.equal(system, 'Be brief.');
    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'eA==' } });
    assert.deepEqual(messages[1].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'eA==' } });
});

test('AnthropicClient streams text and thinking deltas with browser-access headers', async () => {
    const fetch = globalThis.fetch;
    let url, options;
    const payload = [
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Hmm"}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
        ''
    ].join('\r\n\r\n');
    globalThis.fetch = async (u, o) => { url = u; options = o; return splitResponse(payload); };
    try {
        const chunks = [];
        await new AnthropicClient('test-only-key').streamChat(
            [{ role: 'system', content: 'Sys' }, { role: 'user', content: 'Hi' }],
            (chunk, metadata) => chunks.push([chunk, metadata]),
            'claude-sonnet-4-5'
        );
        assert.equal(url, 'https://api.anthropic.com/v1/messages');
        assert.equal(options.headers['anthropic-dangerous-direct-browser-access'], 'true');
        assert.equal(options.headers['anthropic-version'], '2023-06-01');
        const body = JSON.parse(options.body);
        assert.equal(body.system, 'Sys');
        assert.equal(body.max_tokens, 8192);
        assert.equal(body.stream, true);
        assert.deepEqual(chunks[0], ['Hmm', { isThinking: true }]);
        assert.deepEqual(chunks[1], ['Hello', { isThinking: false }]);
        assert.equal(chunks[2][1].finishReason, 'end_turn');
    } finally { globalThis.fetch = fetch; }
});

test('AnthropicClient caps max_tokens for Claude 3 models and surfaces stream errors', async () => {
    const fetch = globalThis.fetch;
    let body;
    globalThis.fetch = async (u, o) => { body = JSON.parse(o.body); return splitResponse('data: {"type":"error","error":{"message":"overloaded"}}\r\n\r\n'); };
    try {
        await assert.rejects(
            new AnthropicClient('test-only-key').streamChat([{ role: 'user', content: 'Hi' }], () => {}, 'claude-3-opus-20240229'),
            /overloaded/
        );
        assert.equal(body.max_tokens, 4096);
    } finally { globalThis.fetch = fetch; }
});

test('OpenAICompatibleClient works keyless against a custom base URL', async () => {
    const fetch = globalThis.fetch;
    let url, options;
    globalThis.fetch = async (u, o) => { url = u; options = o; return splitResponse('data: {"choices":[{"delta":{"content":"ok"}}]}\r\n\r\ndata: [DONE]\r\n'); };
    try {
        let result = '';
        const client = new OpenAICompatibleClient('', { baseUrl: 'http://localhost:8080/v1/', label: 'Custom endpoint', requireKey: false });
        await client.streamChat([{ role: 'user', content: 'Hi' }], chunk => { result += chunk; }, 'local-model');
        assert.equal(url, 'http://localhost:8080/v1/chat/completions');
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(result, 'ok');
    } finally { globalThis.fetch = fetch; }
});

test('OpenAICompatibleClient requires a key by default', async () => {
    await assert.rejects(
        new OpenAICompatibleClient('', { baseUrl: 'https://example.com/v1', label: 'Mistral AI' }).streamChat([{ role: 'user', content: 'Hi' }], () => {}, 'm'),
        /Mistral AI API key missing/
    );
});

test('LLMFactory routes OpenRouter to its API with the attribution header', async () => {
    const fetch = globalThis.fetch;
    let url, options;
    globalThis.fetch = async (u, o) => { url = u; options = o; return splitResponse('data: [DONE]\r\n'); };
    try {
        const client = LLMFactory.getClient('openrouter', 'test-only-key');
        assert.ok(client instanceof OpenAICompatibleClient);
        await client.streamChat([{ role: 'user', content: 'Hi' }], () => {}, 'openrouter/auto');
        assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(options.headers['X-Title'], 'Open Claude');
        assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    } finally { globalThis.fetch = fetch; }
});

test('LLMFactory routes Anthropic and rejects unknown providers', () => {
    assert.ok(LLMFactory.getClient('anthropic', 'k') instanceof AnthropicClient);
    assert.throws(() => LLMFactory.getClient('not-a-provider', 'k'), /Unknown provider/);
});

test('OpenAICompatibleClient accumulates fragmented tool_calls and preserves tool turns', async () => {
    const fetch = globalThis.fetch;
    let request;
    const delta = tool_calls => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls } }] })}\r\n\r\n`;
    const payload = delta([{ index: 0, id: 'call_1', type: 'function', function: { name: 'fixture__add_', arguments: '' } }])
        + delta([{ index: 0, function: { name: 'numbers', arguments: '{"a":3,' } }])
        + delta([{ index: 0, function: { arguments: '"b":4}' } }])
        + 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\r\n\r\ndata: [DONE]\r\n';
    globalThis.fetch = async (url, options) => { request = JSON.parse(options.body); return splitResponse(payload); };
    try {
        const tools = [{ type: 'function', function: { name: 'fixture__add_numbers', description: 'Add', parameters: { type: 'object' } } }];
        const result = await new OpenAICompatibleClient('test-only-key', { baseUrl: 'https://example.com/v1' }).streamChat([
            { role: 'user', content: '3+4?' },
            { role: 'assistant', content: '', tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'fixture__add_numbers', arguments: '{"a":1,"b":1}' } }] },
            { role: 'tool', tool_call_id: 'call_0', content: '2' }
        ], () => {}, 'm', { tools });
        assert.deepEqual(request.tools, tools);
        assert.deepEqual(request.messages[1], { role: 'assistant', content: '', tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'fixture__add_numbers', arguments: '{"a":1,"b":1}' } }] });
        assert.deepEqual(request.messages[2], { role: 'tool', tool_call_id: 'call_0', content: '2' });
        assert.deepEqual(result.toolCalls, [{ id: 'call_1', type: 'function', function: { name: 'fixture__add_numbers', arguments: '{"a":3,"b":4}' } }]);
    } finally { globalThis.fetch = fetch; }
});

test('AnthropicClient accumulates tool_use blocks from input_json_delta fragments', async () => {
    const fetch = globalThis.fetch;
    let request;
    const payload = [
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"fixture__add_numbers"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\":3,"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"b\\":4}"}}',
        'data: {"type":"content_block_stop","index":0}',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
        ''
    ].join('\r\n\r\n');
    globalThis.fetch = async (url, options) => { request = JSON.parse(options.body); return splitResponse(payload); };
    try {
        const tools = [{ name: 'fixture__add_numbers', description: 'Add', input_schema: { type: 'object' } }];
        const result = await new AnthropicClient('test-only-key').streamChat([{ role: 'user', content: '3+4?' }], () => {}, 'claude-sonnet-4-5', { tools });
        assert.deepEqual(request.tools, tools);
        assert.deepEqual(result.toolCalls, [{ id: 'toolu_1', name: 'fixture__add_numbers', arguments: '{"a":3,"b":4}' }]);
    } finally { globalThis.fetch = fetch; }
});
