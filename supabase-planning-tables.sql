-- Tables pour le système de planning avec Timefold

-- Table des employés
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

-- Table des plannings générés
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

-- Table des shifts individuels (pour requêtes/export)
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

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_employees_aire ON employees(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedules_aire ON schedules(aire_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_schedule ON schedule_shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_employee ON schedule_shifts(employee_id);

-- RLS Policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_shifts ENABLE ROW LEVEL SECURITY;

-- Policies pour employees
CREATE POLICY "Users can view employees of their aire" ON employees
  FOR SELECT USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert employees of their aire" ON employees
  FOR INSERT WITH CHECK (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()) OR auth.uid() IS NULL);

CREATE POLICY "Users can update employees of their aire" ON employees
  FOR UPDATE USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete employees of their aire" ON employees
  FOR DELETE USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

-- Policies pour schedules
CREATE POLICY "Users can view schedules of their aire" ON schedules
  FOR SELECT USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert schedules of their aire" ON schedules
  FOR INSERT WITH CHECK (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()) OR auth.uid() IS NULL);

CREATE POLICY "Users can delete schedules of their aire" ON schedules
  FOR DELETE USING (aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid()));

-- Policies pour schedule_shifts
CREATE POLICY "Users can view shifts of their aire" ON schedule_shifts
  FOR SELECT USING (
    schedule_id IN (
      SELECT id FROM schedules WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert shifts of their aire" ON schedule_shifts
  FOR INSERT WITH CHECK (
    schedule_id IN (
      SELECT id FROM schedules WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    ) OR auth.uid() IS NULL
  );

CREATE POLICY "Users can delete shifts of their aire" ON schedule_shifts
  FOR DELETE USING (
    schedule_id IN (
      SELECT id FROM schedules WHERE aire_id IN (SELECT aire_id FROM profiles WHERE id = auth.uid())
    )
  );

