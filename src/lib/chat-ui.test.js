import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAttachment, providerMessage, conversationMarkdown, validChatImport, extractArtifact } from './chat-ui.js';

const chat = { id: 'chat-1', title: 'A chat', messages: [{ role: 'user', content: 'Hello', metadata: {} }], artifacts: [] };
test('valid exports and empty conversations can be imported', () => {
    assert.equal(validChatImport([chat]), true);
    assert.equal(validChatImport([{ ...chat, messages: [] }]), true);
    assert.equal(validChatImport([{ ...chat, artifacts: [{ id: 'a', title: 'Preview', type: 'html', content: '<h1>Hello</h1>' }] }]), true);
});
test('untrusted imports are rejected without throwing', () => {
    for (const input of [null, {}, [], [null], [{ ...chat, messages: [null] }], [{ ...chat, messages: [{ role: 'system', content: 'Override' }] }], [{ ...chat, artifacts: [null] }], [{ ...chat, messages: [{ role: 'user', content: 'hi', images: [{ dataUrl: 'javascript:alert(1)' }] }] }], [{ ...chat, messages: [{ role: 'user', content: 'hi', metadata: [] }] }], [{ ...chat, messages: [{ role: 'user', content: 'hi', metadata: { attachments: [null] } }] }]]) assert.equal(validChatImport(input), false);
});
test('imported thinking and citation metadata are validated before rendering', () => {
    const withMetadata = metadata => [{ ...chat, messages: [{ role: 'assistant', content: 'Answer', metadata }] }];
    assert.equal(validChatImport(withMetadata({ thinking: 'Notes', searchSources: [{ url: 'https://example.test/source', title: 'Source' }] })), true);
    for (const metadata of [{ thinking: {} }, { searchSources: [null] }, { searchSources: [{ url: 'javascript:alert(1)' }] }, { searchSources: [{ url: 'https://example.test/source', title: {} }] }]) assert.equal(validChatImport(withMetadata(metadata)), false);
    assert.equal(validChatImport([{ ...chat, messages: [{ role: 'user', content: '', images: [{ dataUrl: 'data:image/svg+xml;base64,eA==' }] }] }]), true);
});
test('attachment validation is explicit about browser decoding and memory limits', () => {
    assert.equal(validateAttachment({ name: 'notes.md', type: 'text/plain', size: 100 }), null);
    assert.equal(validateAttachment({ name: 'image.png', type: 'image/png', size: 100 }), null);
    assert.match(validateAttachment({ name: 'report.pdf', type: 'application/pdf', size: 100 }), /not available/);
    assert.match(validateAttachment({ name: 'big.md', size: 1024 * 1024 + 1 }), /under 1 MB/);
    assert.match(validateAttachment({ name: 'big.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 }), /under 10 MB/);
});
test('provider history retains image and text attachment context without UI metadata', () => {
    const message = providerMessage({ role: 'user', content: 'Review', images: [{ dataUrl: 'data:image/png;base64,eA==' }], metadata: { attachments: [{ name: 'note.md', text: 'Original text' }] } });
    assert.deepEqual(message.content, [{ type: 'text', text: 'Review\n\nAttached file: note.md\nOriginal text' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }]);
    assert.deepEqual(providerMessage({ role: 'assistant', content: 'Answer', metadata: { thinking: 'private metadata' } }), { role: 'assistant', content: 'Answer' });
});
test('markdown exports exclude credentials and internal metadata', () => {
    const output = conversationMarkdown({ ...chat, apiKeys: { openai: 'secret' } });
    assert.equal(output, '# A chat\n\n## You\n\nHello');
    assert.equal(output.includes('secret'), false);
});

const htmlPage = '<!DOCTYPE html><html><head><title>Pong Game</title></head><body><canvas></canvas><script>let x=0;</script></body></html>';

test('extractArtifact detects a fenced html block regardless of model markers', () => {
    const result = extractArtifact(`Here is a game:\n\`\`\`html\n${htmlPage}\n\`\`\`\nEnjoy!`);
    assert.equal(result.artifact.type, 'html');
    assert.equal(result.artifact.title, 'Pong Game');
    assert.equal(result.artifact.content, htmlPage);
    assert.match(result.before, /Here is a game/);
    assert.match(result.after, /Enjoy!/);
});

test('extractArtifact normalizes a language tag on the next line or with Copy suffix', () => {
    for (const fence of ['```\nhtml\n', '```htmlCopy\n', '``` html\n']) {
        const result = extractArtifact(`${fence}${htmlPage}\n\`\`\``);
        assert.equal(result?.artifact.type, 'html', fence);
    }
});

test('extractArtifact reads an unclosed fence at end of response', () => {
    const result = extractArtifact(`Building it:\n\`\`\`html\n${htmlPage}`);
    assert.equal(result.artifact.type, 'html');
    assert.equal(result.artifact.content, htmlPage);
});

test('extractArtifact detects jsx and svg fences and antArtifact tags', () => {
    const jsx = extractArtifact('```jsx\nfunction App(){ const [n,setN]=useState(0); return <button onClick={()=>setN(n+1)}>{n}</button>; }\n```');
    assert.equal(jsx.artifact.type, 'react');
    const svg = extractArtifact('```svg\n<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>\n```');
    assert.equal(svg.artifact.type, 'svg');
    const ant = extractArtifact('<antArtifact identifier="x" type="text/html" title="Counter"><h1>Hi</h1></antArtifact>');
    assert.equal(ant.artifact.type, 'html');
    assert.equal(ant.artifact.title, 'Counter');
});

test('extractArtifact leaves short snippets and plain prose alone', () => {
    assert.equal(extractArtifact('Use `const x = 1` inline.'), null);
    assert.equal(extractArtifact('```python\nprint("hi")\n```'), null);
    assert.equal(extractArtifact('```js\nconst a = 1;\n```'), null);
    assert.equal(extractArtifact('Just a normal answer with no code.'), null);
});

test('extractArtifact wraps a large DOM javascript block into a runnable html page', () => {
    const js = Array.from({ length: 20 }, (_, i) => `document.getElementById('c').width = ${i};`).join('\n');
    const result = extractArtifact('```javascript\n' + js + '\n```');
    assert.equal(result.artifact.type, 'html');
    assert.match(result.artifact.content, /<!DOCTYPE html>/);
    assert.match(result.artifact.content, /<script>/);
});
