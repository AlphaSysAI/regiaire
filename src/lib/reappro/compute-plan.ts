/* =========================
   Moteur de réappro — plan de commande sur 7 jours
   Porté depuis le moteur "réappro v2" d'OrbitAire (multiplicateurs météo /
   affluence / vacances) et adapté à la structure mono-aire d'OrbitAire :
   pas de fournisseurs multiples, pas de zone Bison Futé admin — on réutilise
   les signaux déjà présents dans OrbitAire (météo OWM, trafic TomTom/estimé,
   vacances scolaires) sur tout l'horizon plutôt que sur la seule journée.
========================= */

import { supabase } from '@/lib/supabase';
import { addDaysIso, dateWindowEnding, getIsoWeekAndWeekday, todayIso } from './iso-dates';
import { getCategoryMultipliersForDay, type DayDemandContext } from './demand-multipliers';
import { weatherQueryParams, aireDisplayLabel, type AireLocation } from '@/lib/aire-location';

export const REAPPRO_HORIZON_DAYS = 7;
export const REAPPRO_BASELINE_WEEKS = 12;
export const REAPPRO_TOP_SELLERS_PER_CATEGORY = 3;
export const REAPPRO_SAFETY_MARGIN = 1.1;
const STOCKOUT_RISK_DAYS = 2;
const TOP_SELLER_WINDOW_DAYS = 30;
const DEFAULT_LEAD_TIME_DAYS = 2;

export type ReplenishmentLine = {
  product: { id: string; ean: string; name: string; category: string };
  category: string;
  currentStock: number;
  projectedDemand: number;
  suggestedOrderQty: number;
  stockoutDate: string | null;
  orderByDate: string | null;
  leadTimeDays: number;
  reasons: string[];
};

export type ReplenishmentPlan = {
  aireId: string;
  planDate: string;
  horizonDays: number;
  lines: ReplenishmentLine[];
  limitations: string[];
};

function isoDateKey(v: string): string {
  return v.slice(0, 10);
}

async function fetchWeatherByDate(location: AireLocation): Promise<Map<string, number | null>> {
  const wq = weatherQueryParams(location);
  const qs = wq ? `?forecast=true&${wq}` : '?forecast=true';
  try {
    const res = await fetch(`/api/weather${qs}`);
    const data = await res.json();
    const map = new Map<string, number | null>();
    for (const day of data.forecast || []) {
      if (day?.date) map.set(isoDateKey(day.date), typeof day.tempMax === 'number' ? day.tempMax : null);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchTrafficByDate(location: AireLocation): Promise<Map<string, number | null>> {
  const city = aireDisplayLabel(location);
  try {
    const res = await fetch(`/api/traffic?city=${encodeURIComponent(city)}&forecast=true`);
    const data = await res.json();
    const map = new Map<string, number | null>();
    for (const day of data.forecast || []) {
      if (day?.date) map.set(isoDateKey(day.date), typeof day.trafficScore === 'number' ? day.trafficScore : null);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchHolidaysByDate(planDate: string, horizonDays: number): Promise<Map<string, boolean>> {
  try {
    const res = await fetch(`/api/vacances?start=${planDate}&days=${horizonDays}`);
    const data = await res.json();
    const map = new Map<string, boolean>();
    for (const day of data.days || []) {
      if (day?.date) map.set(isoDateKey(day.date), !!day.isVacances);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function buildDayContexts(
  location: AireLocation,
  planDate: string,
  horizonDays: number
): Promise<DayDemandContext[]> {
  const dates = Array.from({ length: horizonDays }, (_, i) => addDaysIso(planDate, i));
  const [weatherByDate, trafficByDate, holidaysByDate] = await Promise.all([
    fetchWeatherByDate(location),
    fetchTrafficByDate(location),
    fetchHolidaysByDate(planDate, horizonDays),
  ]);

  return dates.map((date) => ({
    date,
    tempMaxC: weatherByDate.get(date) ?? null,
    trafficScore: trafficByDate.get(date) ?? null,
    isOnHoliday: holidaysByDate.get(date) ?? false,
  }));
}

type ProductRow = {
  id: string;
  ean: string;
  name: string;
  category: string;
  lead_time_days: number | null;
};

async function loadProducts(aireId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, ean, name, category, lead_time_days')
    .eq('aire_id', aireId);
  if (error) throw new Error(error.message);
  return (data || []) as ProductRow[];
}

async function loadCurrentStockByProduct(aireId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('product_stocks')
    .select('product_id, quantity')
    .eq('aire_id', aireId)
    .gt('quantity', 0);
  if (error) throw new Error(error.message);
  const stock = new Map<string, number>();
  for (const row of data || []) {
    stock.set(row.product_id, (stock.get(row.product_id) ?? 0) + Number(row.quantity));
  }
  return stock;
}

type WeekdayBaselines = Map<string, Map<number, number>>;

async function loadWeekdayBaselines(aireId: string, planDate: string): Promise<WeekdayBaselines> {
  const historyDays = dateWindowEnding(planDate, REAPPRO_BASELINE_WEEKS * 7);
  const weekdayCounts = new Map<number, number>();
  for (const d of historyDays) {
    const { weekday } = getIsoWeekAndWeekday(d);
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
  }

  const { data, error } = await supabase
    .from('sales')
    .select('product_id, sale_date, quantity')
    .eq('aire_id', aireId)
    .gte('sale_date', historyDays[0])
    .lte('sale_date', planDate);
  if (error) throw new Error(error.message);

  const sums = new Map<string, Map<number, number>>();
  for (const row of data || []) {
    if (!row.product_id) continue;
    const { weekday } = getIsoWeekAndWeekday(isoDateKey(row.sale_date));
    const byWeekday = sums.get(row.product_id) ?? new Map<number, number>();
    byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + Number(row.quantity));
    sums.set(row.product_id, byWeekday);
  }

  const baselines: WeekdayBaselines = new Map();
  for (const [productId, byWeekday] of sums) {
    const baselineMap = new Map<number, number>();
    for (const [weekday, total] of byWeekday) {
      const occurrences = weekdayCounts.get(weekday) ?? 1;
      baselineMap.set(weekday, total / occurrences);
    }
    baselines.set(productId, baselineMap);
  }
  return baselines;
}

async function selectFocusProductIds(
  aireId: string,
  planDate: string,
  products: ProductRow[],
  stockByProduct: Map<string, number>,
  projectedByProduct: Map<string, { total: number; byDay: { date: string; demand: number }[] }>
): Promise<Set<string>> {
  const focus = new Set<string>();
  const windowStart = dateWindowEnding(planDate, TOP_SELLER_WINDOW_DAYS)[0];

  const { data, error } = await supabase
    .from('sales')
    .select('product_id, category, quantity')
    .eq('aire_id', aireId)
    .gte('sale_date', windowStart)
    .lte('sale_date', planDate);
  if (error) throw new Error(error.message);

  const byCategory = new Map<string, Map<string, number>>();
  for (const row of data || []) {
    if (!row.product_id) continue;
    const cat = row.category || 'Divers';
    const byProduct = byCategory.get(cat) ?? new Map<string, number>();
    byProduct.set(row.product_id, (byProduct.get(row.product_id) ?? 0) + Number(row.quantity));
    byCategory.set(cat, byProduct);
  }
  for (const [, byProduct] of byCategory) {
    const top = [...byProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, REAPPRO_TOP_SELLERS_PER_CATEGORY)
      .map(([id]) => id);
    for (const id of top) focus.add(id);
  }

  for (const product of products) {
    const projection = projectedByProduct.get(product.id);
    if (!projection) continue;
    const currentStock = stockByProduct.get(product.id) ?? 0;
    const nearTermDemand = projection.byDay
      .slice(0, STOCKOUT_RISK_DAYS)
      .reduce((sum, d) => sum + d.demand, 0);
    if (nearTermDemand > 0 && currentStock < nearTermDemand) focus.add(product.id);
  }

  return focus;
}

function findStockoutDate(currentStock: number, byDay: { date: string; demand: number }[]): string | null {
  let remaining = currentStock;
  for (const day of byDay) {
    remaining -= day.demand;
    if (remaining <= 0) return day.date;
  }
  return byDay.length > 0 ? byDay[byDay.length - 1].date : null;
}

/**
 * Calcule le plan de réapprovisionnement sur `horizonDays` (7 par défaut) pour une aire.
 * Nécessite un historique de ventes (table `sales`) pour établir une baseline par jour ISO.
 */
export async function computeReplenishmentPlan(
  aireId: string,
  location: AireLocation,
  planDate: string = todayIso(),
  horizonDays: number = REAPPRO_HORIZON_DAYS
): Promise<ReplenishmentPlan> {
  const [dayContexts, products, stockByProduct, baselines] = await Promise.all([
    buildDayContexts(location, planDate, horizonDays),
    loadProducts(aireId),
    loadCurrentStockByProduct(aireId),
    loadWeekdayBaselines(aireId, planDate),
  ]);

  const dates = dayContexts.map((c) => c.date);
  const projectedByProduct = new Map<
    string,
    { total: number; byDay: { date: string; demand: number; reasons: string[] }[]; allReasons: string[] }
  >();

  for (const product of products) {
    const byDay: { date: string; demand: number; reasons: string[] }[] = [];
    const reasonSet = new Set<string>();
    let total = 0;
    for (let i = 0; i < dates.length; i++) {
      const dayCtx = dayContexts[i];
      const { weekday } = getIsoWeekAndWeekday(dates[i]);
      const baseline = baselines.get(product.id)?.get(weekday) ?? 0;
      const { factor, reasons } = getCategoryMultipliersForDay(product.category || 'Divers', dayCtx);
      const demand = baseline * factor;
      total += demand;
      for (const r of reasons) reasonSet.add(r);
      byDay.push({ date: dayCtx.date, demand, reasons });
    }
    projectedByProduct.set(product.id, { total, byDay, allReasons: Array.from(reasonSet) });
  }

  const focusIds = await selectFocusProductIds(aireId, planDate, products, stockByProduct, projectedByProduct);

  const lines: ReplenishmentLine[] = [];
  for (const product of products) {
    if (!focusIds.has(product.id)) continue;
    const projection = projectedByProduct.get(product.id);
    if (!projection) continue;

    const currentStock = stockByProduct.get(product.id) ?? 0;
    const shortfall = Math.max(0, projection.total - currentStock);
    const suggestedOrderQty = shortfall > 0 ? Math.ceil(shortfall * REAPPRO_SAFETY_MARGIN) : 0;
    const stockoutDate = shortfall > 0 ? findStockoutDate(currentStock, projection.byDay) : null;
    const leadTimeDays = product.lead_time_days ?? DEFAULT_LEAD_TIME_DAYS;
    const orderByDate = stockoutDate ? addDaysIso(stockoutDate, -leadTimeDays) : null;
    const firstDayDemand = projection.byDay[0]?.demand ?? 0;

    if (suggestedOrderQty > 0 || currentStock < firstDayDemand) {
      lines.push({
        product: { id: product.id, ean: product.ean, name: product.name, category: product.category || 'Divers' },
        category: product.category || 'Divers',
        currentStock,
        projectedDemand: Math.round(projection.total * 10) / 10,
        suggestedOrderQty,
        stockoutDate,
        orderByDate,
        leadTimeDays,
        reasons: projection.allReasons,
      });
    }
  }

  lines.sort((a, b) => b.suggestedOrderQty - a.suggestedOrderQty || b.projectedDemand - a.projectedDemand);

  return {
    aireId,
    planDate,
    horizonDays,
    lines,
    limitations: [
      "Les commandes déjà passées ne sont pas prises en compte (pas de suivi commandes en v1).",
      "Le stock actuel ne déduit pas les ventes déjà réalisées aujourd'hui.",
      "Baseline calculée sur l'historique des ventes (sales) — moins fiable si peu de recul.",
      "Le signal d'affluence utilise le trafic routier (au lieu d'une zone Bison Futé dédiée).",
      "Délai fournisseur par défaut : 2 jours si non renseigné sur la fiche produit.",
    ],
  };
}
