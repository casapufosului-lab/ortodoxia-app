/**
 * Cheile de limitare pe client (poziția C13 din audit).
 *
 * BUG-UL PE CARE ÎL REPARĂ
 * ------------------------
 * Funcția folosea `'unknown'` ca valoare de rezervă atât pentru adresa clientului, cât și pentru
 * semnalul de dispozitiv. Când platforma nu raportează nicio adresă (`x-forwarded-for` /
 * `cf-connecting-ip` / `x-real-ip` lipsesc), TOȚI utilizatorii cădeau în același contor: hash-ul
 * `ip|<salt>|unknown` era identic pentru toată lumea, iar limita de IP (60/zi) devenea un buget
 * comun — primele 60 de mesaje ale zilei, de oriunde, goleau chatul gratuit pentru toți.
 *
 * CE FACE ACUM
 * ------------
 *   - adresă prezentă → cheia de IP rămâne pe adresă (comportament neschimbat);
 *   - adresă lipsă, dar semnal de dispozitiv valid → cheia de IP cade pe DISPOZITIV, deci fiecare
 *     instalare are contorul ei, nu unul comun;
 *   - nici adresă, nici dispozitiv → `null`: apelantul refuză cererea (fail-closed). Nimic nu poate
 *     fi identificat, deci nimic nu poate fi limitat — iar un contor comun ar bloca utilizatorii
 *     cinstiți, exact bug-ul de mai sus.
 *
 * Modulul e PUR (fără importuri, fără `Deno.*`), ca să poată fi testat direct de `node --test`.
 */

/** Adresa de client: opțională, opțional lungime plafonată (valoarea nu părăsește niciodată procesul). */
export function normalizeAddress(candidates: ReadonlyArray<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const raw = (candidate ?? '').split(',')[0].trim().toLowerCase();
    if (raw.length > 0 && raw.length <= 64) return raw;
  }
  return null;
}

/** Semnalul de dispozitiv trimis de aplicație (`x-device-id`), acceptat doar într-o formă cunoscută. */
export function normalizeDevice(candidate: string | null | undefined): string | null {
  const raw = (candidate ?? '').trim().toLowerCase();
  return /^[a-z0-9._-]{8,64}$/.test(raw) ? raw : null;
}

export type LimitIdentity = {
  /** Identitatea pe (adresă + dispozitiv), sau pe dispozitiv când adresa lipsește. */
  client: string;
  /** Identitatea pe adresă; cade pe dispozitiv când adresa lipsește, niciodată pe un bucket comun. */
  ip: string;
};

/**
 * Construiește cheile de limitare. `null` = cererea nu poate fi identificată și trebuie refuzată.
 */
export function buildLimitIdentity(address: string | null, device: string | null): LimitIdentity | null {
  if (address && device) return { client: `addr:${address}|dev:${device}`, ip: `addr:${address}` };
  if (address) return { client: `addr:${address}`, ip: `addr:${address}` };
  if (device) return { client: `dev:${device}`, ip: `dev:${device}` };
  return null;
}
