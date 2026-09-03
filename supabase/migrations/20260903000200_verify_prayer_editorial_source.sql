-- CONTENT-A1: Verify prayer editorial provenance
-- Updates editorial_source for 10 verified Orthodox prayers

-- The 10 prayers verified against Doxologia.ro and Basilica.ro
-- External editorial verification completed prior to this migration
-- Prayer body text was NOT modified in this migration

UPDATE public.prayers
SET
  editorial_source = 'Text tradițional ortodox, verificat editorial.',
  updated_at = timezone('utc', now())
WHERE
  slug IN (
    'tatal-nostru',
    'rugaciunea-lui-iisus',
    'imparate-ceresc',
    'cuvine-se-cu-adevarat',
    'sfinte-dumnezeule',
    'preasfanta-treime',
    'slava-tatalui',
    'nascatoare-de-dumnezeu-fecioara',
    'sub-milostivirea-ta',
    'rugaciunea-vamesului'
  );

-- Verify exactly 10 rows were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.prayers
  WHERE slug IN (
    'tatal-nostru',
    'rugaciunea-lui-iisus',
    'imparate-ceresc',
    'cuvine-se-cu-adevarat',
    'sfinte-dumnezeule',
    'preasfanta-treime',
    'slava-tatalui',
    'nascatoare-de-dumnezeu-fecioara',
    'sub-milostivirea-ta',
    'rugaciunea-vamesului'
  )
  AND editorial_source = 'Text tradițional ortodox, verificat editorial.';
  
  IF updated_count != 10 THEN
    RAISE EXCEPTION 'Expected 10 prayers to be updated, but got %', updated_count;
  END IF;
END $$;