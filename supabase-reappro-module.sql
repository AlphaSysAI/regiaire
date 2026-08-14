-- =============================================================================
-- OrbitAire — Module RÉAPPRO (plan de réapprovisionnement IA)
-- =============================================================================
-- À exécuter dans l'éditeur SQL Supabase APRÈS supabase-schema-complet.sql
-- et supabase-sales-module.sql (le réappro s'appuie sur l'historique des ventes).
--
-- Ajoute uniquement :
--   • products.lead_time_days — délai fournisseur (jours) utilisé pour calculer
--     la date limite de commande avant rupture. Éditable produit par produit ;
--     valeur par défaut 2 jours si non renseignée.
-- Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 2
    CHECK (lead_time_days >= 0);

COMMENT ON COLUMN public.products.lead_time_days IS
  'Délai fournisseur en jours, utilisé par le moteur de réappro pour calculer la date limite de commande avant rupture.';
