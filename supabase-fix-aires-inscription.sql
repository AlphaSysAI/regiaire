-- À exécuter dans Supabase SQL Editor si les aires n'apparaissent pas sur /auth
-- Cause : RLS bloquait la lecture sans session utilisateur

DROP POLICY IF EXISTS "Public can list aires for signup" ON public.aires;

CREATE POLICY "Public can list aires for signup"
  ON public.aires
  FOR SELECT
  USING (true);
