'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, ChevronRight } from 'lucide-react';
import { AuthShell, AuthBrand, Panel, PrimaryButton } from '@/components/ui/orbit';

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
        setError("Identifiants invalides");
        setLoading(false);
        return;
      }

      if (data?.session) {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const destination =
          next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        window.location.href = destination;
      }
    } catch (err) {
      setError("Une erreur est survenue");
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthBrand />

      <Panel className="p-8 space-y-6">
        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium p-3 rounded-xl text-center">
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
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white shadow-inner"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white shadow-inner"
              />
            </div>
          </div>

          <PrimaryButton type="submit" disabled={loading} className="w-full h-14 text-sm">
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

      <p className="text-center text-slate-500 text-[10px] font-medium">
        Pas encore de compte ?{' '}
        <Link href="/auth" className="text-cyan-400 hover:text-cyan-300">
          Créer son compte
        </Link>
      </p>

      <p className="text-center text-slate-600 text-[9px] font-medium tracking-widest uppercase">
        Propulsé par OrbitAI Technology
      </p>
    </AuthShell>
  );
}
