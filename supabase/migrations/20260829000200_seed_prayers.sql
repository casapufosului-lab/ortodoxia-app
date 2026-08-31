insert into public.prayers (
  slug,
  category,
  title,
  body,
  editorial_source,
  sort_order,
  is_published
)
values
  (
    'tatal-nostru',
    'Rugăciuni de bază',
    'Tatăl nostru',
    'Tatăl nostru, Care ești în ceruri, sfințească-se numele Tău, vie împărăția Ta, facă-se voia Ta, precum în cer, așa și pe pământ. Pâinea noastră cea spre ființă dă-ne-o nouă astăzi și ne iartă nouă greșelile noastre, precum și noi iertăm greșiților noștri. Și nu ne duce pe noi în ispită, ci ne izbăvește de cel rău. Amin.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    10,
    true
  ),
  (
    'rugaciunea-lui-iisus',
    'Rugăciuni de bază',
    'Rugăciunea lui Iisus',
    'Doamne Iisuse Hristoase, Fiul lui Dumnezeu, miluiește-mă pe mine, păcătosul.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    20,
    true
  ),
  (
    'imparate-ceresc',
    'Începutul rugăciunilor',
    'Împărate ceresc',
    'Împărate ceresc, Mângâietorule, Duhul adevărului, Care pretutindenea ești și toate le împlinești, Vistierul bunătăților și Dătătorule de viață, vino și Te sălășluiește întru noi și ne curățește pe noi de toată întinăciunea și mântuiește, Bunule, sufletele noastre.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    30,
    true
  ),
  (
    'cuvine-se-cu-adevarat',
    'Maica Domnului',
    'Cuvine-se cu adevărat',
    'Cuvine-se cu adevărat să te fericim, Născătoare de Dumnezeu, cea pururea fericită și prea nevinovată și Maica Dumnezeului nostru. Ceea ce ești mai cinstită decât heruvimii și mai mărită fără de asemănare decât serafimii, care fără stricăciune pe Dumnezeu-Cuvântul ai născut, pe tine, cea cu adevărat Născătoare de Dumnezeu, te mărim.',
    'Text tradițional ortodox. Validarea editorială finală este necesară înainte de lansare.',
    40,
    true
  )
on conflict (slug) do update set
  category = excluded.category,
  title = excluded.title,
  body = excluded.body,
  editorial_source = excluded.editorial_source,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());
