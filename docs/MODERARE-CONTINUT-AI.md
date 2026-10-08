# Moderarea răspunsurilor AI (raportările utilizatorilor)

Ce este, pe scurt: utilizatorul poate apăsa **„Raportează"** sub orice răspuns al asistentului, iar
raportul ajunge într-un tabel (`ai_reports`) pe care îl citește ownerul. Documentul de față descrie
ce se salvează, cum se citește coada și ce se face cu fiecare raport.

## 1. De ce există

Google Play cere, pentru aplicațiile care afișează **conținut generat de AI**, ca utilizatorul să
poată semnala un răspuns ofensator sau periculos, iar dezvoltatorul să acționeze pe baza
semnalărilor. `AGENTS.md` (regula 36) cere același lucru la nivel de produs. Până la această
modificare, singurul canal era adresa de suport din Setări: un om supărat trebuia să iasă din
aplicație, să-și copieze răspunsul și să scrie un e-mail, iar nimeni nu putea dovedi nici că
raportul a ajuns, nici că a fost citit.

## 2. Ce se salvează (și ce nu)

Butonul se află **doar** sub răspunsurile asistentului (`src/app/(tabs)/chat.tsx`, condiția
`message.role === 'assistant'`), iar utilizatorul alege unul din două motive, fără câmp liber:

| Coloană (`public.ai_reports`) | Ce conține |
| --- | --- |
| `user_id` | utilizatorul care raportează; `default auth.uid()`, deci clientul nu îl trimite |
| `reason` | `offensive` (ofensator sau lipsit de respect) sau `harmful` (informație greșită sau periculoasă) |
| `message_text` | textul răspunsului raportat, maximum 4000 de caractere |
| `thread_id` | identificatorul conversației, dacă există (chatul vizitatorului nu salvează conversații) |
| `app_language` | limba interfeței la momentul raportării (utilă pentru triaj pe limbi) |
| `status` | `open` → `reviewed` sau `dismissed` |
| `created_at`, `reviewed_at`, `review_note` | când a intrat, când și cum a fost închis |

**Nu se salvează**: întrebarea utilizatorului, adresa de e-mail, parola, istoricul conversației.
Textul raportat este deja stocat în conversația omului (`chat_messages`), deci raportarea nu
deschide o categorie nouă de date în politica de confidențialitate — se adaugă doar motivul.
Rândurile dispar odată cu contul (`on delete cascade`), la fel ca restul datelor.

Limitele tehnice, ca să nu se promită altceva: dacă aceeași persoană raportează de două ori exact
același text, rămâne **un singur rând** (index unic pe `user_id` + `md5(message_text)`); un raport
trimis nu poate fi modificat sau șters de cel care l-a trimis (nu există politici de `update` ori
`delete` pe tabel).

## 3. Cum se citește coada

Raportările le citește **doar** ownerul, cu `service_role` (sau din SQL Editor în Supabase), pentru
că RLS-ul le ascunde de ceilalți utilizatori. Cele nerezolvate, cele mai noi primele:

```sql
select created_at, reason, app_language, user_id, thread_id, message_text
from public.ai_reports
where status = 'open'
order by created_at desc
limit 50;
```

Închiderea unui raport (după ce a fost citit și s-a decis ceva):

```sql
update public.ai_reports
set status = 'reviewed',            -- sau 'dismissed' dacă raportarea nu se confirmă
    reviewed_at = timezone('utc', now()),
    review_note = 'ce s-a constatat și ce s-a schimbat'
where id = '<id-ul raportului>';
```

## 4. Ce se face cu un raport

1. **Se citește răspunsul raportat** și se verifică dacă încalcă vreuna dintre regulile din
   promptul asistentului (`supabase/functions/orthodox-chat/index.ts`, șirul `systemInstructions`):
   sfat medical, autovătămare fără trimitere la 112, citat biblic inventat, conținut de ură ori
   periculos, sfat juridic/financiar, poziționare ca preot.
2. **Se notează cauza** în `review_note`, chiar și când raportarea nu se confirmă.
3. **Dacă răspunsul a încălcat o regulă**, se repară cauza, nu simptomul: se strânge regula în
   prompt (și atunci poarta `scripts/chat-safety-rules.mjs` trebuie actualizată intenționat, ceea ce
   lasă urmă în diff) sau se schimbă modelul/limita de tokeni în aceeași funcție. Nu se „rezolvă"
   prin ștergerea răspunsului din baza de date: problema se repetă la următoarea întrebare.
4. **Dacă răspunsul era periculos pentru viața sau sănătatea cuiva** (sfat medical concret,
   autovătămare tratată ca subiect de conversație), se consideră incident: se repară promptul în
   aceeași zi și se notează în `review_note` ce s-a schimbat.
5. Se închide rândul (`reviewed` / `dismissed`) și se notează data.

**Termen**: raportările se citesc în cel mult **3 zile lucrătoare**; cele care descriu pericol
imediat pentru o persoană, în aceeași zi. Cine citește: ownerul aplicației (Ștefan Ștefan), care
este și persoana de contact din fișa magazinului Play.

## 5. Ce trebuie făcut o singură dată (owner)

1. Aplicarea migrației `supabase/migrations/20261008000200_add_ai_reports.sql` în baza live
   (fără ea, butonul „Raportează" răspunde „Raportul nu a putut fi trimis"). Verificare:
   `GET /rest/v1/ai_reports?select=id&limit=0` → `200`, nu `404`.
2. Confirmarea că `service_role` (sau contul de SQL Editor) vede tabelul; RLS-ul rămâne activ.
3. Prima citire a cozii: până atunci, rândul de mai sus întoarce zero linii — ceea ce este corect,
   nu un semn că raportarea nu funcționează.

## 6. Ce verifică automat poarta

`scripts/chat-safety-rules.mjs` (rulat de `npm run safety` și de `npm test`) verifică la fiecare
rulare: regulile obligatorii din prompt, faptul că promptul chiar este trimis către OpenAI
(`instructions: systemInstructions`), prezența `safety_identifier` și `store: false`, plus tot
lanțul de raportare — butonul din chat, scrierea în `ai_reports`, RLS-ul și politicile din migrație
și existența acestui document. În plus, poarta **demonstrează că este sensibilă**: pentru fiecare
regulă, o copie a promptului fără regula respectivă trebuie să producă o cădere a porții.
