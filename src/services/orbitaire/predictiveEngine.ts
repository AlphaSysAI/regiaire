/**
 * OrbitAire — moteur prédictif multi-paramètres
 * Anticipation ruptures, commandes suggérées, scoring de confiance,
 * impact croisé météo / vacances / flux routiers / élasticité carburant→boutique.
 */

export type ProductCategoryKind =
  | 'carburant'
  | 'frais'
  | 'boissons'
  | 'snacking'
  | 'depannage'
  | 'autre';

export type RiskStatus = 'normal' | 'vigilance' | 'rupture_imminente';

export type CalendarZone = 'A' | 'B' | 'C' | 'EU';

export type PredictiveHorizon = 'hourly' | 'daily' | 'monthly';

export interface SalesHistoryPoint {
  date: string;
  productId?: string;
  category: string;
  quantity: number;
  revenueTtc?: number;
}

export interface WeatherDayInput {
  date: string;
  tempMaxC: number | null;
  tempMinC?: number | null;
  condition?: string;
  precipMm?: number | null;
  alertLevel?: 'none' | 'yellow' | 'orange' | 'red';
}

export interface TrafficDayInput {
  date: string;
  trafficScore: number | null;
  /** Ratio approximatif VL (0–1). Si absent, estimé depuis le score. */
  lightVehicleShare?: number | null;
  /** Ratio PL (0–1). */
  heavyVehicleShare?: number | null;
}

export interface CalendarDayInput {
  date: string;
  isSchoolHoliday: boolean;
  zones?: CalendarZone[];
  isPublicHoliday?: boolean;
  isBridgeDay?: boolean;
  isChasseCroise?: boolean;
  isEuropeanTransitPeak?: boolean;
}

export interface StockSnapshot {
  productId: string;
  ean?: string;
  name: string;
  category: string;
  currentStock: number;
  minThreshold?: number;
  targetStock?: number;
  leadTimeDays?: number;
}

export interface FuelBoutiqueElasticity {
  /** Corrélation volume piste → panier boutique (typiquement 0.15–0.45). */
  conversionLift: number;
  /** Volume carburant indexé (1 = normal). */
  fuelVolumeIndex: number;
}

export interface PredictiveEngineInput {
  planDate: string;
  horizonDays?: number;
  salesHistory: SalesHistoryPoint[];
  weather: WeatherDayInput[];
  traffic: TrafficDayInput[];
  calendar: CalendarDayInput[];
  stocks: StockSnapshot[];
  elasticity?: FuelBoutiqueElasticity;
}

export interface DemandShockEvent {
  date: string;
  title: string;
  impactPct: number;
  drivers: string[];
  severity: 'info' | 'warning' | 'critical';
}

export interface CausalJustification {
  summary: string;
  drivers: Array<{ label: string; contributionPct: number }>;
}

export interface OrderRecommendation {
  productId: string;
  ean?: string;
  name: string;
  category: string;
  categoryKind: ProductCategoryKind;
  currentStock: number;
  estimatedSalesJ3: number;
  estimatedSalesHorizon: number;
  suggestedOrderQty: number;
  riskStatus: RiskStatus;
  confidencePct: number;
  justification: CausalJustification;
  bottleneck?: string | null;
}

export interface ForecastSeriesPoint {
  date: string;
  actualSales: number | null;
  predictedSales: number;
  confidenceLow: number;
  confidenceHigh: number;
  trafficIndex: number;
}

export interface OperationalChecklistItem {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  relatedDate?: string;
}

export interface KpiSnapshot {
  serviceRateJ7Pct: number;
  ruptureAlertLevel: 'green' | 'amber' | 'red';
  ruptureRiskCount: number;
  capturedRevenueOpportunityEur: number;
  overallConfidencePct: number;
}

export interface PredictiveEngineOutput {
  generatedAt: string;
  planDate: string;
  horizonDays: number;
  kpis: KpiSnapshot;
  series: ForecastSeriesPoint[];
  recommendations: OrderRecommendation[];
  demandShocks: DemandShockEvent[];
  checklist: OperationalChecklistItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function weekdayIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function classifyCategory(category: string): ProductCategoryKind {
  const c = category.toLowerCase();
  if (/(carbur|diesel|sp95|sp98|gpl|adblue|cuve)/.test(c)) return 'carburant';
  if (/(frais|sandwich|salade|yaourt|lait|fromage|boucher)/.test(c)) return 'frais';
  if (/(boisson|eau|soda|jus|café|thé|glace)/.test(c)) return 'boissons';
  if (/(snack|chips|confiser|boulang|viennois|biscuit)/.test(c)) return 'snacking';
  if (/(dépann|depann|huile|balai|ampoule|accesso|pneu|liquide)/.test(c)) return 'depannage';
  return 'autre';
}

// ---------------------------------------------------------------------------
// Historique glissant pondéré
// ---------------------------------------------------------------------------

interface WeightedBaseline {
  dailyDemand: number;
  trendFactor: number;
  historyDaysUsed: number;
  yoyAvailable: boolean;
}

function quantityOnDate(
  history: SalesHistoryPoint[],
  productId: string,
  date: string
): number {
  return history
    .filter((h) => h.productId === productId && h.date === date)
    .reduce((s, h) => s + h.quantity, 0);
}

function categoryQuantityOnDate(
  history: SalesHistoryPoint[],
  category: string,
  date: string
): number {
  const cat = category.toLowerCase();
  return history
    .filter((h) => h.category.toLowerCase() === cat && h.date === date)
    .reduce((s, h) => s + h.quantity, 0);
}

function totalQuantityOnDate(history: SalesHistoryPoint[], date: string): number {
  return history.filter((h) => h.date === date).reduce((s, h) => s + h.quantity, 0);
}

/**
 * Baseline produit : moyenne pondérée J-7 (poids 3), J-14 (poids 2),
 * même jour semaine sur 4 semaines (poids 1), + tendance récente vs N-1.
 */
function computeWeightedBaseline(
  history: SalesHistoryPoint[],
  productId: string,
  planDate: string
): WeightedBaseline {
  const d7 = quantityOnDate(history, productId, addDaysIso(planDate, -7));
  const d14 = quantityOnDate(history, productId, addDaysIso(planDate, -14));
  const sameWeekdaySamples: number[] = [];
  for (let w = 1; w <= 4; w += 1) {
    sameWeekdaySamples.push(quantityOnDate(history, productId, addDaysIso(planDate, -7 * w)));
  }

  const weighted =
    (d7 * 3 + d14 * 2 + mean(sameWeekdaySamples) * 1) / (3 + 2 + 1);

  const recentWindow = [d7, d14, ...sameWeekdaySamples.slice(0, 2)].filter((x) => x > 0);
  const olderWindow = sameWeekdaySamples.slice(2).filter((x) => x > 0);
  let trendFactor = 1;
  if (recentWindow.length > 0 && olderWindow.length > 0) {
    const recent = mean(recentWindow);
    const older = mean(olderWindow);
    if (older > 0) trendFactor = clamp(recent / older, 0.7, 1.45);
  }

  const yoyDate = addDaysIso(planDate, -365);
  const yoy = quantityOnDate(history, productId, yoyDate);
  const yoyAvailable = yoy > 0;
  if (yoyAvailable && weighted > 0) {
    const yoyBlend = 0.7 * weighted + 0.3 * yoy;
    return {
      dailyDemand: Math.max(0, yoyBlend * trendFactor),
      trendFactor,
      historyDaysUsed: recentWindow.length + olderWindow.length + (yoyAvailable ? 1 : 0),
      yoyAvailable,
    };
  }

  const historyDaysUsed = history.filter((h) => h.productId === productId).length;
  return {
    dailyDemand: Math.max(0, weighted * trendFactor),
    trendFactor,
    historyDaysUsed,
    yoyAvailable: false,
  };
}

// ---------------------------------------------------------------------------
// Facteurs contextuels
// ---------------------------------------------------------------------------

interface DayFactors {
  weatherFactor: number;
  trafficFactor: number;
  calendarFactor: number;
  elasticityFactor: number;
  drivers: Array<{ label: string; contributionPct: number }>;
}

function weatherFactorForCategory(
  kind: ProductCategoryKind,
  day: WeatherDayInput | undefined
): { factor: number; drivers: Array<{ label: string; contributionPct: number }> } {
  if (!day || day.tempMaxC == null) {
    return { factor: 1, drivers: [] };
  }
  const drivers: Array<{ label: string; contributionPct: number }> = [];
  let factor = 1;
  const t = day.tempMaxC;
  const precip = day.precipMm ?? 0;
  const alert = day.alertLevel ?? 'none';

  if (kind === 'boissons' || kind === 'frais') {
    if (t >= 31) {
      factor *= 1.38;
      drivers.push({ label: `Pic thermique ${Math.round(t)}°C`, contributionPct: 38 });
    } else if (t >= 28) {
      factor *= 1.22;
      drivers.push({ label: `Forte chaleur ${Math.round(t)}°C`, contributionPct: 22 });
    } else if (t >= 25) {
      factor *= 1.12;
      drivers.push({ label: `Chaleur ${Math.round(t)}°C`, contributionPct: 12 });
    } else if (t <= 2) {
      factor *= kind === 'boissons' ? 0.85 : 0.95;
      drivers.push({ label: `Froid extrême ${Math.round(t)}°C`, contributionPct: -15 });
      if (kind === 'boissons') {
        factor *= 1.08; // boissons chaudes compensent partiellement
        drivers.push({ label: 'Report boissons chaudes', contributionPct: 8 });
      }
    }
  }

  if (kind === 'snacking' && t >= 28) {
    factor *= 1.1;
    drivers.push({ label: 'Snacking frais boosté par chaleur', contributionPct: 10 });
  }

  if (precip >= 5 || /rain|orage|storm/i.test(day.condition ?? '')) {
    factor *= 1.08; // temps d'arrêt rallongé
    drivers.push({ label: 'Précipitations → arrêt moyen prolongé', contributionPct: 8 });
  }

  if (alert === 'orange' || alert === 'red') {
    factor *= alert === 'red' ? 1.15 : 1.1;
    drivers.push({
      label: `Alerte météo ${alert}`,
      contributionPct: alert === 'red' ? 15 : 10,
    });
  }

  return { factor, drivers };
}

function trafficFactorForDay(
  kind: ProductCategoryKind,
  day: TrafficDayInput | undefined
): { factor: number; drivers: Array<{ label: string; contributionPct: number }> } {
  if (!day || day.trafficScore == null) {
    return { factor: 1, drivers: [] };
  }
  const drivers: Array<{ label: string; contributionPct: number }> = [];
  const score = day.trafficScore;
  const vl = day.lightVehicleShare ?? clamp(0.55 + (score - 50) / 200, 0.4, 0.85);
  const pl = day.heavyVehicleShare ?? clamp(1 - vl, 0.15, 0.55);

  let factor = 1;
  if (score >= 85) {
    factor *= 1.35;
    drivers.push({ label: `Trafic saturé (score ${Math.round(score)})`, contributionPct: 35 });
  } else if (score >= 70) {
    factor *= 1.2;
    drivers.push({ label: `Trafic dense (score ${Math.round(score)})`, contributionPct: 20 });
  } else if (score >= 55) {
    factor *= 1.08;
    drivers.push({ label: `Trafic soutenu (score ${Math.round(score)})`, contributionPct: 8 });
  } else if (score < 35) {
    factor *= 0.82;
    drivers.push({ label: `Trafic faible (score ${Math.round(score)})`, contributionPct: -18 });
  }

  if (kind === 'depannage' && pl >= 0.35) {
    factor *= 1.12;
    drivers.push({
      label: `Part PL élevée (${Math.round(pl * 100)} %) → dépannage`,
      contributionPct: 12,
    });
  }
  if ((kind === 'frais' || kind === 'snacking') && vl >= 0.7) {
    factor *= 1.08;
    drivers.push({
      label: `Part VL élevée (${Math.round(vl * 100)} %) → boutique`,
      contributionPct: 8,
    });
  }

  return { factor, drivers };
}

function calendarFactorForDay(
  kind: ProductCategoryKind,
  day: CalendarDayInput | undefined
): { factor: number; drivers: Array<{ label: string; contributionPct: number }> } {
  if (!day) return { factor: 1, drivers: [] };
  const drivers: Array<{ label: string; contributionPct: number }> = [];
  let factor = 1;

  if (day.isChasseCroise) {
    const zones = (day.zones ?? []).join('/');
    factor *= 1.32;
    drivers.push({
      label: `Chassé-croisé${zones ? ` Zone ${zones}` : ''}`,
      contributionPct: 32,
    });
  } else if (day.isSchoolHoliday) {
    factor *= 1.18;
    drivers.push({ label: 'Vacances scolaires', contributionPct: 18 });
  }

  if (day.isPublicHoliday) {
    factor *= 1.15;
    drivers.push({ label: 'Jour férié', contributionPct: 15 });
  }
  if (day.isBridgeDay) {
    factor *= 1.12;
    drivers.push({ label: 'Pont / week-end prolongé', contributionPct: 12 });
  }
  if (day.isEuropeanTransitPeak) {
    factor *= 1.1;
    drivers.push({ label: 'Pic transit européen', contributionPct: 10 });
  }

  // Frais / snacking plus sensibles aux chassés-croisés de weekend
  const wd = weekdayIso(day.date);
  if ((kind === 'frais' || kind === 'snacking') && (wd === 6 || wd === 7) && factor > 1) {
    factor *= 1.06;
    drivers.push({ label: 'Effet week-end sur frais/snacking', contributionPct: 6 });
  }

  return { factor, drivers };
}

function elasticityFactorForKind(
  kind: ProductCategoryKind,
  elasticity: FuelBoutiqueElasticity | undefined
): { factor: number; drivers: Array<{ label: string; contributionPct: number }> } {
  if (!elasticity) return { factor: 1, drivers: [] };
  if (kind === 'carburant') {
    const f = clamp(elasticity.fuelVolumeIndex, 0.7, 1.5);
    return {
      factor: f,
      drivers:
        f !== 1
          ? [{ label: `Index volume carburant ×${f.toFixed(2)}`, contributionPct: Math.round((f - 1) * 100) }]
          : [],
    };
  }
  if (kind === 'frais' || kind === 'boissons' || kind === 'snacking') {
    const lift = elasticity.conversionLift * (elasticity.fuelVolumeIndex - 1);
    const f = clamp(1 + lift, 0.85, 1.4);
    if (Math.abs(f - 1) < 0.02) return { factor: 1, drivers: [] };
    return {
      factor: f,
      drivers: [
        {
          label: `Élasticité carburant→boutique (${Math.round(elasticity.conversionLift * 100)} %)`,
          contributionPct: Math.round((f - 1) * 100),
        },
      ],
    };
  }
  return { factor: 1, drivers: [] };
}

function combineDayFactors(
  kind: ProductCategoryKind,
  weather: WeatherDayInput | undefined,
  traffic: TrafficDayInput | undefined,
  calendar: CalendarDayInput | undefined,
  elasticity: FuelBoutiqueElasticity | undefined
): DayFactors {
  const w = weatherFactorForCategory(kind, weather);
  const t = trafficFactorForDay(kind, traffic);
  const c = calendarFactorForDay(kind, calendar);
  const e = elasticityFactorForKind(kind, elasticity);
  return {
    weatherFactor: w.factor,
    trafficFactor: t.factor,
    calendarFactor: c.factor,
    elasticityFactor: e.factor,
    drivers: [...w.drivers, ...t.drivers, ...c.drivers, ...e.drivers]
      .sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct))
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Confiance
// ---------------------------------------------------------------------------

function confidenceScore(opts: {
  historyDaysUsed: number;
  yoyAvailable: boolean;
  weatherComplete: boolean;
  trafficComplete: boolean;
  calendarComplete: boolean;
  demandVolatility: number;
}): number {
  let score = 35;
  score += clamp(opts.historyDaysUsed, 0, 30); // jusqu'à +30
  if (opts.yoyAvailable) score += 10;
  if (opts.weatherComplete) score += 8;
  if (opts.trafficComplete) score += 8;
  if (opts.calendarComplete) score += 5;
  // pénalité volatilité
  score -= clamp(Math.round(opts.demandVolatility * 20), 0, 25);
  return clamp(Math.round(score), 20, 96);
}

// ---------------------------------------------------------------------------
// Enrichissement calendaire (heuristiques chassés-croisés)
// ---------------------------------------------------------------------------

export function enrichCalendarDays(days: CalendarDayInput[]): CalendarDayInput[] {
  return days.map((day) => {
    const wd = weekdayIso(day.date);
    const isWeekend = wd >= 6;
    const isChasseCroise =
      day.isChasseCroise ??
      (day.isSchoolHoliday && isWeekend);
    const isBridgeDay =
      day.isBridgeDay ??
      (day.isPublicHoliday === true && (wd === 5 || wd === 1));
    return {
      ...day,
      isChasseCroise,
      isBridgeDay,
      zones: day.zones ?? (isChasseCroise ? (['A', 'C'] as CalendarZone[]) : undefined),
      isEuropeanTransitPeak:
        day.isEuropeanTransitPeak ??
        (day.isSchoolHoliday && (wd === 5 || wd === 6 || wd === 7)),
    };
  });
}

// ---------------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------------

function indexByDate<T extends { date: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.date, row);
  return map;
}

function buildJustification(
  factors: DayFactors,
  peakDate: string,
  kind: ProductCategoryKind
): CausalJustification {
  const top = factors.drivers[0];
  const totalLift = Math.round(
    (factors.weatherFactor * factors.trafficFactor * factors.calendarFactor * factors.elasticityFactor - 1) *
      100
  );
  const kindLabel =
    kind === 'frais'
      ? 'snacking frais'
      : kind === 'boissons'
        ? 'boissons'
        : kind === 'carburant'
          ? 'carburants'
          : kind === 'depannage'
            ? 'dépannage auto'
            : 'catégorie';

  const summary =
    top && totalLift !== 0
      ? `${totalLift > 0 ? '+' : ''}${totalLift} % sur ${kindLabel} anticipé ${formatFrDay(peakDate)} : ${factors.drivers
          .slice(0, 2)
          .map((d) => d.label)
          .join(' + ')}`
      : `Demande stable sur ${kindLabel} — facteurs contextuels neutres`;

  return { summary, drivers: factors.drivers };
}

function formatFrDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function riskFor(
  currentStock: number,
  demandJ3: number,
  demandHorizon: number,
  minThreshold?: number
): RiskStatus {
  if (demandJ3 > 0 && currentStock < demandJ3 * 0.5) return 'rupture_imminente';
  if (demandJ3 > 0 && currentStock < demandJ3) return 'rupture_imminente';
  if (minThreshold != null && currentStock <= minThreshold) return 'vigilance';
  if (demandHorizon > 0 && currentStock < demandHorizon * 0.85) return 'vigilance';
  return 'normal';
}

export function runPredictiveEngine(input: PredictiveEngineInput): PredictiveEngineOutput {
  const horizonDays = clamp(input.horizonDays ?? 7, 1, 31);
  const planDate = input.planDate;
  const calendar = enrichCalendarDays(input.calendar);
  const weatherByDate = indexByDate(input.weather);
  const trafficByDate = indexByDate(input.traffic);
  const calendarByDate = indexByDate(calendar);
  const elasticity = input.elasticity ?? {
    conversionLift: 0.28,
    fuelVolumeIndex: 1,
  };

  // Index volume carburant depuis trafic moyen horizon si non fourni explicitement ≠ 1
  if (input.elasticity == null) {
    const scores = input.traffic
      .map((t) => t.trafficScore)
      .filter((s): s is number => s != null);
    if (scores.length > 0) {
      elasticity.fuelVolumeIndex = clamp(mean(scores) / 55, 0.75, 1.4);
    }
  }

  const horizonDates = Array.from({ length: horizonDays }, (_, i) => addDaysIso(planDate, i));

  const recommendations: OrderRecommendation[] = [];
  const productDailySeries = new Map<string, number[]>();

  for (const stock of input.stocks) {
    const kind = classifyCategory(stock.category);
    const baseline = computeWeightedBaseline(input.salesHistory, stock.productId, planDate);

    const byDay: number[] = [];
    let peakFactors: DayFactors | null = null;
    let peakDate = planDate;
    let peakDemand = 0;

    for (const date of horizonDates) {
      const factors = combineDayFactors(
        kind,
        weatherByDate.get(date),
        trafficByDate.get(date),
        calendarByDate.get(date),
        elasticity
      );
      const dayDemand =
        baseline.dailyDemand *
        factors.weatherFactor *
        factors.trafficFactor *
        factors.calendarFactor *
        factors.elasticityFactor;
      byDay.push(dayDemand);
      if (dayDemand > peakDemand) {
        peakDemand = dayDemand;
        peakFactors = factors;
        peakDate = date;
      }
    }

    productDailySeries.set(stock.productId, byDay);
    const estimatedSalesJ3 = byDay.slice(0, 3).reduce((a, b) => a + b, 0);
    const estimatedSalesHorizon = byDay.reduce((a, b) => a + b, 0);
    const lead = stock.leadTimeDays ?? 2;
    const coverNeed = byDay.slice(0, Math.min(horizonDays, lead + 3)).reduce((a, b) => a + b, 0);
    const safety = 1.1;
    const suggestedOrderQty = Math.max(
      0,
      Math.ceil(coverNeed * safety - stock.currentStock)
    );

    const histQty = input.salesHistory
      .filter((h) => h.productId === stock.productId)
      .map((h) => h.quantity);
    const conf = confidenceScore({
      historyDaysUsed: baseline.historyDaysUsed,
      yoyAvailable: baseline.yoyAvailable,
      weatherComplete: input.weather.filter((w) => w.tempMaxC != null).length >= horizonDays * 0.7,
      trafficComplete:
        input.traffic.filter((t) => t.trafficScore != null).length >= horizonDays * 0.7,
      calendarComplete: calendar.length >= horizonDays * 0.7,
      demandVolatility:
        baseline.dailyDemand > 0 ? stddev(histQty) / Math.max(baseline.dailyDemand, 1) : 0.5,
    });

    const factorsForJust =
      peakFactors ??
      combineDayFactors(
        kind,
        weatherByDate.get(planDate),
        trafficByDate.get(planDate),
        calendarByDate.get(planDate),
        elasticity
      );

    let bottleneck: string | null = null;
    if (kind === 'carburant' && suggestedOrderQty > 0 && stock.currentStock < estimatedSalesJ3) {
      bottleneck = `Sous-capacité cuve probable avant ${formatFrDay(peakDate)}`;
    }
    if (kind === 'frais' && estimatedSalesJ3 > stock.currentStock) {
      bottleneck = `Saturation linéaire frais anticipée ${formatFrDay(peakDate)}`;
    }

    recommendations.push({
      productId: stock.productId,
      ean: stock.ean,
      name: stock.name,
      category: stock.category,
      categoryKind: kind,
      currentStock: stock.currentStock,
      estimatedSalesJ3: Math.round(estimatedSalesJ3 * 10) / 10,
      estimatedSalesHorizon: Math.round(estimatedSalesHorizon * 10) / 10,
      suggestedOrderQty,
      riskStatus: riskFor(
        stock.currentStock,
        estimatedSalesJ3,
        estimatedSalesHorizon,
        stock.minThreshold
      ),
      confidencePct: conf,
      justification: buildJustification(factorsForJust, peakDate, kind),
      bottleneck,
    });
  }

  recommendations.sort((a, b) => {
    const rank = { rupture_imminente: 0, vigilance: 1, normal: 2 };
    const r = rank[a.riskStatus] - rank[b.riskStatus];
    if (r !== 0) return r;
    return b.suggestedOrderQty - a.suggestedOrderQty;
  });

  // Série agrégée trafic / ventes / prévision
  const series: ForecastSeriesPoint[] = [];
  for (let i = -6; i < horizonDays; i += 1) {
    const date = addDaysIso(planDate, i);
    const actual =
      i < 0 ? totalQuantityOnDate(input.salesHistory, date) : null;
    let predicted = 0;
    for (const stock of input.stocks) {
      const kind = classifyCategory(stock.category);
      const baseline = computeWeightedBaseline(input.salesHistory, stock.productId, planDate);
      const factors = combineDayFactors(
        kind,
        weatherByDate.get(date) ?? weatherByDate.get(planDate),
        trafficByDate.get(date) ?? trafficByDate.get(planDate),
        calendarByDate.get(date) ?? calendarByDate.get(planDate),
        elasticity
      );
      predicted +=
        baseline.dailyDemand *
        factors.weatherFactor *
        factors.trafficFactor *
        factors.calendarFactor *
        factors.elasticityFactor;
    }
    if (input.stocks.length === 0) {
      // fallback agrégé catégorie
      const catDemand = mean(
        [-7, -14, -21, -28].map((o) => totalQuantityOnDate(input.salesHistory, addDaysIso(date, o)))
      );
      predicted = catDemand;
    }
    const band = predicted * 0.12;
    const traffic = trafficByDate.get(date)?.trafficScore ?? 50;
    series.push({
      date,
      actualSales: actual != null && actual > 0 ? actual : i < 0 ? actual : null,
      predictedSales: Math.round(predicted * 10) / 10,
      confidenceLow: Math.round((predicted - band) * 10) / 10,
      confidenceHigh: Math.round((predicted + band) * 10) / 10,
      trafficIndex: traffic,
    });
  }

  // Demand shocks
  const demandShocks: DemandShockEvent[] = [];
  for (const date of horizonDates) {
    const cal = calendarByDate.get(date);
    const wx = weatherByDate.get(date);
    const tr = trafficByDate.get(date);
    const drivers: string[] = [];
    let impact = 0;
    if (cal?.isChasseCroise) {
      drivers.push(`Chassé-croisé Zone ${(cal.zones ?? ['A', 'C']).join('/')}`);
      impact += 32;
    } else if (cal?.isSchoolHoliday) {
      drivers.push('Vacances scolaires');
      impact += 18;
    }
    if (wx?.tempMaxC != null && wx.tempMaxC >= 30) {
      drivers.push(`Pic thermique ${Math.round(wx.tempMaxC)}°C`);
      impact += 20;
    }
    if (tr?.trafficScore != null && tr.trafficScore >= 80) {
      drivers.push(`Pic trafic ${Math.round(tr.trafficScore)}`);
      impact += 15;
    }
    if (cal?.isEuropeanTransitPeak) {
      drivers.push('Transit européen');
      impact += 8;
    }
    if (drivers.length >= 2 || impact >= 25) {
      demandShocks.push({
        date,
        title: drivers[0] ?? 'Choc de demande',
        impactPct: impact,
        drivers,
        severity: impact >= 45 ? 'critical' : impact >= 28 ? 'warning' : 'info',
      });
    }
  }

  // Checklist ops
  const checklist: OperationalChecklistItem[] = [];
  const ruptureCount = recommendations.filter((r) => r.riskStatus === 'rupture_imminente').length;
  const vigilanceCount = recommendations.filter((r) => r.riskStatus === 'vigilance').length;
  if (ruptureCount > 0) {
    checklist.push({
      id: 'rush-order',
      priority: 'high',
      title: 'Lancer commandes urgentes',
      detail: `${ruptureCount} référence(s) en rupture imminente — valider la matrice de commande.`,
    });
  }
  const peakShock = demandShocks.find((s) => s.severity !== 'info');
  if (peakShock) {
    checklist.push({
      id: 'staffing',
      priority: 'high',
      title: 'Renfort staffing sur pic de flux',
      detail: `${peakShock.title} le ${formatFrDay(peakShock.date)} (+${peakShock.impactPct} %). Prévoir +1 équipier boutique 11h–15h.`,
      relatedDate: peakShock.date,
    });
  }
  const fraisRisk = recommendations.find(
    (r) => r.categoryKind === 'frais' && r.riskStatus !== 'normal'
  );
  if (fraisRisk) {
    checklist.push({
      id: 'fresh-restock',
      priority: 'medium',
      title: 'Cadencer réassort frais',
      detail: `${fraisRisk.name} : ${fraisRisk.justification.summary}`,
    });
  }
  if (vigilanceCount > 0) {
    checklist.push({
      id: 'watchlist',
      priority: 'medium',
      title: 'Surveiller linéaires en vigilance',
      detail: `${vigilanceCount} produit(s) sous seuil de couverture J+3.`,
    });
  }
  checklist.push({
    id: 'fuel-check',
    priority: 'low',
    title: 'Contrôle niveaux cuves',
    detail: `Index volume carburant ×${elasticity.fuelVolumeIndex.toFixed(2)} — vérifier autonomie avant week-end.`,
  });

  const covered = recommendations.filter((r) => r.riskStatus === 'normal').length;
  const serviceRate =
    recommendations.length === 0
      ? 100
      : Math.round((covered / recommendations.length) * 1000) / 10;

  const capturedRevenue = recommendations
    .filter((r) => r.suggestedOrderQty > 0)
    .reduce((sum, r) => sum + r.suggestedOrderQty * 3.2, 0); // panier unitaire proxy

  const overallConfidence =
    recommendations.length > 0
      ? Math.round(mean(recommendations.map((r) => r.confidencePct)))
      : 45;

  const kpis: KpiSnapshot = {
    serviceRateJ7Pct: serviceRate,
    ruptureAlertLevel: ruptureCount > 3 ? 'red' : ruptureCount > 0 ? 'amber' : 'green',
    ruptureRiskCount: ruptureCount,
    capturedRevenueOpportunityEur: Math.round(capturedRevenue),
    overallConfidencePct: overallConfidence,
  };

  return {
    generatedAt: new Date().toISOString(),
    planDate,
    horizonDays,
    kpis,
    series,
    recommendations: recommendations.slice(0, 80),
    demandShocks: demandShocks.slice(0, 12),
    checklist,
  };
}
