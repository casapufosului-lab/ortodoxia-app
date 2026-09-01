# Stadiul calendarului Republicii Moldova (md-basarabia / md-chisinau)

Data raport: 2026-09-01
Branch: `master`
Commit analizat: `6f45167` („Integrare RevenueCat si calendar Moldova pentru 2026")

> ⚠️ **Nimic nu a fost aplicat live.**
> Cele 5 migrări Moldova (`20260901000100` … `20260901000500`) sunt **eliminate din working tree** (staging `D`, fără commit). Datele Moldova nu există în prezent în baza live. Nu s-a creat niciun alt set de date Moldova inventat.

---

## Cele două calendare necesare

Aplicația expune trei calendare bisericești (vezi `src/i18n/config.ts`):

| Calendar | Jurisdicție | Stil liturgic | Statut |
|----------|-------------|---------------|--------|
| `ro-bor` | Patriarhia Română | stil nou (gregorian) | existent (bază 2026 completă) |
| `md-basarabia` | Mitropolia Basarabiei (canonic sub BOR) | **stil vechi (iulian)** | ❌ eliminat / neimportat |
| `md-chisinau` | Mitropolia Chișinăului și a Întregii Moldove (sub BOR rusă) | stil vechi (iulian) | ❌ eliminat / neimportat |

Note importante despre corectitudine:
- `md-basarabia` a fost construit **greșit ca stil nou** (derivat direct din `ro-bor`, fără decalaj iulian). Mitropolia Basarabiei folosește **stilul vechi**. Orice re-import trebuie să respecte acest lucru.
- `md-chisinau` a fost construit prin decalaj mecanic de +13 zile din `ro-bor`, plus un mic set de overrides; baza rămâne nemapată editorial corect la fiecare dată iuliană.

---

## Sursa cerută pentru fiecare

| Calendar | Sursă acceptabilă (conform regulilor) | Cerințe |
|----------|---------------------------------------|---------|
| `md-basarabia` | Set de date oficial cu permisiune clară de reutilizare **și** licență explicită pentru uz comercial. Ex. OCMA-API **numai dacă** fișierul conține efectiv sărbători/sfinți în română (de verificat). **NU** `maicadomnului.ro` sau alte site-uri fără licență explicită. | Confirmare stil vechi; verificare editorială |
| `md-chisinau` | Sursă oficială a Mitropoliei Chișinăului (ex. `mitropolia.md`) sau set de date cu licență comercială explicită. Agregatorul public `orthocal.info` **NU** are licență explicită de reutilizare și **NU** poate fi folosit. | Verificare editorială la fiecare dată |

---

## Statutul licenței

| Sursă folosită în migrările șterse | Licență | Acceptabil? |
|------------------------------------|---------|-------------|
| `ro-bor` (propriu) | proprietar aplicație, reutilizabil intern | bază structurală ✔, DAR nu e un calendar Moldova real |
| `orthocal.info` (agregator) | fără licență explicită de reutilizare comercială | ❌ neacceptabil |
| `OCMA-API` (menționat în comentarii) | MIT declarată, **neconfirmat** că fișierul RO conține date relevante; e în curs de verificare | ⏳ de verificat înainte de import |

Reguli aplicate (din cerințe):
- Nu folosim o pagină doar pentru că se citește gratuit.
- Acceptăm doar sursă oficială cu permisiune clară **sau** set de date cu licență comercială explicită.
- Nu folosim OCMA-API până nu confirmăm că fișierul românesc conține efectiv sărbători și sfinți.
- Nu copiem un site fără licență explicită.
- Nu inventăm sărbători, ranguri, posturi sau diferențe locale.

---

## Ce date lipsesc

1. `md-basarabia` — **toate** (nu există set de date Moldova real pe stil vechi; migrarea ștearsă era doar un duplicat al `ro-bor` pe stil nou).
2. `md-chisinau` — baza completă de 365 zile pe stil vechi, cu mapare editorială corectă a sfinților/sărbătorilor pentru fiecare dată iuliană. Doar un mic set de overrides (ian + mobile) avea conținut distinct.
3. Ranguri de sărbători, posturi și diferențe locale reale (nu derivate mecanic).
4. Surse cu licență explicită pentru utilizare comercială și atribuire în aplicație.

---

## Ce trebuie verificat înainte de import

- [ ] Obține un set de date cu licență comercială explicită (sau sursă oficială cu permisiune clară) pentru ambele jurisdicții.
- [ ] Confirmă că `md-basarabia` folosește **stilul vechi** (iulian), corect față de implementarea anterioară greșită.
- [ ] Validează OCMA-API: fișierul românesc trebuie să conțină efectiv sărbători/sfinți înainte de a fi folosit.
- [ ] Verificare editorială a fiecărei date (rang, sfinți, posturi, titluri) — nu doar decalaj mecanic.
- [ ] Atribuirea sursei și licența în `editorial_source`.
- [ ] Re-testare locală a migrărilor (supabase db reset / pull) **înainte** de orice aplicare live.
- [ ] Păstrează codul care permite alegerea `md-basarabia` / `md-chisinau` (doar datele provizorii au fost eliminate).

---

## Confirmare live

- ✅ Datele Moldova nu există în prezent în baza live.
- ✅ Doar fișierele locale din working tree au fost eliminate (staging `D`, fără commit).
- ✅ Nu s-a creat niciun alt set de date Moldova inventat.
