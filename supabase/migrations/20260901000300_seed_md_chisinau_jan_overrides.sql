-- =====================================================================
-- md-chisinau — overrides stil vechi (iulian) 2026 — Ianuarie
-- =====================================================================
-- Sursă: orthocal.info (stil iulian), tradus în română.
-- Acoperă zilele de graniță (1–13 ianuarie, care în stil vechi corespund
-- datelor din decembrie ale anului anterior, neacoperite de ro-bor 2026)
-- și sărbătorile mari/verificate din ianuarie + începutul Triodului.
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
  ('MD','ro','md-chisinau','2026-01-01','cruce neagră',array[]::text[],'Sf. Mc. Bonifatie și Dreapta Aglaida','Postul Nașterii Domnului (Dezlegare la untdelemn și vin)','Post','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-02','cruce neagră',array[]::text[],'Înainte-prăznuirea Nașterii Domnului; † Sf. Sfințit Mc. Ignatie Teoforul','Repausul Sf. Ioan de Kronstadt (stil vechi). Post de apă și pâine.','Post','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-03','cruce neagră',array[]::text[],'Sâmbăta dinaintea Nașterii Domnului; Sf. Mc. Iuliana și soții ei','Sf. Mc. Iuliana și cei împreună cu ea; Sf. Petru, mitropolitul Moscovei; Sf. Procopie din Veatka. Post cu untdelemn și vin.','Post','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-04','cruce neagră',array[]::text[],'Duminica dinaintea Nașterii Domnului; Sf. Mare Mc. Anastasia','Sf. Anastasia și cei împreună cu ea. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-05','cruce neagră',array[]::text[],'Sfinții 10 Mucenici din Creta; Sf. Pavel, arhiepiscopul Neocezareei','Sf. Naum de Ohrida (stil vechi). Post de apă și pâine.','Post','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-06','cruce neagră',array[]::text[],'Ajunul Nașterii Domnului (Ajunul Crăciunului)','Sf. Mc. Eugenia. Post aspru (ajun).','Post','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-07','cruce roșie',array[]::text[],'Nașterea Domnului (Crăciunul pe stil vechi)','Păstorii care L-au văzut pe Domnul; Închinarea Magilor. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-08','cruce roșie',array[]::text[],'Soborul Maicii Domnului','Sf. Sfințit Mc. Eftimie din Sardes; Fuga în Egipt a Sfintei Familii; Sf. Constantin din Synada. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-09','cruce roșie',array[]::text[],'Sf. Ap. întâiul Mc. și Arhidiacon Ștefan','Sf. Teodor cel Însemnat. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-10','cruce neagră',array[]::text[],'Sâmbăta după Nașterea Domnului; Sfinții 20.000 de Mucenici din Nicomidia','Sf. Simion cel cu mir; Sf. Mc. Marcu și Teofil, cu cei împreună cu ei. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-11','cruce roșie',array[]::text[],'Duminica după Nașterea Domnului; Sfinții 14.000 de prunci uciși din porunca lui Irod','Sf. Cuv. Marcel, egumenul Mănăstirii Neadormiților. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-12','cruce neagră',array[]::text[],'Sf. Mc. Anisia din Tesalonic','Sf. Macarie, mitropolitul Moscovei; Sf. Nicon (Lutov), ascetul. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true),
  ('MD','ro','md-chisinau','2026-01-13','cruce neagră',array[]::text[],'Odovania Nașterii Domnului; Sf. Cuv. Melania Romana','Sf. Melania cea tânără; Sf. Zotic, ocrotitorul săracilor; Sf. Teofilact de Ohrida. Fără post.','','orthocal.info (stil iulian), tradus în română, 2026',true)
on conflict (country_code, language_code, calendar_code, calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());
