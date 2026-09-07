const { ESLint } = require('eslint');
const path = require('node:path');
async function main() {
  const eslint = new ESLint({
    ignore: false,
    overrideConfig: { settings: { 'import/resolver': { [path.resolve('scripts/chat-import-resolver.cjs')]: {} } } },
  });
  const results = await eslint.lintFiles(['supabase/functions/orthodox-chat/index.ts']);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);
  process.exitCode = results.some(result => result.errorCount || result.warningCount) ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
