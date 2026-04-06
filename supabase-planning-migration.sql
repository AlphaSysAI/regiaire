-- =====================================================
-- Script de migration pour le système de planning Timefold
-- Ce script peut être exécuté plusieurs fois sans erreur
-- =====================================================

-- =====================================================
-- 1. TABLE EMPLOYEES
-- =====================================================

-- Créer la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES aires(id) ON DELETE CASCADE,
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  heures_semaine INTEGER NOT NULL DEFAULT 35,
  heures_mois INTEGER NOT NULL DEFAULT 151,
  quart_prefere TEXT[] DEFAULT ARRAY[]::TEXT[],
  quart_obligatoire VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter les colonnes manquantes si la table existe déjà
DO $$ 
BEGIN
  -- Ajouter quart_prefere si elle n'existe pas ou si elle est VARCHAR
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'quart_prefere'
  ) THEN
    ALTER TABLE employees ADD COLUMN quart_prefere TEXT[] DEFAULT ARRAY[]::TEXT[];
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' 
    AND column_name = 'quart_prefere' 
    AND data_type = 'character varying'
  ) THEN
    -- Migrer de VARCHAR à TEXT[]
    ALTER TABLE employees 
      ALTER COLUMN quart_prefere TYPE TEXT[] 
      USING CASE 
        WHEN quart_prefere::text IS NULL OR quart_prefere::text = '' THEN ARRAY[]::TEXT[]
        ELSE ARRAY[quart_prefere::text]
      END;
  END IF;

  -- Ajouter quart_obligatoire si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'quart_obligatoire'
  ) THEN
    ALTER TABLE employees ADD COLUMN quart_obligatoire VARCHAR(10);
  END IF;

  -- Ajouter heures_semaine si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'heures_semaine'
  ) THEN
    ALTER TABLE employees ADD COLUMN heures_semaine INTEGER NOT NULL DEFAULT 35;
  END IF;

  -- Ajouter heures_mois si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'heures_mois'
  ) THEN
    ALTER TABLE employees ADD COLUMN heures_mois INTEGER NOT NULL DEFAULT 151;
  END IF;

  -- Ajouter updated_at si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE employees ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- =====================================================
-- 2. TABLE SCHEDULES
-- =====================================================

-- Créer la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aire_id UUID NOT NULL REFERENCES aires(id) ON DELETE CASCADE,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  planning_data JSONB NOT NULL,
  instructions_speciales TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Ajouter les colonnes manquantes si la table existe déjà
DO $$ 
BEGIN
  -- Ajouter instructions_speciales si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'instructions_speciales'
  ) THEN
    ALTER TABLE schedules ADD COLUMN instructions_speciales TEXT;
  END IF;

  -- Ajouter created_by si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE schedules ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;

  -- S'assurer que planning_data est JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedules' 
    AND column_name = 'planning_data' 
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE schedules 
      ALTER COLUMN planning_data TYPE JSONB 
      USING planning_data::jsonb;
  END IF;
END $$;

-- =====================================================
-- 3. TABLE SCHEDULE_SHIFTS
-- =====================================================

-- Créer la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS schedule_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  quart_debut TIME,
  quart_fin TIME,
  heures INTEGER DEFAULT 8,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter les colonnes manquantes si la table existe déjà
DO $$ 
BEGIN
  -- Ajouter quart_debut si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_shifts' AND column_name = 'quart_debut'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN quart_debut TIME;
  END IF;

  -- Ajouter quart_fin si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_shifts' AND column_name = 'quart_fin'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN quart_fin TIME;
  END IF;

  -- Ajouter heures si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_shifts' AND column_name = 'heures'
  ) THEN
    ALTER TABLE schedule_shifts ADD COLUMN heures INTEGER DEFAULT 8;
  END IF;
END $$;

-- =====================================================
-- 4. INDEX POUR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_employees_aire ON employees(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedules_aire ON schedules(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedules_periode ON schedules(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_schedule ON schedule_shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_employee ON schedule_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_date ON schedule_shifts(date);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Activer RLS sur toutes les tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_shifts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. POLICIES RLS - EMPLOYEES
-- =====================================================

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Users can view employees of their aire" ON employees;
DROP POLICY IF EXISTS "Users can insert employees of their aire" ON employees;
DROP POLICY IF EXISTS "Users can update employees of their aire" ON employees;
DROP POLICY IF EXISTS "Users can delete employees of their aire" ON employees;

-- Créer les nouvelles policies
CREATE POLICY "Users can view employees of their aire" ON employees
  FOR SELECT 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert employees of their aire" ON employees
  FOR INSERT 
  WITH CHECK (
    aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()) 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Users can update employees of their aire" ON employees
  FOR UPDATE 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete employees of their aire" ON employees
  FOR DELETE 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

-- =====================================================
-- 7. POLICIES RLS - SCHEDULES
-- =====================================================

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Users can view schedules of their aire" ON schedules;
DROP POLICY IF EXISTS "Users can insert schedules of their aire" ON schedules;
DROP POLICY IF EXISTS "Users can update schedules of their aire" ON schedules;
DROP POLICY IF EXISTS "Users can delete schedules of their aire" ON schedules;

-- Créer les nouvelles policies
CREATE POLICY "Users can view schedules of their aire" ON schedules
  FOR SELECT 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert schedules of their aire" ON schedules
  FOR INSERT 
  WITH CHECK (
    aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()) 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Users can update schedules of their aire" ON schedules
  FOR UPDATE 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete schedules of their aire" ON schedules
  FOR DELETE 
  USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

-- =====================================================
-- 8. POLICIES RLS - SCHEDULE_SHIFTS
-- =====================================================

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Users can view shifts of their aire" ON schedule_shifts;
DROP POLICY IF EXISTS "Users can insert shifts of their aire" ON schedule_shifts;
DROP POLICY IF EXISTS "Users can update shifts of their aire" ON schedule_shifts;
DROP POLICY IF EXISTS "Users can delete shifts of their aire" ON schedule_shifts;

-- Créer les nouvelles policies
CREATE POLICY "Users can view shifts of their aire" ON schedule_shifts
  FOR SELECT 
  USING (
    schedule_id IN (
      SELECT id FROM schedules 
      WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert shifts of their aire" ON schedule_shifts
  FOR INSERT 
  WITH CHECK (
    schedule_id IN (
      SELECT id FROM schedules 
      WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    ) 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Users can update shifts of their aire" ON schedule_shifts
  FOR UPDATE 
  USING (
    schedule_id IN (
      SELECT id FROM schedules 
      WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can delete shifts of their aire" ON schedule_shifts
  FOR DELETE 
  USING (
    schedule_id IN (
      SELECT id FROM schedules 
      WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    )
  );

-- =====================================================
-- 9. FONCTION POUR MISE À JOUR AUTOMATIQUE updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger si nécessaire
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FIN DU SCRIPT
-- =====================================================

-- Vérification finale
DO $$
BEGIN
  RAISE NOTICE 'Migration terminée avec succès !';
  RAISE NOTICE 'Tables créées/mises à jour : employees, schedules, schedule_shifts';
  RAISE NOTICE 'Policies RLS configurées pour toutes les tables';
END $$;

