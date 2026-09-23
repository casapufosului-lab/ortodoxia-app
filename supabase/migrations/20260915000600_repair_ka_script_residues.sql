-- 20260915000600 — clear the remaining non-Georgian script residues from the `ka`
-- notification bank.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- 20260915000500 carries the Chinese/Russian repairs that the previous round made in
-- the seed file. A script scan of the same corpus (placeholders excluded) found 18
-- further `ka` rows whose text is Georgian but still carries a foreign word, and the
-- remote database holds exactly those 18 rows. `Sorgen` is German, `sincera` is
-- Italian, `discouragement` / `Courage` are English, and `وسط` is Arabic.
--
-- WHAT IS CHANGED
-- ---------------
-- ONLY the offending word. Three titles are repaired too: two began with a stray
-- space, and `daily_087` read "გ Sorgen-ები მიაწვდე" (a truncated word plus the German
-- token). No sentence is otherwise rewritten and no new liturgical content is added.
--
-- SUBSTITUTION TABLE (review this list before applying)
-- ------------------------------------------------
--   Sorgen-ებისთვის -> საზრუნავებისთვის      (already used in this corpus)
--   Sorgen-ების     -> საზრუნავების
--   Sorgen-ები      -> საზრუნავები
--   Sorgen-ის       -> საზრუნავის
--   Sorgen-ით       -> საზრუნავით
--   Sorgen          -> საზრუნავი            (already used in this corpus)
--   sincera         -> გულწრფელი            (already used in this corpus)
--   discouragement  -> სასოწარკვეთა
--   Courage         -> გამბედაობა
--   وسط             -> შუაში               (Arabic "midst")
--
-- TITLE REPAIRS
-- -------------
--   black_cross_117  " sincera მადლობა"        -> "გულწრფელი მადლობა"
--   daily_108        " sincera ლოცვა"          -> "გულწრფელი ლოცვა"
--   daily_087        "გ Sorgen-ები მიაწვდე"    -> "საზრუნავები მიანდე ღმერთს"
--
-- Idempotent: every statement is an UPDATE keyed by the row's natural key and sets
-- the same final text, so re-running changes nothing. The unique key columns
-- (language_code, country_code, calendar_code, day_type, theme) are never modified.
-- SCOPE: 18 rows.

update public.notification_messages
set
  title_template = 'მშვიდობის შენარჩუნება',
  body_template = 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. სულის სიმშვიდე ლოცვით და ღმერთში რწმენით შენარჩუნდება. არ დაუშვა, რომ საზრუნავი შენი გული შეაწუხოს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_004';

update public.notification_messages
set
  title_template = 'დარჩი მშვიდობაში',
  body_template = 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. მიენდო ღმერთს შენს საზრუნავი-ებს. მშვიდი გულით ლოცვა მოაქვს ძალას.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_091';

update public.notification_messages
set
  title_template = 'სარწმუნოების მშვიდობა',
  body_template = 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. სარწმუნოება მოაქვს სიმშვიდეს საზრუნავების შუაში. მიენდო ღმერთს თითოეული ნაბიჯისთვის.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_104';

update public.notification_messages
set
  title_template = 'გულწრფელი მადლობა',
  body_template = 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. მადლობა თითოეული მიღებული სიკეთისთვის. მადლიერი გული რჩება მშვიდობით და იმედით.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_117';

update public.notification_messages
set
  title_template = 'გულის მშვიდობა შეინარჩუნე',
  body_template = 'თუნდაც საზრუნავის შუაში, ეძებე სიმშვიდე, რომელიც ღმერთთან სიახლოვიდან მოდის. ის არ ტოვებს მათ, ვინც მას ეძებს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_002';

update public.notification_messages
set
  title_template = 'მტკიცე იმედი',
  body_template = 'არ დაუშვა, რომ სასოწარკვეთა-მა შენი გული დაიპყროს. შენი იმედი ღმერთში დააყენე და მოთმინებით განაგრძე.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_005';

update public.notification_messages
set
  title_template = 'მზერა მაღლა',
  body_template = 'როდესაც საზრუნავები მძიმე ხდება, შენი აზრი ღმერთისკენ აწიე. ლოცვა გაწვდავს და იმედს მოაქვს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_010';

update public.notification_messages
set
  title_template = 'შეიძინე სიმშვიდე',
  body_template = 'მხოლოდ რამდენიმე წუთით დატოვე საზრუნავები და შენი აზრი ღმერთისკენ აწიე. ლოცვა გულს დასვენებას მოაქვს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_020';

update public.notification_messages
set
  title_template = 'ყოველ ნაბიჯზე ნდობა',
  body_template = 'წინ მიდი რწმენით და დატოვე საზრუნავები ღმერთის ხელში. ის აძლიერებს სულს, რომელიც მას ეძებს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_061';

update public.notification_messages
set
  title_template = 'რწმენის სიხარული',
  body_template = 'რწმენა გაწვდავს გამბედაობა-ით გამოცდებში და მშვიდობას გულში. ყოველდღე ახლოს დარჩი ღმერთთან.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_081';

update public.notification_messages
set
  title_template = 'საზრუნავები მიანდე ღმერთს',
  body_template = 'დატოვე ღმერთის წინაშე ის, რაც გაწუხებს. ლოცვა ძალას და სიმშვიდეს მოაქვს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_087';

update public.notification_messages
set
  title_template = 'მშვიდი გული',
  body_template = 'დატოვე საზრუნავები ღმერთის წინაშე და წინ მიდი რწმენით. ის არის შენი მხარდაჭერა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_097';

update public.notification_messages
set
  title_template = 'გულწრფელი ლოცვა',
  body_template = 'ამ დღის დაწყება გულიდან ლოცვით. ღმერთი ისმენს მათ, ვინც რწმენით ეძებს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_108';

update public.notification_messages
set
  title_template = 'ყველაფერი ღმერთს მიენდო',
  body_template = 'გთხოვ, ღმერთს მიაწვდე შენი საზრუნავი და გეგმები. ის ხელმძღვანელობს მორწმუნის ნაბიჯებს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_113';

update public.notification_messages
set
  title_template = 'იმედი და მშვიდობა',
  body_template = 'მარხვის წესები: {fasting_note}. ნუ დაუშვებ, რომ სასოწარკვეთა შენი სული აღელვოს. ღმერთი არის იმათ მხარდაჭერა, ვინც ეძებს მას.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'fasting'
    and theme = 'fasting_042';

update public.notification_messages
set
  title_template = 'შეჩერდი სიჩქარეს',
  body_template = 'დღეს არის წითელი ჯვრის დღესასწაული: {feast_title}. დროებით დაანებე საზრუნავი-ებს და მიმართე შენი გული ღმერთისკენ ლოცვით.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'red_cross'
    and theme = 'red_cross_002';

update public.notification_messages
set
  title_template = 'ძლიერება ლოცვაში',
  body_template = 'დღეს არის წითელი ჯვრის დღესასწაული: {feast_title}. ეძებე ძალა ლოცვაში და მიენდო ღმერთს ყველა საზრუნავებისთვის.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'red_cross'
    and theme = 'red_cross_029';

update public.notification_messages
set
  title_template = 'მშვიდობა სულისთვის',
  body_template = 'დღეს არის კვირა. დაანებე თავი საზრუნავი-ებს და ეძებე სიმშვიდე ღმერთთან სიახლოვეში. ლოცვა აძლიერებს გულს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'sunday'
    and theme = 'sunday_017';
