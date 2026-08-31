# Configurare Supabase

1. Creează un proiect Supabase.
2. Deschide SQL Editor în dashboard.
3. Rulează fișierele din `migrations` în ordinea numelui lor.
4. Copiază `.env.example` în `.env`.
5. Completează URL-ul proiectului și cheia publicabilă din Project Settings, API Keys.

Nu folosi cheia `service_role` și nu o introduce în aplicație.

## Chat AI

- Codul funcției este în `functions/orthodox-chat/index.ts`.
- Vizitatorii primesc 5 întrebări gratuite pe zi fără cont, iar utilizatorii autentificați au 5 mesaje pe zi pentru planul gratuit sau 50 pentru Premium.
- Migrarea `20260831000100_add_guest_ai_usage.sql` trebuie rulată după celelalte migrări pentru contorizarea întrebărilor anonime.
- Secretul `OPENAI_API_KEY` se adaugă numai în Supabase, Edge Functions, Secrets.
- Cheia OpenAI nu se adaugă în `.env`-ul aplicației Expo.
- Modelul configurat pentru MVP este `gpt-5.4-mini` prin Responses API.

## Premium

- Starea abonamentului este păstrată în tabela `subscriptions`.
- Utilizatorul poate citi numai propriul abonament.
- Aplicația nu poate activa singură Premium. Scrierea în tabelă rămâne rezervată sistemului de plăți de pe server.
- Plățile Apple și Google nu sunt încă conectate.

## Verificare minimă

- toate cele nouă tabele există în schema `public`;
- Row Level Security este activ pe fiecare tabel;
- la crearea unui utilizator apare automat profilul cu același identificator;
- un utilizator autentificat nu poate citi profilul, favoritele sau conversațiile altui utilizator;
- utilizatorii neautentificați pot citi numai conținutul publicat.
