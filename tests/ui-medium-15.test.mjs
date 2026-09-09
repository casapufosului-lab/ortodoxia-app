import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
const calendar = readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');

for (const [name, source] of [['Home', home], ['Calendar', calendar]]) {
  test(`MEDIUM #15 ${name} keeps today in refreshable state`, () => {
    assert.match(source, /const \[today, setToday\] = useState\(\(\) => new Date\(\)\);/);
    assert.doesNotMatch(source, /const today = useMemo\(\(\) => new Date\(\), \[\]\);/);
  });

  test(`MEDIUM #15 ${name} refreshes today while screen stays open`, () => {
    assert.match(source, /setInterval\(refreshToday, 60_000\)/);
    assert.match(source, /clearInterval\(intervalId\)/);
  });

  test(`MEDIUM #15 ${name} refreshes today when native app becomes active`, () => {
    assert.match(source, /AppState\.addEventListener\('change'/);
    assert.match(source, /state === 'active'\) refreshToday\(\)/);
    assert.match(source, /appStateListener\?\.remove\(\)/);
  });
}