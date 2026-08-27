function normalizeString(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatExportTime(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sanitizeFilenamePart(value, fallback = 'cerebr-chat') {
    const sanitized = normalizeString(value, fallback)
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .slice(0, 96)
        .trim();
    return sanitized || fallback;
}

export function buildChatMarkdownFilename(chat, date = new Date()) {
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    return `${sanitizeFilenamePart(chat?.title)}-${timestamp}.md`;
}

function messageContentToMarkdown(content, labels) {
    if (!Array.isArray(content)) return String(content ?? '').trim();

    const blocks = [];
    let imageIndex = 0;
    content.forEach((part) => {
        if (part?.type === 'text' && String(part.text || '').trim()) {
            blocks.push(String(part.text).trim());
            return;
        }
        if (part?.type === 'image_url') {
            const url = normalizeString(part?.image_url?.url);
            if (!url) return;
            imageIndex += 1;
            blocks.push(`![${labels.image} ${imageIndex}](${url})`);
        }
    });
    return blocks.join('\n\n').trim();
}

function collectSources(messages = [], fallbackSource = null, labels) {
    const sourceMap = new Map();
    messages.forEach((message) => {
        (Array.isArray(message?.contextSources) ? message.contextSources : []).forEach((source) => {
            const title = normalizeString(source?.title);
            const url = normalizeString(source?.url);
            if (!title && !url) return;
            sourceMap.set(url || title, { title, url, fallback: false });
        });
    });

    if (sourceMap.size === 0 && fallbackSource) {
        const title = normalizeString(fallbackSource.title);
        const url = normalizeString(fallbackSource.url);
        if (title || url) {
            sourceMap.set(url || title, {
                title: title || labels.exportPage,
                url,
                fallback: true,
            });
        }
    }
    return Array.from(sourceMap.values());
}

export function buildChatMarkdown({
    chat,
    exportedAt = new Date(),
    fallbackSource = null,
    labels: labelOverrides = {},
} = {}) {
    const labels = {
        exportedAt: '导出时间',
        sources: '文章来源',
        conversation: '对话',
        user: '用户',
        assistant: '助手',
        image: '图片',
        exportPage: '导出时页面',
        ...labelOverrides,
    };
    const messages = (Array.isArray(chat?.messages) ? chat.messages : [])
        .filter((message) => message?.role === 'user' || message?.role === 'assistant');
    if (messages.length === 0) return '';

    const title = normalizeString(chat?.title, 'Cerebr Chat');
    const sources = collectSources(messages, fallbackSource, labels);
    const sections = [
        `# ${title}`,
        `- ${labels.exportedAt}: ${formatExportTime(exportedAt)}`,
    ];

    if (sources.length > 0) {
        sections.push(`## ${labels.sources}`);
        sources.forEach((source) => {
            const titleText = source.fallback
                ? `${source.title}（${labels.exportPage}）`
                : (source.title || source.url);
            sections.push(source.url ? `- [${titleText}](${source.url})` : `- ${titleText}`);
        });
    }

    sections.push('---', `## ${labels.conversation}`);
    let userIndex = 0;
    let assistantIndex = 0;
    messages.forEach((message) => {
        const isUser = message.role === 'user';
        const index = isUser ? ++userIndex : ++assistantIndex;
        const roleLabel = isUser ? labels.user : labels.assistant;
        const content = messageContentToMarkdown(message.content, labels) || '—';
        sections.push(`### ${roleLabel} ${index}`, content);
    });

    return `${sections.join('\n\n')}\n`;
}

export function downloadChatMarkdown(markdown, filename) {
    const blob = new Blob([String(markdown || '')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = normalizeString(filename, 'cerebr-chat.md');
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
