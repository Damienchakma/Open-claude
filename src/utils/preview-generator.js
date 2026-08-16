
export function generatePreviewHTML(files) {
    // Extract all component code
    const appCode = files['src/App.tsx'] || '';

    // Process component files to remove exports and imports for the browser bundle
    // simpler approach: we'll bundle them all into one script for now or use a simple module system simulation
    // For this implementation, we will concatenate them and use Babel.

    // We need to resolve imports roughly.
    // A simple strategy is to make all components available globally or in a scope.

    const componentFiles = Object.entries(files)
        .filter(([path]) => (path.endsWith('.tsx') || path.endsWith('.jsx')) && path !== 'src/App.tsx' && path !== 'src/index.tsx')
        .map(([path, code]) => {
            // Remove imports
            let cleanCode = code.replace(/import\s+.*?from\s+['"].*?['"];?/g, '');
            // Remove default export
            cleanCode = cleanCode.replace(/export\s+default\s+/g, '');
            // Remove named exports
            cleanCode = cleanCode.replace(/export\s+/g, '');
            return cleanCode;
        });

    let mainAppCode = appCode.replace(/import\s+.*?from\s+['"].*?['"];?/g, '');
    mainAppCode = mainAppCode.replace(/export\s+default\s+function\s+App/, 'function App');
    // If it was just "export default App", handle that
    mainAppCode = mainAppCode.replace(/export\s+default\s+App;?/, '');

    const combinedCode = [
        ...componentFiles,
        mainAppCode
    ].join('\n\n');

    // Create HTML with bundled code
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        /* Add some basic scrollbar styling */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // Prevent common errors
        window.process = { env: { NODE_ENV: 'production' } };
        
        try {
            ${combinedCode}
            
            // Note: We assume the main component is named 'App'
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
        } catch (err) {
            document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">' + err.toString() + '</div>';
            console.error(err);
        }
    </script>
</body>
</html>
    `;
}
