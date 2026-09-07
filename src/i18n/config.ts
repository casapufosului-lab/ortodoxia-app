export type CountryCode = 'RO' | 'MD';
export const SUPPORTED_LANGUAGES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'] as const;
export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

export function isSupportedLanguage(code: string): code is LanguageCode {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

export function resolveLanguageCode(code: string | null | undefined): LanguageCode {
  return code && isSupportedLanguage(code) ? code : 'ro';
}
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
  'account.deleteAuthRequired': 'Autentificare necesară. Conectează-te din nou.',
  'account.deleteServiceUnavailable': 'Serviciul nu este configurat. Încearcă mai târziu.',
  'account.notificationChannelName': 'Mesajul zilei',
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

  'calendar.weekdayLu': 'Lu',
  'calendar.weekdayMa': 'Ma',
  'calendar.weekdayMi': 'Mi',
  'calendar.weekdayJo': 'Jo',
  'calendar.weekdayVi': 'Vi',
  'calendar.weekdaySa': 'Sâ',
  'calendar.weekdayDu': 'Du',
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
  'bible.bookMAT': 'Matei',
  'bible.bookMAR': 'Marcu',
  'bible.bookLUK': 'Luca',
  'bible.bookJOH': 'Ioan',
  'bible.bookACT': 'Faptele Apostolilor',
  'bible.bookROM': 'Romani',
  'bible.book1CO': '1 Corinteni',
  'bible.book2CO': '2 Corinteni',
  'bible.bookGAL': 'Galateni',
  'bible.bookEPH': 'Efeseni',
  'bible.bookPHI': 'Filipeni',
  'bible.bookCOL': 'Coloseni',
  'bible.book1TH': '1 Tesaloniceni',
  'bible.book2TH': '2 Tesaloniceni',
  'bible.book1TI': '1 Timotei',
  'bible.book2TI': '2 Timotei',
  'bible.bookTIT': 'Tit',
  'bible.bookPHM': 'Filimon',
  'bible.bookHEB': 'Evrei',
  'bible.bookJAM': 'Iacov',
  'bible.book1PE': '1 Petru',
  'bible.book2PE': '2 Petru',
  'bible.book1JO': '1 Ioan',
  'bible.book2JO': '2 Ioan',
  'bible.book3JO': '3 Ioan',
  'bible.bookJUD': 'Iuda',
  'bible.bookREV': 'Apocalipsa',
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
  'premium.planFree': 'Plan Gratuit',
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
  'premium.offeringsError': 'Ofertele de abonament nu au putut fi încărcate. Încearcă din nou.',
  'premium.storeUnavailable': 'Magazinul nu este disponibil momentan.',
  'premium.planUnavailable': 'Planul ales nu este disponibil în magazin.',
  'premium.purchaseFailed': 'Cumpărarea nu a reușit. Încearcă din nou.',
  'premium.activated': 'Abonamentul Premium a fost activat.',
  'premium.paymentPending': 'Plata a fost procesată, dar Premium nu este încă activ. Verifică în câteva momente.',
  'premium.purchaseCancelled': 'Cumpărarea a fost anulată.',
  'premium.restoreFailed': 'Restaurarea nu a reușit. Încearcă din nou.',
  'premium.restoreSuccess': 'Cumpărăturile tale au fost restaurate.',
  'premium.restoreNone': 'Nu am găsit cumpărături de restaurat.',
  'account.planError': 'Starea abonamentului nu a putut fi verificată.',

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

  // ── Privacy screen ──────────────────────────────────────────────────
  'privacy.title': 'Politica de confidențialitate',
  'privacy.meta': 'Versiune: 1.0 — [DATA DE COMPLETAT]',

  'privacy.s1Title': '1. Operator',
  'privacy.s1Entity': '[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]',
  'privacy.s1Support': '[ADRESĂ DE SUPORT DE COMPLETAT]',
  'privacy.s1Postal': '[ADRESĂ POȘTALĂ DE COMPLETAT]',

  'privacy.s2Title': '2. Ce date colectăm',
  'privacy.s2Intro': 'Ortodoxia procesează următoarele categorii de date, strict în măsura în care funcționalitățile aplicației le utilizează.',

  'privacy.s2_1Title': '2.1 Date de autentificare',
  'privacy.s2_1Content': 'La crearea unui cont, colectăm adresa de e-mail și parola furnizate. Parola este stocată hash-uită (nu în plaintext) de către Supabase.',

  'privacy.s2_2Title': '2.2 Profil utilizator',
  'privacy.s2_2Content': 'Numele de afișare setat de utilizator este stocat în tabelul `profiles` din Supabase, asociat identificatorului unic al contului.',

  'privacy.s2_3Title': '2.3 Preferințe de regiune și calendar',
  'privacy.s2_3Content': 'Preferința de regiune și calendar liturgic este stocată local pe dispozitiv și nu este transmisă serverului în mod automat.',

  'privacy.s2_4Title': '2.4 Conversații AI',
  'privacy.s2_4Content1': 'Când un utilizator autentificat trimite un mesaj către Chatul AI, conținutul mesajelor și răspunsurilor este stocat în tabelele `chat_threads` și `chat_messages` din Supabase, asociat contului.',
  'privacy.s2_4Content2': 'Utilizarea zilnică a mesajelor AI este înregistrată în tabelul `usage_daily`. Pentru utilizatorii neautentificați se utilizează un identificator generat local; utilizarea este înregistrată în `guest_usage_daily`.',
  'privacy.s2_4Content3': 'Nu introduceți informații personale sensibile în conversațiile AI. Mesajele reflectă ceea ce furnizați în mod voluntar.',

  'privacy.s2_5Title': '2.5 Preferințe de notificări',
  'privacy.s2_5Content': 'Dacă activați notificările, starea preferinței este stocată în tabelul `notification_preferences`. Un Expo Push Token este transmis și stocat server-side. Token-ul este regenerat de sistemul Expo și nu conține date personale.',

  'privacy.s2_6Title': '2.6 Abonamente și plăți',
  'privacy.s2_6Content': 'Plățile sunt gestionate de Apple App Store, Google Play și RevenueCat. Starea abonamentului este sincronizată printr-un webhook server-side și stocată în tabelul `subscriptions` din Supabase. Nu stocăm date de card bancar.',

  'privacy.s2_7Title': '2.7 Rugăciuni și preferințe',
  'privacy.s2_7Content': 'Rugăciunile sunt stocate în tabelul `prayers` din Supabase. Favoritele salvate sunt stocate în tabelul `favorites` asociat contului.',

  'privacy.s2_8Title': '2.8 Conținut audio generat de AI',
  'privacy.s2_8Content': 'La cerere, aplicația poate genera audio pentru o rugăciune folosind OpenAI text-to-speech. Fișierul rezultat este stocat în Supabase Storage. Generarea are loc pe server.',

  'privacy.s2_9Title': '2.9 Starea serviciilor LIVE',
  'privacy.s2_9Content': 'Pagina "Slujbe LIVE" afișează starea live a surselor video selectate. Verificarea este realizată pe server folosind YouTube Data API și este temporar cache-uită în tabelul `live_service_status_cache`. Nu sunt colectate date personale în legătură cu utilizarea acestei funcții.',

  'privacy.s2_10Title': '2.10 Loguri de erori',
  'privacy.s2_10Content': 'În cazul unor erori de conexiune, anumite loguri pot conține informații despre cererea eșuată. Aceste loguri nu conțin date personale în mod deliberat și nu sunt folosite în scopuri de analiză sau urmărire.',

  'privacy.s3Title': '3. Ce date NU colectăm',
  'privacy.s3Content': 'Ortodoxia nu folosește servicii de analiză (analytics), raportare a erorilor (crash reporting) sau urmărire a utilizatorilor (tracking). Nu colectăm date din cameră, microfon, fotografii sau locație.',

  'privacy.s4Title': '4. Terți care procesează date',
  'privacy.s4Intro': 'Datele sunt procesate prin intermediul următoarelor servicii terțe:',
  'privacy.s4ThService': 'Serviciu',
  'privacy.s4ThPurpose': 'Scop',
  'privacy.s4RowSupabasePurpose': 'Bază de date, autentificare, stocare fișiere',
  'privacy.s4RowOpenAIPurpose': 'Răspunsuri AI și conținut audio',
  'privacy.s4RowRevenueCatPurpose': 'Gestionarea abonamentelor',
  'privacy.s4RowAppStorePurpose': 'Plăți și drepturi de abonament',
  'privacy.s4RowYouTubePurpose': 'Verificarea stării live',
  'privacy.s4RowExpoPurpose': 'Platforma aplicației; Expo Push',

  'privacy.s5Title': '5. Conținut extern',
  'privacy.s5Content': 'Aplicația poate afișa sau lega către conținut extern — transmisiuni live și resurse editoriale. Ortodoxia nu este responsabilă pentru conținutul sau practicile de confidențialitate ale acestor servicii externe.',

  'privacy.s6Title': '6. Securitate',
  'privacy.s6Content': 'Datele sunt transmise prin HTTPS/TLS. Parolele sunt hash-uite. Cheile API sunt păstrate exclusiv server-side. Nicio măsură de securitate nu oferă o garanție absolută.',

  'privacy.s7Title': '7. Drepturile dumneavoastră',
  'privacy.s7Content': 'Este posibil să aveți dreptul de a accesa, rectifica sau șterge datele dumneavoastră. Contactați operatorul: [ADRESĂ DE SUPORT DE COMPLETAT]',

  'privacy.s8Title': '8. Ștergerea contului vs. anularea abonamentului',
  'privacy.s8DeleteLabel': 'Ștergerea contului',
  'privacy.s8DeleteBody': ' elimină profilul și datele asociate din Supabase. Contul nu mai poate fi recuperat.',
  'privacy.s8CancelLabel': 'Anularea abonamentului',
  'privacy.s8CancelBody': ' (din App Store / Google Play) oprește doar reînnoirea automată. Drepturile Premium rămân valabile până la sfârșitul perioadei deja plătite.',
  'privacy.s8Uninstall': 'Dezinstalarea aplicației NU anulează abonamentul.',

  'privacy.s9Title': '9. Modificări ale politicii',
  'privacy.s9Content': 'Această politică poate fi actualizată periodic. Modificările semnificative vor fi comunicate prin aplicație sau prin e-mail.',

  'privacy.s10Title': '10. Contact',
  'privacy.s10Support': '[ADRESĂ DE SUPORT DE COMPLETAT]',
  'privacy.s10PublicUrl': '[URL PUBLIC AL POLITICII DE COMPLETAT]',

  // ── Terms screen ────────────────────────────────────────────────────
  'terms.title': 'Termeni și condiții',
  'terms.meta': 'Versiune: 1.0 — [DATA DE COMPLETAT]',

  'terms.s1Title': '1. Operator și acceptare',
  'terms.s1Entity': '[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]',
  'terms.s1Support': '[ADRESĂ DE SUPORT DE COMPLETAT]',
  'terms.s1Content': 'Utilizarea aplicației Ortodoxia este condiționată de acceptarea prezentelor condiții. Dacă nu sunteți de acord, vă rugăm să nu utilizați aplicația.',

  'terms.s2Title': '2. Eligibilitate',
  'terms.s2Content': 'Aplicația este destinată persoanelor cu vârsta minimă necesară pentru a-și crea un cont pe platformele Apple App Store / Google Play. Persoanele minore trebuie să utilizeze aplicația cu acordul reprezentantului legal.',

  'terms.s3Title': '3. Contul dumneavoastră',
  'terms.s3Content1': 'Sunteți responsabil pentru confidențialitatea credențialelor contului și pentru toate activitățile desfășurate prin contul dumneavoastră. Notificați-ne imediat la adresa de suport dacă suspectați o utilizare neautorizată.',
  'terms.s3Content2': 'Ștergerea contului este o acțiune separată de anularea abonamentului. Pentru detalii, consultați Politica de confidențialitate (secțiunea 8).',

  'terms.s4Title': '4. Utilizare acceptabilă',
  'terms.s4Content': 'Vă angajați să utilizați aplicația într-un mod onest și respectuos, fără a încerca să eludați limitele tehnice, să abuzați de funcționalitățile AI sau să prejudiciați alți utilizatori.',

  'terms.s5Title': '5. Utilizare interzisă',
  'terms.s5Intro': 'Nu este permisă:',
  'terms.s5Li1': '• încercarea de a accesa conturi sau date ale altor utilizatori;',
  'terms.s5Li2': '• utilizarea aplicației în scopuri ilegale, ofensatoare, abuzive sau frauduloase;',
  'terms.s5Li3': '• copierea, redistribuirea sau republicarea conținutului aplicației fără drept;',
  'terms.s5Li4': '• eludarea mecanismelor de limitare a utilizării (de ex. a limitei zilnice de mesaje AI);',
  'terms.s5Li5': '• introducerea deliberată de conținut care poate genera răspunsuri dăunătoare sau ilicite.',

  'terms.s6Title': '6. Limitări ale conținutului AI',
  'terms.s6Intro': 'Răspunsurile generate de Chatul AI sunt generate automat de un model lingvistic. Acestea:',
  'terms.s6Li1': '• pot conține erori sau inexactități;',
  'terms.s6Li2': '• trebuie evaluate independent de către utilizator;',
  'terms.s6Li3': '• nu reprezintă puncte de vedere oficiale ale Bisericii Ortodoxe sau ale vreunei autorități eclesiastice.',

  'terms.s6_1Title': '6.1 AI nu înlocuiește profesioniștii',
  'terms.s6_1Intro': 'Chatul AI nu înlocuiește și nu se substituie:',
  'terms.s6_1Li1': '• unui preot sau duhovnic — pentru îndrumare duhovnicească;',
  'terms.s6_1Li2': '• unui medic — pentru diagnostic, tratament sau sfaturi medicale;',
  'terms.s6_1Li3': '• unui avocat — pentru consultanță juridică;',
  'terms.s6_1Li4': '• unui serviciu de urgență.',
  'terms.s6_1Content': 'Pentru urgențe medicale, psihologice sau de siguranță, contactați imediat serviciile de urgență (112 în România, sau numărul corespunzător din țara dumneavoastră).',

  'terms.s6_2Title': '6.2 Limitări privind conținutul religios',
  'terms.s6_2Content1': 'Explicațiile religioase generate de AI nu sunt hotărâri eclesiastice oficiale. Pentru aspecte doctrinare, canonice sau liturgice, consultați sursele bisericești oficiale (Sfânta Scriptură, scrierile Sfinților Părinți, indicațiile duhovnicului dumneavoastră).',
  'terms.s6_2Content2': 'Aplicația nu implică și nu pretinde girul sau susținerea vreunei autorități bisericești.',

  'terms.s6_3Title': '6.3 Responsabilitatea dumneavoastră',
  'terms.s6_3Content': 'Sunteți singurul responsabil pentru deciziile luate pe baza informațiilor generate de AI. Nu vă bazați exclusiv pe aceste răspunsuri pentru decizii importante privind sănătatea, viața spirituală, drepturile sau siguranța dumneavoastră.',

  'terms.s7Title': '7. Conținut extern',
  'terms.s7Content': 'Aplicația poate afișa transmisiuni live, linkuri sau citate editoriale provenind de la terțe părți. Acestea rămân sub responsabilitatea furnizorilor respectivi. Ortodoxia nu garantează acuratețea, disponibilitatea sau actualitatea conținutului extern.',

  'terms.s8Title': '8. Abonamente',
  'terms.s8Content': 'Funcționalitățile Premium sunt disponibile prin abonament lunar sau anual. Abonamentul se reînnoiește automat până la anulare.',
  'terms.s8_1Title': '8.1 Plăți și reînnoire',
  'terms.s8_1Content': 'Plățile sunt procesate de Apple App Store sau Google Play. Anularea reînnoirii automate se face din contul dumneavoastră de pe platforma respectivă (Setări → Abonamente).',
  'terms.s8_2Title': '8.2 Anulare',
  'terms.s8_2Content': 'Anularea oprește reînnoirea viitoare. Accesul la funcționalitățile Premium rămâne activ până la sfârșitul perioadei deja plătite.',
  'terms.s8_3Title': '8.3 Dezinstalare',
  'terms.s8_3Content': 'Dezinstalarea aplicației nu anulează abonamentul. Anularea se face doar din App Store / Google Play.',
  'terms.s8_4Title': '8.4 Restituiri',
  'terms.s8_4Content': 'Restituirile sunt gestionate de Apple / Google conform politicilor acestora. Ortodoxia nu oferă restituiri directe. Pentru solicitări de restituire, contactați platforma de unde ați efectuat achiziția.',
  'terms.s8_5Title': '8.5 Restaurare',
  'terms.s8_5Content': 'Funcția "Restaurează cumpărăturile" disponibilă în ecranul Premium reactivează drepturile de abonament existente, atunci când este suportat de platformă.',

  'terms.s9Title': '9. Limitarea răspunderii',
  'terms.s9Content': 'Aplicația este furnizată "așa cum este". În limita permisă de lege, Ortodoxia nu garantează că serviciul va fi neîntrerupt, lipsit de erori sau complet potrivit unui anumit scop. Nu ne asumăm răspunderea pentru daune indirecte, incidentale sau consecutive rezultate din utilizarea aplicației.',

  'terms.s10Title': '10. Suspendare și restricționare',
  'terms.s10Content': 'În caz de abuz, încălcare a acestor condiții sau solicitări din partea autorităților, ne rezervăm dreptul de a suspenda sau restrictiona accesul la cont sau la aplicație.',

  'terms.s11Title': '11. Modificări',
  'terms.s11Content': 'Ne rezervăm dreptul de a actualiza periodic acești termeni. Modificările semnificative vor fi comunicate prin aplicație sau prin e-mail.',

  'terms.s12Title': '12. Legea aplicabilă',
  'terms.s12Content': 'Prezentele condiții sunt guvernate de legile [JURISDICȚIA DE COMPLETAT]. Orice dispută va fi soluționată de instanțele competente din [LOCALITATE DE COMPLETAT].',

  'terms.s13Title': '13. Contact',
  'terms.s13Support': '[ADRESĂ DE SUPORT DE COMPLETAT]',
  'terms.s13PublicUrl': '[URL PUBLIC AL TERMENILOR DE COMPLETAT]',
  'live.scheduleNotePutna': 'Sfânta Liturghie de duminică este transmisă pe canalul de YouTube al mănăstirii.',
  'live.scheduleNoteRadioRenasterea': 'Sfânta Liturghie de duminică din Catedrala Mitropolitană este transmisă în direct.',
  'live.closePlayerAccessibilityLabel': 'Închide playerul video',
  'live.closePlayer': '✕ Închide',
  'live.playerAccessibilityLabel': 'Player YouTube live',

} as const;

export type TranslationKey = keyof typeof ro;

const en: Partial<Record<TranslationKey, string>> = {};
const el: Partial<Record<TranslationKey, string>> = {};
const sr: Partial<Record<TranslationKey, string>> = {};
const bg: Partial<Record<TranslationKey, string>> = {};
const mk: Partial<Record<TranslationKey, string>> = {};
const uk: Partial<Record<TranslationKey, string>> = {};
const ka: Partial<Record<TranslationKey, string>> = {};
const ru: Partial<Record<TranslationKey, string>> = {};
const sq: Partial<Record<TranslationKey, string>> = {};

const translations: Record<LanguageCode, Partial<Record<TranslationKey, string>>> = {
  ro,
  en,
  el,
  sr,
  bg,
  mk,
  uk,
  ka,
  ru,
  sq,
};

export function translate(languageCode: LanguageCode, key: TranslationKey) {
  return translations[languageCode][key] ?? ro[key];
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
