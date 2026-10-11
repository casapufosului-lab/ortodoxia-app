-- Contorul zilei pe pas al cascadei de furnizori AI (09.10.2026).
--
-- DE CE EXISTĂ
-- ------------
-- Funcția Edge e fără stare: fiecare cerere poate ajunge pe alt isolate, deci „câte cereri am
-- trimis azi către Groq?" nu se poate ține în memorie. Contorul trăiește aici, într-o singură
-- tabelă, iar trecerea de la un furnizor la următorul se decide atomic: când contorul unui pas
-- ajunge la `switchAt`, pasul e sărit pentru restul zilei (cerința ownerului: „la 999 din 1000 se
-- schimbă"), iar utilizatorul primește răspuns de la următorul furnizor fără să observe nimic.
--
-- CE NU FACE: nu ține chei, nu ține text de conversație, nu ține identitatea nimănui. Doar
-- (zi, pas) → câte cereri. Zero date personale.
--
-- ZIUA se calculează în Europe/Bucharest, ca plafonul lunar existent (`ai_usage_monthly`), ca
-- „mâine" să însemne miezul nopții românesc, nu UTC.

CREATE TABLE IF NOT EXISTS public.ai_provider_usage_daily (
  day date NOT NULL,
  step_id text NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  -- Ultima valoare citită din antetul furnizorului (`x-ratelimit-remaining-requests`, la Groq),
  -- când există: dacă furnizorul și contorul local nu sunt de acord, antetul are prioritate.
  provider_remaining integer,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (day, step_id)
);

COMMENT ON TABLE public.ai_provider_usage_daily IS
  'Daily request counter per cascade step (day, step_id). Owned by the Edge function (service_role); it holds no personal data and no keys.';

ALTER TABLE public.ai_provider_usage_daily ENABLE ROW LEVEL SECURITY;

-- Fără politici pentru anon/authenticated: doar service_role (funcția Edge) o citește/scrie.
REVOKE ALL ON public.ai_provider_usage_daily FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.ai_provider_usage_daily.provider_remaining IS
  'Last remaining-requests value reported by the provider header, when the provider reports one.';

-- ─── rezervarea atomică a unui pas ───────────────────────────────────────────────────────────
--
-- `for update` pe rândul zilei: două cereri simultane nu pot trece amândouă de prag, fiindcă a
-- doua așteaptă prima să comită și citește contorul deja incrementat. Un pas epuizat NU se
-- incrementează (întoarce allowed = false și contorul neschimbat).

CREATE OR REPLACE FUNCTION public.reserve_ai_provider_step(p_step text, p_switch_at integer)
RETURNS TABLE (allowed boolean, requests integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (pg_catalog.timezone('Europe/Bucharest', pg_catalog.statement_timestamp()))::date;
  v_count integer;
BEGIN
  IF p_step IS NULL OR p_step = '' OR p_switch_at IS NULL OR p_switch_at < 1 THEN
    RAISE EXCEPTION 'Invalid provider step reservation';
  END IF;

  INSERT INTO public.ai_provider_usage_daily (day, step_id, requests)
  VALUES (v_day, p_step, 0)
  ON CONFLICT (day, step_id) DO NOTHING;

  SELECT u.requests INTO v_count
  FROM public.ai_provider_usage_daily AS u
  WHERE u.day = v_day AND u.step_id = p_step
  FOR UPDATE;

  IF v_count >= p_switch_at THEN
    RETURN QUERY SELECT false, v_count;
    RETURN;
  END IF;

  UPDATE public.ai_provider_usage_daily AS u
  SET requests = u.requests + 1,
      updated_at = pg_catalog.timezone('utc', pg_catalog.statement_timestamp())
  WHERE u.day = v_day AND u.step_id = p_step;

  RETURN QUERY SELECT true, v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_provider_step(text, integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_ai_provider_step(text, integer) TO service_role;

COMMENT ON FUNCTION public.reserve_ai_provider_step(text, integer) IS
  'Atomically reserves one request for a cascade step for the current Bucharest day. Returns (allowed, requests): allowed = false once the step reached its switch threshold, so the caller moves to the next provider. No personal data involved.';

-- ─── urma lăsată de furnizor: cât mai are de fapt ───────────────────────────────────────────
--
-- Antetul furnizorului (`x-ratelimit-remaining-requests`) e singura sursă care nu poate fi
-- „rotunjită". Când există, valoarea lui se scrie aici, ca operatorul să vadă dintr-o privire dacă
-- realitatea furnizorului contrazice contorul local (de exemplu după o resetare făcută de noi).

CREATE OR REPLACE FUNCTION public.record_ai_provider_remaining(p_step text, p_remaining integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (pg_catalog.timezone('Europe/Bucharest', pg_catalog.statement_timestamp()))::date;
BEGIN
  IF p_step IS NULL OR p_step = '' OR p_remaining IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_provider_usage_daily AS u
  SET provider_remaining = p_remaining,
      updated_at = pg_catalog.timezone('utc', pg_catalog.statement_timestamp())
  WHERE u.day = v_day AND u.step_id = p_step;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_provider_remaining(text, integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_ai_provider_remaining(text, integer) TO service_role;

COMMENT ON FUNCTION public.record_ai_provider_remaining(text, integer) IS
  'Stores the remaining-requests value reported by a provider header, when the provider reports one. Best-effort: a failure here must never fail a chat response.';
