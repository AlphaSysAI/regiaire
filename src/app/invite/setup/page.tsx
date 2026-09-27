'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Lock, Phone, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthBrand, AuthShell, Panel, PrimaryButton } from '@/components/ui/orbit';
import { defaultLandingPath, normalizeModules } from '@/lib/modules';

/**
 * Page d'activation : définir le mot de passe après clic sur le lien d'invitation.
 * Supabase recovery link pose la session (hash) avant redirection vers /invite/setup.
 */
export default function InviteSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Échanger le hash recovery si présent
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      if (hash.includes('access_token') || hash.includes('type=recovery')) {
        // supabase-js parse automatiquement le hash au démarrage
        await new Promise((r) => setTimeout(r, 200));
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Lien invalide ou expiré. Contactez OrbitAire pour une nouvelle invitation.');
        setChecking(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, full_name')
        .eq('id', session.user.id)
        .maybeSingle();

      setFirstName(profile?.first_name || '');
      setLastName(profile?.last_name || '');
      setPhone(profile?.phone || '');
      setChecking(false);
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Mot de passe : 8 caractères minimum');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        setError(pwError.message);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Session perdue');
        setLoading(false);
        return;
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error: profError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName,
          phone: phone.trim(),
          profile_completed: true,
          password_set_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profError) {
        setError(profError.message);
        setLoading(false);
        return;
      }

      const { data: refreshed } = await supabase
        .from('profiles')
        .select('enabled_modules')
        .eq('id', user.id)
        .single();

      const landing = defaultLandingPath(normalizeModules(refreshed?.enabled_modules));
      window.location.href = landing;
    } catch {
      setError('Une erreur est survenue');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <AuthShell>
        <Loader2 className="mx-auto animate-spin text-cyan-400" size={28} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthBrand />
      <Panel className="space-y-6 p-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Activez votre compte</h1>
          <p className="mt-1 text-xs text-slate-400">
            Vérifiez vos informations et choisissez votre mot de passe.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-center text-xs text-rose-400">
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                required
                placeholder="Prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-11 text-sm outline-none focus:border-cyan-400"
              />
            </div>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                required
                placeholder="Nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-11 text-sm outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
            <input
              required
              type="tel"
              placeholder="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-11 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
            <input
              required
              type="password"
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-11 text-sm outline-none focus:border-cyan-400"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
            <input
              required
              type="password"
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-11 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          <PrimaryButton type="submit" disabled={loading} className="h-14 w-full text-sm">
            {loading ? (
              <Loader2 className="animate-spin text-cyan-400" size={18} />
            ) : (
              <>
                Accéder à mon espace <ChevronRight size={16} />
              </>
            )}
          </PrimaryButton>
        </form>
      </Panel>
    </AuthShell>
  );
}
