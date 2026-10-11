/**
 * PREMIUM: sincronizarea cu magazinul (R1, build 19, 10.10.2026).
 *
 * Istoricul, ca sa se inteleaga de ce arata asa. Build 14 a livrat "sincronizare AUTOMATA cu magazinul":
 * la fiecare login si la fiecare deschidere a ecranului Premium se chemau `Purchases.restorePurchases()`
 * + `getCustomerInfo()`, pe motiv ca restaurarea muta pe utilizatorul autentificat o achizitie intrata pe
 * un `app_user_id` anonim. Ownerul a raportat exact efectul secundar: operatii care schimba ceva in cont
 * fara ca omul sa fi cerut. Decizia R1 (10.10.2026) intoarce regula, cu argument din documentatia
 * RevenueCat: `Purchases.logIn(<id Supabase>)` aliaseaza AUTOMAT o achizitie facuta anonim, deci
 * restaurarea programatica nu era necesara.
 *
 * Regula pe care o apara testele de aici (si pe care o fixeaza, nu doar o descriu):
 *   - la pornire/login: `Purchases.logIn(<id Supabase>)` + o citire `getCustomerInfo()` (FARA restore);
 *   - `Purchases.restorePurchases()` EXCLUSIV din butonul "Restaureaza cumparaturile" (premium.tsx).
 *
 * Ce verifica (structural, pe sursa reala):
 *  1. LIB: diagnosticul contine toate cele patru valori cerute (`originalAppUserId`, cheile din
 *     `entitlements.active`, cheile din `entitlements.all`, `managementURL`).
 *  2. LIB: restaurarea trece prin functia care face `logIn` INAINTE de `restorePurchases` (lacatul
 *     global si verificarea identitatii nu pot fi ocolite).
 *  3. HOOK: `syncWithStore` (calea MANUALA) restaureaza, apoi citeste, pentru utilizatorul curent.
 *  4. HOOK: la login NU se cheama sincronizarea si NU se restaureaza nimic; se re-citeste doar starea
 *     (T4-4), ca fereastra de identitate sa nu tina ecranul pe "se activeaza".
 *  5. HOOK -> useSubscription: dovada sincronizarii (`storeSync`) ajunge la ecran.
 *  6. ECRAN: la fiecare deschidere se RE-CITESTE starea (`refreshRevenueCat` + `refresh`), fara
 *     `syncWithStore()`; restaurarea se cere doar din buton (`handleRestore`).
 *  7. ECRAN: "Premium activ" + data expirarii se afiseaza cand entitlement-ul e activ, iar butoanele
 *     de cumparare se ascund; toate trei ies din `premiumUiState(...)`.
 *  8. ECRAN: diagnosticul permanent (nu temporar) e randat necondiționat.
 *
 * Ce NU dovedeste: randarea reala a componentei (proiectul nu are renderer de React Native) si fluxul
 * real de cumparare/restaurare cu App Store. Fara credentiale, fara apeluri catre magazine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

const RC_LIB = readFileSync('src/lib/revenuecat.ts', 'utf8');
const RC_HOOK = readFileSync('src/hooks/use-revenuecat.ts', 'utf8');
const SUBSCRIPTION_HOOK = readFileSync('src/hooks/use-subscription.ts', 'utf8');
const PREMIUM_SCREEN = readFileSync('src/app/premium.tsx', 'utf8');

/** Blocul dintre doua repere de text (aceeasi metoda ca `revenuecat-identity.test.mjs`). */
function functionBlock(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `reperul de inceput nu a fost gasit: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `reperul de sfarsit nu a fost gasit: ${end}`);
  return source.slice(from, to);
}

describe('PREMIUM / sincronizarea cu magazinul (R1: doar la cererea omului)', () => {
  test('LIB: diagnosticul arata exact ce intoarce RevenueCat (4 valori cerute)', () => {
    // `describeEntitlements` este ultima functie din fisier, deci blocul merge pana la capat.
    const from = RC_LIB.indexOf('export function describeEntitlements');
    assert.ok(from >= 0, 'describeEntitlements lipseste');
    const block = RC_LIB.slice(from);

    assert.ok(
      block.includes('`customerInfo.originalAppUserId = ${info.originalAppUserId}`'),
      'lipseste originalAppUserId',
    );
    assert.ok(block.includes('entitlements.active (${active.length})'), 'lipsesc cheile din active');
    assert.ok(block.includes('entitlements.all (${all.length})'), 'lipsesc cheile din all');
    assert.ok(
      block.includes('`customerInfo.managementURL = ${info.managementURL ? info.managementURL : \'(gol)\'}`'),
      'lipseste managementURL',
    );
  });

  test('LIB: restaurarea trece prin functia care face logIn INAINTE de restorePurchases', () => {
    const block = functionBlock(
      RC_LIB,
      'export async function restoreRevenueCatPurchases',
      'export function isPremiumActive',
    );

    const lock = block.indexOf('return runRevenueCatExclusive(async () => {');
    const ensure = block.indexOf('await ensureRevenueCatUserUnlocked(userId)');
    const restore = block.indexOf('return Purchases.restorePurchases()');

    assert.ok(lock >= 0);
    assert.ok(ensure > lock, 'logIn/identitatea trebuie verificata inainte de restaurare');
    assert.ok(restore > ensure, 'restaurarea trebuie sa vina dupa verificarea identitatii');
  });

  test('HOOK: syncWithStore (calea manuala) restaureaza, apoi citeste, pentru utilizatorul curent', () => {
    const block = functionBlock(
      RC_HOOK,
      'const syncWithStore = useCallback',
      'const availabilityFor = useCallback',
    );

    const restore = block.indexOf('await restoreRevenueCatPurchases(syncUserId)');
    const read = block.indexOf('await getRevenueCatCustomerInfo(syncUserId)');

    assert.ok(restore >= 0, 'sincronizarea manuala trebuie sa cheme restaurarea (care face logIn inainte)');
    assert.ok(read > restore, 'citirea `getCustomerInfo()` vine DUPA restaurare');
    assert.ok(
      !block.includes('await Purchases.restorePurchases()'),
      'hook-ul nu are voie sa cheme SDK-ul direct: ar ocoli lacatul global si verificarea identitatii',
    );
    assert.ok(block.includes('if (!userId) return;'), 'fara utilizator autentificat nu se cheama nimic');
    assert.ok(block.includes('if (!isRevenueCatConfigured()) return;'));

    const guard = block.indexOf('if (!mountedRef.current || userIdRef.current !== syncUserId) return;');
    const owner = block.indexOf('setCustomerInfoUserId(syncUserId);');
    const publish = block.indexOf('setCustomerInfo(info);');

    assert.ok(guard >= 0, 'un rezultat sosit dupa schimbarea contului trebuie aruncat');
    assert.ok(owner > guard, 'starea se publica doar pentru utilizatorul curent');
    assert.ok(publish > owner);
  });

  test('HOOK: la login NU porneste sincronizarea/restaurarea; doar o re-citire (R1 + T4-4)', () => {
    // `lastIndexOf`: acelasi text de comentariu apare si mai sus (raportul `storeSync`), iar blocul
    // corect este ultimul — cel lipit de efectul care urmeaza dupa login.
    const from = RC_HOOK.lastIndexOf('// R1 (build 19, 10.10.2026)');
    assert.ok(from >= 0, 'comentariul R1 lipseste din hook');
    const to = RC_HOOK.indexOf('const availabilityFor = useCallback', from);
    assert.ok(to > from, 'reperul de sfarsit lipseste');
    const block = RC_HOOK.slice(from, to);

    // Ce ramane automat: o singura citire `getCustomerInfo()` (`refresh`), fortata dupa login.
    assert.ok(
      block.includes('const timeoutId = setTimeout(() => void refresh(), 0)'),
      'dupa login trebuie sa existe citirea fortata (T4-4)',
    );
    assert.ok(block.includes('[refresh, userId]'), 'citirea trebuie sa urmareasca login-ul');
    assert.ok(block.includes('clearTimeout(timeoutId);'));

    // Ce NU mai are voie sa apara pe calea automata (cerinta inversata fata de build 14, decizia R1).
    // Se verifica doar LINIile DE COD: comentariul explica istoricul si are voie sa pomeneasca numele.
    const code = block
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    assert.ok(!code.includes('syncWithStore'), 'sincronizarea NU se mai cheama automat la login');
    assert.ok(!code.includes('restoreRevenueCatPurchases'), 'restaurarea nu are ce cauta pe calea automata');
    assert.ok(!code.includes('restorePurchases'), 'nimic nu restaureaza automat');

    // Identitatea (logIn) se face in efectul de identificare, care ruleaza la login.
    assert.ok(RC_HOOK.includes('void identifyRevenueCatUser(userId);'));

    // In hook, restaurarea are EXACT doua cai si amandoua sunt expuse ecranului ca functii chemate din
    // buton: `restore()` (butonul „Restaureaza cumparaturile") si raportul `syncWithStore()` (dupa o
    // restaurare reusita). Niciuna nu se cheama singura — asta a verificat testul de mai sus.
    const hookCode = RC_HOOK
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    assert.equal(
      (hookCode.match(/restoreRevenueCatPurchases\(/g) ?? []).length,
      2,
      'restaurarea are exact doua cai in hook: `restore()` si raportul `syncWithStore()`',
    );
    assert.ok(hookCode.includes('const restore = useCallback'), 'butonul cheama `restore()` din hook');
    assert.equal(
      (hookCode.match(/void syncWithStore\(\)/g) ?? []).length,
      0,
      'hook-ul nu isi cheama singur sincronizarea',
    );
    assert.equal(
      (hookCode.match(/void restore\(\)/g) ?? []).length,
      0,
      'hook-ul nu se restaureaza singur',
    );
  });

  test('HOOK: dovada sincronizarii este expusa (storeSync + syncWithStore)', () => {
    assert.ok(RC_HOOK.includes('export type StoreSyncReport = {'));
    assert.ok(RC_HOOK.includes('${restored ? \'reusit\' :'));
    assert.ok(RC_HOOK.includes('`Purchases.getAppUserID() = ${sdkUserId}`'));
    assert.ok(RC_HOOK.includes('storeSync,'));
    assert.ok(RC_HOOK.includes('syncWithStore,'));
    assert.ok(SUBSCRIPTION_HOOK.includes('storeSync: revenueCat.storeSync,'));
    assert.ok(SUBSCRIPTION_HOOK.includes('syncWithStore: revenueCat.syncWithStore,'));
  });

  test('ECRAN: la fiecare deschidere se RE-CITESTE starea; restore doar din buton (R1)', () => {
    const block = functionBlock(PREMIUM_SCREEN, 'useFocusEffect(', '  );');

    assert.ok(block.includes('void refreshRevenueCat();'), 'starea magazinului se re-citeste la fiecare deschidere');
    assert.ok(block.includes('void refresh();'), 'randul server-side se re-citeste la fel');
    assert.ok(
      !block.includes('syncWithStore'),
      'la deschiderea ecranului NU se mai restaureaza nimic (cerinta inversata, decizia R1)',
    );
    assert.ok(PREMIUM_SCREEN.includes('[refresh, refreshRevenueCat])'));

    // Butonul de restaurare: singurul loc din aplicatie care cere restaurarea.
    const handler = functionBlock(PREMIUM_SCREEN, 'const handleRestore =', 'return (');
    assert.ok(handler.includes('const result = await restore();'));
    assert.ok(handler.includes('if (result.ok) void syncWithStore();'));
    assert.equal(
      (PREMIUM_SCREEN.match(/void syncWithStore\(\)/g) ?? []).length,
      1,
      'syncWithStore se cheama exact o data in ecran: din buton',
    );
    assert.ok(PREMIUM_SCREEN.includes('label={busyPlan === \'restore\' ? t(\'premium.restoring\') : t(\'premium.restorePurchases\')}'));
  });

  test('ECRAN: "Premium activ" + expirarea; butoanele ies din actiunea planului (T3)', () => {
    // Eticheta si expirarea ies din `premiumUiState(...)`; butoanele, din `premiumPlanActions(...)`.
    // O singură sursă pentru fiecare: eticheta nu poate contrazice butoanele, fiindcă amândouă citesc
    // ACELAȘI entitlement (`premium`), nu rândul din baza de date.
    assert.equal(
      (PREMIUM_SCREEN.match(/= premiumUiState\(\{/g) ?? []).length,
      1,
      'starea de ecran se calculeaza o singura data',
    );
    assert.ok(
      PREMIUM_SCREEN.includes(
        'const { labelKey: premiumLabelKey, expirationDate: expiryIso } = premiumUiState({',
      ),
      'ecranul trebuie sa isi derive starea din `premiumUiState(...)`',
    );
    assert.ok(PREMIUM_SCREEN.includes('premiumActive,'), 'inputs: entitlement-ul');
    assert.ok(PREMIUM_SCREEN.includes('premiumExpirationDate: premium?.expirationDate ?? null'), 'inputs: expirarea din entitlement');
    assert.ok(PREMIUM_SCREEN.includes('storeStateKnown: premiumKnown'), 'inputs: starea magazinului');
    assert.ok(PREMIUM_SCREEN.includes('storeStateUnknownError,'), 'inputs: fereastra "necunoscut" (eroare de citire)');
    assert.ok(PREMIUM_SCREEN.includes('storeStateUnknownExpired,'), 'inputs: fereastra "necunoscut" (10 secunde)');
    assert.ok(PREMIUM_SCREEN.includes("t('premium.statusChecking') : premiumLabel"));
    assert.ok(PREMIUM_SCREEN.includes("t('premium.expiryLabel').replace('{date}', expiryDate)"));
    // T3 (build 21, 11.10.2026): butoanele nu mai ies din `premiumUiState(...)` - fiecare plan își
    // ia rândul din `premiumPlanActions(...)`, prin `planCardBody`, exact o dată per plan. Interdicția
    // veche rămâne: `{showPurchaseButtons ? (` nu mai are voie să apară (a fost regula duplicată).
    assert.equal((PREMIUM_SCREEN.match(/\{showPurchaseButtons \? \(/g) ?? []).length, 0);
    assert.equal((PREMIUM_SCREEN.match(/\{planCardBody\(planActions\./g) ?? []).length, 2);
    assert.ok(PREMIUM_SCREEN.includes('const planActions = premiumPlanActions({'));
  });

  test('ECRAN: diagnosticul permanent e randat neconditionat, inainte de </Screen>', () => {
    assert.ok(PREMIUM_SCREEN.includes('styles.storeStateTitle'));
    assert.ok(PREMIUM_SCREEN.includes('storeStateTitle: {'));

    const block = functionBlock(
      PREMIUM_SCREEN,
      "{'STAREA REVENUECAT \u2014 DIAGNOSTIC PERMANENT'}",
      '</Screen>',
    );

    assert.ok(block.includes('{storeStateLines.map((line, index) => ('), 'liniile de diagnostic lipsesc');
    assert.ok(block.includes('diagValue("entitlement \'premium\'.isActive", premiumActive)'));
    assert.ok(block.includes('{customerInfoError ?'), 'eroarea citirii starii trebuie sa ramana vizibila');
    // Permanent = se randeaza mereu: fara conditie de tip `__DEV__` sau buton de "arata detalii".
    assert.ok(!block.includes('__DEV__'));
    assert.ok(!block.includes('if ('));

    const state = functionBlock(
      PREMIUM_SCREEN,
      'const storeStateLines: string[] = [',
      'const requireUser = () => {',
    );

    assert.ok(state.includes('...(storeSync ? storeSync.lines : ['));
    assert.ok(state.includes('...entitlementDiagnostics,'));
  });
});
