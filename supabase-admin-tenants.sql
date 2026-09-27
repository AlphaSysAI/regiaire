-- =============================================================================
-- OrbitAire — Tenants entreprise (1 user = 1 entreprise) + modules add-on
-- =============================================================================
-- À exécuter dans Supabase APRÈS supabase-schema-complet.sql
-- Idempotent.
--
-- Notes :
--   • La table `aires` reste le tenant technique interne (1:1 avec le client).
--     Elle n'est plus exposée côté UI (pas de sélecteur / arborescence).
--   • Les modules sont stockés sur `profiles.enabled_modules` (text[]).
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40),
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.enabled_modules IS
  'Modules OrbitAire activés pour cette entreprise (user) : pilotage, stock, antigaspi, equipe, planning, reappro, verdict, livraisons';

COMMENT ON COLUMN public.profiles.profile_completed IS
  'false tant que le client n''a pas validé ses infos à la 1ère connexion';

-- Backfill full_name → first/last si vide
UPDATE public.profiles
SET
  first_name = COALESCE(first_name, NULLIF(split_part(COALESCE(full_name, ''), ' ', 1), '')),
  last_name = COALESCE(
    last_name,
    NULLIF(trim(substring(COALESCE(full_name, '') from position(' ' in COALESCE(full_name, '') || ' '))), '')
  )
WHERE first_name IS NULL OR last_name IS NULL;

-- Clients existants : considérer le profil complété + tous modules (rétrocompat)
UPDATE public.profiles
SET
  profile_completed = TRUE,
  enabled_modules = ARRAY[
    'pilotage', 'stock', 'antigaspi', 'equipe', 'planning', 'reappro', 'verdict', 'livraisons'
  ]::TEXT[]
WHERE COALESCE(cardinality(enabled_modules), 0) = 0
  AND role IS DISTINCT FROM 'admin';

-- Admins Orbit (flag) — à ajuster manuellement si besoin
-- UPDATE public.profiles SET role = 'admin', profile_completed = TRUE WHERE email IN (...);

-- Retirer la policy publique liste aires (plus d'inscription self-service)
DROP POLICY IF EXISTS "Public can list aires for signup" ON public.aires;
