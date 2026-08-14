'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  PackagePlus, RefreshCw, AlertTriangle,
  TrendingUp, Info, CalendarClock,
} from 'lucide-react';
import {
  parseAireCoords, aireDisplayLabel, type AireLocation,
} from '@/lib/aire-location';
import {
  computeReplenishmentPlan, type ReplenishmentPlan, type ReplenishmentLine,
} from '@/lib/reappro/compute-plan';
import { todayIso } from '@/lib/reappro/iso-dates';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  PanelTitle,
  KpiTile,
} from '@/components/ui/orbit';

function daysUntil(dateIso: string): number {
  const today = new Date(todayIso() + 'T00:00:00Z').getTime();
  const target = new Date(dateIso + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

function UrgencyBadge({ orderByDate }: { orderByDate: string | null }) {
  if (!orderByDate) {
    return (
      <span className="rounded-lg bg-slate-800 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        Pas d&apos;urgence
      </span>
    );
  }
  const delta = daysUntil(orderByDate);
  const label =
    delta <= 0 ? "À commander aujourd'hui" : delta === 1 ? 'À commander demain' : `À commander sous ${delta} j`;
  const color =
    delta <= 0
      ? 'bg-rose-600 text-white'
      : delta <= 2
        ? 'bg-amber-500/80 text-white'
        : 'bg-slate-800 text-slate-300';
  return (
    <span className={`rounded-lg px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}

function ReplenishmentCard({ line }: { line: ReplenishmentLine }) {
  return (
    <Panel className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-400">
            {line.category}
          </p>
          <h3
            className="truncate text-sm font-semibold leading-tight text-white"
            style={{ fontFamily: 'var(--font-display), system-ui' }}
          >
            {line.product.name}
          </h3>
          <p className="mt-1 text-[10px] font-medium text-slate-500">EAN {line.product.ean}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Suggéré</p>
          <p className="text-2xl font-bold tabular-nums text-cyan-400">+{line.suggestedOrderQty}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Stock actuel</p>
          <p className="text-base font-bold tabular-nums text-white">{line.currentStock}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Demande 7j</p>
          <p className="text-base font-bold tabular-nums text-white">{line.projectedDemand}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <UrgencyBadge orderByDate={line.orderByDate} />
        <span className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
          Délai fourniss. {line.leadTimeDays}j
        </span>
      </div>

      {line.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {line.reasons.map((r) => (
            <span
              key={r}
              className="rounded-lg bg-slate-800/70 px-2 py-1 text-[9px] font-medium text-slate-400"
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function ReapproPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aireLabel, setAireLabel] = useState('');
  const [plan, setPlan] = useState<ReplenishmentPlan | null>(null);

  const load = async (aireId: string, location: AireLocation) => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeReplenishmentPlan(aireId, location);
      setPlan(result);
    } catch (err) {
      console.error(err);
      setError('Impossible de calculer le plan de réappro pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data: profile } = await supabase
        .from('profiles')
        .select('aire_id, aires(id, name, city, latitude, longitude)')
        .eq('id', user.id)
        .single();

      if (profile?.aire_id) {
        const location = parseAireCoords(profile.aires as {
          latitude?: number | null; longitude?: number | null; city?: string | null; name?: string | null;
        } | null);
        setAireLabel(aireDisplayLabel(location));
        load(profile.aire_id, location);
      } else {
        setLoading(false);
      }
    })();
  }, [router]);

  const totalSuggested = plan?.lines.reduce((sum, l) => sum + l.suggestedOrderQty, 0) ?? 0;

  const refresh = () => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('aire_id, aires(id, name, city, latitude, longitude)')
        .eq('id', user.id)
        .single();
      if (profile?.aire_id) {
        const location = parseAireCoords(profile.aires as {
          latitude?: number | null; longitude?: number | null; city?: string | null; name?: string | null;
        } | null);
        load(profile.aire_id, location);
      }
    })();
  };

  return (
    <PageShell>
      <PageHeader
        title="Réappro"
        accent="IA"
        subtitle={aireLabel || 'Plan de commande'}
        icon={PackagePlus}
        backHref="/"
        actions={
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      <PageBody>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <RefreshCw size={28} className="animate-spin text-cyan-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Calcul du plan de réappro…
            </p>
          </div>
        )}

        {!loading && error && (
          <Panel className="border-rose-500/30 bg-rose-500/10 text-center">
            <AlertTriangle size={28} className="mx-auto mb-2 text-rose-400" />
            <p className="text-sm font-semibold text-rose-300">{error}</p>
          </Panel>
        )}

        {!loading && !error && plan && (
          <>
            <Panel className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 to-slate-900/80">
              <PanelTitle hint={`Horizon ${plan.horizonDays} jours`}>Synthèse commande</PanelTitle>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile
                  label="Produits à commander"
                  value={plan.lines.length}
                  tone="cyan"
                />
                <KpiTile
                  label="Unités suggérées"
                  value={totalSuggested}
                  tone="default"
                />
              </div>
            </Panel>

            {plan.lines.length > 0 ? (
              <div className="space-y-3">
                {plan.lines.map((line) => (
                  <ReplenishmentCard key={line.product.id} line={line} />
                ))}
              </div>
            ) : (
              <Panel className="text-center">
                <TrendingUp size={32} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm font-semibold text-slate-200">Aucune commande urgente</p>
                <p className="mt-2 text-xs text-slate-500">
                  Les stocks couvrent la demande projetée sur {plan.horizonDays} jours.
                </p>
              </Panel>
            )}

            <Panel className="flex gap-3 bg-slate-900/40">
              <Info size={16} className="mt-0.5 shrink-0 text-slate-500" />
              <ul className="space-y-1.5">
                {plan.limitations.map((l) => (
                  <li key={l} className="text-[11px] leading-relaxed text-slate-500">
                    {l}
                  </li>
                ))}
              </ul>
            </Panel>

            <div className="flex items-center justify-center gap-1.5 text-slate-600">
              <CalendarClock size={11} />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Basé sur les ventes jusqu&apos;au {new Date(plan.planDate).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </>
        )}
      </PageBody>
    </PageShell>
  );
}
