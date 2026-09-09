import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import ts from 'typescript';

test('MEDIUM #20 backend edge functions typecheck outside app tsconfig', () => {
  const files = [
    resolve('supabase/functions/live-services-status/index.ts'),
    resolve('supabase/functions/revenuecat-webhook/index.ts'),
  ];
  const shim = resolve('tests/__virtual_deno.d.ts');
  const declaration = 'declare namespace Deno { const env: { get(name: string): string | undefined }; function serve(handler: (req: Request) => Promise<Response>): void; }';
  const host = ts.createCompilerHost({});
  const originalGet = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, ...rest) => resolve(name) === shim ? ts.createSourceFile(name, declaration, version, true) : originalGet(name, version, ...rest);
  const program = ts.createProgram([...files, shim], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { 'npm:@supabase/supabase-js@2': [resolve('node_modules/@supabase/supabase-js/dist/index.d.mts')] },
  }, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});
