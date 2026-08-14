'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User, Mail, Lock, MapPin, Loader2, ChevronRight } from 'lucide-react';
import { AuthShell, AuthBrand, Panel, PrimaryButton } from '@/components/ui/orbit';

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

  const fieldClass =
    'w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white';

  return (
    <AuthShell>
      <AuthBrand subtitle="Créer un compte" />

      <Panel className="p-8 space-y-4">
        <form onSubmit={handleSignUp} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium p-3 rounded-xl text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium p-3 rounded-xl text-center">
              {success}
            </div>
          )}

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">
              Nom complet
            </span>
            <div className="relative mt-1">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jean Dupont"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">
              Email
            </span>
            <div className="relative mt-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">
              Aire
            </span>
            <div className="relative mt-1">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 z-10" size={18} />
              <select
                required
                disabled={loadingAires}
                value={aireId}
                onChange={(e) => setAireId(e.target.value)}
                className={`${fieldClass} appearance-none`}
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">
              Mot de passe
            </span>
            <div className="relative mt-1">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 caractères"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">
              Confirmer
            </span>
            <div className="relative mt-1">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répéter le mot de passe"
                className={fieldClass}
              />
            </div>
          </label>

          <PrimaryButton
            type="submit"
            disabled={loading || loadingAires}
            className="w-full h-14 text-sm mt-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Créer mon compte <ChevronRight size={16} />
              </>
            )}
          </PrimaryButton>
        </form>
      </Panel>

      <p className="text-center text-slate-500 text-[10px] font-medium">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-cyan-400 hover:text-cyan-300">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
