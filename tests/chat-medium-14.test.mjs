import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const chat = readFileSync('src/app/(tabs)/chat.tsx', 'utf8');
const match = chat.match(/function localDateKey\(\) \{[\s\S]*?\n\}/);
assert.ok(match, 'localDateKey not found');

test('MEDIUM #14 quota date explicitly uses Europe/Bucharest', () => {
  assert.match(match[0], /timeZone:\s*'Europe\/Bucharest'/);
});

test('MEDIUM #14 quota date follows Bucharest across UTC midnight boundary', () => {
  class FakeDate extends Date {
    constructor() { super('2026-09-09T21:30:00Z'); }
  }

  const context = { Intl, Date: FakeDate };
  vm.createContext(context);
  vm.runInContext(`${match[0]}; result = localDateKey();`, context);

  assert.equal(context.result, '2026-09-10');
});

test('MEDIUM #14 usage query uses the Bucharest quota date helper', () => {
  assert.match(chat, /\.eq\('usage_date', localDateKey\(\)\)/);
});