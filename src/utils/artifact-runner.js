/**
 * Universal Resilient Artifact Runner
 * Features:
 * - Multi-CDN sequential fallback (unpkg -> cdnjs -> jsdelivr)
 * - Non-fatal optional library loading (Tailwind failure won't crash React/HTML)
 * - Smart content-type auto-detection (routes full HTML vs React JSX dynamically)
 * - In-iframe runtime error boundary and exception isolation
 */

/**
 * Builds a self-contained HTML page that runs a React/JSX artifact with multi-CDN resilience.
 */
export function buildReactArtifactHtml(jsxCode) {
    const trimmed = jsxCode.trim();

    // Auto-detect: if the code is actually a full HTML page, render it as HTML
    if (
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<html') ||
        (trimmed.includes('<head') && trimmed.includes('<body')) ||
        (trimmed.includes('<canvas') && trimmed.includes('<script>') && !trimmed.includes('useState') && !trimmed.includes('function App'))
    ) {
        return buildHtmlArtifactHtml(jsxCode);
    }

    const cleanedCode = jsxCode
        // Strip ES module imports — libs are provided as globals
        .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
        // export default function App -> function App
        .replace(/export\s+default\s+function\s+/g, 'function ')
        .replace(/export\s+default\s+class\s+/g, 'class ')
        // Remove bare "export default App;"
        .replace(/^export\s+default\s+\w+;\s*$/gm, '')
        // Remove other export keywords
        .replace(/^export\s+(function|const|class|let|var)\s+/gm, '$1 ')
        .trim();

    const escapedCode = cleanedCode
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Artifact Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #111; min-height: 100vh; }
  #root { min-height: 100vh; }
  #_loading { padding: 1.5rem; font-family: monospace; font-size: 13px; color: #6b7280; display: flex; align-items: center; gap: 8px; }
  #_error { display: none; padding: 1.25rem; font-family: monospace; font-size: 13px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 1rem; white-space: pre-wrap; line-height: 1.5; }
</style>
</head>
<body>
<div id="_loading">
  <svg style="animation: spin 1s linear infinite; width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
  <span>Loading artifact environment…</span>
</div>
<style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
<div id="_error"></div>
<div id="root"></div>

<script>
// ─── Multi-CDN Resilient Script Loader ─────────────────────────────────────────
const SCRIPT_DEFS = [
  // Tailwind (optional - won't fail artifact if blocked)
  {
    name: 'Tailwind CSS',
    optional: true,
    urls: [
      'https://cdn.tailwindcss.com',
      'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
      'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.js'
    ]
  },
  // React
  {
    name: 'React',
    optional: false,
    urls: [
      'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
      'https://unpkg.com/react@18/umd/react.production.min.js',
      'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js'
    ]
  },
  // ReactDOM
  {
    name: 'ReactDOM',
    optional: false,
    urls: [
      'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
      'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js'
    ]
  },
  // Babel Standalone
  {
    name: 'Babel',
    optional: false,
    urls: [
      'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js',
      'https://unpkg.com/@babel/standalone/babel.min.js',
      'https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js'
    ]
  },
  // Lucide Icons (optional)
  {
    name: 'Lucide Icons',
    optional: true,
    urls: [
      'https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js',
      'https://cdn.jsdelivr.net/npm/lucide-react@latest/dist/umd/lucide-react.js'
    ]
  },
  // Recharts (optional)
  {
    name: 'Recharts',
    optional: true,
    urls: [
      'https://unpkg.com/recharts@2/umd/Recharts.js',
      'https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js'
    ]
  }
];

function loadSingleScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.timeout = 8000;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

async function loadScriptWithFallback(def) {
  for (const url of def.urls) {
    try {
      await loadSingleScript(url);
      return true;
    } catch (e) {
      console.warn('CDN fallback for ' + def.name + ': ' + url + ' failed, trying next…');
    }
  }
  if (def.optional) {
    console.warn('Optional library ' + def.name + ' failed to load, continuing without it.');
    return false;
  }
  throw new Error('Failed to load required library: ' + def.name);
}

function showError(msg) {
  const loadingEl = document.getElementById('_loading');
  if (loadingEl) loadingEl.style.display = 'none';
  const el = document.getElementById('_error');
  if (el) {
    el.style.display = 'block';
    el.textContent = msg;
  }
}

// Catch runtime errors inside iframe
window.onerror = function(msg, url, line, col, err) {
  showError('Runtime error in artifact:\\n' + (err?.message || msg) + (line ? '\\nLine: ' + line : ''));
  return true;
};
window.onunhandledrejection = function(e) {
  showError('Unhandled Promise Rejection:\\n' + (e.reason?.message || e.reason));
};

async function boot() {
  try {
    for (const def of SCRIPT_DEFS) {
      await loadScriptWithFallback(def);
    }

    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined' || typeof Babel === 'undefined') {
      throw new Error('Core React/Babel libraries were not loaded. Please check your network connection.');
    }

    // ── Expose React hooks + globals ──────────────────────────────────
    const {
      useState, useEffect, useRef, useCallback, useMemo, useContext,
      createContext, useReducer, useLayoutEffect, forwardRef, Fragment,
      memo, lazy, Suspense
    } = React;

    Object.assign(window, {
      useState, useEffect, useRef, useCallback, useMemo, useContext,
      createContext, useReducer, useLayoutEffect, forwardRef, Fragment,
      memo, lazy, Suspense, React, ReactDOM
    });

    // Recharts
    if (typeof Recharts !== 'undefined') {
      const rechartExports = [
        'LineChart','Line','BarChart','Bar','PieChart','Pie','Cell',
        'AreaChart','Area','ScatterChart','Scatter','XAxis','YAxis',
        'CartesianGrid','Tooltip','Legend','ResponsiveContainer',
        'RadialBarChart','RadialBar','RadarChart','Radar','PolarGrid',
        'PolarAngleAxis','PolarRadiusAxis','ComposedChart','FunnelChart','Funnel'
      ];
      rechartExports.forEach(k => { if (Recharts[k]) window[k] = Recharts[k]; });
    }

    // Lucide icons
    if (typeof LucideReact !== 'undefined') {
      Object.assign(window, LucideReact);
    }

    // ── Transpile and execute user JSX ─────────────────────────────────
    const userCode = \`${escapedCode}\`;

    const babelResult = Babel.transform(userCode, {
      presets: ['react'],
      filename: 'artifact.jsx'
    });

    new Function(babelResult.code)();

    // ── Resolve and Mount Root Component ──────────────────────────────
    const RootComponent =
      (typeof App       !== 'undefined' && App)       ||
      (typeof Component !== 'undefined' && Component) ||
      (typeof Main      !== 'undefined' && Main)      ||
      (typeof Game      !== 'undefined' && Game)      ||
      (typeof Dashboard !== 'undefined' && Dashboard) ||
      null;

    if (!RootComponent) {
      showError(
        'Could not find a root component.\\n' +
        'Make sure your code defines a component named App, Component, Main, or Game.'
      );
      return;
    }

    const loadingEl = document.getElementById('_loading');
    if (loadingEl) loadingEl.style.display = 'none';

    const rootEl = document.getElementById('root');
    if (rootEl) {
      ReactDOM.createRoot(rootEl).render(React.createElement(RootComponent));
    }

  } catch (err) {
    showError('Error rendering artifact:\\n\\n' + err.message + (err.stack ? '\\n\\n' + err.stack : ''));
  }
}

boot();
</script>
</body>
</html>`;
}

/**
 * Builds a self-contained HTML document for plain HTML/JS/CSS artifacts.
 */
export function buildHtmlArtifactHtml(htmlCode) {
    const trimmed = htmlCode.trim();

    // If it's already a full HTML document, inject error boundary & basic styling if missing
    if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
        return htmlCode;
    }

    // Detect if the content is actually React/JSX
    if (
        (trimmed.includes('import React') || trimmed.includes('export default') || trimmed.includes('useState(')) &&
        !trimmed.includes('<canvas')
    ) {
        return buildReactArtifactHtml(htmlCode);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>HTML Artifact</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; min-height: 100vh; }
</style>
</head>
<body>
${htmlCode}
</body>
</html>`;
}

