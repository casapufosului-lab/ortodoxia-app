/**
 * Minimal ambient declarations for the Deno globals used by the Supabase Edge
 * Functions, so `tsc --project tsconfig.edge.json` can type-check the backend.
 *
 * Scope is intentionally narrow: only the APIs these functions actually call are
 * declared. Anything not declared here fails the type check, which is the point —
 * an undeclared global means the function relies on something unverified.
 *
 * The `npm:@supabase/supabase-js@2` specifier is mapped to a local stub by the
 * `paths` entry in tsconfig.edge.json, so it needs no declaration here.
 */

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }

  type ServeHandler = (request: Request) => Response | Promise<Response>;

  function serve(handler: ServeHandler): void;

  namespace errors {
    class NotFound extends Error {}
    class PermissionDenied extends Error {}
  }
}
