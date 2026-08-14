'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Sparkles, TrendingUp, TrendingDown, Navigation, RefreshCw,
  Sun, CloudRain, Car, Trophy, AlertTriangle, Calendar, ShoppingBag, PackagePlus,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { checkVacancesStatus, getWeatherData } from '@/lib/intelligence';
import {
  parseAireCoords, aireDisplayLabel, type AireLocation,
} from '@/lib/aire-location';
import {
  PageShell, PageHeader, PageBody, Panel, PanelTitle, KpiTile, PrimaryButton,
} from '@/components/ui/orbit';

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const eur2 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const CAT_COLORS = ['#22d3ee', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#ef4444'];

function Delta({ v, className = '' }: { v: number | null | undefined; className?: string }) {
  if (v == null) return <span className={`text-slate-500 ${className}`}>—</span>;
  const up = v >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${up ? 'text-emerald-400' : 'text-rose-400'} ${className}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{v}%
    </span>
  );
}

function parseVerdict(text: string) {
  const tags = ['BILAN', 'LEVIERS', 'TRAFIC & MÉTÉO', "PLAN D'ACTION"];
  const out: { tag: string; body: string }[] = [];
  for (const tag of tags) {
    const re = new RegExp(`\\[${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*([\\s\\S]*?)(?=\\[[A-ZÀ-Ÿ' &]+\\]|$)`, 'i');
    const m = text.match(re);
    if (m && m[1].trim()) out.push({ tag, body: m[1].trim() });
  }
  if (out.length === 0 && text.trim()) out.push({ tag: 'SYNTHÈSE', body: text.trim() });
  return out;
}

export default function VerdictDetail() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [aireLabel, setAireLabel] = useState('');
  const [weather, setWeather] = useState({ temp: 15, condition: 'Clear', city: '' });
  const [traffic, setTraffic] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [verdict, setVerdict] = useState('');

  const load = async (aireId: string, location: AireLocation) => {
    setLoading(true);
    try {
      const city = aireDisplayLabel(location) || location.city || '';
      const [weatherData, vacances, trafficRes] = await Promise.all([
        (location.lat != null && location.lon != null)
          ? getWeatherData(location.lat, location.lon, location.city || undefined)
          : getWeatherData(undefined, undefined, city || undefined),
        checkVacancesStatus(),
        fetch(`/api/traffic?city=${encodeURIComponent(city)}&forecast=true`)
          .then(r => r.json())
          .catch(() => ({ current: { trafficLevel: 'normal', trafficScore: 50 }, forecast: [] })),
      ]);

      const trafficData = trafficRes.current || trafficRes;
      setWeather({ ...weatherData, city: city || weatherData.city });
      setTraffic(trafficData);

      const res = await fetch('/api/verdict-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aireId,
          city: city || weatherData.city,
          temp: weatherData.temp,
          condition: weatherData.condition,
          isVacances: vacances,
          traffic: trafficData,
          trafficForecast: trafficRes.forecast || [],
        }),
      });
      const data = await res.json();
      setAnalytics(data.analytics || null);
      setVerdict(data.verdict || '');
    } catch (e) {
      console.error(e);
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
        const location = parseAireCoords(profile.aires as any);
        setAireLabel(aireDisplayLabel(location));
        load(profile.aire_id, location);
      } else {
        setLoading(false);
      }
    })();
  }, [router]);

  const empty = analytics && analytics.empty;
  const kpis = analytics && !empty ? [
    { key: 'jour', label: "CA du jour", big: true, ...analytics.jour },
    { key: 'semaine', label: '7 jours', ...analytics.semaine },
    { key: 'm30', label: '30 jours', ...analytics.trente_jours },
    { key: 'mois', label: 'Mois en cours', ...analytics.mois_calendaire },
    { key: 'annee', label: 'Année glissante', ...analytics.annee },
  ] : [];

  const series = (analytics?.series || []).map((p: any) => ({
    date: new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    CA: p.ca,
    'N-1': p.ca_n1,
  }));
  const cats = (analytics?.categories || []).map((c: any) => ({ name: c.category, ca: c.ca }));
  const refDateStr = analytics?.ref_date
    ? new Date(analytics.ref_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <PageShell>
      <PageHeader
        title="Verdict"
        accent="IA"
        subtitle={aireLabel || weather.city || 'Tour de contrôle'}
        icon={Sparkles}
        backHref="/"
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
            {weather.condition === 'Rain' ? (
              <CloudRain size={14} className="text-sky-400" />
            ) : (
              <Sun size={14} className="text-amber-400" />
            )}
            <span className="text-sm font-bold tabular-nums">{Math.round(weather.temp)}°C</span>
          </div>
        }
      />

      <PageBody>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <RefreshCw size={28} className="animate-spin text-cyan-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Analyse du chiffre d&apos;affaires…
            </p>
          </div>
        )}

        {!loading && empty && (
          <Panel className="py-10 text-center">
            <ShoppingBag size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">Aucune donnée de vente</p>
            <p className="mt-2 text-xs text-slate-500">
              Les ventes seront disponibles après le premier import de caisse.
            </p>
          </Panel>
        )}

        {!loading && !empty && analytics && (
          <>
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar size={12} className="text-cyan-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Dernier jour clôturé — {refDateStr}
              </span>
              <Navigation size={10} className="ml-1 text-cyan-400" />
            </div>

            {/* VERDICT IA — hero cyan */}
            <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-600 to-cyan-800 p-6 shadow-xl shadow-cyan-950/30">
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-white/15 p-2 backdrop-blur-md">
                    <Sparkles size={16} className="animate-pulse text-white" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90">
                    Le conseil du jour
                  </span>
                </div>
                {parseVerdict(verdict).map((s, i) => (
                  <div key={i}>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/70">
                      {s.tag}
                    </p>
                    <p className="text-[13.5px] font-medium leading-relaxed text-white">{s.body}</p>
                  </div>
                ))}
                <PrimaryButton
                  onClick={() => router.push('/reappro')}
                  className="border-white/30 bg-white/15 text-white hover:bg-white/25"
                >
                  <PackagePlus size={14} />
                  Voir le plan de réappro
                </PrimaryButton>
              </div>
              <TrendingUp size={150} className="absolute -bottom-8 -right-8 rotate-6 text-white opacity-10" />
            </div>

            {kpis.filter(k => (k as any).big).map((k: any) => (
              <Panel key={k.key}>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  {k.label}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-bold tracking-tight text-white">{eur2(k.ca)}</p>
                  <div className="text-right">
                    <Delta v={k.delta_pct} className="text-lg" />
                    <p className="mt-1 text-[9px] font-medium text-slate-500">N-1 : {eur2(k.ca_n1)}</p>
                  </div>
                </div>
                {k.qty != null && (
                  <p className="mt-3 text-[10px] font-medium text-slate-400">{k.qty} articles vendus</p>
                )}
              </Panel>
            ))}

            <div className="grid grid-cols-2 gap-3">
              {kpis.filter(k => !(k as any).big).map((k: any) => (
                <KpiTile
                  key={k.key}
                  label={k.label}
                  tone="default"
                  value={
                    <span className="flex flex-col gap-0.5">
                      <span>{eur(k.ca)}</span>
                      <span className="flex items-center justify-between gap-2 text-[10px] font-medium">
                        <Delta v={k.delta_pct} className="text-[10px]" />
                        <span className="text-slate-600">N-1 {eur(k.ca_n1)}</span>
                      </span>
                    </span>
                  }
                />
              ))}
            </div>

            <Panel>
              <PanelTitle hint="Comparaison année précédente">
                CA quotidien — 30 jours vs N-1
              </PanelTitle>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#64748b' }} interval={5} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                    <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, fontSize: 11 }}
                      labelStyle={{ color: '#22d3ee', fontWeight: 700 }}
                      formatter={(v: any) => eur2(Number(v))}
                    />
                    <Line type="monotone" dataKey="N-1" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="CA" stroke="#22d3ee" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <div className="grid gap-4">
              <Panel>
                <div className="mb-4 flex items-center gap-2">
                  <Trophy size={14} className="text-emerald-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                    Meilleures ventes (30j)
                  </p>
                </div>
                <div className="space-y-3">
                  {(analytics.top || []).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-4 text-[10px] font-bold text-slate-600">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold">{p.name}</p>
                          <p className="text-[8px] font-semibold uppercase text-slate-500">
                            {p.category} · {p.qty} u.
                          </p>
                        </div>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="text-[12px] font-bold">{eur(p.ca)}</p>
                        <Delta v={p.delta_pct} className="text-[9px]" />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-rose-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                    À surveiller — ventes faibles (30j)
                  </p>
                </div>
                <div className="space-y-3">
                  {(analytics.flop || []).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold">{p.name}</p>
                        <p className="text-[8px] font-semibold uppercase text-slate-500">
                          {p.category} · {p.qty} u.
                        </p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="text-[12px] font-bold">{eur(p.ca)}</p>
                        <Delta v={p.delta_pct} className="text-[9px]" />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel>
              <PanelTitle hint="Répartition 30 jours">CA par catégorie</PanelTitle>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} width={82} />
                    <Tooltip
                      cursor={{ fill: '#1e293b55' }}
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, fontSize: 11 }}
                      formatter={(v: any) => eur2(Number(v))}
                    />
                    <Bar dataKey="ca" radius={[0, 8, 8, 0]}>
                      {cats.map((_: any, i: number) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            {traffic && (
              <Panel className="flex items-center gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <Car
                    size={20}
                    className={
                      traffic.trafficScore >= 80
                        ? 'text-rose-400'
                        : traffic.trafficScore >= 60
                          ? 'text-amber-400'
                          : 'text-slate-400'
                    }
                  />
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                    Trafic routier · TomTom / Bison Futé
                  </p>
                  <p className="text-sm font-semibold capitalize">
                    {traffic.trafficLevel}{' '}
                    <span className="text-[11px] text-slate-500">· score {traffic.trafficScore}/100</span>
                  </p>
                  {traffic.congestion && (
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">{traffic.congestion}</p>
                  )}
                </div>
              </Panel>
            )}
          </>
        )}
      </PageBody>
    </PageShell>
  );
}
