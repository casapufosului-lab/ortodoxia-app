import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/app/(tabs)/chat.tsx', 'utf8');

test('MEDIUM #13 loads the newest 50 chat messages', () => {
  assert.match(chat, /\.from\('chat_messages'\)[\s\S]*?\.eq\('thread_id', latestThreadId\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.limit\(50\);/);
});

test('MEDIUM #13 restores chronological order before rendering', () => {
  assert.match(chat, /setMessages\(\[\.\.\.data\]\.reverse\(\)\.map\(\(message\) => \(\{/);
});
