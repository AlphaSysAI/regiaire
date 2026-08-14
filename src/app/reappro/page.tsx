'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, PackagePlus, Navigation, RefreshCw, AlertTriangle,
  TrendingUp, Info, CalendarClock, Boxes,
} from 'lucide-react';
import {
  parseAireCoords, aireDisplayLabel, type AireLocation,
} from '@/lib/aire-location';
import {
  computeReplenishmentPlan, type ReplenishmentPlan, type ReplenishmentLine,
} from '@/lib/reappro/compute-plan';
import { todayIso } from '@/lib/reappro/iso-dates';

function daysUntil(dateIso: string): number {
  const today = new Date(todayIso() + 'T00:00:00Z').getTime();
  const target = new Date(dateIso + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

function UrgencyBadge({ orderByDate }: { orderByDate: string | null }) {
  if (!orderByDate) {
    return (
      <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-slate-800 text-slate-400">
        Pas d&apos;urgence
      </span>
    );
  }
  const delta = daysUntil(orderByDate);
  const label =
    delta <= 0 ? "À commander aujourd'hui" : delta === 1 ? 'À commander demain' : `À commander sous ${delta} j`;
  const color =
    delta <= 0 ? 'bg-red-600 text-white' : delta <= 2 ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300';
  return <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${color}`}>{label}</span>;
}

function ReplenishmentCard({ line }: { line: ReplenishmentLine }) {
  return (
    <div className="bg-slate-900 rounded-[2.2rem] p-6 border border-slate-800 shadow-lg space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase text-orange-500 tracking-widest mb-1">{line.category}</p>
          <h3 className="text-sm font-black uppercase italic text-white leading-tight truncate">{line.product.name}</h3>
          <p className="text-[9px] text-slate-500 font-bold mt-1">EAN {line.product.ean}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[8px] font-black uppercase text-slate-500 italic">Suggéré</p>
          <p className="text-2xl font-black italic text-orange-500">+{line.suggestedOrderQty}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 text-center">
          <p className="text-[8px] font-black uppercase text-slate-500 italic">Stock actuel</p>
          <p className="text-base font-black italic text-white">{line.currentStock}</p>
        </div>
        <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 text-center">
          <p className="text-[8px] font-black uppercase text-slate-500 italic">Demande 7j</p>
          <p className="text-base font-black italic text-white">{line.projectedDemand}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <UrgencyBadge orderByDate={line.orderByDate} />
        <span className="text-[8px] font-bold text-slate-600 uppercase">Délai fourniss. {line.leadTimeDays}j</span>
      </div>

      {line.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-800">
          {line.reasons.map((r) => (
            <span key={r} className="text-[8px] font-bold text-slate-400 bg-slate-800/70 px-2 py-1 rounded-lg">
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
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
      setError("Impossible de calculer le plan de réappro pour le moment.");
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

  return (
    <div className="p-4 space-y-6 min-h-screen bg-slate-950 text-white pb-32 font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between pt-4">
        <button onClick={() => router.push('/')} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 active:scale-95 transition-all">
          <ArrowLeft size={18} className="text-slate-300" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-black uppercase italic tracking-tighter">Réappro <span className="text-orange-500">IA</span></h1>
          <div className="flex items-center gap-1.5 justify-center mt-1">
            <Navigation size={9} className="text-orange-500" />
            <span className="text-[9px] font-black uppercase text-slate-400 italic">{aireLabel || '—'}</span>
          </div>
        </div>
        <button
          onClick={() => {
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
          }}
          className="p-3 bg-slate-900 rounded-2xl border border-slate-800 active:scale-95 transition-all"
        >
          <RefreshCw size={16} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw size={28} className="text-orange-500 animate-spin" />
          <p className="text-[11px] font-black uppercase italic text-slate-500">Calcul du plan de réappro…</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-6 text-center">
          <AlertTriangle size={28} className="text-red-500 mx-auto mb-2" />
          <p className="text-sm font-black italic text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && plan && (
        <>
          {/* SYNTHÈSE */}
          <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-[2.5rem] p-7 shadow-2xl relative overflow-hidden border-t border-white/20">
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md"><PackagePlus size={16} className="text-white" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 italic">Plan sur {plan.horizonDays} jours</span>
                </div>
                <p className="text-3xl font-black italic text-white">{plan.lines.length}</p>
                <p className="text-[10px] font-bold text-white/80 uppercase italic">Produit{plan.lines.length > 1 ? 's' : ''} à commander</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase text-white/70 italic">Unités suggérées</p>
                <p className="text-2xl font-black italic text-white">{totalSuggested}</p>
              </div>
            </div>
            <Boxes size={140} className="absolute -right-8 -bottom-8 opacity-10 text-white rotate-6" />
          </div>

          {/* LIGNES */}
          {plan.lines.length > 0 ? (
            <div className="space-y-4">
              {plan.lines.map((line) => (
                <ReplenishmentCard key={line.product.id} line={line} />
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-[2rem] p-8 border border-slate-800 text-center">
              <TrendingUp size={32} className="text-green-500 mx-auto mb-3" />
              <p className="text-sm font-black italic text-slate-300">Aucune commande urgente</p>
              <p className="text-[11px] text-slate-500 mt-2">Les stocks couvrent la demande projetée sur {plan.horizonDays} jours.</p>
            </div>
          )}

          {/* LIMITATIONS */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-5 flex gap-3">
            <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
            <ul className="space-y-1.5">
              {plan.limitations.map((l) => (
                <li key={l} className="text-[9px] text-slate-500 font-bold italic leading-relaxed">{l}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-slate-600">
            <CalendarClock size={11} />
            <span className="text-[9px] font-black uppercase italic">Basé sur les ventes jusqu&apos;au {new Date(plan.planDate).toLocaleDateString('fr-FR')}</span>
          </div>
        </>
      )}
    </div>
  );
}
