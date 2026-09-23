-- 20260915000500 — carry the repaired seed DATA onto the remote database.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- The repair round corrected content inside four seed migrations that were ALREADY
-- APPLIED on the linked project (`supabase migration list --linked`):
--
--   20260911000100  Greek calendar 2026        (4 x U+20BC -> U+0386 in `title`)
--   20260911001500  Bulgarian calendar 2026    (idempotency only)
--   20260913120000  RO notification bank       (idempotency only)
--   20260913121000  multilingual bank          (36 `ka` rows repaired)
--
-- Editing an applied migration changes the repository but NOT the database: `db push`
-- records the version and never re-runs it. Those four files are therefore restored
-- byte-for-byte to their HEAD revisions, and every content correction that must exist
-- remotely is re-expressed here as an additive, idempotent UPDATE.
--
-- WHY THE UPDATES ARE SAFE
-- ------------------------
-- * Every statement is an UPDATE keyed by the row's natural key, so running this
--   migration twice produces the identical result.
-- * `title_template` / `body_template` / `is_active` are the only columns touched, so
--   the unique key used by `notification_messages_template_key_idx`
--   (language_code, COALESCE(country_code,''), COALESCE(calendar_code,''), day_type,
--   theme) is never modified and the index cannot be violated.
-- * `title` is the only calendar column touched, so the
--   `calendar_days_sync_feast_rank_code` trigger (which fires on `feast_rank` /
--   `feast_rank_code`) is not invoked and no rank is recomputed.
-- * No row is inserted or deleted, so a row an operator has since edited by hand keeps
--   its identity; only the contaminated text is replaced.
--
-- NOT REPEATED HERE (already covered)
-- ---------------------------------
-- * notification_messages de-duplication and its unique index are in 20260915000100.
-- * The Bulgarian `on conflict ... do update` clause added to 20260911001500 changes
--   only what a FUTURE re-run of that seed would do. The remote already holds exactly
--   those rows from the original plain INSERT, so there is no remote data effect.
-- * 20260913120000 gained only a DELETE-before-reinsert for its own re-run; it changed
--   no row text, and the diff against HEAD confirms 0 changed rows. The structural half
--   of that concern (duplicates + uniqueness) is 20260915000100.
--
-- SCOPE: 3 calendar rows, 36 notification rows
--        (ka/black_cross=30, ka/daily=4, ka/red_cross=1, ka/sunday=1).

-- ─── Greek calendar: U+20BC (AZERI MANAT SIGN) where Greek capital alpha-with-tonos
-- belongs. 4 occurrences across 3 rows; the remote still holds U+20BC.

update public.calendar_days
set title = 'Τα Άγια Θεοφάνεια , Οσίου Ευαγρίου , οσιομάρτυρος Γεωργίου του Πέρσου , μάρτυρος Άσσαντ , ιερομάρτυρος Ρωμανού του Λακεδαίμονος , Οσίου Νικολάου , Οσίου Σεργίου , ιερομάρτυρος Ανδρέου και των συν αυτώ'
where country_code = 'GR'
  and language_code = 'el'
  and calendar_code = 'gr-church-of-greece'
  and calendar_date = '2026-01-06';

update public.calendar_days
set title = 'Ευθυμίου του Μεγάλου , Μνήμη των αγίων μαρτύρων Βασσου, Ευσεβίου, Ευτυχίου και Βασιλείδου , Μνήμη των αγίων μαρτύρων Ινν ᾶ , Πιννά και Ριμμά , μακαρίου Πετρου του Τελώνου , Μνήμη των αγίων μαρτύρων Θυρσου και Αγνής , Αγίου μάρτυρος Ευσεβίου , Αγίας μάρτυρος Άννης , βασιλέως Λεοντος του Μεγάλου , Μνήμη των οσίων Ευθυμίου και Λαυρεντίου , Αγίου Ευθυμίου, αρχιεπισκόπου Τυρνόβου , Οσίου πατρός ημών Ευθυμίου , Αγίου νεομάρτυρος Ζαχαρίου , Οσίου Θεοδώρου του δικαίου'
where country_code = 'GR'
  and language_code = 'el'
  and calendar_code = 'gr-church-of-greece'
  and calendar_date = '2026-01-20';

update public.calendar_days
set title = 'Ανακομιδή του λειψάνου του Αγίου Ιωάννου του Χρυσοστόμου, Αγίας Μαρκιανής της βασιλίσσης , Οσίου Κλαυδίνου , Οσίου Πετρου του Αιγυπτίου , Αγίου Δημητριανού, επισκόπου Ταμασσού , Αγίου Άσκιοτ του βασιλέως , Οσίου Τίτου, του εκ Κιέβου , Αγίου νεομάρτυρος Δημητρίου , Αγίου ιερομάρτυρος Πέτρου'
where country_code = 'GR'
  and language_code = 'el'
  and calendar_code = 'gr-church-of-greece'
  and calendar_date = '2026-01-27';

-- ─── Georgian notification bank: Simplified-Chinese contamination (29 rows), Russian
-- residue (4 rows) and three rows reworded into idiomatic Georgian.

update public.notification_messages
set
  title_template = 'მადლიერების აზრი',
  body_template = 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. მადლობა ღმერთს მისი მზრუნველობისთვის და შეინარჩუნე იმედი ყველა ვითარებაში.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_034';

update public.notification_messages
set
  title_template = 'რწმენის შუქი',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. რწმენა შუქს მატებს აზრს და სიმშვიდეს ანიჭებს გულს. შეინარჩუნე იგი ლოცვით ცოცხალი.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_055';

update public.notification_messages
set
  title_template = 'ნაზი გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. სიმშვიდე და სიკეთე აახლოებს ადამიანებს და ინარჩუნებს გულის მშვიდობას.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_056';

update public.notification_messages
set
  title_template = 'იმოძღვრე იმედით',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მიანდე შენი საზრუნავი ღმერთს და იარე წინ რწმენითა და მოთმინებით.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_057';

update public.notification_messages
set
  title_template = 'მშვიდობა ყოველ ნაბიჯზე',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დაე, მშვიდობამ წარმართოს შენი გადაწყვეტილებები და ყველა ვითარებაში შეინარჩუნე რწმენა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_058';

update public.notification_messages
set
  title_template = 'თავმდაბალი სიყვარული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გიყვარდეს უპირობოდ და დაეხმარე ჩუმად. გულწრფელი სიკეთე სიმშვიდეს ანიჭებს სულს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_059';

update public.notification_messages
set
  title_template = 'მოთმინება ბოლომდე',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. განაგრძე სიკეთის ძიება ლოცვით, მოთმინებითა და სიყვარულით. ღმერთი აძლიერებს მორწმუნის სულს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_060';

update public.notification_messages
set
  title_template = 'სასარგებლო სიტყვები',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დღეს აირჩიე სიტყვები, რომლებიც მშვიდობასა და გამხნევებას მოაქვს. სიკეთე იწყება იმით, როგორ ვლაპარაკობთ.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_061';

update public.notification_messages
set
  title_template = 'დარჩი სიჩუმეში',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნუ დაუშვებ, რომ აჩქარებამ სული შეგაწუხოს. სიმშვიდესა და ლოცვაში გული ძალას პოულობს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_062';

update public.notification_messages
set
  title_template = 'მადლიერი გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მადლობა ღმერთს ყოველი მადლისთვის. მადლიერება მშვიდობასა და იმედს მოაქვს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_063';

update public.notification_messages
set
  title_template = 'მშვიდი გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დარჩი მშვიდად ღმერთის წინაშე და დაე, მისმა მშვიდობამ აავსოს შენი გული.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_064';

update public.notification_messages
set
  title_template = 'აკეთე სიკეთე',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნუ დაიღლები სიკეთის კეთებით. ღმერთი ხედავს ყოველ კეთილ საქმეს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_065';

update public.notification_messages
set
  title_template = 'მოიტანე იმედი',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოუტანე იმედი და ნუგეში შენს გარშემო მყოფებს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_066';

update public.notification_messages
set
  title_template = 'პატიება და შენდობა',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. აპატიე სხვებს, როგორც შენ გსურს, რომ შეგინდონ.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_067';

update public.notification_messages
set
  title_template = 'მადლიერი გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. იყავი მადლიერი წვრილმანებისთვის და ცხოვრება სიხარულით აივსება.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_068';

update public.notification_messages
set
  title_template = 'სიყვარული საქმით',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გამოხატე სიყვარული საქმით და არა მხოლოდ სიტყვით.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_069';

update public.notification_messages
set
  title_template = 'შინაგანი მშვიდობა',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დაე, ღმერთის მშვიდობამ დაიცვას შენი ფიქრები და გული.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_070';

update public.notification_messages
set
  title_template = 'დარჩი რწმენაში',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. როგორი ვითარებაც არ უნდა იყოს, დაიცავი რწმენა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_071';

update public.notification_messages
set
  title_template = 'ნაზი პასუხი',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. უპასუხე ნაზად და დაამშვიდე რისხვა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_072';

update public.notification_messages
set
  title_template = 'ლოცვის დრო',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ყოველდღე გამოყავი დრო ლოცვისთვის და მიუახლოვდი ღმერთს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_073';

update public.notification_messages
set
  title_template = 'მიენდე ღმერთს',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მიანდე შენი ტვირთი ღმერთს და ის დაგეხმარება.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_074';

update public.notification_messages
set
  title_template = 'მხიარული გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მუდამ იხარე უფალში, რადგან სიხარული ძალაა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_075';

update public.notification_messages
set
  title_template = 'კეთილად მოეპყარი სხვებს',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოეპყარი სხვებს ისე, როგორც გსურს, რომ შენ მოგეპყრან.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_076';

update public.notification_messages
set
  title_template = 'მონანიება და განახლება',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოინანიე და განაახლე შენი გული, ღმერთი ერთგულია.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_077';

update public.notification_messages
set
  title_template = 'მშვიდი ლოცვა',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. სიმშვიდეში ისმინე ღმერთის ხმა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_078';

update public.notification_messages
set
  title_template = 'გიყვარდეთ ერთმანეთი',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გიყვარდეთ ერთმანეთი, როგორც ქრისტემ შეგვიყვარა.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_079';

update public.notification_messages
set
  title_template = 'მარადიული იმედი',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. იმედი ამ ცხოვრებაში კი არა, ღმერთის სასუფეველშია.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_080';

update public.notification_messages
set
  title_template = 'მადლიერების ლოცვა',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ილოცე მადლიერი გულით და დაითვალე ღმერთის მადლი.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_081';

update public.notification_messages
set
  title_template = 'ნაზი გული',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნეტარ არიან მშვიდნი, რამეთუ ისინი დაიმკვიდრებენ ქვეყანას.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_082';

update public.notification_messages
set
  title_template = 'ილოცეთ ერთმანეთისთვის',
  body_template = 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ილოცე სხვებისთვის და სიყვარული ამით გამოვლინდება.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'black_cross'
    and theme = 'black_cross_083';

update public.notification_messages
set
  title_template = 'სიყვარული საქმეებით',
  body_template = 'ნამდვილი სიყვარული ჩანს მზრუნველობაში, მოთმინებასა და სიკეთეში მოყვასის მიმართ.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_052';

update public.notification_messages
set
  title_template = 'რწმენის შუქი',
  body_template = 'რწმენა ნათელს ჰფენს მათ ნაბიჯებს, ვინც თავმდაბლად და იმედით მიდის ღმერთის წინაშე.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_103';

update public.notification_messages
set
  title_template = 'რწმენა და მოთმინება',
  body_template = 'იარე წინ შიშის გარეშე. ღმერთი მოქმედებს საჭირო დროს სულის სასიკეთოდ.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_110';

update public.notification_messages
set
  title_template = 'მშვიდობა ყოველ დღე',
  body_template = 'აირჩიე სიმშვიდე არეულობის ნაცვლად. ლოცვა ინარჩუნებს მშვიდობას გულში.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'daily'
    and theme = 'daily_111';

update public.notification_messages
set
  title_template = 'მადლიერი სული',
  body_template = 'დღეს არის წითელი ჯვრის დღესასწაული: {feast_title}. მადლობა ღმერთს მისი მზრუნველობისთვის და შეინარჩუნე მადლიერება ყოველ წუთს.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'red_cross'
    and theme = 'red_cross_025';

update public.notification_messages
set
  title_template = 'მშვიდობა და მადლიერება',
  body_template = 'დღეს კვირაა. იხარე მიღებული ნიჭებით და მადლობა ღმერთს მისი მზრუნველობისთვის.',
  is_active = true
where language_code = 'ka'
    and country_code is null
    and calendar_code is null
    and day_type = 'sunday'
    and theme = 'sunday_012';
