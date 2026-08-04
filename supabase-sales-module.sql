-- =============================================================================
-- RégiAire — Module VENTES (chiffre d'affaires) + analytics verdict IA
-- =============================================================================
-- À exécuter dans l'éditeur SQL Supabase APRÈS supabase-schema-complet.sql.
-- Ajoute :
--   • table public.sales (ventes journalières par produit)
--   • index + RLS (mêmes règles que products : isolation par aire)
--   • fonction public.verdict_analytics(aire, date) → KPIs, comparaisons N-1,
--     top/flop produits, répartition catégories et séries pour les courbes.
--
-- Alimentation prévue en production : import nocturne de l'export de caisse
--   (source = 'caisse-email'). La contrainte UNIQUE(aire, produit, date) rend
--   l'import idempotent (upsert). En démo, source = 'demo'.
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ean VARCHAR(32),
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Divers',
  sale_date DATE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  revenue_ht DECIMAL(12, 2) NOT NULL DEFAULT 0,
  revenue_ttc DECIMAL(12, 2) NOT NULL DEFAULT 0,
  source VARCHAR(40) NOT NULL DEFAULT 'demo',   -- 'demo' | 'caisse-email' | 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aire_id, product_id, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_aire       ON public.sales(aire_id);
CREATE INDEX IF NOT EXISTS idx_sales_aire_date  ON public.sales(aire_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_product    ON public.sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_category   ON public.sales(aire_id, category);

-- --- RLS : isolation par aire (identique à products) ---
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sales of their aire"   ON public.sales;
DROP POLICY IF EXISTS "Users can insert sales of their aire" ON public.sales;
DROP POLICY IF EXISTS "Users can update sales of their aire" ON public.sales;
DROP POLICY IF EXISTS "Users can delete sales of their aire" ON public.sales;
CREATE POLICY "Users can view sales of their aire" ON public.sales
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert sales of their aire" ON public.sales
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update sales of their aire" ON public.sales
  FOR UPDATE USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can delete sales of their aire" ON public.sales
  FOR DELETE USING (aire_id = public.user_aire_id());

-- =============================================================================
-- Fonction d'analytics pour la page « Verdict IA détaillé »
-- Retourne un objet JSON complet : KPIs CA + comparaisons année précédente (N-1)
-- + top/flop produits (30 j) + répartition par catégorie + série 30 j pour courbe.
-- p_ref = jour de référence (défaut : dernier jour de vente connu).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verdict_analytics(p_aire uuid, p_ref date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  ref    date;
  result jsonb;
BEGIN
  ref := COALESCE(p_ref, (SELECT max(sale_date) FROM public.sales WHERE aire_id = p_aire));
  IF ref IS NULL THEN
    RETURN jsonb_build_object('ref_date', NULL, 'empty', true);
  END IF;

  WITH s AS (
    SELECT sale_date, product_id, product_name, category, quantity, revenue_ttc
    FROM public.sales
    WHERE aire_id = p_aire
      AND sale_date BETWEEN ref - 729 AND ref
  ),
  agg AS (
    SELECT
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date = ref), 0)                                           AS ca_jour,
      COALESCE(sum(quantity)    FILTER (WHERE sale_date = ref), 0)                                           AS qty_jour,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date = ref - 365), 0)                                     AS ca_jour_n1,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 6 AND ref), 0)                         AS ca_7,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 6 - 365 AND ref - 365), 0)             AS ca_7_n1,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 29 AND ref), 0)                        AS ca_30,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 29 - 365 AND ref - 365), 0)            AS ca_30_n1,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN date_trunc('month', ref)::date AND ref), 0)  AS ca_mois,
      COALESCE(sum(revenue_ttc) FILTER (
        WHERE sale_date BETWEEN date_trunc('month', (ref - interval '1 year')::date)::date
                            AND (ref - interval '1 year')::date), 0)                                         AS ca_mois_n1,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 364 AND ref), 0)                       AS ca_an,
      COALESCE(sum(revenue_ttc) FILTER (WHERE sale_date BETWEEN ref - 729 AND ref - 365), 0)                 AS ca_an_n1
    FROM s
  ),
  prod AS (
    SELECT product_id, product_name, category,
           sum(quantity)          AS qty,
           round(sum(revenue_ttc), 2) AS ca,
           round(COALESCE((
             SELECT sum(revenue_ttc) FROM s s2
             WHERE s2.product_id = s.product_id
               AND s2.sale_date BETWEEN ref - 29 - 365 AND ref - 365), 0), 2) AS ca_n1
    FROM s
    WHERE sale_date BETWEEN ref - 29 AND ref
    GROUP BY product_id, product_name, category
  ),
  cat AS (
    SELECT category, round(sum(revenue_ttc), 2) AS ca, sum(quantity) AS qty
    FROM s WHERE sale_date BETWEEN ref - 29 AND ref
    GROUP BY category
  ),
  series AS (
    SELECT g.d::date AS date,
      COALESCE((SELECT sum(revenue_ttc) FROM s WHERE sale_date = g.d::date), 0)         AS ca,
      COALESCE((SELECT sum(revenue_ttc) FROM s WHERE sale_date = g.d::date - 365), 0)   AS ca_n1
    FROM generate_series(ref - 29, ref, interval '1 day') g(d)
  )
  SELECT jsonb_build_object(
    'ref_date', ref,
    'empty', false,
    'jour', jsonb_build_object(
        'ca', round(a.ca_jour, 2), 'qty', a.qty_jour, 'ca_n1', round(a.ca_jour_n1, 2),
        'delta_pct', round(((a.ca_jour - a.ca_jour_n1) / NULLIF(a.ca_jour_n1, 0)) * 100, 1)),
    'semaine', jsonb_build_object(
        'ca', round(a.ca_7, 2), 'ca_n1', round(a.ca_7_n1, 2),
        'delta_pct', round(((a.ca_7 - a.ca_7_n1) / NULLIF(a.ca_7_n1, 0)) * 100, 1)),
    'trente_jours', jsonb_build_object(
        'ca', round(a.ca_30, 2), 'ca_n1', round(a.ca_30_n1, 2),
        'delta_pct', round(((a.ca_30 - a.ca_30_n1) / NULLIF(a.ca_30_n1, 0)) * 100, 1)),
    'mois_calendaire', jsonb_build_object(
        'ca', round(a.ca_mois, 2), 'ca_n1', round(a.ca_mois_n1, 2),
        'delta_pct', round(((a.ca_mois - a.ca_mois_n1) / NULLIF(a.ca_mois_n1, 0)) * 100, 1)),
    'annee', jsonb_build_object(
        'ca', round(a.ca_an, 2), 'ca_n1', round(a.ca_an_n1, 2),
        'delta_pct', round(((a.ca_an - a.ca_an_n1) / NULLIF(a.ca_an_n1, 0)) * 100, 1)),
    'top', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT product_name AS name, category, qty, ca, ca_n1,
               round(((ca - ca_n1) / NULLIF(ca_n1, 0)) * 100, 1) AS delta_pct
        FROM prod ORDER BY ca DESC LIMIT 5) t),
    'flop', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT product_name AS name, category, qty, ca, ca_n1,
               round(((ca - ca_n1) / NULLIF(ca_n1, 0)) * 100, 1) AS delta_pct
        FROM prod ORDER BY ca ASC LIMIT 5) t),
    'categories', (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) FROM (
        SELECT category, ca, qty FROM cat ORDER BY ca DESC) c),
    'series', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', date, 'ca', round(ca, 2), 'ca_n1', round(ca_n1, 2))
        ORDER BY date), '[]'::jsonb) FROM series)
  ) INTO result
  FROM agg a;

  RETURN result;
END $$;

-- Exécution accessible aux rôles applicatifs (RLS reste appliquée sur la table)
GRANT EXECUTE ON FUNCTION public.verdict_analytics(uuid, date) TO anon, authenticated, service_role;
