-- Script pour modifier la table employees pour permettre plusieurs quarts préférés
-- À exécuter dans Supabase SQL Editor

-- 1. Ajouter une nouvelle colonne temporaire pour les quarts préférés multiples
ALTER TABLE employees ADD COLUMN IF NOT EXISTS quart_prefere_multiple TEXT[];

-- 2. Migrer les données existantes (convertir le VARCHAR en array)
UPDATE employees 
SET quart_prefere_multiple = CASE 
  WHEN quart_prefere IS NOT NULL THEN ARRAY[quart_prefere]
  ELSE NULL
END;

-- 3. Supprimer l'ancienne colonne
ALTER TABLE employees DROP COLUMN IF EXISTS quart_prefere;

-- 4. Renommer la nouvelle colonne
ALTER TABLE employees RENAME COLUMN quart_prefere_multiple TO quart_prefere;

-- 5. Ajouter une contrainte pour vérifier que les valeurs sont valides
ALTER TABLE employees ADD CONSTRAINT check_quart_prefere 
  CHECK (quart_prefere IS NULL OR 
         (array_length(quart_prefere, 1) > 0 AND 
          quart_prefere <@ ARRAY['6-14', '14-22', '22-6']::TEXT[]));

-- Vérification
SELECT 
  id, 
  nom, 
  prenom, 
  quart_prefere,
  quart_obligatoire
FROM employees 
LIMIT 5;

