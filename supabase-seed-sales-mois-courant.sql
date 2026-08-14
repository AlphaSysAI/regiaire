-- =============================================================================
-- OrbitAire — Seed VENTES & CA : mois en cours jusqu'à aujourd'hui
-- =============================================================================
-- Aire cible : a0000000-0000-4000-8000-000000000001
--
-- Génère des ventes journalières (quantités + CA HT/TTC) pour chaque produit
-- de l'aire, du 1er du mois courant jusqu'à CURRENT_DATE inclus.
--
-- Prérequis :
--   1) supabase-schema-complet.sql
--   2) supabase-sales-module.sql
--   3) Produits de l'aire présents (ex. supabase-seed-demo-1an.sql)
--
-- Idempotent : purge uniquement les ventes demo du mois en cours pour cette
-- aire, puis réinsertion (les autres mois / sources restent intacts).
-- =============================================================================

BEGIN;

DELETE FROM public.sales
WHERE aire_id = 'a0000000-0000-4000-8000-000000000001'
  AND source = 'demo'
  AND sale_date >= date_trunc('month', CURRENT_DATE)::date
  AND sale_date <= CURRENT_DATE;

DO $$
DECLARE
  v_aire  uuid := 'a0000000-0000-4000-8000-000000000001';
  v_start date := date_trunc('month', CURRENT_DATE)::date;
  v_end   date := CURRENT_DATE;
  p       RECORD;
  d       date;
  dow     int;
  mo      int;
  md      int;
  base    numeric;
  vat     numeric;
  f_dow   numeric;
  f_seas  numeric;
  f_vac   numeric;
  f_trend numeric;
  qty     int;
  rev_ht  numeric;
  day_idx int;
  -- facteurs jour de semaine : dim, lun, mar, mer, jeu, ven, sam
  dowf numeric[] := ARRAY[1.35, 0.85, 0.85, 0.95, 1.00, 1.30, 1.40];
BEGIN
  PERFORM setseed(0.3141);

  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE aire_id = v_aire LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Aucun produit pour l''aire %. Exécute d''abord supabase-seed-demo-1an.sql',
      v_aire;
  END IF;

  FOR p IN
    SELECT id, ean, name, category, price_ht
    FROM public.products
    WHERE aire_id = v_aire
  LOOP
    base := CASE p.category
              WHEN 'Boissons'    THEN 48
              WHEN 'Café'        THEN 58
              WHEN 'Snacking'    THEN 32
              WHEN 'Confiserie'  THEN 26
              WHEN 'Sandwichs'   THEN 20
              WHEN 'Traiteur'    THEN 10
              WHEN 'Boulangerie' THEN 24
              WHEN 'Fruits'      THEN 18
              ELSE 22
            END;

    vat := CASE p.category
             WHEN 'Café' THEN 0.10
             WHEN 'Sandwichs' THEN 0.10
             WHEN 'Traiteur' THEN 0.10
             ELSE 0.055
           END;

    d := v_start;
    day_idx := 0;
    WHILE d <= v_end LOOP
      dow := extract(dow from d)::int;  -- 0 = dimanche
      mo  := extract(month from d)::int;
      md  := mo * 100 + extract(day from d)::int;

      f_dow := dowf[dow + 1];

      -- Saisonnalité légère (mois courant)
      f_seas := CASE
        WHEN p.category = 'Boissons' AND mo BETWEEN 6 AND 8  THEN 1.45
        WHEN p.category = 'Boissons' AND mo IN (12, 1, 2)    THEN 0.85
        WHEN p.category = 'Fruits'   AND mo BETWEEN 6 AND 9  THEN 1.25
        WHEN p.category = 'Café'     AND mo IN (11, 12, 1, 2) THEN 1.30
        WHEN p.category = 'Café'     AND mo BETWEEN 6 AND 8  THEN 0.88
        WHEN p.category IN ('Sandwichs', 'Snacking') AND mo BETWEEN 6 AND 8 THEN 1.15
        ELSE 1.00
      END;

      -- Vacances / chassés-croisés (approx. zone A Lyon)
      f_vac := CASE
        WHEN (md >= 1220 OR md <= 105)          -- Noël
          OR (md >= 208 AND md <= 309)          -- Hiver
          OR (md >= 412 AND md <= 511)          -- Printemps
          OR (md >= 705 AND md <= 831)          -- Été
          OR (md >= 1018 AND md <= 1102)        -- Toussaint
        THEN 1.28 ELSE 1.00
      END;

      -- Légère montée en charge dans le mois (début → fin)
      f_trend := 0.92 + (day_idx::numeric / GREATEST((v_end - v_start), 1)) * 0.16;

      qty := round(
        base * f_dow * f_seas * f_vac * f_trend * (0.82 + random() * 0.36)
      )::int;
      IF qty < 1 THEN qty := 1; END IF;

      rev_ht := round((qty * COALESCE(p.price_ht, 1))::numeric, 2);

      INSERT INTO public.sales (
        aire_id, product_id, ean, product_name, category, sale_date,
        quantity, revenue_ht, revenue_ttc, source
      )
      VALUES (
        v_aire, p.id, p.ean, p.name, p.category, d,
        qty, rev_ht, round((rev_ht * (1 + vat))::numeric, 2), 'demo'
      )
      ON CONFLICT (aire_id, product_id, sale_date)
      DO UPDATE SET
        quantity     = EXCLUDED.quantity,
        revenue_ht   = EXCLUDED.revenue_ht,
        revenue_ttc  = EXCLUDED.revenue_ttc,
        product_name = EXCLUDED.product_name,
        category     = EXCLUDED.category,
        ean          = EXCLUDED.ean,
        source       = 'demo';

      d := d + 1;
      day_idx := day_idx + 1;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- Vérifications (décommenter dans l'éditeur SQL) :
--
-- SELECT
--   min(sale_date) AS debut,
--   max(sale_date) AS fin,
--   count(*) AS lignes,
--   sum(quantity) AS unites,
--   round(sum(revenue_ht), 2) AS ca_ht,
--   round(sum(revenue_ttc), 2) AS ca_ttc
-- FROM public.sales
-- WHERE aire_id = 'a0000000-0000-4000-8000-000000000001'
--   AND sale_date >= date_trunc('month', CURRENT_DATE)::date
--   AND sale_date <= CURRENT_DATE;
--
-- SELECT sale_date, sum(quantity) AS unites, round(sum(revenue_ttc), 2) AS ca_ttc
-- FROM public.sales
-- WHERE aire_id = 'a0000000-0000-4000-8000-000000000001'
--   AND sale_date >= date_trunc('month', CURRENT_DATE)::date
-- GROUP BY 1 ORDER BY 1;
-- =============================================================================
