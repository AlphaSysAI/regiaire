'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User, Mail, Lock, MapPin, Loader2, ChevronRight } from 'lucide-react';

type Aire = { id: string; name: string; city: string | null };

export default function AuthPage() {
  const router = useRouter();
  const [aires, setAires] = useState<Aire[]>([]);
  const [loadingAires, setLoadingAires] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [aireId, setAireId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/aires');
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Impossible de charger la liste des aires');
          return;
        }
        const list = json.aires ?? [];
        if (list.length === 0) {
          setError(
            'Aucune aire disponible. Exécutez supabase-fix-aires-inscription.sql dans Supabase.'
          );
          return;
        }
        setAires(list);
        if (list.length === 1) setAireId(list[0].id);
      } catch {
        setError('Impossible de charger la liste des aires');
      } finally {
        setLoadingAires(false);
      }
    })();
  }, []);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (!aireId) {
      setError("Sélectionnez votre aire d'autoroute");
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          aire_id: aireId,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          aire_id: aireId,
        })
        .eq('id', data.user.id);

      if (profileError) {
        console.error('Profil:', profileError);
      }
    }

    setLoading(false);

    if (data.session) {
      window.location.href = '/';
      return;
    }

    setSuccess(
      'Compte créé ! Si la confirmation email est activée, vérifiez votre boîte mail puis connectez-vous.'
    );
    setTimeout(() => router.push('/login'), 4000);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">
            Régi<span className="text-orange-500 italic">Aire</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-2 italic">
            Créer un compte
          </p>
        </div>

        <form
          onSubmit={handleSignUp}
          className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl space-y-4"
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase p-3 rounded-xl text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-black uppercase p-3 rounded-xl text-center">
              {success}
            </div>
          )}

          <label className="block">
            <span className="text-[9px] font-black uppercase text-slate-500 ml-1">Nom complet</span>
            <div className="relative mt-1">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase text-slate-500 ml-1">Email</span>
            <div className="relative mt-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase text-slate-500 ml-1">Aire</span>
            <div className="relative mt-1">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 z-10" size={18} />
              <select
                required
                disabled={loadingAires}
                value={aireId}
                onChange={(e) => setAireId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500 appearance-none"
              >
                <option value="">
                  {loadingAires ? 'Chargement…' : '— Choisir votre aire —'}
                </option>
                {aires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.city ? ` (${a.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase text-slate-500 ml-1">Mot de passe</span>
            <div className="relative mt-1">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 caractères"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase text-slate-500 ml-1">Confirmer</span>
            <div className="relative mt-1">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répéter le mot de passe"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-orange-500"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading || loadingAires}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white h-14 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 mt-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>Créer mon compte <ChevronRight size={16} /></>
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 text-[10px] font-bold uppercase">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-orange-500 hover:text-orange-400">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
