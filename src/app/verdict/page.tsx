'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown, Navigation, RefreshCw,
  Sun, CloudRain, Car, Trophy, AlertTriangle, Calendar, ShoppingBag,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { checkVacancesStatus, getWeatherData } from '@/lib/intelligence';
import {
  parseAireCoords, aireDisplayLabel, type AireLocation,
} from '@/lib/aire-location';

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const eur2 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const CAT_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#ef4444'];

function Delta({ v, className = '' }: { v: number | null | undefined; className?: string }) {
  if (v == null) return <span className={`text-slate-500 ${className}`}>—</span>;
  const up = v >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-black ${up ? 'text-green-500' : 'text-red-500'} ${className}`}>
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
    <div className="p-4 space-y-6 min-h-screen bg-slate-950 text-white pb-32 font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between pt-4">
        <button onClick={() => router.push('/')} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 active:scale-95 transition-all">
          <ArrowLeft size={18} className="text-slate-300" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-black uppercase italic tracking-tighter">Verdict <span className="text-orange-500">IA</span></h1>
          <div className="flex items-center gap-1.5 justify-center mt-1">
            <Navigation size={9} className="text-orange-500" />
            <span className="text-[9px] font-black uppercase text-slate-400 italic">{aireLabel || weather.city || '—'}</span>
          </div>
        </div>
        <div className="bg-slate-900 px-3 py-2 rounded-2xl border border-slate-800 flex items-center gap-2">
          {weather.condition === 'Rain' ? <CloudRain size={14} className="text-blue-400" /> : <Sun size={14} className="text-orange-500" />}
          <span className="text-[11px] font-black italic">{Math.round(weather.temp)}°C</span>
        </div>
      </header>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw size={28} className="text-orange-500 animate-spin" />
          <p className="text-[11px] font-black uppercase italic text-slate-500">Analyse du chiffre d'affaires…</p>
        </div>
      )}

      {!loading && empty && (
        <div className="bg-slate-900 rounded-[2rem] p-8 border border-slate-800 text-center">
          <ShoppingBag size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-black italic text-slate-300">Aucune donnée de vente</p>
          <p className="text-[11px] text-slate-500 mt-2">Les ventes seront disponibles après le premier import de caisse.</p>
        </div>
      )}

      {!loading && !empty && analytics && (
        <>
          {/* DATE DE RÉFÉRENCE */}
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={12} className="text-orange-500" />
            <span className="text-[10px] font-black uppercase italic">Dernier jour clôturé — {refDateStr}</span>
          </div>

          {/* VERDICT IA */}
          <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-[2.5rem] p-7 shadow-2xl relative overflow-hidden border-t border-white/20">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md"><Sparkles size={16} className="text-white animate-pulse" /></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 italic">Le conseil du jour</span>
              </div>
              {parseVerdict(verdict).map((s, i) => (
                <div key={i}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/70 italic mb-1">{s.tag}</p>
                  <p className="text-[13.5px] font-bold text-white leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
            <TrendingUp size={150} className="absolute -right-8 -bottom-8 opacity-10 text-white rotate-6" />
          </div>

          {/* KPI CA DU JOUR (grande carte) */}
          {kpis.filter(k => (k as any).big).map((k: any) => (
            <div key={k.key} className="bg-slate-900 rounded-[2.5rem] p-7 border border-slate-800 shadow-xl">
              <p className="text-[9px] font-black uppercase text-slate-500 italic mb-2">{k.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black italic tracking-tight">{eur2(k.ca)}</p>
                <div className="text-right">
                  <Delta v={k.delta_pct} className="text-lg" />
                  <p className="text-[9px] text-slate-500 font-bold mt-1">N-1 : {eur2(k.ca_n1)}</p>
                </div>
              </div>
              {k.qty != null && (
                <p className="text-[10px] text-slate-400 font-bold mt-3 italic">{k.qty} articles vendus</p>
              )}
            </div>
          ))}

          {/* KPI GRID (autres périodes) */}
          <div className="grid grid-cols-2 gap-3">
            {kpis.filter(k => !(k as any).big).map((k: any) => (
              <div key={k.key} className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg">
                <p className="text-[8px] font-black uppercase text-slate-500 italic mb-1">{k.label}</p>
                <p className="text-xl font-black italic">{eur(k.ca)}</p>
                <div className="flex items-center justify-between mt-1">
                  <Delta v={k.delta_pct} className="text-[11px]" />
                  <span className="text-[8px] text-slate-600 font-bold">N-1 {eur(k.ca_n1)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* COURBE CA 30J vs N-1 */}
          <div className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg">
            <p className="text-[9px] font-black uppercase text-slate-400 italic mb-4">CA quotidien — 30 jours vs année précédente</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#64748b' }} interval={5} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                  <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, fontSize: 11 }}
                    labelStyle={{ color: '#f97316', fontWeight: 800 }}
                    formatter={(v: any) => eur2(Number(v))}
                  />
                  <Line type="monotone" dataKey="N-1" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="CA" stroke="#f97316" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TOP / FLOP PRODUITS */}
          <div className="grid gap-4">
            <div className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={14} className="text-green-500" />
                <p className="text-[10px] font-black uppercase text-slate-300 italic">Meilleures ventes (30j)</p>
              </div>
              <div className="space-y-3">
                {(analytics.top || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] font-black text-slate-600 w-4">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold italic truncate">{p.name}</p>
                        <p className="text-[8px] text-slate-500 uppercase font-black">{p.category} · {p.qty} u.</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[12px] font-black italic">{eur(p.ca)}</p>
                      <Delta v={p.delta_pct} className="text-[9px]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={14} className="text-red-500" />
                <p className="text-[10px] font-black uppercase text-slate-300 italic">À surveiller — ventes faibles (30j)</p>
              </div>
              <div className="space-y-3">
                {(analytics.flop || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold italic truncate">{p.name}</p>
                      <p className="text-[8px] text-slate-500 uppercase font-black">{p.category} · {p.qty} u.</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[12px] font-black italic">{eur(p.ca)}</p>
                      <Delta v={p.delta_pct} className="text-[9px]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RÉPARTITION PAR CATÉGORIE */}
          <div className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg">
            <p className="text-[9px] font-black uppercase text-slate-400 italic mb-4">CA par catégorie — 30 jours</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} width={82} />
                  <Tooltip
                    cursor={{ fill: '#1e293b55' }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, fontSize: 11 }}
                    formatter={(v: any) => eur2(Number(v))}
                  />
                  <Bar dataKey="ca" radius={[0, 8, 8, 0]}>
                    {cats.map((_: any, i: number) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CONTEXTE TRAFIC */}
          {traffic && (
            <div className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg flex items-center gap-4">
              <div className="bg-slate-800 p-3 rounded-2xl">
                <Car size={20} className={traffic.trafficScore >= 80 ? 'text-red-500' : traffic.trafficScore >= 60 ? 'text-orange-500' : 'text-slate-400'} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500 italic">Trafic routier · TomTom / Bison Futé</p>
                <p className="text-sm font-black italic capitalize">{traffic.trafficLevel} <span className="text-slate-500 text-[11px]">· score {traffic.trafficScore}/100</span></p>
                {traffic.congestion && <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">{traffic.congestion}</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
