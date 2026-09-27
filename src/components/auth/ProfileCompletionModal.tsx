'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/ui/orbit';

/**
 * Pop-up 1ʳᵉ connexion : vérifier / compléter les infos entreprise.
 * Affichée si profile_completed === false (après setup invite éventuellement déjà true).
 */
export default function ProfileCompletionModal() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'first_name, last_name, phone, company_name, profile_completed, role'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (!profile || profile.role === 'admin' || profile.profile_completed) return;

      setUserId(user.id);
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setPhone(profile.phone || '');
      setCompanyName(profile.company_name || '');
      setOpen(true);
    })();
  }, []);

  if (!open) return null;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);
    setError(null);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { error: updError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        phone: phone.trim(),
        company_name: companyName.trim(),
        profile_completed: true,
      })
      .eq('id', userId);

    setLoading(false);
    if (updError) {
      setError(updError.message);
      return;
    }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-white"
              style={{ fontFamily: 'var(--font-display), system-ui' }}
            >
              Vérifiez vos informations
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Complétez ou corrigez les données de votre entreprise avant de continuer.
            </p>
          </div>
          {/* Pas de fermeture libre : onboarding obligatoire — bouton X désactivé volontairement */}
          <span className="text-slate-700" aria-hidden>
            <X size={18} />
          </span>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}
          <input
            required
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
          />
          <input
            required
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
          />
          <input
            required
            placeholder="Entreprise"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
          />
          <input
            required
            type="tel"
            placeholder="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
          />
          <PrimaryButton type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Confirmer et continuer'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
