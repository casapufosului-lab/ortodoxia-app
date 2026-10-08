/**
 * Adresele magazinelor pentru gestionarea abonamentului (poziția PREMIUM (c) din planul de lansare).
 *
 * Până acum ecranul Premium doar *descria* unde se anulează abonamentul („Setări → Abonamente, în
 * contul App Store sau Google Play"), iar textul numea App Store înaintea Google Play — pe Android,
 * utilizatorul trebuia să caute singur pagina. Aici adresa e aleasă după platformă, ca ecranul să poată
 * oferi un link care duce direct în locul potrivit.
 *
 * Modul pur (fără React Native), ca să poată fi verificat comportamental de teste.
 */

export const GOOGLE_PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
export const APP_STORE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/**
 * Adresa paginii de abonamente a magazinului platformei curente, sau `null` dacă platforma nu are
 * magazin (web/desktop) — în acel caz ecranul NU randează un link mort.
 */
export function manageSubscriptionUrl(platform: string): string | null {
  if (platform === 'android') return GOOGLE_PLAY_SUBSCRIPTIONS_URL;
  if (platform === 'ios') return APP_STORE_SUBSCRIPTIONS_URL;
  return null;
}
