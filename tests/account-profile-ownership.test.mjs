import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src/app/(tabs)/account.tsx'), 'utf8');

test('ADV-01 profile state records which authenticated user owns the loaded form', () => {
  assert.ok(source.includes("const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);"));
  assert.ok(source.includes('const hasCurrentProfile = Boolean(user && profileOwnerId === user.id);'));
});

test('ADV-01 account switch invalidates previous profile ownership immediately', () => {
  assert.ok(source.includes('const userId = user?.id ?? null;'));
  assert.ok(source.includes('profileOwnerId === user.id'));
  assert.ok(!source.includes('profileOwnerId === userId'));
});

test('ADV-01 loaded profile is assigned to the exact user ID used by the request', () => {
  const queryStart = source.indexOf(".from('profiles')");
  const queryEnd = source.indexOf('return () => { active = false; };', queryStart);
  const queryBlock = source.slice(queryStart, queryEnd);

  assert.ok(queryStart >= 0);
  assert.ok(queryEnd > queryStart);
  assert.ok(queryBlock.includes(".eq('id', userId)"));
  assert.ok(queryBlock.includes('setProfileOwnerId(userId);'));
  assert.ok(queryBlock.includes('if (!active) return;'));
});

test('ADV-01 save fails closed unless profile form belongs to current authenticated user', () => {
  const saveStart = source.indexOf('const saveProfile = async () => {');
  const saveEnd = source.indexOf('const handleSignOut', saveStart);
  const saveBlock = source.slice(saveStart, saveEnd);

  assert.ok(saveStart >= 0);
  assert.ok(saveEnd > saveStart);
  assert.ok(saveBlock.includes('if (!user || !hasCurrentProfile || saving || isSavingRef.current) return;'));
  assert.ok(saveBlock.includes(".eq('id', user.id)"));
});

test('ADV-01 previous-account display name cannot render or be edited under the next account', () => {
  assert.ok(source.includes("value={hasCurrentProfile ? displayName : ''}"));
  assert.ok(source.includes('editable={hasCurrentProfile && !saving}'));
});