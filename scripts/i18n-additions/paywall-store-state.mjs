/**
 * Paywall: textele care explică de ce butonul de cumpărare este dezactivat.
 *
 * TASK: „PAYWALL PREMIUM — butoanele să reflecte starea reală a magazinului" (08.10.2026).
 * Măsurat pe emulator: pe un build instalat cu `adb`, Google Play răspundea „The item you were
 * attempting to purchase could not be found.", dar ecranul Premium ținea butonul activ și afișa
 * prețurile din catalogul RevenueCat. Cele trei texte de aici sunt mesajele distincte ale stărilor
 * în care magazinul NU poate vinde: dispozitiv care nu poate cumpăra, magazin fără nicio ofertă,
 * respectiv pachet fără preț primit de la magazin.
 *
 * `premium.planUnavailable` („fără pachetul planului") exista deja și este refolosit.
 */
export const PAYWALL_STORE_STATE_VALUES = {
  ro: {
    'premium.deviceCannotPurchase': 'Acest dispozitiv nu poate face cumpărături în magazin. Instalează aplicația din Google Play sau App Store și încearcă din nou acolo — nu este o defecțiune a aplicației.',
    'premium.storeNoOfferings': 'Magazinul nu are deocamdată niciun abonament disponibil pentru acest cont. Reîncearcă mai târziu.',
    'premium.priceUnavailable': 'Magazinul nu a trimis prețul acestui plan, așa că nu îl putem afișa. Reîncearcă mai târziu.',
  },
  en: {
    'premium.deviceCannotPurchase': 'This device cannot make store purchases. Install the app from Google Play or the App Store and try again there — this is not a defect of the app.',
    'premium.storeNoOfferings': 'The store has no subscription available for this account yet. Please try again later.',
    'premium.priceUnavailable': 'The store did not send the price of this plan, so we cannot show it. Please try again later.',
  },
  el: {
    'premium.deviceCannotPurchase': 'Αυτή η συσκευή δεν μπορεί να κάνει αγορές από το κατάστημα. Εγκαταστήστε την εφαρμογή από το Google Play ή το App Store και δοκιμάστε ξανά εκεί — δεν είναι σφάλμα της εφαρμογής.',
    'premium.storeNoOfferings': 'Το κατάστημα δεν έχει ακόμη διαθέσιμη συνδρομή για αυτόν τον λογαριασμό. Δοκιμάστε ξανά αργότερα.',
    'premium.priceUnavailable': 'Το κατάστημα δεν έστειλε την τιμή αυτού του προγράμματος, οπότε δεν μπορούμε να την εμφανίσουμε. Δοκιμάστε ξανά αργότερα.',
  },
  sr: {
    'premium.deviceCannotPurchase': 'Овај уређај не може да обавља куповине у продавници. Инсталирајте апликацију са Google Play или App Store и покушајте поново тамо — то није грешка у апликацији.',
    'premium.storeNoOfferings': 'Продавница још нема доступну претплату за овај налог. Покушајте поново касније.',
    'premium.priceUnavailable': 'Продавница није послала цену овог плана, па не можемо да је прикажемо. Покушајте поново касније.',
  },
  bg: {
    'premium.deviceCannotPurchase': 'Това устройство не може да прави покупки в магазина. Инсталирайте приложението от Google Play или App Store и опитайте отново там — това не е дефект на приложението.',
    'premium.storeNoOfferings': 'Магазинът все още няма наличен абонамент за този акаунт. Опитайте отново по-късно.',
    'premium.priceUnavailable': 'Магазинът не изпрати цената на този план, затова не можем да я покажем. Опитайте отново по-късно.',
  },
  mk: {
    'premium.deviceCannotPurchase': 'Овој уред не може да купува од продавницата. Инсталирајте ја апликацијата од Google Play или App Store и обидете се повторно таму — ова не е дефект на апликацијата.',
    'premium.storeNoOfferings': 'Продавницата сè уште нема достапен абонамент за оваа сметка. Обидете се повторно подоцна.',
    'premium.priceUnavailable': 'Продавницата не ја испрати цената на овој план, па не можеме да ја прикажеме. Обидете се повторно подоцна.',
  },
  uk: {
    'premium.deviceCannotPurchase': 'Цей пристрій не може купувати в магазині. Встановіть застосунок із Google Play або App Store і спробуйте знову там — це не дефект застосунку.',
    'premium.storeNoOfferings': 'У магазині ще немає доступної підписки для цього облікового запису. Спробуйте знову пізніше.',
    'premium.priceUnavailable': 'Магазин не надіслав ціну цього плану, тому ми не можемо її показати. Спробуйте знову пізніше.',
  },
  ka: {
    'premium.deviceCannotPurchase': 'ამ მოწყობილობას მაღაზიაში შესყიდვა არ შეუძლია. დააინსტალირეთ აპლიკაცია Google Play-დან ან App Store-იდან და სცადეთ იქ — ეს აპლიკაციის ხარვეზი არ არის.',
    'premium.storeNoOfferings': 'მაღაზიას ამ ანგარიშისთვის გამოწერა ჯერ არ აქვს. სცადეთ მოგვიანებით.',
    'premium.priceUnavailable': 'მაღაზიამ ამ გეგმის ფასი არ გამოგზავნა, ამიტომ ვერ ვაჩვენებთ. სცადეთ მოგვიანებით.',
  },
  ru: {
    'premium.deviceCannotPurchase': 'Это устройство не может совершать покупки в магазине. Установите приложение из Google Play или App Store и попробуйте там — это не дефект приложения.',
    'premium.storeNoOfferings': 'В магазине пока нет доступной подписки для этой учётной записи. Попробуйте позже.',
    'premium.priceUnavailable': 'Магазин не отправил цену этого плана, поэтому мы не можем её показать. Попробуйте позже.',
  },
  sq: {
    'premium.deviceCannotPurchase': 'Kjo pajisje nuk mund të bëjë blerje në dyqan. Instaloni aplikacionin nga Google Play ose App Store dhe provoni përsëri atje — nuk është defekt i aplikacionit.',
    'premium.storeNoOfferings': 'Dyqani nuk ka ende një abonim të disponueshëm për këtë llogari. Provoni përsëri më vonë.',
    'premium.priceUnavailable': 'Dyqani nuk dërgoi çmimin e këtij plani, prandaj nuk mund ta shfaqim. Provoni përsëri më vonë.',
  },
};
