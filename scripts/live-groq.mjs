// Live browser test against Groq. Requires GROQ_API_KEY in the environment; the key is never written to disk.
// Usage: node scripts/live-groq.mjs <playwright-core entry> <chrome executable>
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const runtime = process.argv[2] || process.env.PLAYWRIGHT_CORE_PATH;
if (!runtime) throw new Error('Pass the path to an installed playwright-core entry point. No packages are downloaded.');
const module = await import(pathToFileURL(path.resolve(runtime)).href);
const { chromium } = module.default || module;

const key = process.env.GROQ_API_KEY;
if (!key) { console.error('GROQ_API_KEY is not set'); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.argv[3] || process.env.CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); };

async function send(text) {
    const before = await page.locator('article.message-assistant:not(.is-streaming)').count();
    await page.getByLabel('Message Open Claude').fill(text);
    await page.getByLabel('Send message', { exact: true }).click();
    await page.waitForFunction(expected => document.querySelectorAll('article.message-assistant:not(.is-streaming)').length >= expected && !document.querySelector('.generation-status'), before + 1, { timeout: 90000 });
    return page.locator('article.message-assistant:not(.is-streaming)').last();
}

try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(k => {
        localStorage.setItem('groq_key', k);
        localStorage.setItem('selected_provider', 'groq');
        localStorage.setItem('selected_model', 'qwen/qwen3.8-27b');
    }, key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Message Open Claude').waitFor();
    await page.waitForFunction(() => localStorage.getItem('selected_model') && document.querySelector('.model-label')?.textContent !== 'Select model', null, { timeout: 30000 });
    await page.screenshot({ path: 'screenshots/live-empty.png' });

    const first = await send('Reply with exactly this sentence: Hello from Open Claude.');
    check('basic streaming response', (await first.innerText()).includes('Hello from Open Claude'));

    const qwenReasoning = await send('What is 17 * 23? Answer briefly.');
    const qwenHeader = qwenReasoning.locator('.thinking-panel-header');
    check('qwen reasoning row shown', await qwenHeader.count() === 1 && /Thought for \d+s/.test(await qwenHeader.innerText()));
    await page.screenshot({ path: 'screenshots/live-qwen-thinking.png' });

    const markdown = await send('Show a tiny markdown demo: one heading, one bold word, a two-item bullet list, and a one-line python code block. Nothing else.');
    check('markdown code block rendered', await markdown.locator('.code-block').count() > 0);
    check('plain code blocks hide the text label', await markdown.locator('.code-heading > span').first().innerText() !== 'text');
    await page.screenshot({ path: 'screenshots/live-conversation.png' });

    const assistantCount = await page.locator('article.message-assistant:not(.is-streaming)').count();
    await page.getByLabel('Retry response').click();
    await page.waitForFunction(expected => document.querySelectorAll('article.message-assistant:not(.is-streaming)').length >= expected && !document.querySelector('.generation-status'), assistantCount, { timeout: 90000 });
    check('retry regenerates without duplicating the turn', await page.locator('article.message-assistant:not(.is-streaming)').count() === assistantCount);

    await page.evaluate(() => { localStorage.setItem('selected_model', 'openai/gpt-oss-120b'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Message Open Claude').waitFor();
    const reasoning = await send('What is 17 * 23? Answer briefly.');
    const thinkingHeader = reasoning.locator('.thinking-panel-header');
    check('reasoning model shows thought summary', await thinkingHeader.count() === 1 && /Thought for \d+s/.test(await thinkingHeader.innerText()));
    await thinkingHeader.click();
    await page.waitForTimeout(400);
    check('thought process expands', await reasoning.locator('#thinking-content-panel').isVisible());
    const labelColor = await reasoning.locator('.thinking-label').evaluate(element => getComputedStyle(element).color);
    check('thinking label is neutral, not purple', !/139, 92, 246|168, 85, 247|124, 58, 237/.test(labelColor), labelColor);
    await page.screenshot({ path: 'screenshots/live-thinking.png' });

    const followUp = await send('Multiply that result by 2. Reply with just the number.');
    check('multi-turn context retained', (await followUp.innerText()).includes('782'));

    const artifactTurn = await send('Build a tiny click-counter game as one self-contained HTML page.');
    check('artifact card replaces raw code in chat', await artifactTurn.locator('.artifact-card').count() === 1 && await artifactTurn.locator('.code-block').count() === 0);
    check('artifact panel opens with sandboxed preview', await page.locator('.artifact-panel iframe[sandbox]').count() === 1);
    await page.screenshot({ path: 'screenshots/live-artifact.png' });
    await page.getByRole('button', { name: 'Close artifact panel', exact: true }).click();

    await page.evaluate(() => { localStorage.setItem('selected_model', 'qwen/qwen3.8-27b'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Message Open Claude').waitFor();
    const qwenArtifact = await send('Draw a simple SVG: a red circle inside a blue ring. Output only one svg code block.');
    check('qwen artifact detected from a plain fence', await qwenArtifact.locator('.artifact-card').count() === 1 && await qwenArtifact.locator('.code-block').count() === 0);
    await page.screenshot({ path: 'screenshots/live-qwen-artifact.png' });
    await page.getByRole('button', { name: 'Close artifact panel', exact: true }).click();

    await page.getByLabel('Choose model').click();
    await page.getByRole('menuitem', { name: 'Model settings' }).click();
    await page.getByRole('button', { name: 'Connections' }).click();
    const providerOptions = await page.locator('#provider option').count();
    check('settings lists all providers', providerOptions >= 14, `${providerOptions} options`);
    check('API key field stays masked', await page.locator('#key-groq').getAttribute('type') === 'password');
    await page.screenshot({ path: 'screenshots/live-settings.png' });

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
    console.error(`HARNESS ERROR: ${error.message.split('\n')[0]}`);
    failures.push(`harness: ${error.message}`);
    await page.screenshot({ path: 'screenshots/live-failure.png' }).catch(() => {});
} finally {
    await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL LIVE CHECKS PASSED');
process.exit(failures.length ? 1 : 0);