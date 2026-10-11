/**
 * PREMIUM - T6 (4) din taskul de reparare (10.10.2026): `restorePurchases()` se cheama DOAR din buton.
 *
 * Decizia R1: NU `syncPurchases()`, NU `restorePurchases()` automat. La pornire/login se face doar
 * `Purchases.logIn(<id Supabase>)` + o citire `getCustomerInfo()` (prin `refresh()`), pentru ca
 * `logIn` aliaseaza AUTOMAT achizitia facuta anonim (documentatia RevenueCat). Restaurarea propriu-zisa
 * (`Purchases.restorePurchases()`) se cheama EXCLUSIV din butonul "Restaureaza cumparaturile".
 *
 * Testul dovedeste ABSENTA apelului automat, structural, pe codul real:
 *   - in `src/lib/revenuecat.ts` exista UN singur `Purchases.restorePurchases()`, in functia
 *     `restoreRevenueCatPurchases`, dupa deblocarea/identificarea utilizatorului;
 *   - in `src/hooks/use-revenuecat.ts` `restoreRevenueCatPurchases(...)` are exact doua locuri de
 *     apel, amandoua in callback-urile expuse ecranului (`restore`, `syncWithStore`) - NICIUN `useEffect`;
 *   - in `src/app/premium.tsx` cele doua apeluri (`await restore()`, `void syncWithStore()`) sunt
 *     in interiorul lui `handleRestore`, iar `handleRestore` este legat numai de butonul de restaurare.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (text, needle) => text.split(needle).length - 1;

/** Blocul `{...}` care incepe dupa `marker`, prin numararea acoladelor. */
const blockAfter = (source, marker) => {
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
};

/** Toate blocurile `{...}` care urmeaza dupa fiecare aparitie a `marker`. */
const blocksAfter = (source, marker) => {
  const out = [];
  let idx = source.indexOf(marker);
  while (idx >= 0) {
    out.push(blockAfter(source.slice(idx), marker));
    idx = source.indexOf(marker, idx + marker.length);
  }
  return out;
};

const LIB_RAW = read('src/lib/revenuecat.ts');
const RC_HOOK_RAW = read('src/hooks/use-revenuecat.ts');
const PREMIUM_RAW = read('src/app/premium.tsx');

// Codul fara comentarii: doar pentru numararea apelurilor reale. Comentariile se verifica pe sursa
// bruta (`*_RAW`), altfel "lipsa" unei fraze ar putea veni din faptul ca am sters comentariile.
const LIB = stripComments(LIB_RAW);
const RC_HOOK = stripComments(RC_HOOK_RAW);
const PREMIUM = stripComments(PREMIUM_RAW);

const STORE_CALLS = ['restore(', 'syncWithStore(', 'restoreRevenueCatPurchases(', 'restorePurchases('];

describe('T6(4) restaurarea pleaca doar din buton - dovada pe cod', () => {
  test('LIB: un singur `Purchases.restorePurchases()`, in `restoreRevenueCatPurchases`, dupa logIn', () => {
    assert.equal(
      count(LIB, 'Purchases.restorePurchases()'),
      1,
      'o singura restaurare reala in tot modulul de magazin',
    );

    const body = blockAfter(LIB, 'export async function restoreRevenueCatPurchases(');
    assert.ok(body.includes('Purchases.restorePurchases()'), 'restaurarea sta in functia dedicata');
    assert.ok(
      body.includes('await ensureRevenueCatUserUnlocked(userId);'),
      'identificarea (`logIn`) se face INAINTE de restaurare',
    );
    assert.ok(
      body.indexOf('ensureRevenueCatUserUnlocked(userId)') < body.indexOf('Purchases.restorePurchases()'),
      'ordinea: logIn, apoi restore',
    );
  });

  test('HOOK: `restoreRevenueCatPurchases(...)` se cheama in exact 2 locuri, ambele expuse ecranului', () => {
    assert.equal(
      count(RC_HOOK, 'restoreRevenueCatPurchases('),
      2,
      'doar `restore` si `syncWithStore` pot chema restaurarea',
    );

    const restoreBody = blockAfter(RC_HOOK, 'const restore = useCallback(');
    const syncBody = blockAfter(RC_HOOK, 'const syncWithStore = useCallback(');
    assert.ok(restoreBody.includes('restoreRevenueCatPurchases('), '`restore` (butonul) restaureaza');
    assert.ok(syncBody.includes('restoreRevenueCatPurchases('), '`syncWithStore` (dupa buton) restaureaza');
    assert.equal(
      count(restoreBody, 'restoreRevenueCatPurchases(') + count(syncBody, 'restoreRevenueCatPurchases('),
      2,
      'niciun al treilea loc de apel, in afara celor doua callback-uri',
    );

    // Ambele ies din hook, ca ecranul sa le poata lega de buton.
    assert.ok(RC_HOOK.includes('    restore,'));
    assert.ok(RC_HOOK.includes('    syncWithStore,'));
  });

  test('HOOK: NICIUN `useEffect` nu restaureaza si nu sincronizeaza nimic', () => {
    const effects = blocksAfter(RC_HOOK, 'useEffect(');
    assert.ok(effects.length >= 3, `ma asteptam la mai multe efecte, am gasit ${effects.length}`);
    for (const body of effects) {
      for (const call of STORE_CALLS) {
        assert.ok(
          !body.includes(call),
          `un efect cheama "${call}" - restaurarea trebuie sa fie exclusiv din buton`,
        );
      }
    }

    // Efectul de dupa logIn face DOAR o citire (T4-4), ca fereastra de identitate sa nu ramana lunga.
    const afterLogin = stripComments(blockAfter(RC_HOOK_RAW, 'AICI se chema AUTOMAT'));
    assert.ok(
      afterLogin.includes('void refresh()'),
      'dupa `logIn` ramane doar re-citirea (`refresh`), fara nicio operatie in cont',
    );
    assert.ok(!afterLogin.includes('syncWithStore('));
    assert.ok(!afterLogin.includes('restoreRevenueCatPurchases('));
    assert.ok(
      RC_HOOK_RAW.includes('AICI se chema AUTOMAT `syncWithStore()`'),
      'comentariul care explica de ce NU mai e automat trebuie sa ramana in cod',
    );
  });

  test('ECRAN: ambele apeluri sunt in `handleRestore`, iar butonul este singurul care il cheama', () => {
    assert.equal(count(PREMIUM, 'await restore()'), 1);
    assert.equal(count(PREMIUM, 'void syncWithStore()'), 1);

    const handler = blockAfter(PREMIUM, 'const handleRestore = async () => {');
    assert.ok(handler.includes('await restore()'), 'restaurarea pleaca din handler-ul butonului');
    assert.ok(handler.includes('void syncWithStore()'), 'raportul complet se cere tot din buton');

    // Handler-ul apare o singura data ca apel: in butonul de restaurare.
    assert.equal(count(PREMIUM, 'handleRestore'), 2, 'definitia + singurul loc de apel');
    assert.equal(count(PREMIUM, 'void handleRestore()'), 1);
    assert.ok(
      PREMIUM.includes(
        "label={busyPlan === 'restore' ? t('premium.restoring') : t('premium.restorePurchases')} onPress={() => void handleRestore()}",
      ),
      'butonul "Restaureaza cumparaturile" este cel care porneste restaurarea',
    );

    // Reactivarea ecranului doar RE-CITESTE; nu restaureaza nimic.
    const focus = blockAfter(PREMIUM, 'useFocusEffect(');
    assert.ok(focus.includes('void refreshRevenueCat();'));
    assert.ok(focus.includes('void refresh();'));
    for (const call of ['restore()', 'syncWithStore(', 'handleRestore(']) {
      assert.ok(!focus.includes(call), `reactivarea ecranului nu are voie sa cheme "${call}"`);
    }
    assert.ok(
      PREMIUM_RAW.includes('R1 (build 19, 10.10.2026)'),
      'schimbarea fata de build 14 este explicata in cod',
    );
  });

  test('HOOK: comentariile care fixau cerinta din build 14 au fost actualizate (R1), nu sterse tacit', () => {
    assert.equal(
      count(RC_HOOK_RAW, 'build 14'),
      0,
      'nu mai exista textul care cerea restaurarea automata',
    );
    assert.ok(
      RC_HOOK_RAW.includes('R1 (build 19, 10.10.2026)'),
      'inlocuirea este documentata la locul ei',
    );
    assert.ok(
      RC_HOOK_RAW.includes('se cheama EXCLUSIV din butonul'),
      'regula noua este scrisa in hook, langa cod',
    );
  });
});
