-- =============================================================================
-- RégiAire — Schéma PostgreSQL complet (Supabase)
-- =============================================================================
-- À exécuter dans l’éditeur SQL Supabase (projet vierge ou complément).
-- Idempotent : CREATE IF NOT EXISTS, DROP POLICY IF EXISTS avant recréation.
--
-- Prérequis : projet Supabase avec Auth activé.
-- Après exécution : créer un utilisateur (Auth), puis lier son profil à une aire
--   UPDATE profiles SET aire_id = '<uuid_aire>' WHERE id = '<uuid_user>';
-- =============================================================================

-- Extensions utiles (gen_random_uuid est natif sur Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Fonction trigger générique (sans dépendance aux tables métier)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. Aires (stations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.aires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  city VARCHAR(120),
  latitude DECIMAL(9, 6),
  longitude DECIMAL(9, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. Profils utilisateurs (liés à auth.users)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  aire_id UUID REFERENCES public.aires(id) ON DELETE SET NULL,
  email TEXT,
  full_name VARCHAR(200),
  role VARCHAR(50) DEFAULT 'manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3. Produits & stocks
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  ean VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Divers',
  price_ht DECIMAL(10, 2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aire_id, ean)
);

CREATE TABLE IF NOT EXISTS public.product_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expiry_date DATE NOT NULL,
  is_promo BOOLEAN NOT NULL DEFAULT FALSE,
  ean VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.waste_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason VARCHAR(120) NOT NULL,
  cost_loss DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4. Livraisons (bons de livraison / factures scannés)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pending_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  delivery_group_id UUID NOT NULL,
  ean VARCHAR(32),
  product_name VARCHAR(255) NOT NULL,
  total_colis INTEGER NOT NULL DEFAULT 1,
  units_per_colis INTEGER NOT NULL DEFAULT 1,
  expected_total_qty INTEGER NOT NULL DEFAULT 0,
  colis_received INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. Équipe — checklists & notes de service
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shift_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  task_name VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Général',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shift_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by VARCHAR(50) NOT NULL,
  completion_rate INTEGER NOT NULL DEFAULT 0,
  missing_tasks TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. Planning employés (Timefold)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  heures_semaine INTEGER NOT NULL DEFAULT 35,
  heures_mois INTEGER NOT NULL DEFAULT 151,
  quart_prefere TEXT[] DEFAULT ARRAY[]::TEXT[],
  quart_obligatoire VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employees_quart_prefere_check CHECK (
    quart_prefere IS NULL
    OR (
      array_length(quart_prefere, 1) > 0
      AND quart_prefere <@ ARRAY['6-14', '14-22', '22-6']::TEXT[]
    )
  )
);

CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  planning_data JSONB NOT NULL,
  instructions_speciales TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.schedule_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  quart_debut TIME,
  quart_fin TIME,
  heures INTEGER NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 7. Verdicts IA (apprentissage & feedback)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  temperature DECIMAL(5, 2),
  condition TEXT,
  city TEXT,
  is_vacances BOOLEAN NOT NULL DEFAULT FALSE,
  products_count INTEGER NOT NULL DEFAULT 0,
  low_stocks_count INTEGER NOT NULL DEFAULT 0,
  total_loss DECIMAL(10, 2) NOT NULL DEFAULT 0,
  expiring_count INTEGER NOT NULL DEFAULT 0,
  feedback TEXT CHECK (feedback IN ('positive', 'negative') OR feedback IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Fonctions & triggers (après création des tables)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_aire_id()
RETURNS UUID AS $$
  SELECT aire_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Profil automatique à l’inscription (aire_id à renseigner manuellement ensuite)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, aire_id)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'aire_id'), '')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    aire_id = COALESCE(EXCLUDED.aire_id, profiles.aire_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_aire ON public.profiles(aire_id);
CREATE INDEX IF NOT EXISTS idx_products_aire ON public.products(aire_id);
CREATE INDEX IF NOT EXISTS idx_products_ean ON public.products(ean);
CREATE INDEX IF NOT EXISTS idx_product_stocks_aire ON public.product_stocks(aire_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_product ON public.product_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_expiry ON public.product_stocks(expiry_date);
CREATE INDEX IF NOT EXISTS idx_product_stocks_ean ON public.product_stocks(aire_id, ean);
CREATE INDEX IF NOT EXISTS idx_waste_logs_aire ON public.waste_logs(aire_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_product ON public.waste_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_pending_deliveries_aire ON public.pending_deliveries(aire_id);
CREATE INDEX IF NOT EXISTS idx_pending_deliveries_group ON public.pending_deliveries(delivery_group_id);
CREATE INDEX IF NOT EXISTS idx_pending_deliveries_status ON public.pending_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_shift_tasks_aire ON public.shift_tasks(aire_id);
CREATE INDEX IF NOT EXISTS idx_shift_notes_aire ON public.shift_notes(aire_id);
CREATE INDEX IF NOT EXISTS idx_shift_notes_created ON public.shift_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_aire ON public.employees(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedules_aire ON public.schedules(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedules_periode ON public.schedules(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_schedule ON public.schedule_shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_employee ON public.schedule_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_date ON public.schedule_shifts(date);
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_aire_id ON public.ai_verdicts(aire_id);
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_created_at ON public.ai_verdicts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_feedback ON public.ai_verdicts(feedback) WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_similar ON public.ai_verdicts(aire_id, is_vacances, created_at);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.aires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_verdicts ENABLE ROW LEVEL SECURITY;

-- --- aires ---
DROP POLICY IF EXISTS "Users can view their aire" ON public.aires;
DROP POLICY IF EXISTS "Public can list aires for signup" ON public.aires;
CREATE POLICY "Users can view their aire" ON public.aires
  FOR SELECT USING (id = public.user_aire_id());
-- Lecture publique (id, name, city) pour le formulaire d'inscription /api/aires
CREATE POLICY "Public can list aires for signup" ON public.aires
  FOR SELECT USING (true);

-- --- profiles ---
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- --- products ---
DROP POLICY IF EXISTS "Users can view products of their aire" ON public.products;
DROP POLICY IF EXISTS "Users can insert products of their aire" ON public.products;
DROP POLICY IF EXISTS "Users can update products of their aire" ON public.products;
DROP POLICY IF EXISTS "Users can delete products of their aire" ON public.products;
CREATE POLICY "Users can view products of their aire" ON public.products
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert products of their aire" ON public.products
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update products of their aire" ON public.products
  FOR UPDATE USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can delete products of their aire" ON public.products
  FOR DELETE USING (aire_id = public.user_aire_id());

-- --- product_stocks ---
DROP POLICY IF EXISTS "Users can view stocks of their aire" ON public.product_stocks;
DROP POLICY IF EXISTS "Users can insert stocks of their aire" ON public.product_stocks;
DROP POLICY IF EXISTS "Users can update stocks of their aire" ON public.product_stocks;
DROP POLICY IF EXISTS "Users can delete stocks of their aire" ON public.product_stocks;
CREATE POLICY "Users can view stocks of their aire" ON public.product_stocks
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert stocks of their aire" ON public.product_stocks
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update stocks of their aire" ON public.product_stocks
  FOR UPDATE USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can delete stocks of their aire" ON public.product_stocks
  FOR DELETE USING (aire_id = public.user_aire_id());

-- --- waste_logs ---
DROP POLICY IF EXISTS "Users can view waste of their aire" ON public.waste_logs;
DROP POLICY IF EXISTS "Users can insert waste of their aire" ON public.waste_logs;
CREATE POLICY "Users can view waste of their aire" ON public.waste_logs
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert waste of their aire" ON public.waste_logs
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());

-- --- pending_deliveries ---
DROP POLICY IF EXISTS "Users can view deliveries of their aire" ON public.pending_deliveries;
DROP POLICY IF EXISTS "Users can insert deliveries of their aire" ON public.pending_deliveries;
DROP POLICY IF EXISTS "Users can update deliveries of their aire" ON public.pending_deliveries;
CREATE POLICY "Users can view deliveries of their aire" ON public.pending_deliveries
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert deliveries of their aire" ON public.pending_deliveries
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update deliveries of their aire" ON public.pending_deliveries
  FOR UPDATE USING (aire_id = public.user_aire_id());

-- --- shift_tasks ---
DROP POLICY IF EXISTS "Users can view tasks of their aire" ON public.shift_tasks;
DROP POLICY IF EXISTS "Users can update tasks of their aire" ON public.shift_tasks;
CREATE POLICY "Users can view tasks of their aire" ON public.shift_tasks
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can update tasks of their aire" ON public.shift_tasks
  FOR UPDATE USING (aire_id = public.user_aire_id());

-- --- shift_notes ---
DROP POLICY IF EXISTS "Users can view notes of their aire" ON public.shift_notes;
DROP POLICY IF EXISTS "Users can insert notes of their aire" ON public.shift_notes;
CREATE POLICY "Users can view notes of their aire" ON public.shift_notes
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert notes of their aire" ON public.shift_notes
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());

-- --- employees ---
DROP POLICY IF EXISTS "Users can view employees of their aire" ON public.employees;
DROP POLICY IF EXISTS "Users can insert employees of their aire" ON public.employees;
DROP POLICY IF EXISTS "Users can update employees of their aire" ON public.employees;
DROP POLICY IF EXISTS "Users can delete employees of their aire" ON public.employees;
CREATE POLICY "Users can view employees of their aire" ON public.employees
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert employees of their aire" ON public.employees
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update employees of their aire" ON public.employees
  FOR UPDATE USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can delete employees of their aire" ON public.employees
  FOR DELETE USING (aire_id = public.user_aire_id());

-- --- schedules ---
DROP POLICY IF EXISTS "Users can view schedules of their aire" ON public.schedules;
DROP POLICY IF EXISTS "Users can insert schedules of their aire" ON public.schedules;
DROP POLICY IF EXISTS "Users can update schedules of their aire" ON public.schedules;
DROP POLICY IF EXISTS "Users can delete schedules of their aire" ON public.schedules;
CREATE POLICY "Users can view schedules of their aire" ON public.schedules
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert schedules of their aire" ON public.schedules
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update schedules of their aire" ON public.schedules
  FOR UPDATE USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can delete schedules of their aire" ON public.schedules
  FOR DELETE USING (aire_id = public.user_aire_id());

-- --- schedule_shifts ---
DROP POLICY IF EXISTS "Users can view shifts of their aire" ON public.schedule_shifts;
DROP POLICY IF EXISTS "Users can insert shifts of their aire" ON public.schedule_shifts;
DROP POLICY IF EXISTS "Users can update shifts of their aire" ON public.schedule_shifts;
DROP POLICY IF EXISTS "Users can delete shifts of their aire" ON public.schedule_shifts;
CREATE POLICY "Users can view shifts of their aire" ON public.schedule_shifts
  FOR SELECT USING (
    schedule_id IN (SELECT id FROM public.schedules WHERE aire_id = public.user_aire_id())
  );
CREATE POLICY "Users can insert shifts of their aire" ON public.schedule_shifts
  FOR INSERT WITH CHECK (
    schedule_id IN (SELECT id FROM public.schedules WHERE aire_id = public.user_aire_id())
  );
CREATE POLICY "Users can update shifts of their aire" ON public.schedule_shifts
  FOR UPDATE USING (
    schedule_id IN (SELECT id FROM public.schedules WHERE aire_id = public.user_aire_id())
  );
CREATE POLICY "Users can delete shifts of their aire" ON public.schedule_shifts
  FOR DELETE USING (
    schedule_id IN (SELECT id FROM public.schedules WHERE aire_id = public.user_aire_id())
  );

-- --- ai_verdicts ---
DROP POLICY IF EXISTS "Users can view verdicts of their aire" ON public.ai_verdicts;
DROP POLICY IF EXISTS "Users can insert verdicts for their aire" ON public.ai_verdicts;
DROP POLICY IF EXISTS "Users can update feedback for their aire verdicts" ON public.ai_verdicts;
CREATE POLICY "Users can view verdicts of their aire" ON public.ai_verdicts
  FOR SELECT USING (aire_id = public.user_aire_id());
CREATE POLICY "Users can insert verdicts for their aire" ON public.ai_verdicts
  FOR INSERT WITH CHECK (aire_id = public.user_aire_id());
CREATE POLICY "Users can update feedback for their aire verdicts" ON public.ai_verdicts
  FOR UPDATE USING (aire_id = public.user_aire_id())
  WITH CHECK (aire_id = public.user_aire_id());

-- =============================================================================
-- Données de démonstration (optionnel — commenter si non souhaité)
-- =============================================================================

INSERT INTO public.aires (id, name, city)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Aire Démo RégiAire',
  'Lyon'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shift_tasks (aire_id, task_name, category, sort_order)
SELECT
  'a0000000-0000-4000-8000-000000000001',
  t.task_name,
  t.category,
  t.sort_order
FROM (
  VALUES
    ('Vérifier températures frigos', 'Hygiène', 1),
    ('Contrôle propreté sanitaires', 'Hygiène', 2),
    ('Rangement gondole boissons', 'Magasin', 3),
    ('Inventaire rapide snacking', 'Magasin', 4),
    ('Vider corbeilles zone restauration', 'Entretien', 5),
    ('Rapport caisse / litiges', 'Admin', 6)
) AS t(task_name, category, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shift_tasks
  WHERE aire_id = 'a0000000-0000-4000-8000-000000000001'
);

-- =============================================================================
-- Fin — Tables créées :
--   aires, profiles, products, product_stocks, waste_logs,
--   pending_deliveries, shift_tasks, shift_notes,
--   employees, schedules, schedule_shifts, ai_verdicts
-- =============================================================================
