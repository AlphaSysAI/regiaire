-- =============================================================================
-- RégiAire — Jeu de données de démonstration : 1 AN D'ACTIVITÉ
-- =============================================================================
-- Aire cible : a0000000-0000-4000-8000-000000000001  (Aire Démo RégiAire — Lyon)
--
-- Contenu généré (relatif à CURRENT_DATE, sur 365 jours glissants) :
--   • 21 produits répartis en catégories (boissons, snacking, frais, fruits...)
--   • Lots de stock (product_stocks) avec DLC échelonnées sur l'année
--   • Historique de gaspillage (waste_logs) — surtout sur les produits frais
--   • Livraisons en cours (pending_deliveries)
--   • 1 an de verdicts IA quotidiens (ai_verdicts) avec météo/vacances saisonnières
--   • Équipe (employees), planning courant (schedules + schedule_shifts)
--   • Notes de service hebdomadaires (shift_notes) sur l'année
--
-- Idempotent : purge puis réinsertion des données de démo de cette aire.
-- À exécuter dans l'éditeur SQL Supabase APRÈS supabase-schema-complet.sql.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Aire + purge des anciennes données de démo de cette aire
-- -----------------------------------------------------------------------------
INSERT INTO public.aires (id, name, city, latitude, longitude)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Aire Démo RégiAire', 'Lyon', 45.764000, 4.835700)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.waste_logs        WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.product_stocks    WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.pending_deliveries WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.ai_verdicts       WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.shift_notes       WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.schedule_shifts   WHERE schedule_id IN (
  SELECT id FROM public.schedules WHERE aire_id = 'a0000000-0000-4000-8000-000000000001'
);
DELETE FROM public.schedules         WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.employees         WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.products          WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';

-- -----------------------------------------------------------------------------
-- 1. Catalogue produits (table temporaire de paramétrage)
--    shelf_life  = durée de conservation (jours)  → DLC = livraison + shelf_life
--    restock     = cadence de réappro (jours)
--    lot_qty     = quantité livrée par lot
--    waste_rate  = probabilité qu'un lot passé génère de la perte (frais = élevé)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _seed_prod (
  id uuid, ean text, name text, category text, price_ht numeric,
  min_threshold int, shelf_life int, restock int, lot_qty int, waste_rate numeric
) ON COMMIT DROP;

INSERT INTO _seed_prod VALUES
  -- Boissons (longue conservation, gaspillage rare)
  ('b0000000-0000-4000-8000-000000000001','5449000000996','Coca-Cola 33cl',          'Boissons',   1.20, 24, 300,  7, 48, 0.03),
  ('b0000000-0000-4000-8000-000000000002','3274080005003','Eau Cristaline 50cl',      'Boissons',   0.70, 30, 400,  7, 60, 0.02),
  ('b0000000-0000-4000-8000-000000000003','9002490100070','Red Bull 25cl',            'Boissons',   1.95, 18, 300, 10, 36, 0.02),
  ('b0000000-0000-4000-8000-000000000004','3124480176738','Orangina 33cl',            'Boissons',   1.30, 18, 300, 10, 36, 0.03),
  ('b0000000-0000-4000-8000-000000000005','3057640385003','Vittel 1.5L',              'Boissons',   0.95, 20, 400, 10, 40, 0.02),
  ('b0000000-0000-4000-8000-000000000006','3038350013828','Jus d''orange Tropicana 25cl','Boissons',1.40, 12,  90,  7, 24, 0.12),
  -- Snacking / confiserie (conservation moyenne à longue)
  ('b0000000-0000-4000-8000-000000000007','3168930009900','Chips Lay''s Nature 45g',  'Snacking',   1.10, 20, 120, 10, 40, 0.05),
  ('b0000000-0000-4000-8000-000000000008','5053990138654','Pringles Original 175g',   'Snacking',   2.50, 12, 200, 14, 24, 0.03),
  ('b0000000-0000-4000-8000-000000000009','8000500310427','Kinder Bueno',             'Confiserie', 1.15, 20, 120, 10, 40, 0.05),
  ('b0000000-0000-4000-8000-000000000010','5000159407236','Twix',                     'Confiserie', 1.05, 20, 150, 10, 40, 0.04),
  ('b0000000-0000-4000-8000-000000000011','5000159461122','M&M''s Peanut',            'Confiserie', 1.60, 15, 180, 14, 30, 0.03),
  ('b0000000-0000-4000-8000-000000000012','3014230021374','Chewing-gum Freedent',     'Confiserie', 1.25, 15, 300, 21, 30, 0.02),
  -- Café / boissons chaudes (consommable)
  ('b0000000-0000-4000-8000-000000000013','2000000000013','Café expresso (gobelet)',  'Café',       1.50, 40, 180, 14,100, 0.02),
  ('b0000000-0000-4000-8000-000000000014','2000000000020','Cappuccino (gobelet)',     'Café',       1.80, 30, 180, 14, 80, 0.02),
  -- Produits frais / traiteur (DLC courte, gaspillage fréquent)
  ('b0000000-0000-4000-8000-000000000015','2100000000012','Sandwich Jambon-Beurre',   'Sandwichs',  3.20,  8,   3,  2, 20, 0.55),
  ('b0000000-0000-4000-8000-000000000016','2100000000029','Sandwich Poulet Crudités', 'Sandwichs',  3.80,  8,   3,  2, 18, 0.55),
  ('b0000000-0000-4000-8000-000000000017','2100000000036','Wrap Végétarien',          'Sandwichs',  3.50,  6,   3,  2, 12, 0.50),
  ('b0000000-0000-4000-8000-000000000018','2100000000043','Salade César',             'Traiteur',   4.90,  5,   4,  2, 10, 0.45),
  ('b0000000-0000-4000-8000-000000000019','2100000000050','Croissant beurre',         'Boulangerie',1.10, 10,   2,  1, 24, 0.40),
  -- Fruits (DLC moyenne)
  ('b0000000-0000-4000-8000-000000000020','2200000000019','Pomme Gala (unité)',       'Fruits',     0.60, 12,  14,  4, 30, 0.20),
  ('b0000000-0000-4000-8000-000000000021','2200000000026','Banane (unité)',           'Fruits',     0.45, 12,   8,  4, 30, 0.25);

-- Insertion des produits (current_stock recalculé plus bas)
INSERT INTO public.products (id, aire_id, ean, name, category, price_ht, current_stock, min_threshold)
SELECT id, 'a0000000-0000-4000-8000-000000000001', ean, name, category, price_ht, 0, min_threshold
FROM _seed_prod;

-- -----------------------------------------------------------------------------
-- 2. Lots de stock (product_stocks) + historique de gaspillage (waste_logs)
--    Sur 365 jours : un lot livré à chaque cadence de réappro.
--    Lots dont la DLC est passée  -> quantity 0 (écoulés/traités)
--    Lots dont la DLC est future  -> quantité restante réaliste
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_aire  uuid := 'a0000000-0000-4000-8000-000000000001';
  v_start date := CURRENT_DATE - 365;
  v_today date := CURRENT_DATE;
  p       RECORD;
  d       date;
  exp     date;
  remaining int;
  wqty    int;
  r       numeric;
BEGIN
  PERFORM setseed(0.7777);

  FOR p IN SELECT * FROM _seed_prod LOOP
    d := v_start;
    WHILE d <= v_today LOOP
      exp := d + p.shelf_life;

      IF exp < v_today THEN
        remaining := 0;                                   -- lot passé : écoulé
      ELSE
        remaining := GREATEST(1, round(p.lot_qty * (0.35 + random() * 0.60))::int);
      END IF;

      INSERT INTO public.product_stocks (product_id, aire_id, quantity, expiry_date, is_promo, ean, created_at)
      VALUES (p.id, v_aire, remaining, exp,
              (remaining > 0 AND random() < 0.12),        -- ~12% des lots actifs en promo
              p.ean, d + interval '8 hours 30 minutes');

      -- Gaspillage sur les lots dont la DLC est dépassée
      IF exp < v_today THEN
        r := random();
        IF r < p.waste_rate THEN
          wqty := GREATEST(1, round(p.lot_qty * (0.05 + random() * 0.20))::int);
          INSERT INTO public.waste_logs (product_id, aire_id, quantity, reason, cost_loss, created_at)
          VALUES (p.id, v_aire, wqty,
                  CASE WHEN random() < 0.7 THEN 'Périmé (AntiGaspi)'
                       WHEN random() < 0.5 THEN 'Périmé'
                       ELSE 'Casse' END,
                  round((p.price_ht * wqty)::numeric, 2),
                  exp + interval '19 hours');
        END IF;
      END IF;

      d := d + p.restock;
    END LOOP;
  END LOOP;

  -- current_stock = somme des lots encore valides (DLC >= aujourd'hui)
  UPDATE public.products pr
  SET current_stock = COALESCE((
        SELECT SUM(ps.quantity) FROM public.product_stocks ps
        WHERE ps.product_id = pr.id AND ps.expiry_date >= v_today
      ), 0),
      updated_at = NOW()
  WHERE pr.aire_id = v_aire;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Livraisons en cours / récentes (pending_deliveries)
-- -----------------------------------------------------------------------------
INSERT INTO public.pending_deliveries
  (aire_id, delivery_group_id, ean, product_name, total_colis, units_per_colis, expected_total_qty, colis_received, status, created_at)
VALUES
  -- Livraison boissons complétée (hier)
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','5449000000996','Coca-Cola 33cl',       4, 24, 96, 4, 'completed', CURRENT_DATE - 1 + interval '9 hours'),
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','3274080005003','Eau Cristaline 50cl',  3, 24, 72, 3, 'completed', CURRENT_DATE - 1 + interval '9 hours'),
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','9002490100070','Red Bull 25cl',        2, 24, 48, 2, 'completed', CURRENT_DATE - 1 + interval '9 hours'),
  -- Livraison snacking en cours de réception (aujourd'hui)
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','3168930009900','Chips Lay''s Nature 45g',5, 20, 100, 2, 'pending', CURRENT_DATE + interval '7 hours 30 minutes'),
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','8000500310427','Kinder Bueno',          3, 30, 90, 0, 'pending', CURRENT_DATE + interval '7 hours 30 minutes'),
  -- Livraison frais à recevoir (aujourd'hui)
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','2100000000012','Sandwich Jambon-Beurre',1, 20, 20, 0, 'pending', CURRENT_DATE + interval '6 hours'),
  ('a0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','2100000000050','Croissant beurre',      1, 24, 24, 0, 'pending', CURRENT_DATE + interval '6 hours');

-- -----------------------------------------------------------------------------
-- 4. Historique des verdicts IA — 1 an, un verdict par jour
--    Météo & vacances scolaires reconstituées de façon saisonnière.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_aire uuid := 'a0000000-0000-4000-8000-000000000001';
  d      date := CURRENT_DATE - 365;
  mo     int;
  md     int;
  dow    int;
  base_t numeric;
  temp   numeric;
  cond   text;
  vac    boolean;
  fb     text;
  low    int;
  expc   int;
  loss   numeric;
  jour   text;
  verdict text;
  r      numeric;
  months numeric[] := ARRAY[6,7,10,14,18,23,27,26,21,15,10,6];  -- moyennes mensuelles Lyon
  jours  text[] := ARRAY['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
BEGIN
  PERFORM setseed(0.1234);

  WHILE d <= CURRENT_DATE LOOP
    mo  := extract(month from d)::int;
    md  := extract(month from d)::int * 100 + extract(day from d)::int;
    dow := extract(dow from d)::int;   -- 0 = dimanche ... 6 = samedi

    -- Température = moyenne mensuelle +/- 4°C
    base_t := months[mo];
    temp   := round((base_t + (random() * 8 - 4))::numeric, 1);

    -- Condition météo pondérée par la saison
    r := random();
    IF base_t >= 24 THEN
      cond := CASE WHEN r < 0.60 THEN 'Clear' WHEN r < 0.85 THEN 'Clouds' ELSE 'Rain' END;
    ELSIF base_t <= 9 THEN
      cond := CASE WHEN r < 0.30 THEN 'Clear' WHEN r < 0.65 THEN 'Clouds' WHEN r < 0.90 THEN 'Rain' ELSE 'Snow' END;
    ELSE
      cond := CASE WHEN r < 0.40 THEN 'Clear' WHEN r < 0.75 THEN 'Clouds' ELSE 'Rain' END;
    END IF;

    -- Vacances scolaires (approximation zone A/Lyon)
    vac := (md >= 1220 OR md <= 105)          -- Noël
        OR (md >= 208 AND md <= 309)          -- Hiver
        OR (md >= 412 AND md <= 511)          -- Printemps
        OR (md >= 705 AND md <= 831)          -- Été
        OR (md >= 1018 AND md <= 1102);       -- Toussaint

    low  := floor(random() * random() * 7)::int;    -- ruptures (biais vers 0)
    expc := floor(random() * random() * 6)::int;    -- lots en DLC courte
    loss := round((random() * random() * 90)::numeric, 2);

    r  := random();
    fb := CASE WHEN r < 0.18 THEN 'positive' WHEN r < 0.26 THEN 'negative' ELSE NULL END;

    jour := initcap(jours[dow + 1]);

    IF vac AND temp >= 25 THEN
      verdict := format('[ACTION JOURNÉE] %s (vacances, %s°C) : forte affluence attendue → maintenez boissons froides et snacking en rayon. [JOURS À VENIR] Lyon : chaleur persistante, augmentez boissons fraîches +40%% et anticipez les glaces pour le week-end.', jour, temp);
    ELSIF vac THEN
      verdict := format('[ACTION JOURNÉE] %s (vacances) : affluence soutenue → surveillez les ruptures snacking et boissons. [JOURS À VENIR] Lyon : trafic dense maintenu, ne relâchez pas les commandes cette semaine.', jour);
    ELSIF dow IN (5, 6) AND temp >= 22 THEN
      verdict := format('[ACTION JOURNÉE] %s : trafic très dense (week-end) + %s°C → pic d''affluence, +30%% boissons et snacking. [JOURS À VENIR] Lyon : week-end chaud, préparez boissons froides et sandwichs frais.', jour, temp);
    ELSIF dow IN (0, 6) THEN
      verdict := format('[ACTION JOURNÉE] %s : gestion du pic week-end → magasin rempli, DLC courtes traitées. [JOURS À VENIR] Lyon : retour au calme en début de semaine, ne surchargez pas les commandes.', jour);
    ELSIF temp <= 8 THEN
      verdict := format('[ACTION JOURNÉE] %s (%s°C) : temps froid → poussez cafés et boissons chaudes. [JOURS À VENIR] Lyon : fraîcheur maintenue, adaptez le rayon frais à la baisse.', jour, temp);
    ELSE
      verdict := format('[ACTION JOURNÉE] %s : activité normale → optimisez les stocks et traitez les DLC courtes. [JOURS À VENIR] Lyon : semaine calme prévue, commencez à anticiper le week-end.', jour);
    END IF;

    IF expc >= 1 THEN
      verdict := format('[ALERTE] %s lot(s) en DLC courte → à écouler en priorité. ', expc) || verdict;
    END IF;

    INSERT INTO public.ai_verdicts
      (aire_id, verdict, temperature, condition, city, is_vacances,
       products_count, low_stocks_count, total_loss, expiring_count, feedback, created_at)
    VALUES
      (v_aire, verdict, temp, cond, 'Lyon', vac,
       21, low, loss, expc, fb, d + interval '7 hours 15 minutes');

    d := d + 1;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Équipe (employees)
-- -----------------------------------------------------------------------------
INSERT INTO public.employees (id, aire_id, prenom, nom, heures_semaine, heures_mois, quart_prefere, quart_obligatoire)
VALUES
  ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Sophie',   'Martin',   35, 151, ARRAY['6-14']::text[],          NULL),
  ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Karim',    'Benali',   35, 151, ARRAY['14-22']::text[],         NULL),
  ('c0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Julie',    'Petit',    28, 121, ARRAY['6-14','14-22']::text[],  NULL),
  ('c0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','Thomas',   'Roux',     35, 151, ARRAY['22-6']::text[],          '22-6'),
  ('c0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','Amina',    'Diallo',   35, 151, ARRAY['14-22','22-6']::text[],  NULL);

-- -----------------------------------------------------------------------------
-- 6. Planning courant (schedules + schedule_shifts) — quinzaine en cours
-- -----------------------------------------------------------------------------
INSERT INTO public.schedules (id, aire_id, periode_debut, periode_fin, planning_data, instructions_speciales, created_at)
VALUES
  ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   CURRENT_DATE - 7, CURRENT_DATE + 7,
   '{"source":"seed","couverture":"3 quarts/jour","rotation":"6-14 / 14-22 / 22-6"}'::jsonb,
   'Renforcer les créneaux week-end (affluence). Couverture nuit assurée par Thomas.',
   CURRENT_DATE - 8 + interval '10 hours');

DO $$
DECLARE
  v_sched uuid := 'e0000000-0000-4000-8000-000000000001';
  emps    uuid[] := ARRAY[
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000003',
    'c0000000-0000-4000-8000-000000000004',
    'c0000000-0000-4000-8000-000000000005'];
  starts  time[] := ARRAY['06:00','14:00','22:00']::time[];
  ends    time[] := ARRAY['14:00','22:00','06:00']::time[];
  i int; j int; q int;
BEGIN
  FOR i IN 0..13 LOOP                       -- 14 jours
    FOR j IN 1..array_length(emps, 1) LOOP  -- 5 employés
      q := ((i + j) % 3) + 1;               -- rotation des quarts
      -- Thomas (index 4) toujours de nuit
      IF j = 4 THEN q := 3; END IF;
      INSERT INTO public.schedule_shifts (schedule_id, employee_id, date, quart_debut, quart_fin, heures)
      VALUES (v_sched, emps[j], CURRENT_DATE - 7 + i, starts[q], ends[q], 8);
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Notes de service hebdomadaires (shift_notes) — sur l'année
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_aire uuid := 'a0000000-0000-4000-8000-000000000001';
  d      date := CURRENT_DATE - 364;
  auteurs text[] := ARRAY['Sophie','Karim','Julie','Thomas','Amina'];
  taches  text[] := ARRAY['Vérifier températures frigos','Contrôle propreté sanitaires',
                          'Rangement gondole boissons','Inventaire rapide snacking',
                          'Vider corbeilles zone restauration','Rapport caisse / litiges'];
  rate   int;
  miss   text[];
  auteur text;
  contenu text;
BEGIN
  PERFORM setseed(0.5309);

  WHILE d <= CURRENT_DATE LOOP
    rate   := 60 + floor(random() * 41)::int;   -- 60–100 %
    auteur := auteurs[1 + floor(random() * array_length(auteurs, 1))::int];

    -- Tâches manquantes si taux < 100 %
    IF rate < 100 THEN
      miss := ARRAY[ taches[1 + floor(random() * array_length(taches, 1))::int] ];
    ELSE
      miss := ARRAY[]::text[];
    END IF;

    contenu := CASE
      WHEN rate >= 95 THEN 'Service nickel, magasin bien tenu. RAS.'
      WHEN rate >= 80 THEN 'Bon service. Quelques réassorts à finaliser au prochain quart.'
      WHEN rate >= 70 THEN 'Affluence soutenue, checklist non terminée. À reprendre.'
      ELSE 'Service tendu (sous-effectif). Priorité au réassort et à l''hygiène demain.'
    END;

    INSERT INTO public.shift_notes (aire_id, content, created_by, completion_rate, missing_tasks, created_at)
    VALUES (v_aire, contenu, auteur, rate, miss, d + interval '21 hours');

    d := d + 7;   -- une note par semaine
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- Vérifications rapides (décommenter au besoin) :
-- SELECT count(*) FROM products         WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- SELECT count(*) FROM product_stocks   WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- SELECT count(*) FROM waste_logs       WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- SELECT count(*) FROM ai_verdicts      WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- SELECT round(SUM(cost_loss),2) AS perte_totale_an FROM waste_logs
--   WHERE aire_id = 'a0000000-0000-4000-8000-000000000001';
-- =============================================================================
