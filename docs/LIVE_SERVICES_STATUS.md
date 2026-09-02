# Slujbe LIVE — Surse și servicii

> Stare: **LIVE-A** — structură permanentă și UI de bază. Detecția dinamică
> a transmisiunilor live este planificată în LIVE-B.

## Principii

- Ortodoxia **nu este broadcasterul**. Nu descărcăm, nu rehostăm, nu
  proxynam și nu restreamăm transmisiunile. Deschidem doar pagina/sursa
  oficială a providerului.
- Registrul surselor este **canonic și permanent** în
  `src/live/live-services.ts`. UI-ul nu conține URL-uri împrăștiate.
- Sursele permanente **nu conțin niciodată** un `videoId` curent ca
  configurație permanentă. Un `videoId` de o singură emisiune aparține doar
  unui obiect tranzitoriu `CurrentLiveBroadcast` (LIVE-B).

## Surse candidate

### 1. TRINITAS TV — București

- **Nume**: TRINITAS TV
- **Locație**: București
- **Website oficial**: https://www.trinitas.tv
- **Canal YouTube stabil**: https://www.youtube.com/@TrinitasTVOFICIAL
- **Channel ID verificat**: `UCcqFHIDYfKsaJ5KXZjzW7ZQ`
- **Cum s-a stabilit proveniența**: website-ul oficial trinitas.tv se
  autodefinește ca „Televiziunea Patriarhiei Române”, are iconiță YouTube
  și este listat în proiectele oficiale ale patriarhia.ro. Canalul YouTube
  are numele oficial „TRINITAS TV”.
- **Enabled**: DA
- **Detecție dinamică planificată**: DA
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează program suplimentar.

### 2. Doxologia — Iași / Catedrala Mitropolitană

- **Nume**: Doxologia
- **Locație**: Iași
- **Website oficial**: https://doxologia.ro
- **Canal YouTube stabil**: https://www.youtube.com/@doxologia
- **Channel ID verificat**: `UC48EI8pmHeFuZIn1O4qKu8A`
- **Cum s-a stabilit proveniența**: doxologia.ro se autodefinește ca
  proiect al Arhiepiscopiei Iașilor („Site dezvoltat de DOXOLOGIA MEDIA,
  Arhiepiscopia Iașilor”). Canalul YouTube are numele oficial „doxologia.ro”.
- **Enabled**: DA
- **Detecție dinamică planificată**: DA
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează program suplimentar.

### 3. Mănăstirea Putna — Putna

- **Nume**: Mănăstirea Putna
- **Locație**: Putna
- **Website oficial**: https://www.putna.ro
- **Canal YouTube stabil**: https://www.youtube.com/@ManastireaPutna
- **Channel ID verificat**: `UCFwQ9MMZSMYJ8pevvLHS79g`
- **Cum s-a stabilit proveniența**: website-ul oficial putna.ro declară
  explicit că slujbele sunt transmise în direct „pe pagina de Facebook și
  pe canalul de YouTube ale mănăstirii”. Canalul YouTube are numele oficial
  „Putna Monastery”.
- **Enabled**: DA
- **Detecție dinamică planificată**: DA
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: site-ul oficial publică programul
  săptămânal al slujbelor, inclusiv Sfânta Liturghie de duminică la 9:00.

### 4. Mănăstirea Sihăstria — Neamț

- **Nume**: Mănăstirea Sihăstria
- **Locație**: Neamț
- **Website oficial**: https://sihastria.ro (greu accesibil / temporar nerecepționat)
- **Canal YouTube stabil**: https://www.youtube.com/@manastireasihastria
- **Channel ID verificat**: `UCD3L96gliife4V-II9izsPA`
- **Cum s-a stabilit proveniența**: canalul YouTube există cu numele
  oficial „Mănăstirea Sihăstria”, iar Doxologia confirmă existența
  mănăstirii. **Dar** nu am putut confirma **independent** că website-ul
  oficial al mănăstirii linkuie către acest canal SAU că descrierea
  canalului linkuie clar înapoi către organizație (site nerecepționat în
  timpul verificării). Conform regulilor, acestă sursă este **DEZACTIVATĂ**
  în registru până la reverificarea provenienței.
- **Enabled**: NU
- **Detecție dinamică planificată**: DA (când va fi reactivată)
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează.

### 5. Radio Renașterea — Cluj-Napoca / Catedrala Mitropolitană

- **Nume**: Radio Renașterea
- **Locație**: Cluj-Napoca
- **Website oficial**: https://radiorenasterea.ro
- **Canal YouTube stabil**: https://www.youtube.com/@Radiorenasterea
- **Channel ID verificat**: `UCMV6BZET4_LpJlUOaBj-QWw`
- **Cum s-a stabilit proveniența**: radiorenasterea.ro se autodefinește ca
  „instrument de misiune a Arhiepiscopiei Vadului, Feleacului și Clujului”
  și este listat în website-ul oficial al Mitropoliei Clujului
  (mitropolia-clujului.ro). Canalul YouTube are numele oficial
  „Radio Renasterea”.
- **Enabled**: DA
- **Detecție dinamică planificată**: DA
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: site-ul oficial declară că Sfânta
  Liturghie de duminică din Catedrala Mitropolitană este transmisă în
  direct în fiecare duminică și sărbătoare.

---

## Siguranță

- Toate URL-urile din registru sunt **HTTPS** și pe **allowlist explicit**
  (`ALLOWED_DOMAINS` din `src/live/live-services.ts`).
- Deschiderea folosește `openBrowserAsync` (expo-web-browser) după validare
  strictă — doar HTTPS + domeniu aprobat. URL-urile malformate sau
  neaprobate eșuează sigur, fără eroră tehnică pentru utilizator.
- Nu există înregistrări permanente cu `youtube.com/watch?v=...`.

## Fișiere

| Fișier | Rol |
|---|---|
| `src/live/types.ts` | Tipuri `PermanentLiveSource`, `CurrentLiveBroadcast`, `LiveStatus` |
| `src/live/live-services.ts` | Registrul canonic al surselor + allowlist domenii |
| `src/live/live-service-access.ts` | Validare URL și deschidere sigură |
| `src/app/live.tsx` | Ecran dedicat „Slujbe LIVE” |
| `tests/live-services.test.mjs` | Teste focalizate |
