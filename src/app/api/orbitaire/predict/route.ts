import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  runPredictiveEngine,
  enrichCalendarDays,
  type CalendarDayInput,
  type PredictiveEngineOutput,
  type SalesHistoryPoint,
  type StockSnapshot,
  type TrafficDayInput,
  type WeatherDayInput,
} from '@/services/orbitaire/predictiveEngine';
import { parseAireCoords, weatherQueryParams, aireDisplayLabel } from '@/lib/aire-location';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * POST /api/orbitaire/predict
 * Body: { aire_id: string, plan_date?: string, horizon_days?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const aireId = body.aire_id as string | undefined;
    const planDate = (body.plan_date as string) || todayIso();
    const horizonDays = Math.min(31, Math.max(1, Number(body.horizon_days) || 7));

    if (!aireId) {
      return NextResponse.json({ success: false, error: 'aire_id requis' }, { status: 400 });
    }
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ success: false, error: 'Configuration Supabase manquante' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: aire, error: aireError } = await supabase
      .from('aires')
      .select('id, name, city, latitude, longitude')
      .eq('id', aireId)
      .single();

    if (aireError || !aire) {
      return NextResponse.json({ success: false, error: 'Aire introuvable' }, { status: 404 });
    }

    const location = parseAireCoords(aire);
    // 90 jours suffisent pour baseline + courbe (évite la troncature Supabase 1000 rows)
    const historyStart = addDaysIso(planDate, -90);

    const [productsRes, stocksRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, ean, name, category, min_threshold, lead_time_days')
        .eq('aire_id', aireId),
      supabase
        .from('product_stocks')
        .select('product_id, quantity')
        .eq('aire_id', aireId)
        .gt('quantity', 0),
    ]);

    // Pagination ventes : la limite défaut Supabase (1000) tronquait l'historique
    // et faisait tomber prédictions + ventes réelles à ~0.
    const salesRows: Array<{
      product_id: string | null;
      category: string | null;
      sale_date: string;
      quantity: number | null;
      revenue_ttc: number | null;
    }> = [];
    const pageSize = 1000;
    let from = 0;
    let salesError: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const { data, error } = await supabase
        .from('sales')
        .select('product_id, category, sale_date, quantity, revenue_ttc')
        .eq('aire_id', aireId)
        .gte('sale_date', historyStart)
        .lte('sale_date', planDate)
        .order('sale_date', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        salesError = error.message;
        break;
      }
      if (!data || data.length === 0) break;
      salesRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const salesRes = { data: salesRows, error: salesError };

    const stockByProduct = new Map<string, number>();
    for (const row of stocksRes.data || []) {
      stockByProduct.set(
        row.product_id,
        (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity)
      );
    }

    const stocks: StockSnapshot[] = (productsRes.data || []).map((p) => ({
      productId: p.id,
      ean: p.ean ?? undefined,
      name: p.name,
      category: p.category || 'Divers',
      currentStock: stockByProduct.get(p.id) ?? 0,
      minThreshold: p.min_threshold ?? undefined,
      leadTimeDays: p.lead_time_days ?? 2,
    }));

    // Focus: top sellers + low stock to keep payload actionable
    const salesQty = new Map<string, number>();
    for (const row of salesRes.data || []) {
      if (!row.product_id) continue;
      salesQty.set(row.product_id, (salesQty.get(row.product_id) ?? 0) + Number(row.quantity));
    }
    const topIds = [...salesQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([id]) => id);
    const lowStockIds = stocks
      .filter((s) => s.currentStock <= (s.minThreshold ?? 5))
      .map((s) => s.productId);
    const focus = new Set([...topIds, ...lowStockIds]);
    const focusedStocks =
      focus.size > 0 ? stocks.filter((s) => focus.has(s.productId) || s.currentStock > 0) : stocks;

    const salesHistory: SalesHistoryPoint[] = (salesRes.data || []).map((row) => ({
      date: String(row.sale_date).slice(0, 10),
      productId: row.product_id ?? undefined,
      category: row.category || 'Divers',
      quantity: Number(row.quantity) || 0,
      revenueTtc: Number(row.revenue_ttc) || 0,
    }));

    const wq = weatherQueryParams(location);
    const forecastQs = wq ? `?forecast=true&${wq}` : '?forecast=true';
    const city = aireDisplayLabel(location) || aire.city || aire.name || '';

    const origin = req.nextUrl.origin;
    const [weatherJson, trafficJson, vacancesJson] = await Promise.all([
      fetch(`${origin}/api/weather${forecastQs}`).then((r) => r.json()).catch(() => ({})),
      fetch(`${origin}/api/traffic?city=${encodeURIComponent(city)}&forecast=true`)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(`${origin}/api/vacances?start=${planDate}&days=${horizonDays}`)
        .then((r) => r.json())
        .catch(() => ({ days: [] })),
    ]);

    const weather: WeatherDayInput[] = (weatherJson.forecast || []).map(
      (d: {
        date?: string;
        tempMax?: number;
        tempMin?: number;
        condition?: string;
        precipMm?: number;
      }) => ({
        date: String(d.date).slice(0, 10),
        tempMaxC: typeof d.tempMax === 'number' ? d.tempMax : null,
        tempMinC: typeof d.tempMin === 'number' ? d.tempMin : null,
        condition: d.condition,
        precipMm: typeof d.precipMm === 'number' ? d.precipMm : null,
        alertLevel: 'none' as const,
      })
    );

    // Backfill past days with current temp if forecast only covers future
    if (typeof weatherJson.temp === 'number') {
      for (let i = 1; i <= 6; i += 1) {
        const date = addDaysIso(planDate, -i);
        if (!weather.find((w) => w.date === date)) {
          weather.push({
            date,
            tempMaxC: weatherJson.temp,
            condition: weatherJson.condition,
            alertLevel: 'none',
          });
        }
      }
    }

    const traffic: TrafficDayInput[] = (trafficJson.forecast || []).map(
      (d: { date?: string; trafficScore?: number }) => ({
        date: String(d.date).slice(0, 10),
        trafficScore: typeof d.trafficScore === 'number' ? d.trafficScore : null,
        lightVehicleShare: null,
        heavyVehicleShare: null,
      })
    );
    if (trafficJson.current?.trafficScore != null) {
      traffic.push({
        date: planDate,
        trafficScore: trafficJson.current.trafficScore,
      });
    }

    const calendarRaw: CalendarDayInput[] = (vacancesJson.days || []).map(
      (d: { date?: string; isVacances?: boolean }) => ({
        date: String(d.date).slice(0, 10),
        isSchoolHoliday: !!d.isVacances,
      })
    );
    // Past calendar approx for series
    for (let i = 1; i <= 6; i += 1) {
      const date = addDaysIso(planDate, -i);
      if (!calendarRaw.find((c) => c.date === date)) {
        calendarRaw.push({ date, isSchoolHoliday: false });
      }
    }
    const calendar = enrichCalendarDays(calendarRaw);

    const prediction: PredictiveEngineOutput = runPredictiveEngine({
      planDate,
      horizonDays,
      salesHistory,
      weather,
      traffic,
      calendar,
      stocks: focusedStocks.length > 0 ? focusedStocks : stocks.slice(0, 30),
      elasticity: {
        conversionLift: 0.28,
        fuelVolumeIndex: 1,
      },
    });

    return NextResponse.json({
      success: true,
      aire: { id: aire.id, name: aire.name, city: aire.city },
      prediction,
      limitations: [
        ...(salesRes.error ? [`Historique ventes: ${salesRes.error}`] : []),
        ...(salesHistory.length === 0 ? ['Aucune vente en base — baseline dégradée'] : []),
        ...(salesHistory.length > 0
          ? [`${salesHistory.length} lignes de ventes chargées (90 j)`]
          : []),
        ...(weather.length === 0 ? ['Prévisions météo indisponibles'] : []),
        ...(traffic.length === 0 ? ['Prévisions trafic indisponibles'] : []),
      ],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur moteur prédictif';
    console.error('OrbitAire predict error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
