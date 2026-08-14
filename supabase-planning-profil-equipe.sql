-- Profil équipe pour la planification (jour / nuit / nuit_aprem)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profil_equipe VARCHAR(20) DEFAULT 'jour';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_profil_equipe_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_profil_equipe_check
  CHECK (profil_equipe IN ('jour', 'nuit', 'nuit_aprem'));

-- Données démo : Thomas = nuit strict, Amina = nuit + aprem occasionnels
UPDATE public.employees SET profil_equipe = 'nuit'
  WHERE prenom = 'Thomas' AND nom = 'Roux';
UPDATE public.employees SET profil_equipe = 'nuit_aprem'
  WHERE prenom = 'Amina' AND nom = 'Diallo';
UPDATE public.employees SET profil_equipe = 'jour'
  WHERE profil_equipe IS NULL OR profil_equipe NOT IN ('nuit', 'nuit_aprem');
