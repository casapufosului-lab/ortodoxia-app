/**
 * Textul care spune explicit „Premium activ" atunci când entitlement-ul `premium` citit din
 * `CustomerInfo.entitlements.active` este activ (build 13, 10.10.2026).
 *
 * De ce e nevoie de o cheie nouă și nu se refolosește `premium.syncingBody`: acela spune
 * „sincronizarea durează câteva secunde", adică o stare de AȘTEPTARE. Când magazinul a confirmat
 * deja abonamentul, omul trebuie să vadă o afirmație, nu o promisiune — și, dedesubt, data de
 * expirare luată din entitlement (`premium.expiryLabel`).
 *
 * Reguli respectate de fiecare valoare (verificate de `npm run test:i18n` și de porțile de teste):
 *   - fără `{...}` (nu are placeholdere), fără apostrof care ar rupe `'cheie': 'valoare'`;
 *   - peste 30 de caractere, distinctă între limbi;
 *   - în limbile cu alfabet non-latin singurul cuvânt latin este „Premium" (nume de produs, în
 *     allow-list-ul din `scripts/validate-i18n-corpus.mjs`).
 */
export const PREMIUM_ENTITLEMENT_STATE_VALUES = {
  ro: {
    'premium.entitlementActive': 'Premium activ — abonamentul este confirmat de magazin.',
  },
  en: {
    'premium.entitlementActive': 'Premium active — the store has confirmed your subscription.',
  },
  el: {
    'premium.entitlementActive': 'Premium ενεργό — το κατάστημα επιβεβαίωσε τη συνδρομή σας.',
  },
  // Sârba este scrisă chirilic în acest corpus (`EXPECTED_SCRIPT.sr = 'cyrillic'`), deci valoarea
  // nu are voie să conțină cuvinte latine în afara numelui de produs „Premium".
  sr: {
    'premium.entitlementActive': 'Premium активан — продавница је потврдила вашу претплату.',
  },
  bg: {
    'premium.entitlementActive': 'Premium активен — магазинът потвърди абонамента ви.',
  },
  mk: {
    'premium.entitlementActive': 'Premium активен — продавницата го потврди вашиот абонамент.',
  },
  uk: {
    'premium.entitlementActive': 'Premium активний — магазин підтвердив вашу підписку.',
  },
  ka: {
    'premium.entitlementActive': 'Premium აქტიურია — მაღაზიამ დაადასტურა თქვენი გამოწერა.',
  },
  ru: {
    'premium.entitlementActive': 'Premium активен — магазин подтвердил вашу подписку.',
  },
  sq: {
    'premium.entitlementActive': 'Premium aktiv — dyqani konfirmoi abonimin tuaj.',
  },
};
