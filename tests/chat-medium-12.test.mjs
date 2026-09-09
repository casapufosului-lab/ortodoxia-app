import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/app/(tabs)/chat.tsx', 'utf8');
const supabase = readFileSync('src/lib/supabase.ts', 'utf8');
const backend = readFileSync('supabase/functions/orthodox-chat/index.ts', 'utf8');
const config = readFileSync('supabase/config.toml', 'utf8');

test('MEDIUM #12 client no longer sends a resettable guestId', () => {
  assert.equal(chat.includes('GUEST_ID_STORAGE_KEY'), false);
  assert.equal(chat.includes('ensureGuestId'), false);
  assert.equal(chat.includes('guestId:'), false);
});

test('MEDIUM #12 guest chat uses a separate anonymous Supabase session', () => {
  assert.match(chat, /ensureGuestChatSession\(\)/);
  assert.match(chat, /user \? supabase : chatGuestSupabase/);
  assert.match(supabase, /storageKey:\s*'ortodoxia-chat-guest-auth'/);
  assert.match(supabase, /signInAnonymously\(\)/);
});

test('MEDIUM #12 backend trusts only verified user identity for quota', () => {
  assert.equal(backend.includes('body.guestId'), false);
  assert.match(backend, /p_user_id:\s*user\.id/);
  assert.match(backend, /p_guest_id:\s*null/);
  assert.match(backend, /safety_identifier:\s*user\.id/);
});

test('MEDIUM #12 anonymous users do not persist chat history', () => {
  assert.match(backend, /const isAnonymous = user\?\.is_anonymous === true/);
  assert.match(backend, /if \(user && !isAnonymous && !threadId\)/);
  assert.equal((backend.match(/if \(user && !isAnonymous && threadId\)/g) ?? []).length, 3);
});

test('MEDIUM #12 local Supabase config enables anonymous sign-ins', () => {
  assert.match(config, /\[auth\][\s\S]*enable_anonymous_sign_ins\s*=\s*true/);
});
