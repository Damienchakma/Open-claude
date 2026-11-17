# Claude interface reference inventory

Inspected 2026-11-17. Reference: https://claude.ai/new. Independent frontend implementation; no authenticated source bundles, credentials, or proprietary assets extracted.

## Evidence and access boundary

- REA capture `ev_8449bc7d6a030f44c276c6157e0eb467465e763735c04c339c3b5a0b4feeb082`: Chrome 157, 1280 × 720, light appearance, 1.5-second settle; Cloudflare security verification, not the chat interface.
- REA capture `ev_340d5af5ef1b7d23cd19dead0fd00e06518357bf34d55b120b9f479344e43469`: fresh profile with an 8-second settle; same verification screen. No protection bypass attempted.
- Qoder's normal browser reaches the public sign-in page after navigating to `/new`. No account sign-in was attempted. `screenshots/claude-public-entry.png` records this boundary, not the chat interface.
- Public sign-in computed styles: 14 px body; proprietary `anthropic-sans` and `anthropic-serif` families; body background rgb(252, 252, 251). These observations cannot establish signed-in chat colors or dimensions.

## Core state inventory

| State | Reference coverage | Implementation and verification target |
| --- | --- | --- |
| New conversation | Inaccessible behind sign-in | Centered serif greeting, warm paper layout, composer, separate prompt chips |
| Sidebar open/collapsed | Inaccessible | Fixed-width navigation, compact rail, mobile overlay, local recents |
| User/assistant turns | Inaccessible | Right-aligned user surface, unboxed serif assistant prose, action toolbar |
| Markdown/code | Inaccessible | Existing markdown/GFM and Prism dependencies; plain, fenced and unlabelled code; tables and overflow |
| Composer | Inaccessible | Auto-growing input, Enter/Shift+Enter, attachment previews, actual model/provider menu, send/stop |
| Attachments | Inaccessible | Browser image and text reading; explicit rejection of formats without decoders |
| Dropdown/context menus | Inaccessible | Dismissal, Escape, arrow-key navigation, rename/delete/export/copy |
| Settings/modals | Inaccessible | Native modal focus containment, profile/appearance, existing provider configuration, local data controls |
| Loading/streaming | Inaccessible | Existing provider streaming, honest errors, cancellation, loading indicator |
| Scrolling | Inaccessible | Single conversation scroller, pinned composer, follow only when near bottom, jump-to-bottom |
| Responsive/animation | Inaccessible | Desktop rail, mobile drawer, responsive menus/modals, reduced-motion support |

Chat geometry and spacing are reconstruction choices, not measurements of current Claude. Existing open-license Source Serif 4/Inter fonts and independently authored SVG/UI are used instead of extracting Anthropic fonts or assets. Current-version pixel-perfect fidelity requires user-supplied screenshots or authorized visible reference access.

## Scope exclusions

No subscriptions, payments, pricing, artificial message limits, promotional banners, enterprise infrastructure, backend, database, or simulated AI replies. The labelled example conversation only demonstrates rendering. Real generation uses the project's existing direct browser-to-provider clients; keys and conversation data stay in local browser storage, with keys excluded from exports.

## Component mapping

The existing ChatMode generation pipeline remains in place. ChatWorkspace owns the shell and navigation; ChatComposer is shared by empty and active conversations; Sidebar owns navigation; Menu and Dialog own repeated dismissal/focus behaviour. ChatMessage reuses existing markdown, code, citations, thinking and artifact rendering. SettingsModal retains local provider/API configuration with new settings navigation.

## Verification results

Final verification on 2026-11-17:

- 18 Node unit tests passed: import validation, unsafe citation/thinking metadata, attachment decoding boundaries, image/text request context, credential-free markdown exports, Ollama multimodal conversion, fragmented JSON/UTF-8 streams for Groq, OpenAI, LM Studio and Ollama, Anthropic message conversion and SSE text/thinking deltas with browser-access headers, Claude 3 token caps and stream errors, keyless OpenAI-compatible custom endpoints, and LLMFactory routing for OpenRouter/Anthropic/unknown providers.
- Live Groq verification (2026-11-17, `scripts/live-groq.mjs`, key supplied via environment only): streaming response, markdown/code rendering, plain-code label suppression, retry without turn duplication, `openai/gpt-oss-120b` reasoning row ("Thought for *n*s", neutral colour, expandable), multi-turn context, 14-provider Connections list, masked key field, zero uncaught page errors. Groq's catalog no longer serves `llama-3.3-70b-versatile`; defaults now use `openai/gpt-oss-120b` / `qwen/qwen3.8-27b`.
- 14 Chrome browser check groups passed with zero uncaught page errors. They cover empty/conversation layouts, markdown/table/code rendering, copy/download/edit, search/rename/switch, dialog keyboard focus, themes, actual model/provider selection, text/image-only attachments, incognito isolation, cancellation followed by another request, incremental streaming, honest provider errors, isolated artifact previews including separate tabs, mobile menus/drawer focus, backup import/export, last-chat deletion, damaged-history preservation and explicit recovery.
- Browser coverage: 1440 × 900 desktop; 390 × 844 portrait; 320 × 568 narrow portrait; 844 × 390 landscape/tablet layout. Light, dark and system-theme transitions were exercised. Reduced-motion mode was enabled for deterministic screenshots; ordinary animations were not quantitatively profiled.
- External provider calls were intercepted with labelled test fixtures in an isolated browser context. No real API credentials, paid inference, or live Tavily search were used. This verifies frontend request/rendering behaviour, not provider availability or every provider's current live API.
- Production Vite build passed. Focused ESLint checks of touched modules reported zero errors and nine existing unused-variable warnings; repository-wide lint is not claimed because no ESLint configuration is provided.
- Windows-aware diff whitespace check passed, retaining the repository's CRLF convention for the existing main stylesheet.

Reasoning / artifacts / MCP round (2026-11-17, later same day):

- 33 Node unit tests passed, adding: Groq Qwen parsed-reasoning request parameters and thinking routing; OpenAI-compatible fragmented `tool_calls` accumulation and tool-turn preservation; Anthropic `tool_use` / `input_json_delta` accumulation; MCP client JSON-RPC over Streamable HTTP with session header, SSE response parsing, HTTP/JSON-RPC/tool-level errors, disabled-server skipping, abort propagation, name slugging and corrupt-storage tolerance; six artifact-parser cases (fenced HTML titles, fence normalisation variants, unclosed fences, JSX/SVG/antArtifact, negative cases, DOM-JS wrapping).
- 18 Chrome browser check groups passed, adding artifact card ↔ panel reopen/Preview/Code tabs and two MCP groups: Settings → MCP servers add/Test/remove against a same-origin fake MCP server, and a full model tool-call round-trip (fragmented Groq `tool_calls` → `tools/call` → second provider round carrying `role: tool` result → final answer), asserting the `Mcp-Session-Id` reuse.
- Live Groq suite re-run: 15 checks passed, including Qwen 3.8 reasoning row (Groq requires `reasoning_format: parsed` plus a non-default `reasoning_effort`; the default emits no reasoning) and artifact detection from both `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` plain fences. Artifacts now use one fence-based contract for every model and a Claude-style panel (title/type header, Preview/Code tabs, copy/download/refresh/open-in-new-tab, filename footer).
- Live MCP suite (`scripts/live-mcp.mjs`, 4 checks): a real local Streamable HTTP MCP server plus real Groq `openai/gpt-oss-120b` tool calling — initialize/tools/list/tools/call observed server-side, arguments intact, session header reused, answer grounded in the tool result. Screenshot `screenshots/live-mcp.png`; settings screenshot `screenshots/desktop-settings-mcp.png`.
- MCP scope: browser-only Streamable HTTP/SSE transport with CORS; stdio servers require an HTTP bridge; tool calling implemented for OpenAI-compatible and Anthropic clients only. These limits are stated in Settings and the README rather than hidden.

Provider default refresh (2026-11-17, later same day):

- Default model IDs re-verified against official catalogs/docs and replaced where retired: Anthropic `claude-sonnet-5-5`, OpenAI `gpt-6-astra`, Gemini `gemini-4-hydrogen` (2.5 deprecated), xAI `grok-4.7` (grok-4 retired), Mistral `mistral-large-4` (Medium 3.5 deprecated), DeepSeek `deepseek-flash` (`deepseek-chat` retired 2026-07-24), Together `moonshotai/Kimi-K3.1-Pro`, Cerebras `gpt-oss-120b`, Fireworks `accounts/fireworks/models/deepseek-v4p1-flash-1017`, Ollama `qwen3`. Groq kept `openai/gpt-oss-120b`, confirmed against its live `/models` catalog; OpenRouter kept the evergreen `openrouter/auto`.
- Touched: `providers.js` defaults, client parameter fallbacks, `ModelService.js` fallback catalogs/vision patterns/vision suggestions, `IntelligentSearchTool.js` helper models, README provider table, mocked UI fixture IDs (vision path now exercises OpenAI `gpt-6-astra`, since Groq's current catalog has no vision model).
- Re-ran after the refresh: 33 unit tests, 18 browser groups, 15 live Groq checks and the production build — all passed. Other providers' defaults are doc/catalog-verified, not live-inference-verified.

The REA local interaction replay opened the app, selected Account menu → View example conversation, waited for the explicit example label, and captured accessibility/screenshot/URL successfully. Retained parent evidence: `ev_fdcb7a5f439bf0580d17f7a497b5426d8b4d18c164a3908a139bed00d0ccf1a6`; summary projection: `ev_79e3bcb956ee9e74224b8b948417490f739d4248e58c7ec60c6f97d4bafdea32`. This replay preceded the final refinements; the final Chrome regression suite above verifies those refinements.

## Reproduce the checks

From the project directory, using the working local Node installation and the already installed Playwright/Chrome (no package download):

```bash
NODE="C:/Users/damie/AppData/Local/hermes/tools/node-26.12.1-win32-x64/node.exe"
"$NODE" --test src/lib/chat-ui.test.js src/lib/llm/clients.test.js src/lib/mcp.test.js
"$NODE" node_modules/vite/bin/vite.js build
"$NODE" scripts/test-ui.mjs "../rea-runtime/node_modules/rea-agents/node_modules/playwright-core/index.js" "C:/Program Files/Google/Chrome/Application/chrome.exe"
GROQ_API_KEY=... "$NODE" scripts/live-groq.mjs "../rea-runtime/node_modules/rea-agents/node_modules/playwright-core/index.js" "C:/Program Files/Google/Chrome/Application/chrome.exe"
GROQ_API_KEY=... "$NODE" scripts/live-mcp.mjs "../rea-runtime/node_modules/rea-agents/node_modules/playwright-core/index.js" "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

The browser suite expects the existing Vite dev server at http://127.0.0.1:5173/. Start it with `"$NODE" node_modules/vite/bin/vite.js --host 127.0.0.1` if needed. The test script accepts an installed Playwright entry point and Chrome executable as arguments, or `PLAYWRIGHT_CORE_PATH` / `CHROME_PATH` environment variables.

## Visual review and remaining limitations

Reviewed screenshots include `desktop-empty.png`, `desktop-conversation.png`, `desktop-settings-dark.png`, `desktop-streaming.png`, `mobile-390.png`, `mobile-320.png`, `mobile-844.png`, `mobile-sidebar.png`, `mobile-settings.png` and `mobile-conversation.png` under `screenshots/`. Iteration fixed clipped dropdowns, model-menu autofocus dismissal, modal/drawer keyboard containment, assistant mark/action sizing, dark surfaces and small-screen overflow. The initial workspace screenshot is retained for comparison.

There is no valid screenshot-to-screenshot pixel comparison against Claude's signed-in chat: only its public sign-in/security boundary was accessible. Exact current signed-in Claude fidelity remains unverified. The implementation intentionally uses original assets and the existing frontend stack, without subscriptions, backend infrastructure or private Anthropic services.

Build warnings remain for outdated browser-compatibility datasets and a large JavaScript chunk (~1.85 MB uncompressed, including retained editor/PDF/preview dependencies). Cross-browser Safari/Firefox testing, React-preview external CDN availability, and live search integration remain unverified; live inference is verified for Groq only (chat, reasoning, artifacts and MCP tool calling). MCP stdio servers and non-OpenAI/Anthropic tool calling are out of scope for a backend-free browser app. Frontend API keys are inherently visible to code running in the app's origin; preview sandboxes reduce artifact access but do not make client-side credentials server secrets.
