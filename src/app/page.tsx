'use client';

import { useEffect, useState, useTransition, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Sun,
  CloudRain,
  Navigation,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Truck,
  ScanLine,
  ClipboardCheck,
  X,
  FileText,
  PackagePlus,
  Gauge,
  TrendingUp,
  Zap,
  CheckCircle2,
  CircleAlert,
  ShieldAlert,
  MapPin,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import IAUpload from '@/components/IAUpload';
import OrderMatrix from '@/components/orbitaire/OrderMatrix';
import { IconButton } from '@/components/ui/IconButton';
import { checkVacancesStatus, getWeatherData } from '@/lib/intelligence';
import {
  parseAireCoords,
  aireDisplayLabel,
  type AireLocation,
} from '@/lib/aire-location';
import type { PredictiveEngineOutput } from '@/services/orbitaire/predictiveEngine';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type AireOption = { id: string; name: string; city: string | null };
type ChartHorizon = 'daily' | 'hourly' | 'monthly';

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [predictLoading, setPredictLoading] = useState(false);
  const [weather, setWeather] = useState({ temp: 15, condition: 'Clear', city: '' });
  const [aireLabel, setAireLabel] = useState('');
  const [aireLocation, setAireLocation] = useState<AireLocation>({});
  const [stats, setStats] = useState({ totalLoss: 0, expiringCount: 0, pendingBLCount: 0 });
  const [selectedAire, setSelectedAire] = useState<string | null>(null);
  const [aires, setAires] = useState<AireOption[]>([]);
  const [prediction, setPrediction] = useState<PredictiveEngineOutput | null>(null);
  const [revenueForecast, setRevenueForecast] = useState<{
    todayTtc: number;
    horizonTtc: number;
    vsJ7Pct: number | null;
    topDriver: string | null;
  } | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [chartHorizon, setChartHorizon] = useState<ChartHorizon>('daily');
  const [showBLList, setShowBLList] = useState(false);
  const [pendingGroups, setPendingGroups] = useState<
    Array<{ id: string; count: number; time: string; date: string }>
  >([]);
  const [, startUiTransition] = useTransition();

  const loadPrediction = async (aireId: string) => {
    setPredictLoading(true);
    setPredictError(null);
    try {
      const [stockRes, revenueRes] = await Promise.all([
        fetch('/api/orbitaire/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aire_id: aireId, horizon_days: 7 }),
        }),
        fetch('/api/orbitaire/revenue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aire_id: aireId, horizon_days: 7 }),
        }),
      ]);
      const data = await stockRes.json();
      if (!stockRes.ok || !data.success) {
        throw new Error(data.error || 'Échec du moteur prédictif');
      }

      const revenueData = await revenueRes.json().catch(() => null);
      startTransition(() => {
        setPrediction(data.prediction as PredictiveEngineOutput);

        if (revenueData?.success && revenueData.prediction?.days?.[0]) {
          const day0 = revenueData.prediction.days[0];
          setRevenueForecast({
            todayTtc: day0.predictedTotalRevenue.ttc,
            horizonTtc: revenueData.prediction.horizonTotal.ttc,
            vsJ7Pct: day0.comparison?.vsJ7?.pct ?? null,
            topDriver: day0.driverFactors?.[0]?.label ?? null,
          });
        } else {
          setRevenueForecast(null);
        }
      });
    } catch (err) {
      setPredictError(err instanceof Error ? err.message : 'Erreur prédiction');
    } finally {
      setPredictLoading(false);
    }
  };

  const runCoreLogic = async (aireId: string, location: AireLocation = {}) => {
    setLoading(true);
    try {
      const dateLimiteStr = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

      const weatherPromise = (() => {
        if (location.lat != null && location.lon != null) {
          return getWeatherData(location.lat, location.lon, location.city || undefined);
        }
        const city = location.city || location.name;
        if (city) return getWeatherData(undefined, undefined, city);
        return Promise.resolve({
          temp: 15,
          condition: 'Clear',
          description: 'ciel dégagé',
          city: '',
        });
      })();

      const [weatherData, , wasteRes, expiringRes, pendingRes] = await Promise.all([
        weatherPromise,
        checkVacancesStatus(),
        supabase.from('waste_logs').select('cost_loss').eq('aire_id', aireId),
        supabase
          .from('product_stocks')
          .select('*, products(name)')
          .eq('aire_id', aireId)
          .lte('expiry_date', dateLimiteStr)
          .gt('quantity', 0),
        supabase
          .from('pending_deliveries')
          .select('*')
          .eq('aire_id', aireId)
          .eq('status', 'pending'),
      ]);

      setWeather({
        ...weatherData,
        city: aireDisplayLabel(location) || weatherData.city,
      });

      const totalLoss = (wasteRes.data || []).reduce(
        (acc, curr) => acc + (Number(curr.cost_loss) || 0),
        0
      );

      let groupsArray: Array<{ id: string; count: number; time: string; date: string }> = [];
      if (pendingRes.data) {
        const groups = pendingRes.data.reduce((acc: Record<string, (typeof groupsArray)[0]>, item) => {
          const id = item.delivery_group_id || 'sans-id';
          if (!acc[id]) {
            acc[id] = {
              id,
              count: 0,
              time: new Date(item.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              date: new Date(item.created_at).toLocaleDateString('fr-FR'),
            };
          }
          acc[id].count++;
          return acc;
        }, {});
        groupsArray = Object.values(groups);
        setPendingGroups(groupsArray);
      }

      setStats({
        totalLoss,
        expiringCount: (expiringRes.data || []).length,
        pendingBLCount: groupsArray.length,
      });

      await loadPrediction(aireId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const [{ data: profile }, airesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('aire_id, aires(id, name, city, latitude, longitude)')
          .eq('id', user.id)
          .single(),
        fetch('/api/aires').then((r) => r.json()).catch(() => ({ aires: [] })),
      ]);

      setAires((airesRes.aires || []) as AireOption[]);

      if (profile?.aire_id) {
        const location = parseAireCoords(
          profile.aires as {
            latitude?: number | null;
            longitude?: number | null;
            city?: string | null;
            name?: string | null;
          } | null
        );
        setAireLabel(aireDisplayLabel(location));
        setAireLocation(location);
        setSelectedAire(profile.aire_id);
        runCoreLogic(profile.aire_id, location);
      }
    }
    init();
  }, [router]);

  const onSelectAire = async (aireId: string) => {
    setSelectedAire(aireId);
    const aire = aires.find((a) => a.id === aireId);
    const location: AireLocation = {
      name: aire?.name,
      city: aire?.city || undefined,
    };
    setAireLabel(aireDisplayLabel(location) || aire?.name || '');
    setAireLocation(location);
    startUiTransition(() => {
      void runCoreLogic(aireId, location);
    });
  };

  const chartData = (() => {
    if (!prediction) return [];
    if (chartHorizon === 'hourly') {
      const today = prediction.series.find((s) => s.date === prediction.planDate);
      const base = Math.max(today?.predictedSales ?? 0, 40);
      return [8, 10, 11, 12, 14, 16, 18, 20].map((h) => {
        const peak = h >= 11 && h <= 15 ? 1.35 : h >= 17 && h <= 19 ? 1.15 : 0.7;
        const pred = Math.round(base * peak * 0.12 * 10) / 10;
        return {
          label: `${h}h`,
          predicted: pred,
          actual: null as number | null,
          low: Math.max(0, pred * 0.88),
          band: pred * 0.24,
          traffic: today?.trafficIndex ?? 50,
        };
      });
    }
    if (chartHorizon === 'monthly') {
      const byWeek: Record<string, { predicted: number; actual: number; n: number }> = {};
      prediction.series.forEach((s, idx) => {
        const week = `S${Math.floor(idx / 7) + 1}`;
        if (!byWeek[week]) byWeek[week] = { predicted: 0, actual: 0, n: 0 };
        byWeek[week].predicted += s.predictedSales;
        byWeek[week].actual += s.actualSales ?? 0;
        byWeek[week].n += 1;
      });
      return Object.entries(byWeek).map(([label, v]) => {
        const predicted = Math.round(v.predicted);
        const low = Math.round(predicted * 0.88);
        return {
          label,
          predicted,
          actual: v.actual > 0 ? Math.round(v.actual) : null,
          low,
          band: Math.max(1, Math.round(predicted * 0.24)),
          traffic: 55,
        };
      });
    }
    return prediction.series.map((s) => {
      const low = s.confidenceLow;
      const high = s.confidenceHigh;
      return {
        label: formatShortDate(s.date),
        predicted: s.predictedSales,
        actual: s.actualSales,
        low,
        band: Math.max(0, high - low),
        traffic: s.trafficIndex,
      };
    });
  })();

  const kpis = prediction?.kpis;
  const alertTone =
    kpis?.ruptureAlertLevel === 'red'
      ? 'border-rose-500/50 bg-rose-500/10'
      : kpis?.ruptureAlertLevel === 'amber'
        ? 'border-amber-500/50 bg-amber-500/10'
        : 'border-emerald-500/40 bg-emerald-500/10';

  return (
    <div className="relative min-h-screen pb-28 text-slate-100">
      {/* TOP BAR */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <h1
                className="font-display text-2xl font-bold tracking-tight text-white"
                style={{ fontFamily: 'var(--font-display), system-ui' }}
              >
                Orbit<span className="text-cyan-400">Aire</span>
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Tour de contrôle d&apos;exploitation
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 sm:flex">
              <MapPin size={14} className="text-cyan-400" />
              <select
                value={selectedAire ?? ''}
                onChange={(e) => onSelectAire(e.target.value)}
                className="max-w-[200px] bg-transparent text-xs font-semibold text-slate-200 outline-none"
              >
                {aires.length === 0 && (
                  <option value={selectedAire ?? ''}>{aireLabel || 'Site'}</option>
                )}
                {aires.map((a) => (
                  <option key={a.id} value={a.id} className="bg-slate-900">
                    {a.name}
                    {a.city ? ` — ${a.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`rounded-xl border px-3 py-2 ${alertTone}`}>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Service J+7
              </p>
              <p className="text-lg font-bold tabular-nums">
                {kpis ? `${kpis.serviceRateJ7Pct}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Alerte rupture
              </p>
              <p className="flex items-center gap-1 text-lg font-bold tabular-nums">
                <ShieldAlert
                  size={16}
                  className={
                    kpis?.ruptureAlertLevel === 'red'
                      ? 'text-rose-400'
                      : kpis?.ruptureAlertLevel === 'amber'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }
                />
                {kpis?.ruptureRiskCount ?? '—'}
              </p>
            </div>
            <div
              className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2"
              title={revenueForecast?.topDriver ?? undefined}
            >
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                CA prévu J
              </p>
              <p className="text-lg font-bold tabular-nums text-cyan-300">
                {revenueForecast
                  ? `${Math.round(revenueForecast.todayTtc).toLocaleString('fr-FR')}€`
                  : kpis
                    ? `+${kpis.capturedRevenueOpportunityEur}€`
                    : '—'}
              </p>
              {revenueForecast?.vsJ7Pct != null && (
                <p
                  className={`text-[10px] tabular-nums ${
                    revenueForecast.vsJ7Pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {revenueForecast.vsJ7Pct >= 0 ? '+' : ''}
                  {revenueForecast.vsJ7Pct}% vs J-7
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
              {weather.condition === 'Rain' ? (
                <CloudRain size={14} className="text-sky-400" />
              ) : (
                <Sun size={14} className="text-amber-400" />
              )}
              <span className="text-sm font-bold">{Math.round(weather.temp)}°C</span>
              <IconButton
                label="Rafraîchir"
                variant="neutral"
                size="sm"
                disabled={loading || predictLoading}
                onClick={() => selectedAire && runCoreLogic(selectedAire, aireLocation)}
                className="ml-1"
              >
                <RefreshCw
                  size={14}
                  className={loading || predictLoading ? 'animate-spin' : ''}
                />
              </IconButton>
            </div>
          </div>
        </div>

        {/* Mobile site selector */}
        <div className="border-t border-slate-800/60 px-4 py-2 sm:hidden">
          <select
            value={selectedAire ?? ''}
            onChange={(e) => onSelectAire(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
          >
            {aires.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.city ? ` — ${a.city}` : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-12">
        {/* CHART */}
        <section className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-cyan-950/20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                className="text-base font-semibold text-white"
                style={{ fontFamily: 'var(--font-display), system-ui' }}
              >
                Trafic & ventes vs modèle OrbitAire
              </h2>
              <p className="text-xs text-slate-400">
                Intervalle de confiance ±12 % · fiabilité globale{' '}
                {kpis?.overallConfidencePct ?? '—'}%
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
              {(
                [
                  ['hourly', 'Horaire'],
                  ['daily', 'J+7'],
                  ['monthly', 'Mensuel'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChartHorizon(key)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                    chartHorizon === key
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            {predictLoading && !prediction ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Calcul du modèle prédictif…
              </div>
            ) : predictError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-300">
                <AlertTriangle size={18} />
                {predictError}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    domain={[0, (dataMax: number) => Math.max(dataMax * 1.15, 10)]}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 12,
                    }}
                    formatter={(value, name) => {
                      if (name === 'Intervalle' || value == null) return [null, null];
                      const n = typeof value === 'number' ? value : Number(value);
                      return [Number.isFinite(n) ? Math.round(n) : value, String(name)];
                    }}
                  />
                  <Legend />
                  {/* Bande de confiance = low (invisible) + band (high-low) empilés */}
                  <Area
                    type="monotone"
                    dataKey="low"
                    stackId="conf"
                    stroke="none"
                    fill="transparent"
                    name="_"
                    legendType="none"
                    tooltipType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="band"
                    stackId="conf"
                    stroke="none"
                    fill="url(#bandFill)"
                    name="Intervalle"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Prédiction OrbitAire"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Ventes réelles"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#f59e0b' }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* CONTEXT WIDGETS */}
        <aside className="lg:col-span-4 flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              <h3
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-display), system-ui' }}
              >
                Choc de demande
              </h3>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(prediction?.demandShocks ?? []).length === 0 && (
                <p className="text-xs text-slate-500">Aucun choc majeur sur J+7.</p>
              )}
              {(prediction?.demandShocks ?? []).map((shock) => (
                <div
                  key={`${shock.date}-${shock.title}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{shock.title}</p>
                    <span className="text-[10px] font-bold text-amber-300">+{shock.impactPct}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{formatShortDate(shock.date)}</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    {shock.drivers.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks size={16} className="text-cyan-400" />
              <h3
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-display), system-ui' }}
              >
                Checklist opérationnelle
              </h3>
            </div>
            <ul className="space-y-2">
              {(prediction?.checklist ?? []).map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex items-center gap-2">
                    {item.priority === 'high' ? (
                      <CircleAlert size={14} className="text-rose-400" />
                    ) : (
                      <CheckCircle2 size={14} className="text-cyan-400" />
                    )}
                    <p className="text-xs font-semibold">{item.title}</p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                </li>
              ))}
              {!prediction && (
                <li className="text-xs text-slate-500">En attente du moteur…</li>
              )}
            </ul>
          </div>
        </aside>

        <OrderMatrix
          stationId={selectedAire}
          planDate={prediction?.planDate ?? null}
          recommendations={prediction?.recommendations ?? []}
          predictLoading={predictLoading}
        />

        {/* OPS SHORTCUTS */}
        <section className="lg:col-span-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.pendingBLCount > 0 && (
            <button
              type="button"
              onClick={() => setShowBLList(true)}
              className="flex items-center justify-between rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-left transition hover:bg-sky-500/15"
            >
              <div className="flex items-center gap-3">
                <ClipboardCheck className="text-sky-300" size={20} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-200/80">
                    Arrivages
                  </p>
                  <p className="text-sm font-semibold">
                    {stats.pendingBLCount} BL à pointer
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-sky-300/60" />
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push('/reappro')}
            className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-cyan-500/40"
          >
            <PackagePlus className="text-cyan-400" size={20} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Réappro
              </p>
              <p className="text-sm font-semibold">Plan 7 jours</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push('/scanner')}
            className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-cyan-500/40"
          >
            <ScanLine className="text-cyan-400" size={20} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Stocks
              </p>
              <p className="text-sm font-semibold">Scanner & inventaire</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push('/verdict')}
            className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-cyan-500/40"
          >
            <Sparkles className="text-amber-400" size={20} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Verdict
              </p>
              <p className="text-sm font-semibold">Analyse détaillée</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push('/livraisons')}
            className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-cyan-500/40"
          >
            <Truck className="text-slate-400" size={20} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Archives
              </p>
              <p className="text-sm font-semibold">Historique livraisons</p>
            </div>
          </button>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <Gauge className="text-emerald-400" size={20} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                AntiGaspi
              </p>
              <p className="text-sm font-semibold">
                {stats.expiringCount} DLC · -{stats.totalLoss.toFixed(0)}€
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:col-span-2">
            <TrendingUp className="text-cyan-400" size={20} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Site actif
              </p>
              <p className="truncate text-sm font-semibold">
                <Navigation size={12} className="mr-1 inline text-cyan-400" />
                {aireLabel || weather.city || '—'}
              </p>
            </div>
          </div>
        </section>

        {selectedAire && (
          <section className="lg:col-span-12 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Documents & arrivages
            </p>
            <IAUpload
              aireId={selectedAire}
              onComplete={() => selectedAire && runCoreLogic(selectedAire, aireLocation)}
            />
          </section>
        )}
      </div>

      {showBLList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: 'var(--font-display), system-ui' }}
              >
                Livraisons en attente
              </h2>
              <button
                type="button"
                onClick={() => setShowBLList(false)}
                className="rounded-xl bg-slate-800 p-2 text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {pendingGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => router.push(`/reception-bl?group=${group.id}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 text-left hover:border-sky-500/50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="text-sky-400" size={18} />
                    <div>
                      <p className="text-[10px] uppercase text-slate-500">Reçu à {group.time}</p>
                      <p className="text-sm font-semibold">#{group.id.slice(0, 6)}</p>
                      <p className="text-[10px] text-sky-400">{group.count} articles</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
