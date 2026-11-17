export function validateAttachment(file) {
    if (file.type?.startsWith('image/')) {
        return file.size > 10 * 1024 * 1024 ? 'This image is too large to keep in browser memory. Choose an image under 10 MB.' : null;
    }
    if (!/\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|log|sql|sh)$/i.test(file.name)) {
        return 'Choose an image or text-based file. PDF and office document decoding is not available in this frontend.';
    }
    return file.size > 1024 * 1024 ? 'Choose a text file under 1 MB so it can be read in the browser.' : null;
}

export function providerMessage(message) {
    const files = message.metadata?.attachments || [];
    const text = message.content + files.map(file => `\n\nAttached file: ${file.name}\n${file.text || ''}`).join('');
    const images = message.images || [];
    return {
        role: message.role,
        content: images.length ? [{ type: 'text', text }, ...images.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl } }))] : text
    };
}

export function conversationMarkdown(chat) {
    return `# ${chat.title}\n\n` + chat.messages.map(message => `## ${message.role === 'user' ? 'You' : 'Open Claude'}\n\n${message.content}`).join('\n\n');
}

export function downloadText(name, text, type = 'text/markdown') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function normalizeArtifactFences(text) {
    return text
        .replace(/```[ \t]*[\r\n]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*Copy?[ \t]*[\r\n]+/gi, '```$1\n')
        .replace(/```[ \t]*(html|jsx|react|tsx|svg|javascript|js|typescript|ts)Copy[ \t]*[\r\n]+/gi, '```$1\n')
        .replace(/```[ \t]+(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]+[\r\n]+/gi, '```$1\n')
        .replace(/```(html|jsx|react|tsx|svg|javascript|js|typescript|ts)[ \t]*\r\n/gi, '```$1\n');
}

const artifactTitle = (content, fallback) => {
    const htmlTitle = /<title>([^<]+)<\/title>/i.exec(content)?.[1];
    const comment = /^\s*(?:\/\/|\/\*+|<!--|#)\s*(.+?)(?:\*\/|-->)?\s*$/m.exec(content)?.[1];
    return (htmlTitle || comment || fallback).replace(/["'`]/g, '').trim().slice(0, 80) || fallback;
};

// Finds the first artifact-worthy block in a response, independent of model-specific markers.
// Returns { artifact, before, after } so callers can splice a card marker in place of the source.
export function extractArtifact(text) {
    if (!text) return null;

    const ant = /(?:```[ \t]*(?:xml|html)?[ \t]*Copy?[ \t]*\r?\n)?[ \t]*<antArtifact\s+([^>]+)>([\s\S]*?)<\/antArtifact>[ \t]*(?:\r?\n```)?/i.exec(text);
    if (ant) {
        const attrs = ant[1];
        const content = ant[2].trim();
        const rawType = (/type=["']?([^"'\s>]+)/i.exec(attrs)?.[1] || '').toLowerCase();
        const isReact = rawType.includes('react') || rawType.includes('jsx') ||
            (!rawType.includes('html') && /import React|export default function|useState\(/.test(content) && !content.startsWith('<!DOCTYPE') && !content.startsWith('<html'));
        const type = rawType.includes('svg') ? 'svg' : rawType.includes('markdown') || rawType.includes('paper') ? 'markdown' : isReact ? 'react' : 'html';
        const title = (/title=["']([^"']+)["']/i.exec(attrs)?.[1] || artifactTitle(content, 'Interactive Artifact')).replace(/["'`]/g, '').trim();
        return {
            artifact: { type, language: type === 'react' ? 'jsx' : type, title, content },
            before: text.slice(0, ant.index),
            after: text.slice(ant.index + ant[0].length)
        };
    }

    const normalized = normalizeArtifactFences(text);
    const lines = normalized.split('\n');
    let start = -1, lang = '', body = [];
    for (let i = 0; i < lines.length; i++) {
        if (start === -1) {
            const open = /^```([\w+-]*)[ \t]*$/.exec(lines[i]);
            if (open) { start = i; lang = open[1].toLowerCase(); body = []; }
            continue;
        }
        if (/^```[ \t]*$/.test(lines[i]) || i === lines.length - 1) {
            if (i === lines.length - 1 && !/^```[ \t]*$/.test(lines[i])) body.push(lines[i]);
            const content = body.join('\n').trim();
            const lineCount = content.split('\n').length;
            const explicit = ['html', 'jsx', 'react', 'tsx', 'svg'].includes(lang);
            const jsLike = ['javascript', 'js', 'typescript', 'ts'].includes(lang) && lineCount > 15;
            const noLang = lang === '' && lineCount > 30 && /<!DOCTYPE|<html|function App|useState|export default/.test(content);
            if (content && (explicit || jsLike || noLang)) {
                let type, language, fallbackTitle;
                if (lang === 'svg' || (!lang && content.startsWith('<svg'))) { type = 'svg'; language = 'svg'; fallbackTitle = 'SVG Graphic'; }
                else if (['jsx', 'react', 'tsx'].includes(lang) || (jsLike && !/document\.|getElementById|addEventListener|<canvas/.test(content))) { type = 'react'; language = 'jsx'; fallbackTitle = 'Interactive Component'; }
                else if (jsLike) {
                    type = 'html'; language = lang.startsWith('ts') ? 'typescript' : 'javascript'; fallbackTitle = 'Interactive Application';
                    return {
                        artifact: { type, language, title: artifactTitle(content, fallbackTitle), content: `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#111}</style></head>\n<body>\n<script>\n${content}\n</script>\n</body>\n</html>` },
                        before: lines.slice(0, start).join('\n'),
                        after: lines.slice(i + 1).join('\n')
                    };
                }
                else { type = 'html'; language = 'html'; fallbackTitle = 'HTML Application'; }
                return {
                    artifact: { type, language, title: artifactTitle(content, fallbackTitle), content },
                    before: lines.slice(0, start).join('\n'),
                    after: lines.slice(i + 1).join('\n')
                };
            }
            start = -1; lang = ''; body = [];
        } else {
            body.push(lines[i]);
        }
    }

    const rawHtml = /<!DOCTYPE html[\s\S]*?<\/html>/i.exec(normalized);
    if (rawHtml) {
        return {
            artifact: { type: 'html', language: 'html', title: artifactTitle(rawHtml[0], 'HTML Application'), content: rawHtml[0] },
            before: normalized.slice(0, rawHtml.index),
            after: normalized.slice(rawHtml.index + rawHtml[0].length)
        };
    }
    return null;
}

export function validChatImport(value) {
    const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
    return Array.isArray(value) && value.length > 0 && value.every(chat =>
        object(chat) && typeof chat.id === 'string' && typeof chat.title === 'string' && Array.isArray(chat.messages) &&
        chat.messages.every(message => object(message) && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' &&
            (message.images === undefined || (Array.isArray(message.images) && message.images.every(image => object(image) && typeof image.dataUrl === 'string' && /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,/i.test(image.dataUrl)))) &&
            (message.metadata === undefined || (object(message.metadata) &&
                (message.metadata.thinking == null || typeof message.metadata.thinking === 'string') &&
                (message.metadata.searchSources === undefined || (Array.isArray(message.metadata.searchSources) && message.metadata.searchSources.every(source => object(source) && typeof source.url === 'string' && /^https?:\/\//i.test(source.url) && (source.title === undefined || typeof source.title === 'string')))) &&
                (message.metadata.attachments === undefined || (Array.isArray(message.metadata.attachments) && message.metadata.attachments.every(file => object(file) && typeof file.name === 'string' && typeof file.text === 'string')))))) &&
        (chat.artifacts === undefined || (Array.isArray(chat.artifacts) && chat.artifacts.every(artifact => object(artifact) && typeof artifact.id === 'string' && typeof artifact.title === 'string' && typeof artifact.type === 'string' && typeof artifact.content === 'string')))
    );
}
