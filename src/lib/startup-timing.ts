/**
 * Startup timing for the Ortodoxia app.
 *
 * WHY THIS EXISTS
 * ---------------
 * "The app feels slow to open" is not something a test can assert. What a test can
 * assert is the work that happens before the first screen is on the glass:
 *
 *   jsStart        -> the JS bundle began executing (module scope of this file)
 *   providersReady -> the localization provider finished reading its preferences,
 *                     which is the single gate in front of the whole navigator
 *   firstScreen    -> the root layout rendered for the first time
 *   splashHidden   -> the native splash was dismissed and the app is interactive
 *
 * The three phases have different fixes, so measuring them apart is the only way to
 * know whether a regression is bundle evaluation, storage I/O or render. The values
 * are also published on `globalThis.__ORTODOXIA_STARTUP__` so an end-to-end harness
 * can read them without parsing logs.
 *
 * In production this records nothing visible and adds no dependency: the timings are
 * kept in memory and only logged in development.
 */

/** Milliseconds since the JS runtime started, or null when unavailable. */
function now(): number {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
}

export type StartupPhase = 'jsStart' | 'providersReady' | 'firstScreen' | 'splashHidden';

export type StartupRecord = Partial<Record<StartupPhase, number>>;

const record: StartupRecord = { jsStart: now() };

/**
 * `globalThis` is cast because the app's TypeScript config does not include the
 * DOM lib, and the harness reads this property from a plain JS context.
 */
const globalScope = globalThis as unknown as { __ORTODOXIA_STARTUP__?: StartupRecord };
globalScope.__ORTODOXIA_STARTUP__ = record;

/** Record a phase. The first value wins, so a remount cannot distort the timing. */
export function markStartup(phase: StartupPhase) {
  if (record[phase] !== undefined) return;
  record[phase] = now();
  if (__DEV__) {
    const base = record.jsStart ?? 0;
    console.log(`[startup] ${phase}: +${Math.round((record[phase] as number) - base)}ms`);
  }
}

/** Snapshot for diagnostics, e.g. an "About" screen or a support log. */
export function readStartupRecord(): StartupRecord {
  return { ...record };
}
