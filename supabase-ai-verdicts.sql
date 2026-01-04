-- Table pour stocker les verdicts IA avec contexte et feedback
-- À exécuter dans l'éditeur SQL de Supabase

CREATE TABLE IF NOT EXISTS ai_verdicts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aire_id UUID NOT NULL REFERENCES aires(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  temperature DECIMAL(5,2),
  condition TEXT,
  city TEXT,
  is_vacances BOOLEAN DEFAULT false,
  products_count INTEGER DEFAULT 0,
  low_stocks_count INTEGER DEFAULT 0,
  total_loss DECIMAL(10,2) DEFAULT 0,
  expiring_count INTEGER DEFAULT 0,
  feedback TEXT CHECK (feedback IN ('positive', 'negative', NULL)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_aire_id ON ai_verdicts(aire_id);
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_created_at ON ai_verdicts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_feedback ON ai_verdicts(feedback) WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_verdicts_similar ON ai_verdicts(aire_id, is_vacances, created_at);

-- RLS (Row Level Security) - À adapter selon tes besoins
ALTER TABLE ai_verdicts ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir les verdicts de leur aire
CREATE POLICY "Users can view verdicts of their aire"
  ON ai_verdicts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.aire_id = ai_verdicts.aire_id
    )
  );

-- Politique : Les utilisateurs peuvent insérer des verdicts pour leur aire
CREATE POLICY "Users can insert verdicts for their aire"
  ON ai_verdicts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.aire_id = ai_verdicts.aire_id
    )
  );

-- Politique : Les utilisateurs peuvent mettre à jour le feedback des verdicts de leur aire
CREATE POLICY "Users can update feedback for their aire verdicts"
  ON ai_verdicts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.aire_id = ai_verdicts.aire_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.aire_id = ai_verdicts.aire_id
    )
  );

