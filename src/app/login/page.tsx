'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, ChevronRight } from 'lucide-react';
import { AuthShell, AuthBrand, Panel, PrimaryButton } from '@/components/ui/orbit';
import { defaultLandingPath, normalizeModules } from '@/lib/modules';
import { isAdminEmail } from '@/lib/admin-emails';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Identifiants invalides');
        setLoading(false);
        return;
      }

      if (data?.session?.user) {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        if (next && next.startsWith('/') && !next.startsWith('//')) {
          window.location.href = next;
          return;
        }

        if (isAdminEmail(data.session.user.email)) {
          window.location.href = '/admin';
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('enabled_modules, role, profile_completed, password_set_at')
          .eq('id', data.session.user.id)
          .maybeSingle();

        if (profile?.role === 'admin') {
          window.location.href = '/admin';
          return;
        }

        if (!profile?.password_set_at && !profile?.profile_completed) {
          window.location.href = '/invite/setup';
          return;
        }

        const mods = normalizeModules(profile?.enabled_modules);
        window.location.href = defaultLandingPath(mods);
      }
    } catch {
      setError('Une erreur est survenue');
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthBrand />

      <Panel className="space-y-6 p-8">
        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs font-medium text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="email"
                placeholder="Email Pro"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-12 text-sm text-white shadow-inner outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 pl-12 text-sm text-white shadow-inner outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
          </div>

          <PrimaryButton type="submit" disabled={loading} className="h-14 w-full text-sm">
            {loading ? (
              <Loader2 className="animate-spin text-cyan-400" size={18} />
            ) : (
              <>
                Se connecter <ChevronRight size={16} />
              </>
            )}
          </PrimaryButton>
        </form>
      </Panel>

      <p className="text-center text-[10px] font-medium text-slate-500">
        Accès sur invitation OrbitAire uniquement
      </p>

      <p className="text-center text-[9px] font-medium uppercase tracking-widest text-slate-600">
        Propulsé par OrbitAI Technology
      </p>
    </AuthShell>
  );
}
