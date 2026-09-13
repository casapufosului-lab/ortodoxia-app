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
  ('el', null, null, 'daily', 'peace', 'Σκέψη της ημέρας', '{verse_text} ({verse_source}) Ξεκίνα την ημέρα με ειρήνη και μια σύντομη προσευχή.', true),
  ('el', null, null, 'daily', 'hope', 'Σκέψη της ημέρας', '{verse_text} ({verse_source}) Είθε ο Κύριος να φωτίζει τα βήματά σου σήμερα.', true),
  ('el', null, null, 'sunday', 'sunday', 'Ευλογημένη Κυριακή', '{verse_text} ({verse_source}) Σήμερα είναι Κυριακή. Κάνε χώρο για προσευχή και ειρήνη.', true),
  ('el', null, null, 'fasting', 'fasting', 'Σκέψη νηστείας', '{verse_text} ({verse_source}) Αν σήμερα είναι ημέρα νηστείας, δέξου την με υπομονή, εγκράτεια και προσευχή.', true),
  ('el', null, null, 'red_cross', 'feast', 'Ευλογημένη εορτή', 'Σήμερα είναι μεγάλη εορτή: {feast_title}. {verse_text} ({verse_source}) Είθε ο Θεός να σου χαρίζει ειρήνη και φως.', true),

  ('sr', null, null, 'daily', 'peace', 'Мисао дана', '{verse_text} ({verse_source}) Започни дан у миру и краткој молитви.', true),
  ('sr', null, null, 'daily', 'hope', 'Мисао дана', '{verse_text} ({verse_source}) Нека Господ данас просветли твоје кораке.', true),
  ('sr', null, null, 'sunday', 'sunday', 'Благословена недеља', '{verse_text} ({verse_source}) Данас је недеља. Остави места за молитву и мир.', true),
  ('sr', null, null, 'fasting', 'fasting', 'Мисао о посту', '{verse_text} ({verse_source}) Ако је данас дан поста, прими га са стрпљењем, уздржањем и молитвом.', true),
  ('sr', null, null, 'red_cross', 'feast', 'Благословен празник', 'Данас је велики празник: {feast_title}. {verse_text} ({verse_source}) Нека ти Бог дарује мир и светлост.', true),

  ('bg', null, null, 'daily', 'peace', 'Мисъл за деня', '{verse_text} ({verse_source}) Започни деня с мир и кратка молитва.', true),
  ('bg', null, null, 'daily', 'hope', 'Мисъл за деня', '{verse_text} ({verse_source}) Нека Господ осветява стъпките ти днес.', true),
  ('bg', null, null, 'sunday', 'sunday', 'Благословена неделя', '{verse_text} ({verse_source}) Днес е неделя. Отдели място за молитва и мир.', true),
  ('bg', null, null, 'fasting', 'fasting', 'Мисъл за поста', '{verse_text} ({verse_source}) Ако днес е постен ден, приеми го с търпение, въздържание и молитва.', true),
  ('bg', null, null, 'red_cross', 'feast', 'Благословен празник', 'Днес е голям празник: {feast_title}. {verse_text} ({verse_source}) Бог да ти дари мир и светлина.', true),

  ('mk', null, null, 'daily', 'peace', 'Мисла на денот', '{verse_text} ({verse_source}) Започни го денот со мир и кратка молитва.', true),
  ('mk', null, null, 'daily', 'hope', 'Мисла на денот', '{verse_text} ({verse_source}) Нека Господ денес ги осветли твоите чекори.', true),
  ('mk', null, null, 'sunday', 'sunday', 'Благословена недела', '{verse_text} ({verse_source}) Денес е недела. Направи место за молитва и мир.', true),
  ('mk', null, null, 'fasting', 'fasting', 'Мисла за постот', '{verse_text} ({verse_source}) Ако денес е постен ден, прими го со трпение, воздржување и молитва.', true),
  ('mk', null, null, 'red_cross', 'feast', 'Благословен празник', 'Денес е голем празник: {feast_title}. {verse_text} ({verse_source}) Бог нека ти дарува мир и светлина.', true),

  ('uk', null, null, 'daily', 'peace', 'Думка дня', '{verse_text} ({verse_source}) Почни день з миром і короткою молитвою.', true),
  ('uk', null, null, 'daily', 'hope', 'Думка дня', '{verse_text} ({verse_source}) Нехай Господь сьогодні освітлює твої кроки.', true),
  ('uk', null, null, 'sunday', 'sunday', 'Благословенної неділі', '{verse_text} ({verse_source}) Сьогодні неділя. Знайди місце для молитви і миру.', true),
  ('uk', null, null, 'fasting', 'fasting', 'Думка про піст', '{verse_text} ({verse_source}) Якщо сьогодні день посту, прийми його з терпінням, стриманістю і молитвою.', true),
  ('uk', null, null, 'red_cross', 'feast', 'Благословенне свято', 'Сьогодні велике свято: {feast_title}. {verse_text} ({verse_source}) Нехай Бог дарує тобі мир і світло.', true),

  ('ka', null, null, 'daily', 'peace', 'დღის ფიქრი', '{verse_text} ({verse_source}) დაიწყე დღე მშვიდობით და მოკლე ლოცვით.', true),
  ('ka', null, null, 'daily', 'hope', 'დღის ფიქრი', '{verse_text} ({verse_source}) უფალმა დღეს გაანათოს შენი ნაბიჯები.', true),
  ('ka', null, null, 'sunday', 'sunday', 'კურთხეული კვირა', '{verse_text} ({verse_source}) დღეს კვირაა. დაუთმე ადგილი ლოცვასა და მშვიდობას.', true),
  ('ka', null, null, 'fasting', 'fasting', 'მარხვის ფიქრი', '{verse_text} ({verse_source}) თუ დღეს მარხვის დღეა, მიიღე იგი მოთმინებით, თავშეკავებით და ლოცვით.', true),
  ('ka', null, null, 'red_cross', 'feast', 'კურთხეული დღესასწაული', 'დღეს დიდი დღესასწაულია: {feast_title}. {verse_text} ({verse_source}) ღმერთმა მოგანიჭოს მშვიდობა და ნათელი.', true),

  ('ru', null, null, 'daily', 'peace', 'Мысль дня', '{verse_text} ({verse_source}) Начни день с миром и короткой молитвой.', true),
  ('ru', null, null, 'daily', 'hope', 'Мысль дня', '{verse_text} ({verse_source}) Пусть Господь сегодня освещает твои шаги.', true),
  ('ru', null, null, 'sunday', 'sunday', 'Благословенного воскресенья', '{verse_text} ({verse_source}) Сегодня воскресенье. Найди место для молитвы и мира.', true),
  ('ru', null, null, 'fasting', 'fasting', 'Мысль о посте', '{verse_text} ({verse_source}) Если сегодня день поста, прими его с терпением, воздержанием и молитвой.', true),
  ('ru', null, null, 'red_cross', 'feast', 'Благословенный праздник', 'Сегодня великий праздник: {feast_title}. {verse_text} ({verse_source}) Да дарует тебе Бог мир и свет.', true),

  ('sq', null, null, 'daily', 'peace', 'Mendimi i ditës', '{verse_text} ({verse_source}) Filloje ditën me paqe dhe me një lutje të shkurtër.', true),
  ('sq', null, null, 'daily', 'hope', 'Mendimi i ditës', '{verse_text} ({verse_source}) Zoti t’i ndriçoftë hapat sot.', true),
  ('sq', null, null, 'sunday', 'sunday', 'E diel e bekuar', '{verse_text} ({verse_source}) Sot është e diel. Gjej vend për lutje dhe paqe.', true),
  ('sq', null, null, 'fasting', 'fasting', 'Mendim për agjërimin', '{verse_text} ({verse_source}) Nëse sot është ditë agjërimi, pranoje me durim, përmbajtje dhe lutje.', true),
  ('sq', null, null, 'red_cross', 'feast', 'Festë e bekuar', 'Sot është festë e madhe: {feast_title}. {verse_text} ({verse_source}) Zoti të dhëntë paqe dhe dritë.', true)
on conflict do nothing;

commit;
