import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  predictStationRevenue,
  type RevenueHistoryPoint,
  type RevenuePredictionResult,
} from '@/services/orbitaire/revenuePredictionEngine';
import {
  enrichCalendarDays,
  type CalendarDayInput,
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
 * POST /api/orbitaire/revenue
 * Body: { aire_id, plan_date?, horizon_days?, traffic_profile? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const aireId = body.aire_id as string | undefined;
    const planDate = (body.plan_date as string) || todayIso();
    const horizonDays = Math.min(31, Math.max(1, Number(body.horizon_days) || 7));
    const trafficProfile = body.traffic_profile ?? 'mixte';

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
    const historyStart = addDaysIso(planDate, -400);

    // Pagination ventes (CA)
    const salesRows: Array<{
      category: string | null;
      sale_date: string;
      revenue_ttc: number | null;
      revenue_ht: number | null;
      product_name: string | null;
    }> = [];
    const pageSize = 1000;
    let from = 0;
    for (let page = 0; page < 25; page += 1) {
      const { data, error } = await supabase
        .from('sales')
        .select('category, sale_date, revenue_ttc, revenue_ht, product_name')
        .eq('aire_id', aireId)
        .gte('sale_date', historyStart)
        .lte('sale_date', planDate)
        .order('sale_date', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!data?.length) break;
      salesRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const history: RevenueHistoryPoint[] = salesRows.map((row) => ({
      date: String(row.sale_date).slice(0, 10),
      category: row.category || 'Divers',
      revenueTtc: Number(row.revenue_ttc) || 0,
      revenueHt: Number(row.revenue_ht) || 0,
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
      (d: { date?: string; tempMax?: number; condition?: string; precipMm?: number }) => ({
        date: String(d.date).slice(0, 10),
        tempMaxC: typeof d.tempMax === 'number' ? d.tempMax : null,
        condition: d.condition,
        precipMm: typeof d.precipMm === 'number' ? d.precipMm : null,
        alertLevel: 'none' as const,
      })
    );

    const traffic: TrafficDayInput[] = (trafficJson.forecast || []).map(
      (d: { date?: string; trafficScore?: number }) => ({
        date: String(d.date).slice(0, 10),
        trafficScore: typeof d.trafficScore === 'number' ? d.trafficScore : null,
      })
    );
    if (trafficJson.current?.trafficScore != null) {
      traffic.push({ date: planDate, trafficScore: trafficJson.current.trafficScore });
    }

    const calendarRaw: CalendarDayInput[] = (vacancesJson.days || []).map(
      (d: { date?: string; isVacances?: boolean }) => ({
        date: String(d.date).slice(0, 10),
        isSchoolHoliday: !!d.isVacances,
      })
    );
    const calendar = enrichCalendarDays(calendarRaw);

    const prediction: RevenuePredictionResult = predictStationRevenue({
      planDate,
      horizonDays,
      history,
      weather,
      traffic,
      calendar,
      trafficProfile,
    });

    return NextResponse.json({
      success: true,
      aire: { id: aire.id, name: aire.name, city: aire.city },
      prediction,
      meta: {
        historyLines: history.length,
        limitations: [
          ...(history.length === 0 ? ['Aucune vente — baseline dégradée'] : []),
          ...(weather.length === 0 ? ['Météo indisponible'] : []),
          ...(traffic.length === 0 ? ['Trafic indisponible'] : []),
        ],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur prédiction CA';
    console.error('OrbitAire revenue error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
