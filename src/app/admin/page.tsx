'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  Copy,
  Loader2,
  Mail,
  Phone,
  Shield,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MODULE_CATALOG, type ModuleKey } from '@/lib/modules';
import { PageBody, PageHeader, PageShell, Panel, PrimaryButton } from '@/components/ui/orbit';

type ClientRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  modules: ModuleKey[];
  profileCompleted: boolean;
  invitedAt: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [modules, setModules] = useState<ModuleKey[]>(['pilotage', 'stock']);

  const loadClients = useCallback(async () => {
    const res = await fetch('/api/admin/clients', { headers: await authHeaders() });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        router.push('/login?next=/admin');
        return;
      }
      setError(json.error || 'Chargement impossible');
      return;
    }
    setClients(json.clients || []);
    setReady(true);
  }, [router]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?next=/admin');
        return;
      }
      await loadClients();
    })();
  }, [loadClients, router]);

  const toggleModule = (key: ModuleKey) => {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInviteLink(null);
    setEmailNote(null);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          companyName,
          modules,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Création impossible');
        return;
      }
      setInviteLink(json.inviteLink || null);
      setEmailNote(
        json.emailSent
          ? 'Email d’invitation envoyé.'
          : `Email non envoyé (${json.emailError || 'Resend non configuré'}). Copiez le lien ci-dessous.`
      );
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setCompanyName('');
      setModules(['pilotage', 'stock']);
      await loadClients();
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
  };

  if (!ready && !error) {
    return (
      <PageShell>
        <PageBody className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-cyan-400" size={28} />
        </PageBody>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Admin"
        accent="OrbitAire"
        subtitle="Création clients · modules · invitations"
        icon={Shield}
      />
      <PageBody className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="text-cyan-400" size={18} />
            <h2 className="text-sm font-semibold text-white">Nouvel entreprise / client</h2>
          </div>
          <form onSubmit={onCreate} className="space-y-3">
            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
              />
              <input
                required
                placeholder="Nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                required
                placeholder="Nom de l’entreprise"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-500"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                required
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-500"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                required
                type="tel"
                placeholder="Téléphone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Modules / add-ons
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULE_CATALOG.map((mod) => {
                  const on = modules.includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggleModule(mod.key)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                        on
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        {on && <Check size={12} />}
                        {mod.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {mod.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <PrimaryButton type="submit" disabled={loading || modules.length === 0} className="w-full">
              {loading ? <Loader2 className="animate-spin" size={16} /> : 'Créer et inviter'}
            </PrimaryButton>
          </form>

          {(inviteLink || emailNote) && (
            <div className="mt-4 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              {emailNote && <p>{emailNote}</p>}
              {inviteLink && (
                <div className="flex items-start gap-2">
                  <code className="flex-1 break-all text-[10px] text-emerald-100/90">{inviteLink}</code>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="rounded-lg bg-emerald-500/20 p-2 hover:bg-emerald-500/30"
                    title="Copier le lien"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Clients</h2>
          <div className="space-y-3">
            {clients.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
              >
                <p className="font-semibold text-slate-100">
                  {c.companyName || '—'}
                </p>
                <p className="text-slate-400">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ')} · {c.email}
                </p>
                <p className="text-slate-500">{c.phone}</p>
                <p className="mt-2 text-[10px] text-slate-500">
                  Modules : {c.modules.join(', ') || 'aucun'}
                </p>
                <p className="text-[10px] text-slate-600">
                  {c.profileCompleted ? 'Profil complété' : 'En attente 1ʳᵉ connexion'}
                </p>
              </div>
            ))}
            {clients.length === 0 && (
              <p className="text-center text-slate-500 py-8">Aucun client pour l’instant</p>
            )}
          </div>
        </Panel>
      </PageBody>
    </PageShell>
  );
}
