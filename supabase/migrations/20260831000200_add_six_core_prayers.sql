insert into public.prayers (
  slug,
  category,
  title,
  body,
  editorial_source,
  sort_order,
  is_published,
  language_code,
  country_code
)
values
  (
    'sfinte-dumnezeule',
    'Rugăciuni de bază',
    'Sfinte Dumnezeule',
    'Sfinte Dumnezeule, Sfinte tare, Sfinte fără de moarte, miluiește-ne pe noi.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    50,
    true,
    'ro',
    null
  ),
  (
    'preasfanta-treime',
    'Începutul rugăciunilor',
    'Preasfântă Treime',
    'Preasfântă Treime, miluiește-ne pe noi. Doamne, curățește păcatele noastre. Stăpâne, iartă fărădelegile noastre. Sfinte, cercetează și vindecă neputințele noastre, pentru numele Tău.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    60,
    true,
    'ro',
    null
  ),
  (
    'slava-tatalui',
    'Rugăciuni de bază',
    'Slavă Tatălui',
    'Slavă Tatălui și Fiului și Sfântului Duh, și acum și pururea și în vecii vecilor. Amin.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    70,
    true,
    'ro',
    null
  ),
  (
    'nascatoare-de-dumnezeu-fecioara',
    'Maica Domnului',
    'Născătoare de Dumnezeu Fecioară',
    'Născătoare de Dumnezeu Fecioară, bucură-te, ceea ce ești plină de har, Marie, Domnul este cu tine. Binecuvântată ești tu între femei și binecuvântat este rodul pântecelui tău, că ai născut pe Mântuitorul sufletelor noastre.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    80,
    true,
    'ro',
    null
  ),
  (
    'sub-milostivirea-ta',
    'Maica Domnului',
    'Sub milostivirea ta',
    'Sub milostivirea ta scăpăm, Născătoare de Dumnezeu; rugăciunile noastre nu le trece cu vederea întru nevoi, ci din primejdii ne izbăvește pe noi, una curată, una binecuvântată.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    90,
    true,
    'ro',
    null
  ),
  (
    'rugaciunea-vamesului',
    'Rugăciuni scurte',
    'Rugăciunea vameșului',
    'Dumnezeule, milostiv fii mie, păcătosului.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    100,
    true,
    'ro',
    null
  )
on conflict do nothing;
