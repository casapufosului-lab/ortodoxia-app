begin;

insert into public.notification_messages (
  language_code,
  country_code,
  calendar_code,
  day_type,
  theme,
  title_template,
  body_template,
  is_active
) values
  ('el', null, null, 'daily', 'peace', 'Σκέψη της ημέρας', '{verse_text} ({verse_source}) Ξεκίνα την ημέρα με ειρήνη και μια σύντομη προσευχή.'),
  ('el', null, null, 'daily', 'hope', 'Σκέψη της ημέρας', '{verse_text} ({verse_source}) Είθε ο Κύριος να φωτίζει τα βήματά σου σήμερα.'),
  ('el', null, null, 'sunday', 'sunday', 'Ευλογημένη Κυριακή', '{verse_text} ({verse_source}) Σήμερα είναι Κυριακή. Κάνε χώρο για προσευχή και ειρήνη.'),
  ('el', null, null, 'fasting', 'fasting', 'Σκέψη νηστείας', '{verse_text} ({verse_source}) Αν σήμερα είναι ημέρα νηστείας, δέξου την με υπομονή, εγκράτεια και προσευχή.'),
  ('el', null, null, 'red_cross', 'feast', 'Ευλογημένη εορτή', 'Σήμερα είναι μεγάλη εορτή: {feast_title}. {verse_text} ({verse_source}) Είθε ο Θεός να σου χαρίζει ειρήνη και φως.'),

  ('sr', null, null, 'daily', 'peace', 'Мисао дана', '{verse_text} ({verse_source}) Започни дан у миру и краткој молитви.'),
  ('sr', null, null, 'daily', 'hope', 'Мисао дана', '{verse_text} ({verse_source}) Нека Господ данас просветли твоје кораке.'),
  ('sr', null, null, 'sunday', 'sunday', 'Благословена недеља', '{verse_text} ({verse_source}) Данас је недеља. Остави места за молитву и мир.'),
  ('sr', null, null, 'fasting', 'fasting', 'Мисао о посту', '{verse_text} ({verse_source}) Ако је данас дан поста, прими га са стрпљењем, уздржањем и молитвом.'),
  ('sr', null, null, 'red_cross', 'feast', 'Благословен празник', 'Данас је велики празник: {feast_title}. {verse_text} ({verse_source}) Нека ти Бог дарује мир и светлост.'),

  ('bg', null, null, 'daily', 'peace', 'Мисъл за деня', '{verse_text} ({verse_source}) Започни деня с мир и кратка молитва.'),
  ('bg', null, null, 'daily', 'hope', 'Мисъл за деня', '{verse_text} ({verse_source}) Нека Господ осветява стъпките ти днес.'),
  ('bg', null, null, 'sunday', 'sunday', 'Благословена неделя', '{verse_text} ({verse_source}) Днес е неделя. Отдели място за молитва и мир.'),
  ('bg', null, null, 'fasting', 'fasting', 'Мисъл за поста', '{verse_text} ({verse_source}) Ако днес е постен ден, приеми го с търпение, въздържание и молитва.'),
  ('bg', null, null, 'red_cross', 'feast', 'Благословен празник', 'Днес е голям празник: {feast_title}. {verse_text} ({verse_source}) Бог да ти дари мир и светлина.'),

  ('mk', null, null, 'daily', 'peace', 'Мисла на денот', '{verse_text} ({verse_source}) Започни го денот со мир и кратка молитва.'),
  ('mk', null, null, 'daily', 'hope', 'Мисла на денот', '{verse_text} ({verse_source}) Нека Господ денес ги осветли твоите чекори.'),
  ('mk', null, null, 'sunday', 'sunday', 'Благословена недела', '{verse_text} ({verse_source}) Денес е недела. Направи место за молитва и мир.'),
  ('mk', null, null, 'fasting', 'fasting', 'Мисла за постот', '{verse_text} ({verse_source}) Ако денес е постен ден, прими го со трпение, воздржување и молитва.'),
  ('mk', null, null, 'red_cross', 'feast', 'Благословен празник', 'Денес е голем празник: {feast_title}. {verse_text} ({verse_source}) Бог нека ти дарува мир и светлина.'),

  ('uk', null, null, 'daily', 'peace', 'Думка дня', '{verse_text} ({verse_source}) Почни день з миром і короткою молитвою.'),
  ('uk', null, null, 'daily', 'hope', 'Думка дня', '{verse_text} ({verse_source}) Нехай Господь сьогодні освітлює твої кроки.'),
  ('uk', null, null, 'sunday', 'sunday', 'Благословенної неділі', '{verse_text} ({verse_source}) Сьогодні неділя. Знайди місце для молитви і миру.'),
  ('uk', null, null, 'fasting', 'fasting', 'Думка про піст', '{verse_text} ({verse_source}) Якщо сьогодні день посту, прийми його з терпінням, стриманістю і молитвою.'),
  ('uk', null, null, 'red_cross', 'feast', 'Благословенне свято', 'Сьогодні велике свято: {feast_title}. {verse_text} ({verse_source}) Нехай Бог дарує тобі мир і світло.'),

  ('ka', null, null, 'daily', 'peace', 'დღის ფიქრი', '{verse_text} ({verse_source}) დაიწყე დღე მშვიდობით და მოკლე ლოცვით.'),
  ('ka', null, null, 'daily', 'hope', 'დღის ფიქრი', '{verse_text} ({verse_source}) უფალმა დღეს გაანათოს შენი ნაბიჯები.'),
  ('ka', null, null, 'sunday', 'sunday', 'კურთხეული კვირა', '{verse_text} ({verse_source}) დღეს კვირაა. დაუთმე ადგილი ლოცვასა და მშვიდობას.'),
  ('ka', null, null, 'fasting', 'fasting', 'მარხვის ფიქრი', '{verse_text} ({verse_source}) თუ დღეს მარხვის დღეა, მიიღე იგი მოთმინებით, თავშეკავებით და ლოცვით.'),
  ('ka', null, null, 'red_cross', 'feast', 'კურთხეული დღესასწაული', 'დღეს დიდი დღესასწაულია: {feast_title}. {verse_text} ({verse_source}) ღმერთმა მოგანიჭოს მშვიდობა და ნათელი.'),

  ('ru', null, null, 'daily', 'peace', 'Мысль дня', '{verse_text} ({verse_source}) Начни день с миром и короткой молитвой.'),
  ('ru', null, null, 'daily', 'hope', 'Мысль дня', '{verse_text} ({verse_source}) Пусть Господь сегодня освещает твои шаги.'),
  ('ru', null, null, 'sunday', 'sunday', 'Благословенного воскресенья', '{verse_text} ({verse_source}) Сегодня воскресенье. Найди место для молитвы и мира.'),
  ('ru', null, null, 'fasting', 'fasting', 'Мысль о посте', '{verse_text} ({verse_source}) Если сегодня день поста, прими его с терпением, воздержанием и молитвой.'),
  ('ru', null, null, 'red_cross', 'feast', 'Благословенный праздник', 'Сегодня великий праздник: {feast_title}. {verse_text} ({verse_source}) Да дарует тебе Бог мир и свет.'),

  ('sq', null, null, 'daily', 'peace', 'Mendimi i ditës', '{verse_text} ({verse_source}) Filloje ditën me paqe dhe me një lutje të shkurtër.'),
  ('sq', null, null, 'daily', 'hope', 'Mendimi i ditës', '{verse_text} ({verse_source}) Zoti t’i ndriçoftë hapat sot.'),
  ('sq', null, null, 'sunday', 'sunday', 'E diel e bekuar', '{verse_text} ({verse_source}) Sot është e diel. Gjej vend për lutje dhe paqe.'),
  ('sq', null, null, 'fasting', 'fasting', 'Mendim për agjërimin', '{verse_text} ({verse_source}) Nëse sot është ditë agjërimi, pranoje me durim, përmbajtje dhe lutje.'),
  ('sq', null, null, 'red_cross', 'feast', 'Festë e bekuar', 'Sot është festë e madhe: {feast_title}. {verse_text} ({verse_source}) Zoti të dhëntë paqe dhe dritë.')
on conflict do nothing;

commit;
