/**
 * Dimensiunile barei de tab-uri, calculate cu zona sigură de jos.
 *
 * DE CE EXISTĂ
 * ------------
 * Bug raportat pe 09.10.2026: pe un telefon cu navigare pe **3 butoane** se vedea doar
 * ecranul Acasă, fără bara de tab-uri. Cauza nu era bara în sine, ci faptul că era
 * desenată cu înălțime și padding **fixe** (`height: 66`, `paddingBottom: 8`), fără nicio
 * citire a zonei sigure. Aplicația are `targetSdk 36`, iar din Android 15 edge-to-edge e
 * obligatoriu: conținutul se desenează în spatele barei de navigare a sistemului. Pe
 * emulatorul de dezvoltare (navigare **gestuală**) bara de sistem e subțire, deci tab-urile
 * se vedeau — de aceea bug-ul nu a fost prins până acum.
 *
 * Deci înălțimea și padding-ul de jos trebuie să **adauge** zona sigură raportată de
 * `useSafeAreaInsets()`, nu să o ignore. Adunarea se face aici, într-o funcție pură, ca
 * poziția să poată fi testată direct (`tests/tab-bar-safe-inset.test.mjs`), nu doar prin
 * citirea sursei.
 */

/** Înălțimea de bază a barei, fără zona sigură (valoarea istorică, păstrată). */
export const TAB_BAR_BASE_HEIGHT = 66;

/** Padding-ul de jos de bază, fără zona sigură (valoarea istorică, păstrată). */
export const TAB_BAR_BASE_PADDING_BOTTOM = 8;

/**
 * Înălțimea și padding-ul de jos ale barei, mărite cu zona sigură de jos.
 *
 * O valoare lipsă, negativă sau nefinită se tratează ca 0: bara nu are voie să scadă sub
 * dimensiunea de bază din cauza unei citiri ciudate a zonei sigure.
 */
export function tabBarMetrics(insetsBottom: number) {
  const bottom = Number.isFinite(insetsBottom) && insetsBottom > 0 ? insetsBottom : 0;
  return {
    height: TAB_BAR_BASE_HEIGHT + bottom,
    paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM + bottom,
  };
}
