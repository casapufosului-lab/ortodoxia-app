// Resolve Deno npm: imports to the installed package without disabling import checks.
const nodeResolver = require('eslint-import-resolver-node');
exports.interfaceVersion = 2;
exports.resolve = (source, file, config) => nodeResolver.resolve(
  source === 'npm:@supabase/supabase-js@2' ? '@supabase/supabase-js' : source,
  file,
  config,
);
