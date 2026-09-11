begin;

-- Repair the 35 Romanian 2026 English calendar translations
-- that remained untranslated in migration 20260911000400.

with payload as (
  select *
  from jsonb_to_recordset('[{"calendar_date":"2026-07-10","title":"St. 45 Martyrs of Nicopolis in Armenia","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-11","title":"St. Great Martyr Euphemia; St. Olga, Equal-to-the-Apostles and Enlightener of Russia","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-14","title":"St. Ap. Aquila; St. M. Justus and Heraclius; St. Ven. Nicodemus of the Holy Mountain","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-15","title":"St. M. Cyricus and Julitta; St. Vladimir, Enlightener of Russia","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-17","title":"St. Great Martyr Marina; St. H. Euphrasius, Bishop of Ionopolis","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-18","title":"St. M. Aemilian of Durostorum; St. Ven. Pambo","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-21","title":"St. Ven. Raphael and Parthenius of Old Agapia; St. Ven. Simeon and John the Hermit; St. Prophet Ezekiel","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-22","title":"St. Priest Confessor Ilie Lăcătușu; St. Myrrh-bearer and Equal-to-the-Apostles Mary Magdalene; St. Ven. M. Marcella","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-24","title":"St. Great Martyr Christina; St. M. Hermogenes","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-27","title":"St. Great Martyr and Healer Panteleimon","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-28","title":"St. Apostles and Deacons: Prochorus, Nicanor, Timon, and Parmenas; St. Ven. Paul of Xeropotamou","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-07-29","title":"St. M. Callinicus, Benjamin, and Mammas; St. M. Theodota with her children","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-08-06","title":"Transfiguration of the Lord","saints":[],"details":null,"fasting_note":"Fish allowed"},{"calendar_date":"2026-08-29","title":"Beheading of the Holy Prophet John the Baptist","saints":[],"details":null,"fasting_note":"Fast"},{"calendar_date":"2026-09-01","title":"Beginning of the Church Year; † St. Ven. Dionysius the Exiguus; St. Ven. Simeon the Stylite; St. 40 Martyrs of Adrianople; Righteous Joshua (Te Deum)","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-02","title":"St. M. Mammas; St. H. John the Faster, Patriarch of Constantinople","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-05","title":"St. Prophet Zechariah and Righteous Elizabeth, parents of St. John the Baptist","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-09","title":"St. and Righteous God-bearing Parents Joachim and Anna; †) St. Ven. Cyriacus of Tazlău; †) St. Ven. Onuphrius of Vorona; St. M. Severian; St. Fathers of the Third Ecumenical Council","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-10","title":"St. M. Minodora, Mitrodora, and Nymphodora; St. Empress Pulcheria","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-11","title":"St. Ven. Theodora of Alexandria; St. Ven. Euphrosynus the Cook","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-15","title":"St. Hierarch Joseph the New of Partoș, Metropolitan of Banat; † St. Great Martyr Nicetas; † St. Hierarch Bessarion, Archbishop of Larissa","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-16","title":"St. Venerable Confessor Sophian of Antim; St. Great Martyr Euphemia; St. Mmes. Meletina and Ludmila","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-17","title":"St. Hierarch Dionysius, Bishop of Cetatea Albă – Ismail; St. Mmes. Sophia (Wisdom) and her daughters: Pistis (Faith), Elpis (Hope), and Agapi (Love)","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-18","title":"St. Hieromartyr Hilarion Felea; St. Hierarch Eumenius, Bishop of Gortyna; St. M. Ariadne","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-19","title":"St. Mmes. Trophimus, Sabbatius, and Dorymedon","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-23","title":"Conception of the Holy Prophet John the Baptist; Sts. Xanthippe and Polyxena","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-24","title":"St. First Female Martyr and Equal-to-the-Apostles Thecla; St. Venerable Silouan the Athonite","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-25","title":"St. Venerable Euphrosyne; St. Venerable Paphnutius the Egyptian; St. Venerable Sergius of Radonezh","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-26","title":"Reposition of the St. Apostle and Evangelist John; †) St. Voivode Neagoe Basarab; St. Venerable Platonida of Argeș (formerly Despina Milica, wife of the Voivode); Righteous Gideon","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-28","title":"St. Venerable Chariton the Confessor; St. Prophet Baruch; St. Venerable Neophytus the Recluse of Cyprus","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-29","title":"St. Venerable Cyriacus the Hermit; St. M. Petronia","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-09-30","title":"St. Hierarch Gregory the Illuminator, Archbishop of Armenia; St. Mmes. Hripsime and Gaiane","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-10-05","title":"Sts. Venerable Daniel and Misail from Turnu Monastery; St. M. Charitina","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-10-06","title":"St. Apostle Thomas; St. M. Erotiis","saints":[],"details":null,"fasting_note":null},{"calendar_date":"2026-10-07","title":"Sts. Great Martyrs Sergius and Bacchus; St. Mmes. Julian the priest, Caesarius the deacon, and Polychronius","saints":[],"details":null,"fasting_note":null}]'::jsonb) as x(
    calendar_date date,
    title text,
    saints jsonb,
    details text,
    fasting_note text
  )
)
insert into public.calendar_day_translations
  (calendar_day_id, language_code, title, saints, details, fasting_note)
select
  d.id,
  'en',
  p.title,
  array(select jsonb_array_elements_text(p.saints)),
  p.details,
  p.fasting_note
from payload p
join public.calendar_days d
  on d.country_code = 'RO'
 and d.calendar_code = 'ro-bor'
 and d.language_code = 'ro'
 and d.calendar_date = p.calendar_date
on conflict (calendar_day_id, language_code) do update set
  title = excluded.title,
  saints = excluded.saints,
  details = excluded.details,
  fasting_note = excluded.fasting_note;

commit;
