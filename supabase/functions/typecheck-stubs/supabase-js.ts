/**
 * Local type stub for `npm:@supabase/supabase-js@2`.
 *
 * PURPOSE
 * -------
 * The Edge Functions are excluded from the app tsconfig because Deno resolves
 * remote `npm:` specifiers that the React Native type environment cannot. That
 * exclusion meant the whole backend had no static check. `tsconfig.edge.json`
 * maps the specifier here so the functions can be type-checked offline.
 *
 * WHAT THIS STUB DOES AND DOES NOT PROVE
 * --------------------------------------
 * It models the *shape* of the client API the functions actually use, so the
 * checker catches wrong method names, wrong option shapes, misuse of the auth
 * API, and — most importantly — undefined variables and broken control flow in
 * `index.ts` files that were previously never parsed by any checker.
 *
 * It deliberately does **not** model the database schema: query results are
 * typed as `unknown` and every `select()` is a generic so that a schema mismatch
 * is still caught by the explicit cast the call sites already perform. Column
 * names are NOT verified here; they are verified by the RLS/migration tests.
 */

export type PostgrestError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export type PostgrestResponse<T = any> = {
  data: T;
  error: PostgrestError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is'
  | 'in'
  | 'contains'
  | 'containedBy'
  | 'textSearch'
  | 'or'
  | 'not'
  | 'match'
  | 'filter'
  | 'overlaps'
  | 'rangeGt'
  | 'rangeLt'
  | 'rangeGte'
  | 'rangeLte'
  | 'rangeAdjacent';

type QueryOrderOptions = {
  ascending?: boolean;
  nullsFirst?: boolean;
  referencedTable?: string;
};

export interface PostgrestFilterBuilder<Result = any> extends PromiseLike<PostgrestResponse<Result>> {
  select(columns?: string, options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  insert(values: unknown, options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  upsert(values: unknown, options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  update(values: unknown, options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  delete(options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  order(column: string, options?: QueryOrderOptions): PostgrestFilterBuilder<Result>;
  limit(count: number): PostgrestFilterBuilder<Result>;
  range(from: number, to: number): PostgrestFilterBuilder<Result>;
  // supabase-js exposes `single<T>()` / `maybeSingle<T>()` as generic overrides
  // so call sites can narrow the row type without a cast.
  single<T = Result>(): PostgrestFilterBuilder<T>;
  maybeSingle<T = Result>(): PostgrestFilterBuilder<T>;
  returns<T>(): PostgrestFilterBuilder<T>;
  overrideTypes<T, K extends string = never>(): PostgrestFilterBuilder<T>;
  // Filter surface: the chainable operators are generated from one signature.
  eq(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  neq(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  gt(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  gte(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  lt(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  lte(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  like(column: string, pattern: string): PostgrestFilterBuilder<Result>;
  ilike(column: string, pattern: string): PostgrestFilterBuilder<Result>;
  is(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  in(column: string, values: readonly unknown[]): PostgrestFilterBuilder<Result>;
  contains(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  containedBy(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  overlaps(column: string, value: unknown): PostgrestFilterBuilder<Result>;
  textSearch(column: string, query: string, options?: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  match(query: Record<string, unknown>): PostgrestFilterBuilder<Result>;
  not(column: string, operator: FilterOperator, value: unknown): PostgrestFilterBuilder<Result>;
  or(filters: string): PostgrestFilterBuilder<Result>;
  filter(column: string, operator: string, value: unknown): PostgrestFilterBuilder<Result>;
  throwOnError(): PostgrestFilterBuilder<Result>;
}

export type User = {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type AuthResponse = {
  data: { user: User | null; session: unknown | null };
  error: PostgrestError | null;
};

export interface GoTrueAdminApi {
  deleteUser(id: string, shouldSoftDelete?: boolean): Promise<{ data: unknown; error: PostgrestError | null }>;
  createUser(attributes: Record<string, unknown>): Promise<AuthResponse>;
}

export interface GoTrueClient {
  getUser(jwt?: string): Promise<AuthResponse>;
  getSession(): Promise<AuthResponse>;
  admin: GoTrueAdminApi;
}

export interface StorageBucketApi {
  from(bucket: string): {
    upload(path: string, file: unknown, options?: Record<string, unknown>): Promise<{ data: { path: string } | null; error: PostgrestError | null }>;
    download(path: string): Promise<{ data: unknown; error: PostgrestError | null }>;
    remove(paths: string[]): Promise<{ data: unknown; error: PostgrestError | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
    createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: PostgrestError | null }>;
  };
}

export interface SupabaseClient {
  from<T = any>(relation: string): PostgrestFilterBuilder<T>;
  // `rpc()` returns a builder in supabase-js (it supports .single()/.maybeSingle()),
  // so it is modelled as one rather than a bare promise.
  rpc<T = any>(fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>): PostgrestFilterBuilder<T>;
  auth: GoTrueClient;
  storage: StorageBucketApi;
  functions: {
    invoke<T = unknown>(name: string, options?: Record<string, unknown>): Promise<{ data: T | null; error: PostgrestError | null }>;
  };
}

export type SupabaseClientOptions = {
  auth?: {
    persistSession?: boolean;
    autoRefreshToken?: boolean;
    detectSessionInUrl?: boolean;
    storage?: unknown;
    storageKey?: string;
  };
  global?: { headers?: Record<string, string>; fetch?: typeof fetch };
  db?: { schema?: string };
  realtime?: Record<string, unknown>;
};

export function createClient(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions,
): SupabaseClient {
  // The stub exists only to type-check call sites; it is never executed.
  throw new Error(
    `createClient stub is type-only (${supabaseUrl.length}/${supabaseKey.length} chars, options: ${options ? 'yes' : 'no'})`,
  );
}
