import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildChatMarkdown,
    buildChatMarkdownFilename,
} from '../src/utils/chat-markdown-export.js';

test('exports complete user and assistant messages without reasoning or drafts', () => {
    const markdown = buildChatMarkdown({
        chat: {
            title: 'Learning / Article',
            messages: [
                {
                    role: 'user',
                    content: 'Explain this article',
                    contextSources: [{ title: 'Article', url: 'https://example.com/a', isCurrent: true }],
                },
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: '**Answer**' },
                        { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
                    ],
                    reasoning_content: 'hidden',
                },
                { role: 'system', content: 'hidden system' },
            ],
        },
        exportedAt: new Date(2026, 7, 27, 9, 5),
    });

    assert.match(markdown, /^# Learning \/ Article/m);
    assert.match(markdown, /\[Article\]\(https:\/\/example\.com\/a\)/);
    assert.match(markdown, /### 用户 1\n\nExplain this article/);
    assert.match(markdown, /### 助手 1\n\n\*\*Answer\*\*/);
    assert.match(markdown, /!\[图片 1\]\(data:image\/png;base64,QUJD\)/);
    assert.doesNotMatch(markdown, /hidden/);
});

test('uses the active page as a labelled fallback for legacy chats', () => {
    const markdown = buildChatMarkdown({
        chat: { title: 'Legacy', messages: [{ role: 'user', content: 'Question' }] },
        fallbackSource: { title: 'Current article', url: 'https://example.com/current' },
    });
    assert.match(markdown, /Current article（导出时页面）/);
});

test('does not export empty conversations and sanitizes filenames', () => {
    assert.equal(buildChatMarkdown({ chat: { messages: [] } }), '');
    assert.equal(
        buildChatMarkdownFilename({ title: 'A/B:C' }, new Date(2026, 7, 27, 9, 5)),
        'A-B-C-20260827-0905.md'
    );
});
