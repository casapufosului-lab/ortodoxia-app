-- =====================================================================
-- md-chisinau — overrides stil vechi (iulian) 2026 — sărbători mobile
-- =====================================================================
-- Sursă: orthocal.info (stil iulian), tradus în română.
-- Acoperă sărbătorile mobile din 2026 (care urmează Paștele iulian) și
-- Buna Vestire pe stil vechi.
-- =====================================================================

insert into public.calendar_days (
  country_code,
  language_code,
  calendar_code,
  calendar_date,
  feast_rank,
  saints,
  title,
  details,
  fasting_note,
  editorial_source,
  is_published
) values
  ('MD','ro','md-chisinau','2026-04-04','cruce roșie',array[]::text[],'Sâmbăta lui Lazăr','Sf. Sfințit Mc. Vasile din Ancira; Sf. Mc. Drosida din Antiohia. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-04-05','cruce roșie',array[]::text[],'Intrarea Domnului în Ierusalim (Floriile)','Sf. Mc. Nicon și cei 199 de ucenici. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-04-06','cruce roșie',array[]::text[],'Înainte-prăznuirea Bunei Vestiri; Sf. Cuv. Zaheu Sihastrul','Comemorarea minunii de la Mănăstirea Peșterilor din Kiev. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-04-07','cruce roșie',array[]::text[],'Buna Vestire a Preasfintei Născătoare de Dumnezeu (stil vechi)','Sf. Sfințit Mc. Tihon, patriarhul Moscovei; Sf. Iustin (Popovic); Sf. Sava cel Nou din Kalymnos. Dezlegare la pește.','Dezlegare la pește','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-04-12','cruce roșie',array[]::text[],'Învierea Domnului (Paștele ortodox, stil vechi)','Începutul Penticostarului; Sf. Cuv. Ioan Scărarul. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true)
on conflict (country_code, language_code, calendar_code, calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());