'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, ChevronRight } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-500">
        
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">
            Régi<span className="text-orange-500 italic">Aire</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-2 italic">
            Accès Sécurisé
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase p-3 rounded-xl text-center">
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
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500 text-white shadow-inner"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500 text-white shadow-inner"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-white text-slate-950 h-14 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            {loading ? (
              <Loader2 className="animate-spin text-orange-500" size={18} />
            ) : (
              <>Se connecter <ChevronRight size={16} /></>
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 text-[10px] font-bold uppercase">
          Pas encore de compte ?{' '}
          <Link href="/auth" className="text-orange-500 hover:text-orange-400">
            Créer son compte
          </Link>
        </p>

        <p className="text-center text-slate-600 text-[9px] font-bold uppercase tracking-widest">
          Propulsé par OrbitAI Technology
        </p>
      </div>
    </div>
  );
}