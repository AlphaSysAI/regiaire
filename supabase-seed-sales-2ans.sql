-- =============================================================================
-- OrbitAire — Seed VENTES : 2 ANS de chiffre d'affaires (démo)
-- =============================================================================
-- Aire cible : a0000000-0000-4000-8000-000000000001
--
-- Génère 2 ans de ventes journalières par produit (≈ 730 j × produits),
-- avec saisonnalité, effet jour de semaine, vacances scolaires et une
-- légère croissance annuelle (~+7 %/an) pour rendre les comparaisons N-1
-- réalistes (globalement positives, avec des jours en repli).
--
-- Prérequis :
--   1) supabase-schema-complet.sql   (tables de base)
--   2) supabase-sales-module.sql     (table sales + fonction analytics)
--   3) supabase-seed-demo-1an.sql    (crée les 21 produits de l'aire)
--
-- Idempotent : purge des ventes de démo de cette aire puis réinsertion.
-- =============================================================================

BEGIN;

DELETE FROM public.sales WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_aire  uuid := 'a0000000-0000-4000-8000-000000000001';
  v_start date := CURRENT_DATE - 730;
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
  f_grow  numeric;
  qty     int;
  rev_ht  numeric;
  days_ago numeric;
  -- facteurs jour de semaine : dim, lun, mar, mer, jeu, ven, sam
  dowf numeric[] := ARRAY[1.35, 0.85, 0.85, 0.95, 1.00, 1.30, 1.40];
BEGIN
  PERFORM setseed(0.2468);

  FOR p IN
    SELECT id, ean, name, category, price_ht
    FROM public.products
    WHERE aire_id = v_aire
  LOOP
    -- Volume de base quotidien + TVA selon la catégorie
    base := CASE p.category
              WHEN 'Boissons'    THEN 45
              WHEN 'Café'        THEN 55
              WHEN 'Snacking'    THEN 30
              WHEN 'Confiserie'  THEN 24
              WHEN 'Sandwichs'   THEN 18
              WHEN 'Traiteur'    THEN 9
              WHEN 'Boulangerie' THEN 22
              WHEN 'Fruits'      THEN 16
              ELSE 20
            END;
    vat  := CASE p.category
              WHEN 'Café' THEN 0.10
              WHEN 'Sandwichs' THEN 0.10
              WHEN 'Traiteur' THEN 0.10
              ELSE 0.055
            END;

    d := v_start;
    WHILE d <= CURRENT_DATE LOOP
      dow := extract(dow from d)::int;                 -- 0 = dimanche
      mo  := extract(month from d)::int;
      md  := mo * 100 + extract(day from d)::int;

      f_dow := dowf[dow + 1];

      -- Saisonnalité par catégorie
      f_seas := CASE
        WHEN p.category = 'Boissons' AND mo BETWEEN 6 AND 8  THEN 1.40
        WHEN p.category = 'Boissons' AND mo IN (12, 1, 2)    THEN 0.80
        WHEN p.category = 'Fruits'   AND mo BETWEEN 6 AND 9  THEN 1.20
        WHEN p.category = 'Café'     AND mo IN (11, 12, 1, 2) THEN 1.35
        WHEN p.category = 'Café'     AND mo BETWEEN 6 AND 8  THEN 0.85
        ELSE 1.00
      END;

      -- Vacances scolaires (approximation zone A / Lyon) → affluence
      f_vac := CASE WHEN (md >= 1220 OR md <= 105)          -- Noël
                      OR (md >= 208 AND md <= 309)          -- Hiver
                      OR (md >= 412 AND md <= 511)          -- Printemps
                      OR (md >= 705 AND md <= 831)          -- Été
                      OR (md >= 1018 AND md <= 1102)        -- Toussaint
                    THEN 1.25 ELSE 1.00 END;

      -- Croissance annuelle : ~+7 %/an (les jours anciens vendent moins)
      days_ago := (CURRENT_DATE - d);
      f_grow   := 1.0 - 0.07 * (days_ago / 365.0);

      -- Quantité vendue = base × facteurs × bruit (±18 %)
      qty := round(base * f_dow * f_seas * f_vac * f_grow * (0.82 + random() * 0.36))::int;
      IF qty < 0 THEN qty := 0; END IF;

      rev_ht := round((qty * p.price_ht)::numeric, 2);

      INSERT INTO public.sales
        (aire_id, product_id, ean, product_name, category, sale_date,
         quantity, revenue_ht, revenue_ttc, source)
      VALUES
        (v_aire, p.id, p.ean, p.name, p.category, d,
         qty, rev_ht, round((rev_ht * (1 + vat))::numeric, 2), 'demo');

      d := d + 1;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- Vérifications rapides (décommenter) :
-- SELECT count(*) lignes, min(sale_date), max(sale_date) FROM sales
--   WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- SELECT jsonb_pretty(public.verdict_analytics('a0000000-0000-4000-8000-000000000001'));
-- =============================================================================
