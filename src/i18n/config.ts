export type CountryCode = 'RO' | 'MD';
export type LanguageCode = 'ro';
export type CalendarCode = 'ro-bor' | 'md-basarabia' | 'md-chisinau';

export type RegionConfig = {
  countryCode: CountryCode;
  countryLabel: string;
  currencyCode: 'RON' | 'MDL';
  languageCode: LanguageCode;
  languageLabel: string;
  locale: 'ro-RO' | 'ro-MD';
  timeZone: 'Europe/Bucharest' | 'Europe/Chisinau';
};

export type CalendarConfig = {
  calendarCode: CalendarCode;
  countryCode: CountryCode;
  description: string;
  jurisdictionLabel: string;
  label: string;
  officialUrl: string;
};

export const DEFAULT_COUNTRY: CountryCode = 'RO';

export const SUPPORTED_REGIONS: readonly RegionConfig[] = [
  {
    countryCode: 'RO',
    countryLabel: 'România',
    currencyCode: 'RON',
    languageCode: 'ro',
    languageLabel: 'Română',
    locale: 'ro-RO',
    timeZone: 'Europe/Bucharest',
  },
  {
    countryCode: 'MD',
    countryLabel: 'Republica Moldova',
    currencyCode: 'MDL',
    languageCode: 'ro',
    languageLabel: 'Română',
    locale: 'ro-MD',
    timeZone: 'Europe/Chisinau',
  },
] as const;

export const CALENDAR_OPTIONS: readonly CalendarConfig[] = [
  {
    calendarCode: 'ro-bor',
    countryCode: 'RO',
    description: 'Calendarul Bisericii Ortodoxe Române.',
    jurisdictionLabel: 'Patriarhia Română',
    label: 'Calendar ortodox românesc 2026',
    officialUrl: 'https://calendar.patriarhia.ro/',
  },
  {
    calendarCode: 'md-basarabia',
    countryCode: 'MD',
    description: 'Mitropolia Basarabiei, autonomă și de stil vechi.',
    jurisdictionLabel: 'Patriarhia Română',
    label: 'Mitropolia Basarabiei',
    officialUrl: 'https://mitropoliabasarabiei.md/',
  },
  {
    calendarCode: 'md-chisinau',
    countryCode: 'MD',
    description: 'Mitropolia Chișinăului și a Întregii Moldove.',
    jurisdictionLabel: 'Biserica Ortodoxă Rusă',
    label: 'Mitropolia Moldovei',
    officialUrl: 'https://mitropolia.md/',
  },
] as const;

export function getRegion(countryCode: string | null | undefined): RegionConfig {
  return SUPPORTED_REGIONS.find((region) => region.countryCode === countryCode)
    ?? SUPPORTED_REGIONS[0];
}

export function getCalendarsForCountry(countryCode: CountryCode) {
  return CALENDAR_OPTIONS.filter((calendar) => calendar.countryCode === countryCode);
}

export function getCalendar(
  calendarCode: string | null | undefined,
  countryCode: CountryCode,
): CalendarConfig | null {
  return CALENDAR_OPTIONS.find((calendar) => (
    calendar.calendarCode === calendarCode && calendar.countryCode === countryCode
  )) ?? null;
}

export function getDefaultCalendar(countryCode: CountryCode): CalendarConfig | null {
  if (countryCode === 'MD') return null;
  return getCalendarsForCountry(countryCode)[0] ?? null;
}

const ro = {
  'nav.home': 'Acasă',
  'nav.prayers': 'Rugăciuni',
  'nav.calendar': 'Calendar',
  'nav.bible': 'Biblia',
  'nav.chat': 'Întreabă',
  'nav.account': 'Cont',
  'account.regionTitle': 'Țară și limbă',
  'account.regionDescription': 'Țara stabilește calendarul, sursele locale și moneda. Limba poate fi schimbată separat când adăugăm traduceri noi.',
  'account.language': 'Limba',
  'account.country': 'Țara',
  'account.calendar': 'Calendar bisericesc',
  'account.calendarDescription': 'În Republica Moldova alegi jurisdicția al cărei calendar vrei să îl urmărești.',
  'account.calendarRequired': 'Alege unul dintre cele două calendare pentru a continua.',
  'account.loading': 'Se încarcă…',
  'account.eyebrow': 'Profil',
  'account.pageTitle': 'Contul meu',
  'account.pageSubtitle': 'Salvează favoritele, conversațiile și accesul Premium.',
  'account.errorTitle': 'Eroare',
  'account.unexpectedError': 'A apărut o eroare neașteptată.',
  'account.dbErrorRetry': 'Încearcă din nou.',
  'account.dbErrorDuplicate': 'Deja există o valoare pentru acest câmp.',
  'account.dbErrorUnauthorized': 'Sesiunea ta a expirat. Autentifică-te din nou.',
  'account.dbErrorNetwork': 'Verifică conexiunea la internet și încearcă din nou.',
  'account.dbErrorGeneric': 'A apărut o eroare. Încearcă din nou.',
  'account.profileUnavailableTitle': 'Profil indisponibil',
  'account.profileSaveFailedTitle': 'Profilul nu a fost salvat',
  'account.profileSaveFailedMessage': 'Profilul nu a fost salvat. Încearcă din nou.',
  'account.profileSavedTitle': 'Profil salvat',
  'account.profileSavedMessage': 'Profil salvat.',
  'account.signOutErrorTitle': 'Deconectarea nu a reușit',
  'account.activeTitle': 'Cont activ',
  'account.displayNameLabel': 'Nume afișat',
  'account.displayNamePlaceholder': 'Numele tău',
  'account.saving': 'Se salvează…',
  'account.saveProfileButton': 'Salvează profilul',
  'account.signOutButton': 'Deconectare',
  'account.guestTitle': 'Folosești aplicația fără cont',
  'account.guestBody': 'Creează un cont pentru a sincroniza conținutul pe dispozitivele tale.',
  'account.guestAuthButton': 'Autentificare sau cont nou',
  'account.chooseCalendarAccessibility': 'Alege',
  'account.notificationsSectionTitle': 'Notificări zilnice',
  'account.notificationsUnavailableTitle': 'Notificări indisponibile',
  'account.notificationsDescription': 'Primești la ora 10:00 versetul, mesajul zilei și sărbătoarea din calendarul ales.',
  'account.notificationsStatusActive': 'Notificările sunt active.',
  'account.notificationsStatusInactive': 'Notificările sunt oprite.',
  'account.notificationsActiveMessage': 'Notificările zilnice sunt active pentru ora 10:00.',
  'account.notificationsActivateFailedPrefix': 'Notificările nu au putut fi activate. ',
  'account.notificationsConfiguring': 'Se configurează…',
  'account.enableNotificationsButton': 'Activează notificările',
  'account.loginForNotificationsButton': 'Conectează-te pentru notificări',
  'account.subscriptionSectionTitle': 'Abonament',
  'account.planChecking': 'Se verifică planul…',
  'account.aiMessagesPerDay': 'Ai {count} de mesaje AI pe zi.',
  'account.freeMessagesPerDay': 'Ai 5 mesaje AI pe zi. Conținutul de bază rămâne gratuit.',
  'account.viewSubscriptionButton': 'Vezi abonamentul',
  'account.viewPremiumButton': 'Vezi Premium',
  'account.openAiChatButton': 'Deschide Chatul AI',
  'account.aboutSectionTitle': 'Despre aplicație',
  'account.privacyPolicyLink': 'Politica de confidențialitate',
  'account.termsLink': 'Termeni și condiții',
  'account.sourcesRow': 'Surse și responsabilitate editorială',
  'account.helpRow': 'Ajutor și contact',
  'account.dangerZoneTitle': 'Zona periculoasă',
  'account.deleteAccountDescription': 'Ștergerea contului elimină permanent profilul, favoritele, conversațiile AI și datele asociate. Această acțiune nu poate fi anulată.',
  'account.deleteAccountTitle': 'Șterge contul?',
  'account.deleteAccountMessage': 'Această acțiune este permanentă și nu poate fi anulată.\n\n• Toate datele contului vor fi șterse\n• Favoritele, conversațiile AI și istoricul vor fi eliminate\n• Contul nu mai poate fi recuperat\n\nAnularea abonamentului se face separat din App Store / Google Play.',
  'account.deleteConfirmTitle': 'Ești sigur?',
  'account.deleteConfirmMessage': 'Confirmă pentru a șterge definitiv contul și toate datele asociate. Această acțiune nu poate fi anulată.',
  'account.cancelButton': 'Anulează',
  'account.continueButton': 'Continuă',
  'account.deleteButton': 'Șterge contul',
  'account.deleteFailedFallback': 'Contul nu a putut fi șters. Încearcă din nou.',
  'account.deleting': 'Se șterge contul…',
  'region.moldovaCalendarPending': 'Calendarul ales este salvat. Conținutul local va fi publicat numai după verificarea surselor bisericești.',
  'region.moldovaChooseCalendar': 'Alege calendarul bisericesc pentru Republica Moldova. Aplicația nu alege automat în locul tău.',
  'calendar.moldovaUnavailable': 'Calendarul ortodox pentru Republica Moldova nu este disponibil momentan.',
  'common.retry': 'Reîncearcă',
  'common.chooseCalendar': 'Alege calendarul',

  'auth.errorGeneric': 'A apărut o eroare. Încearcă din nou.',
  'auth.errorInvalidCredentials': 'Email sau parolă incorectă.',
  'auth.errorAlreadyRegistered': 'Există deja un cont cu acest email.',
  'auth.errorNotConfirmed': 'Emailul nu a fost confirmat. Verifică mesajul primit pe email.',
  'auth.errorPasswordRequirements': 'Parola nu îndeplinește cerințele minime.',
  'auth.errorResetExpired': 'Link-ul de resetare a expirat. Te rugăm să ceri unul nou.',
  'auth.errorResetInvalid': 'Link-ul de resetare este invalid. Te rugăm să ceri unul nou.',
  'auth.errorNetwork': 'Eroare de conexiune. Verifică internetul și încearcă din nou.',
  'auth.passwordTooShortTitle': 'Parolă prea scurtă',
  'auth.passwordTooShortMessage': 'Parola trebuie să aibă cel puțin 6 caractere.',
  'auth.passwordMismatchTitle': 'Parole diferite',
  'auth.passwordMismatchMessage': 'Cele două parole nu sunt identice.',
  'auth.emailInvalidTitle': 'Email invalid',
  'auth.emailInvalidMessage': 'Introdu o adresă de email validă.',
  'auth.emailRequiredTitle': 'Email necesar',
  'auth.emailRequiredMessage': 'Introdu mai întâi o adresă de email validă.',
  'auth.emailRequiredAlertMessage': 'Introdu mai întâi adresa ta de email.',
  'auth.passwordChangedTitle': 'Parolă schimbată',
  'auth.passwordChangedMessage': 'Parola nouă a fost salvată. Te poți autentifica acum.',
  'auth.checkEmailTitle': 'Verifică emailul',
  'auth.checkEmailMessage': 'Ți-am trimis un mesaj pentru confirmarea contului. După confirmare, revino și autentifică-te.',
  'auth.signInFailedTitle': 'Autentificarea nu a reușit',
  'auth.sendEmailErrorTitle': 'Nu am putut trimite mesajul',
  'auth.sendEmailErrorPrefix': 'Nu am putut trimite mesajul: ',
  'auth.sendEmailSuccess': 'Mesaj trimis. Verifică emailul pentru instrucțiunile de resetare.',
  'auth.titleReset': 'Alege o parolă nouă',
  'auth.titleSignIn': 'Bine ai revenit',
  'auth.titleSignUp': 'Creează contul',
  'auth.subtitle': 'Contul păstrează favoritele și conversațiile tale.',
  'auth.displayNameLabel': 'Nume afișat',
  'auth.displayNamePlaceholder': 'Numele tău',
  'auth.emailLabel': 'Email',
  'auth.emailPlaceholder': 'nume@email.ro',
  'auth.passwordLabel': 'Parolă',
  'auth.passwordPlaceholder': 'Parola ta',
  'auth.newPasswordLabel': 'Parolă nouă',
  'auth.newPasswordPlaceholder': 'Parola nouă',
  'auth.confirmPasswordLabel': 'Confirmă parola nouă',
  'auth.confirmPasswordPlaceholder': 'Repetă parola nouă',
  'auth.processing': 'Se procesează…',
  'auth.saveNewPassword': 'Salvează parola nouă',
  'auth.signInButton': 'Autentificare',
  'auth.signUpButton': 'Creează cont',
  'auth.forgotPassword': 'Am uitat parola',
  'auth.backToSignIn': 'Înapoi la autentificare',
  'auth.noAccount': 'Nu ai cont?',
  'auth.hasAccount': 'Ai deja cont?',

  'home.pageTitle': 'Pace ție',
  'home.pageSubtitle': 'Un loc simplu pentru rugăciune, calendar și întrebări.',
  'home.loadError': 'Conținutul zilei nu a putut fi încărcat. Încearcă din nou.',
  'home.unexpectedError': 'A apărut o eroare neașteptată.',
  'home.loadingToday': 'Se încarcă ziua de astăzi...',
  'home.verseFallback': '„Pacea Mea o dau vouă.”',
  'home.verseSourceFallback': 'Ioan 14, 27',
  'home.parableSectionTitle': 'Pilda zilei',
  'home.parableTitleFallback': 'Pilda semănătorului',
  'home.parableBodyFallback': 'Un suflet atent primește cuvântul bun și îl transformă în faptă.',
  'home.calendarSectionTitle': 'Astăzi în calendar',
  'home.calendarDayFallback': 'Astăzi în calendarul ortodox',
  'home.liveSectionTitle': 'Slujbe LIVE',
  'home.liveAccessibilityLabel': 'Slujbe LIVE — Urmărește Sfânta Liturghie în direct',
  'home.liveSubtitle': 'Urmărește Sfânta Liturghie în direct',
  'home.liveLocations': 'București • Iași • Putna • Sihăstria • Cluj',
  'home.askAiGuide': 'Întreabă ghidul AI',

  'prayers.eyebrow': 'Bibliotecă',
  'prayers.subtitle': 'Caută după titlu și păstrează rugăciunile apropiate inimii tale.',
  'prayers.aiVoiceNotice': 'Înregistrările naturale sunt voci generate cu inteligență artificială.',
  'prayers.search': 'Caută o rugăciune',
  'prayers.searchHint': 'Poți căuta cu sau fără diacritice, de exemplu: „tatal nostru”.',
  'prayers.loading': 'Se încarcă rugăciunile...',
  'prayers.read': 'Citește rugăciunea',
  'prayers.close': 'Închide',
  'prayers.audioPlay': '▶ Ascultă',
  'prayers.audioStop': '■ Oprește',
  'prayers.audioPlayAccessibility': 'Ascultă',
  'prayers.audioStopAccessibility': 'Oprește',
  'prayers.favoriteAdd': 'Adaugă la favorite',
  'prayers.favoriteRemove': 'Elimină din favorite',
  'prayers.empty': 'Nu există încă rugăciuni publicate.',
  'prayers.notFound': 'Rugăciunea nu este încă în bibliotecă.',
  'prayers.askChat': 'Întreabă Chatul',
  'prayers.loadError': 'Nu am putut încărca rugăciunile. Încearcă din nou.',
  'prayers.favoritesError': 'Rugăciunile s-au încărcat, dar favoritele nu au putut fi citite.',
  'prayers.favoriteError': 'Favoritul nu a fost salvat. Încearcă din nou.',
  'prayers.audioStartError': 'Fișierul audio nu a putut porni. Încearcă din nou.',
  'prayers.audioUnavailableError': 'Citirea audio nu a putut porni pe acest dispozitiv.',

  'calendar.eyebrow': 'An bisericesc',
  'calendar.title': 'Calendar ortodox',
  'calendar.subtitleFallback': 'Alege calendarul bisericesc pe care vrei să îl urmărești.',
  'calendar.unavailableTitle': 'Calendar indisponibil',
  'calendar.loading': 'Se încarcă calendarul...',
  'calendar.loadingDay': 'Se încarcă informațiile zilei...',
  'calendar.previousMonth': 'Luna anterioară',
  'calendar.nextMonth': 'Luna următoare',
  'calendar.backToCurrentMonth': 'Revino la luna curentă',
  'calendar.redCrossLegend': 'sărbătoare cu cruce roșie',
  'calendar.documentedDayLegend': 'zi înscrisă în calendar',
  'calendar.emptyDay': 'Nu există încă informații publicate pentru această zi.',
  'calendar.feastRankFallback': 'Pomenire',
  'calendar.selectDay': 'Selectează ziua',
  'calendar.loadError': 'Calendarul nu a putut fi încărcat. Încearcă din nou.',

  'bible.title': 'Biblia, aproape de tine',
  'bible.subtitle': 'Alege cartea și capitolul pentru a citi în ritmul tău.',
  'bible.sourceLabel': 'Sursa biblică',
  'bible.sourceDescription': 'Noul Testament, traducere în curs de revizuire și disponibilă în domeniul public. Nu este prezentată drept ediția sinodală ortodoxă.',
  'bible.sourceLink': 'Vezi sursa și condițiile de folosire',
  'bible.bookSection': 'Carte',
  'bible.chapterSection': 'Capitol',
  'bible.previousChapter': 'Capitolul anterior',
  'bible.nextChapter': 'Capitolul următor',
  'bible.search': 'Caută în capitolul curent',
  'bible.loading': 'Se încarcă textul...',
  'bible.retry': 'Încearcă din nou',
  'bible.loadError': 'Textul nu s-a putut încărca. Verifică internetul și încearcă din nou.',
  'bible.emptyChapter': 'Acest capitol nu are încă versete publicate.',
  'bible.noSearchResults': 'Nu am găsit acest cuvânt în capitolul curent.',
  'bible.openSource': 'Deschide sursa originală',

  'chat.welcome': 'Bine ai venit. Poți întreba despre rugăciune, sărbători sau termeni din credința ortodoxă.',
  'chat.eyebrow': 'Ghid informativ',
  'chat.title': 'Întreabă',
  'chat.subtitle': 'Răspunsurile AI pot greși și nu înlocuiesc sfatul preotului duhovnic.',
  'chat.planPremium': 'Plan Premium',
  'chat.planFree': 'Plan gratuit',
  'chat.premiumLimitLabel': '{plan}: {count} din {limit} mesaje rămase azi',
  'chat.freeLimitLabel': '{count} din {limit} întrebări gratuite rămase azi',
  'chat.noMessagesLeft': 'Ai folosit toate cele {limit} mesaje disponibile azi.',
  'chat.freeLimitReached': 'Ai folosit cele {count} de întrebări gratuite disponibile azi. Creează un cont pentru a continua.',
  'chat.premiumOffer': 'Pentru a continua conversația, alege planul Premium, 9,99 lei/lună.',
  'chat.choosePremiumButton': 'Alege planul Premium',
  'chat.maxLengthError': 'Întrebarea poate avea cel mult 1.200 de caractere.',
  'chat.loadError': 'Conversația nu a putut fi încărcată. Încearcă din nou.',
  'chat.oldMessagesLoadError': 'Mesajele vechi nu au putut fi încărcate.',
  'chat.aiResponseError': 'Răspunsul AI nu a putut fi generat. Încearcă din nou.',
  'chat.serviceUnavailableError': 'Serviciul nu este disponibil momentan. Verifică conexiunea și încearcă din nou.',
  'chat.loading': 'Se încarcă conversația...',
  'chat.thinking': 'Pregătesc răspunsul...',
  'chat.retry': 'Reîncarcă conversația',
  'chat.inputPlaceholder': 'Scrie întrebarea ta',
  'chat.sendButton': 'Trimite',

  'premium.eyebrow': 'Abonament',
  'premium.title': 'Ortodoxia Premium',
  'premium.subtitle': 'Mai multe întrebări AI, cu o limită clară pentru controlul costurilor.',
  'premium.statusLabel': 'Planul tău',
  'premium.statusChecking': 'Se verifică…',
  'premium.statusAnnual': 'Premium Anual',
  'premium.statusMonthly': 'Premium Lunar',
  'premium.aiLimitBody': '{count} de mesaje AI disponibile în fiecare zi.',
  'premium.syncingBody': 'Premium activ — sincronizarea durează câteva secunde.',
  'premium.freeBody': '5 mesaje AI pe zi. Rugăciunile, calendarul și conținutul zilnic rămân gratuite.',
  'premium.expiryLabel': 'Valabil până la {date}.',
  'premium.benefitAiLimit': '50 de mesaje AI pe zi, în loc de 5',
  'premium.benefitFreeContent': 'Conținutul de bază rămâne gratuit pentru toți',
  'premium.benefitManageCancel': 'Poți opri reînnoirea din magazinul telefonului',
  'premium.planMonthly': 'Lunar',
  'premium.planAnnual': 'Anual',
  'premium.priceInStore': 'Preț în magazin',
  'premium.renewsAutomatically': 'Abonamentul se reînnoiește automat până îl oprești din magazin.',
  'premium.processing': 'Se procesează…',
  'premium.activateMonthly': 'Activează planul lunar',
  'premium.activateAnnual': 'Activează planul anual',
  'premium.loginToSubscribe': 'Autentifică-te pentru Premium',
  'premium.disclosureTitle': 'Informații despre abonament',
  'premium.disclosureRenews': '• Abonamentul se reînnoiește automat până la anulare.',
  'premium.disclosureCancelLocation': '• Anularea se face din Setări → Abonamente, în contul App Store sau Google Play.',
  'premium.disclosureUninstall': '• Dezinstalarea aplicației NU anulează abonamentul.',
  'premium.disclosureAfterCancel': '• După anulare, accesul Premium rămâne activ până la sfârșitul perioadei plătite.',
  'premium.disclosureRefunds': '• Restituirile sunt gestionate de Apple sau Google, nu de Ortodoxia.',
  'premium.restoring': 'Se restaurează…',
  'premium.restorePurchases': 'Restaurează cumpărăturile',
  'premium.processingPayment': 'Se procesează plata…',
  'premium.paymentNote': 'Plățile se procesează securizat prin App Store sau Google Play.',
  'premium.privacyPolicy': 'Politica de confidențialitate',
  'premium.terms': 'Termeni și condiții',

  'live.eyebrow': 'Slujbe LIVE',
  'live.title': 'Slujbe LIVE',
  'live.subtitle': 'Urmărește Sfânta Liturghie în direct de la surse oficiale. Transmisiunile aparțin instituțiilor bisericești respective.',
  'live.statusView': 'Vezi transmisiunile',
  'live.statusLive': 'LIVE ACUM',
  'live.statusNotLive': 'Momentan nu este LIVE',
  'live.actionEmbed': 'Vezi în direct',
  'live.actionExternal': 'Deschide pe YouTube',
  'live.actionOfficial': 'Deschide sursa oficială',
  'live.retry': 'Reîncearcă',
  'live.loading': 'Se verifică transmisiunile…',
  'live.providerLabel': 'Furnizor: {provider}',
  'live.disclaimer': 'Transmisiunile aparțin surselor oficiale. Aplicația afișează starea live doar pe baza datelor primite de la server.',
  'live.errorStatusFetch': 'Nu am putut verifica transmisiunile acum.',
  'live.errorOpenSource': 'Transmisiunea nu poate fi deschisă momentan.',

  'resetConfirmation.title': 'Verifică emailul',
  'resetConfirmation.subtitle': 'Am trimis instrucțiunile pentru resetarea parolei.',
  'resetConfirmation.cardTitle': 'Mesaj trimis',
  'resetConfirmation.cardSubtitle': 'Deschide mesajul primit și apasă linkul de resetare. Verifică și folderul Spam sau Promotions.',
  'resetConfirmation.backToLogin': 'Înapoi la autentificare',

  'layout.privacyTitle': 'Politică de confidențialitate',
} as const;

export type TranslationKey = keyof typeof ro;

const translations: Record<LanguageCode, Record<TranslationKey, string>> = { ro };

export function translate(languageCode: LanguageCode, key: TranslationKey) {
  return translations[languageCode][key];
}

export function dateKeyInTimeZone(date: Date, timeZone: RegionConfig['timeZone']) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
