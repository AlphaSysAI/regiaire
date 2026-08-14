/**
 * OrbitAire — moteur de prédiction du Chiffre d'Affaires
 * Modélisation financière retail autoroutier / stations-service :
 * conversion piste→boutique, élasticités croisées, pondération
 * récente / N-1 / contexte temps réel.
 */

import {
  enrichCalendarDays,
  type CalendarDayInput,
  type CalendarZone,
  type TrafficDayInput,
  type WeatherDayInput,
} from './predictiveEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FuelGrade = 'gazole' | 'sp95_e10' | 'sp98' | 'adblue';

export type ShopCategory =
  | 'frais_sandwichs'
  | 'boissons'
  | 'epicerie_snacks'
  | 'tabac_presse'
  | 'auto_accessoires'
  | 'autre_boutique';

export type TrafficProfile = 'vl_transit' | 'vl_pendulaire' | 'pl' | 'mixte';

export interface RevenueHistoryPoint {
  date: string;
  /** CA TTC total jour (si fourni, prioritaire pour baseline). */
  totalRevenueTtc?: number;
  totalRevenueHt?: number;
  fuelRevenueTtc?: number;
  shopRevenueTtc?: number;
  servicesRevenueTtc?: number;
  /** Détail boutique optionnel. */
  shopByCategory?: Partial<Record<ShopCategory, number>>;
  /** Détail carburant optionnel. */
  fuelByGrade?: Partial<Record<FuelGrade, number>>;
  /** Proxy volume / panier si CA non dispo (ex. lignes sales). */
  quantity?: number;
  category?: string;
  revenueTtc?: number;
  revenueHt?: number;
}

export interface RevenuePredictionInput {
  planDate: string;
  horizonDays?: number;
  /** Historique CA / ventes (idéalement ≥ 28 j, mieux N-1). */
  history: RevenueHistoryPoint[];
  weather: WeatherDayInput[];
  traffic: TrafficDayInput[];
  calendar: CalendarDayInput[];
  /** Profil dominant de la station (défaut mixte). */
  trafficProfile?: TrafficProfile;
  /** TVA moyenne boutique (défaut 5,5 %). */
  shopVatRate?: number;
  /** TVA carburant (défaut 20 %). */
  fuelVatRate?: number;
  /** Part CA services annexes hors historique (0–1), défaut 0.03. */
  servicesShareFallback?: number;
}

export interface MoneyPair {
  ht: number;
  ttc: number;
}

export interface FuelRevenueBreakdown {
  total: MoneyPair;
  byGrade: Record<FuelGrade, MoneyPair>;
}

export interface ShopRevenueBreakdown {
  total: MoneyPair;
  byCategory: Record<ShopCategory, MoneyPair>;
}

export interface ServicesRevenueBreakdown {
  total: MoneyPair;
  evCharging: MoneyPair;
  carWash: MoneyPair;
}

export interface RevenueComparison {
  vsJ7: { absoluteTtc: number; pct: number | null; baselineTtc: number };
  vsN1: { absoluteTtc: number; pct: number | null; baselineTtc: number };
}

export interface RevenueDriverFactor {
  label: string;
  impactPct: number;
  pillar: 'fuel' | 'shop' | 'services' | 'global';
}

export interface ConfidenceInterval {
  low: MoneyPair;
  median: MoneyPair;
  high: MoneyPair;
  /** Demi-largeur relative utilisée (ex. 0.05 = ±5 %). */
  halfWidthPct: number;
}

export interface HourlyRevenueSlice {
  hour: number;
  label: string;
  predictedTotalTtc: number;
  shopShare: number;
  fuelShare: number;
}

export interface DailyRevenueForecast {
  date: string;
  predictedTotalRevenue: MoneyPair;
  breakdown: {
    fuelRevenue: FuelRevenueBreakdown;
    shopRevenue: ShopRevenueBreakdown;
    evChargingAndServicesRevenue: ServicesRevenueBreakdown;
  };
  comparison: RevenueComparison;
  driverFactors: RevenueDriverFactor[];
  confidenceInterval: ConfidenceInterval;
  hourly: HourlyRevenueSlice[];
  /** Pondération utilisée : récente / N-1 / dynamique. */
  weights: { recent: number; yoy: number; realtime: number };
  conversionRate: number;
  trafficProfile: TrafficProfile;
}

export interface RevenuePredictionResult {
  generatedAt: string;
  planDate: string;
  horizonDays: number;
  days: DailyRevenueForecast[];
  /** Agrégat horizon (somme des jours). */
  horizonTotal: MoneyPair;
  topDrivers: RevenueDriverFactor[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(ttc: number, vatRate: number): MoneyPair {
  const safeTtc = Math.max(0, ttc);
  const ht = safeTtc / (1 + vatRate);
  return { ht: round2(ht), ttc: round2(safeTtc) };
}

function emptyFuel(vat: number): FuelRevenueBreakdown {
  const z = money(0, vat);
  return {
    total: z,
    byGrade: { gazole: { ...z }, sp95_e10: { ...z }, sp98: { ...z }, adblue: { ...z } },
  };
}

function emptyShop(vat: number): ShopRevenueBreakdown {
  const z = money(0, vat);
  return {
    total: z,
    byCategory: {
      frais_sandwichs: { ...z },
      boissons: { ...z },
      epicerie_snacks: { ...z },
      tabac_presse: { ...z },
      auto_accessoires: { ...z },
      autre_boutique: { ...z },
    },
  };
}

function indexByDate<T extends { date: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.date.slice(0, 10), row);
  return map;
}

export function classifyShopCategory(category: string): ShopCategory {
  const c = category.toLowerCase();
  if (/(sandwich|frais|salade|traiteur|boulanger|viennois)/.test(c)) return 'frais_sandwichs';
  if (/(boisson|eau|soda|jus|café|cafe|thé|glace|canette)/.test(c)) return 'boissons';
  if (/(snack|chips|confiser|épicerie|epicerie|biscuit)/.test(c)) return 'epicerie_snacks';
  if (/(tabac|presse|loto|cigarette)/.test(c)) return 'tabac_presse';
  if (/(dépann|depann|huile|balai|ampoule|accesso|auto|pneu)/.test(c)) return 'auto_accessoires';
  if (/(carbur|diesel|gazole|sp95|sp98|adblue)/.test(c)) return 'autre_boutique';
  return 'autre_boutique';
}

export function isFuelCategory(category: string): boolean {
  return /(carbur|diesel|gazole|sp95|sp98|adblue|gpl)/i.test(category);
}

export function classifyFuelGrade(category: string, name = ''): FuelGrade {
  const t = `${category} ${name}`.toLowerCase();
  if (/adblue/.test(t)) return 'adblue';
  if (/sp98|98/.test(t)) return 'sp98';
  if (/sp95|e10|95/.test(t)) return 'sp95_e10';
  return 'gazole';
}

// ---------------------------------------------------------------------------
// Conversion piste → boutique
// ---------------------------------------------------------------------------

export function pisteToShopConversionRate(
  profile: TrafficProfile,
  calendar?: CalendarDayInput,
  traffic?: TrafficDayInput
): number {
  let base =
    profile === 'vl_transit'
      ? 0.5
      : profile === 'vl_pendulaire'
        ? 0.2
        : profile === 'pl'
          ? 0.28
          : 0.35;

  if (calendar?.isChasseCroise || calendar?.isEuropeanTransitPeak) {
    base = clamp(base + 0.12, 0.15, 0.62);
  } else if (calendar?.isSchoolHoliday) {
    base = clamp(base + 0.06, 0.15, 0.58);
  }

  if (traffic?.trafficScore != null && traffic.trafficScore >= 80) {
    base = clamp(base + 0.04, 0.15, 0.62);
  }

  // Mix VL/PL
  if (profile === 'mixte' && traffic) {
    const vl = traffic.lightVehicleShare ?? 0.65;
    const pl = traffic.heavyVehicleShare ?? 1 - vl;
    base = vl * 0.42 + pl * 0.28;
    if (calendar?.isChasseCroise) base = clamp(base + 0.1, 0.15, 0.6);
  }

  return clamp(base, 0.15, 0.6);
}

// ---------------------------------------------------------------------------
// Multiplicateurs contextuels boutique
// ---------------------------------------------------------------------------

interface ShopMultipliers {
  boissons: number;
  frais_sandwichs: number;
  epicerie_snacks: number;
  tabac_presse: number;
  auto_accessoires: number;
  autre_boutique: number;
  cafeHotPenalty: number;
  drivers: RevenueDriverFactor[];
}

function shopContextMultipliers(
  weather?: WeatherDayInput,
  calendar?: CalendarDayInput,
  traffic?: TrafficDayInput
): ShopMultipliers {
  const drivers: RevenueDriverFactor[] = [];
  const m: ShopMultipliers = {
    boissons: 1,
    frais_sandwichs: 1,
    epicerie_snacks: 1,
    tabac_presse: 1,
    auto_accessoires: 1,
    autre_boutique: 1,
    cafeHotPenalty: 1,
    drivers,
  };

  const t = weather?.tempMaxC;
  if (t != null && t > 28) {
    const heatLift = t >= 32 ? 1.7 : t >= 30 ? 1.5 : 1.35;
    m.boissons *= heatLift;
    m.frais_sandwichs *= 1.08;
    m.cafeHotPenalty = t >= 30 ? 0.78 : 0.88;
    drivers.push({
      label: `Canicule ${Math.round(t)}°C → boissons fraîches / glaces`,
      impactPct: Math.round((heatLift - 1) * 100),
      pillar: 'shop',
    });
  } else if (t != null && t <= 3) {
    m.boissons *= 0.9;
    m.cafeHotPenalty = 1.18;
    drivers.push({
      label: `Froid ${Math.round(t)}°C → report café chaud`,
      impactPct: 18,
      pillar: 'shop',
    });
  }

  const precip = weather?.precipMm ?? 0;
  const rainy =
    precip >= 3 || /rain|orage|storm|pluie/i.test(weather?.condition ?? '');
  if (rainy) {
    m.epicerie_snacks *= 1.15;
    m.frais_sandwichs *= 1.1;
    drivers.push({
      label: 'Intempéries → pause rallongée, panier snacking +15 %',
      impactPct: 15,
      pillar: 'shop',
    });
  }

  if (calendar?.isChasseCroise) {
    const zones = (calendar.zones ?? (['A', 'C'] as CalendarZone[])).join('/');
    m.frais_sandwichs *= 1.35;
    m.epicerie_snacks *= 1.28;
    m.boissons *= 1.2;
    m.tabac_presse *= 1.08;
    drivers.push({
      label: `Chassé-croisé Zone ${zones} → panier famille / formules repas`,
      impactPct: 28,
      pillar: 'shop',
    });
  } else if (calendar?.isSchoolHoliday) {
    m.frais_sandwichs *= 1.15;
    m.epicerie_snacks *= 1.12;
    m.boissons *= 1.1;
    drivers.push({
      label: 'Vacances scolaires → hausse panier boutique',
      impactPct: 12,
      pillar: 'shop',
    });
  }

  if (calendar?.isEuropeanTransitPeak) {
    m.frais_sandwichs *= 1.12;
    m.boissons *= 1.1;
    m.auto_accessoires *= 1.08;
    drivers.push({
      label: 'Transit international (Sud / Espagne) → paniers long trajet',
      impactPct: 10,
      pillar: 'shop',
    });
  }

  if (calendar?.isPublicHoliday || calendar?.isBridgeDay) {
    m.frais_sandwichs *= 1.1;
    m.epicerie_snacks *= 1.08;
    drivers.push({
      label: calendar.isBridgeDay ? 'Pont / week-end prolongé' : 'Jour férié',
      impactPct: 10,
      pillar: 'global',
    });
  }

  if (traffic?.trafficScore != null && traffic.trafficScore >= 85) {
    m.auto_accessoires *= 1.06;
    drivers.push({
      label: `Samedi rouge / trafic saturé (score ${Math.round(traffic.trafficScore)})`,
      impactPct: 8,
      pillar: 'global',
    });
  }

  return m;
}

function fuelContextMultiplier(
  weather?: WeatherDayInput,
  calendar?: CalendarDayInput,
  traffic?: TrafficDayInput
): { factor: number; drivers: RevenueDriverFactor[] } {
  let factor = 1;
  const drivers: RevenueDriverFactor[] = [];

  if (calendar?.isChasseCroise || calendar?.isEuropeanTransitPeak) {
    factor *= 1.22;
    drivers.push({
      label: 'Pic départs → volume carburant',
      impactPct: 22,
      pillar: 'fuel',
    });
  } else if (calendar?.isSchoolHoliday) {
    factor *= 1.1;
    drivers.push({ label: 'Vacances → volume piste', impactPct: 10, pillar: 'fuel' });
  }

  if (traffic?.trafficScore != null) {
    if (traffic.trafficScore >= 85) {
      factor *= 1.12;
      drivers.push({
        label: `Flux autoroutier dense (${Math.round(traffic.trafficScore)})`,
        impactPct: 12,
        pillar: 'fuel',
      });
    } else if (traffic.trafficScore < 35) {
      factor *= 0.88;
      drivers.push({
        label: 'Trafic faible → volume piste en repli',
        impactPct: -12,
        pillar: 'fuel',
      });
    }
  }

  // Canicule : légèrement plus de passages / clim, effet modeste sur litres
  if (weather?.tempMaxC != null && weather.tempMaxC >= 30) {
    factor *= 1.03;
  }

  return { factor: clamp(factor, 0.8, 1.35), drivers };
}

// ---------------------------------------------------------------------------
// Historique → séries CA journalières
// ---------------------------------------------------------------------------

interface DailyCa {
  date: string;
  totalTtc: number;
  fuelTtc: number;
  shopTtc: number;
  servicesTtc: number;
  shopByCategory: Record<ShopCategory, number>;
  fuelByGrade: Record<FuelGrade, number>;
}

function blankShopCats(): Record<ShopCategory, number> {
  return {
    frais_sandwichs: 0,
    boissons: 0,
    epicerie_snacks: 0,
    tabac_presse: 0,
    auto_accessoires: 0,
    autre_boutique: 0,
  };
}

function blankFuelGrades(): Record<FuelGrade, number> {
  return { gazole: 0, sp95_e10: 0, sp98: 0, adblue: 0 };
}

/**
 * Agrège l'historique hétérogène (lignes produit ou totaux jour) en CA/jour.
 */
export function aggregateDailyRevenue(history: RevenueHistoryPoint[]): Map<string, DailyCa> {
  const map = new Map<string, DailyCa>();

  const ensure = (date: string): DailyCa => {
    const key = date.slice(0, 10);
    let row = map.get(key);
    if (!row) {
      row = {
        date: key,
        totalTtc: 0,
        fuelTtc: 0,
        shopTtc: 0,
        servicesTtc: 0,
        shopByCategory: blankShopCats(),
        fuelByGrade: blankFuelGrades(),
      };
      map.set(key, row);
    }
    return row;
  };

  for (const h of history) {
    const row = ensure(h.date);

    if (h.totalRevenueTtc != null || h.fuelRevenueTtc != null || h.shopRevenueTtc != null) {
      row.totalTtc += h.totalRevenueTtc ?? 0;
      row.fuelTtc += h.fuelRevenueTtc ?? 0;
      row.shopTtc += h.shopRevenueTtc ?? 0;
      row.servicesTtc += h.servicesRevenueTtc ?? 0;
      if (h.shopByCategory) {
        for (const [k, v] of Object.entries(h.shopByCategory)) {
          row.shopByCategory[k as ShopCategory] += v ?? 0;
        }
      }
      if (h.fuelByGrade) {
        for (const [k, v] of Object.entries(h.fuelByGrade)) {
          row.fuelByGrade[k as FuelGrade] += v ?? 0;
        }
      }
      // Si seul total fourni, répartir heuristiquement
      if (
        (h.totalRevenueTtc ?? 0) > 0 &&
        (h.fuelRevenueTtc ?? 0) === 0 &&
        (h.shopRevenueTtc ?? 0) === 0
      ) {
        row.fuelTtc += (h.totalRevenueTtc ?? 0) * 0.72;
        row.shopTtc += (h.totalRevenueTtc ?? 0) * 0.25;
        row.servicesTtc += (h.totalRevenueTtc ?? 0) * 0.03;
      }
      continue;
    }

    const rev = h.revenueTtc ?? h.revenueHt ?? 0;
    if (rev <= 0) continue;

    if (h.category && isFuelCategory(h.category)) {
      const grade = classifyFuelGrade(h.category);
      row.fuelTtc += rev;
      row.fuelByGrade[grade] += rev;
      row.totalTtc += rev;
    } else if (h.category) {
      const cat = classifyShopCategory(h.category);
      row.shopTtc += rev;
      row.shopByCategory[cat] += rev;
      row.totalTtc += rev;
    } else {
      row.shopTtc += rev;
      row.shopByCategory.autre_boutique += rev;
      row.totalTtc += rev;
    }
  }

  // Compléter total si manquant
  for (const row of map.values()) {
    if (row.totalTtc <= 0) {
      row.totalTtc = row.fuelTtc + row.shopTtc + row.servicesTtc;
    }
  }

  return map;
}

/** Lissage exponentiel sur une série chronologique (plus récent = plus fort). */
export function exponentialSmooth(values: number[], alpha = 0.35): number {
  if (values.length === 0) return 0;
  let s = values[0];
  for (let i = 1; i < values.length; i += 1) {
    s = alpha * values[i] + (1 - alpha) * s;
  }
  return s;
}

function seriesLastWeeks(
  daily: Map<string, DailyCa>,
  planDate: string,
  weeks: number,
  pick: (d: DailyCa) => number
): number[] {
  const out: number[] = [];
  // Du plus ancien au plus récent pour l'EMA
  for (let i = weeks * 7; i >= 1; i -= 1) {
    const d = addDaysIso(planDate, -i);
    const row = daily.get(d);
    if (row) out.push(pick(row));
  }
  return out;
}

function valueOnDate(daily: Map<string, DailyCa>, date: string, pick: (d: DailyCa) => number): number {
  const row = daily.get(date);
  return row ? pick(row) : 0;
}

function sameWeekdaySamples(
  daily: Map<string, DailyCa>,
  planDate: string,
  weekday: number,
  weeks: number,
  pick: (d: DailyCa) => number
): number[] {
  const samples: number[] = [];
  for (let i = 1; i <= weeks * 7; i += 1) {
    const d = addDaysIso(planDate, -i);
    if (weekdayIso(d) !== weekday) continue;
    const v = valueOnDate(daily, d, pick);
    if (v > 0) samples.push(v);
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Tranches horaires (profil type station-service)
// ---------------------------------------------------------------------------

const HOURLY_WEIGHTS_WEEKDAY = [
  0.01, 0.01, 0.01, 0.01, 0.015, 0.03, 0.055, 0.07, 0.065, 0.055, 0.06, 0.075,
  0.08, 0.07, 0.06, 0.055, 0.06, 0.075, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015,
];

const HOURLY_WEIGHTS_WEEKEND = [
  0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.035, 0.05, 0.06, 0.075, 0.09, 0.095,
  0.09, 0.08, 0.07, 0.06, 0.055, 0.055, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015,
];

function buildHourlySlices(
  totalTtc: number,
  shopTtc: number,
  fuelTtc: number,
  date: string
): HourlyRevenueSlice[] {
  const wd = weekdayIso(date);
  const weights = wd >= 6 ? HOURLY_WEIGHTS_WEEKEND : HOURLY_WEIGHTS_WEEKDAY;
  const sumW = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, hour) => {
    const share = w / sumW;
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}h`,
      predictedTotalTtc: round2(totalTtc * share),
      shopShare: totalTtc > 0 ? shopTtc / totalTtc : 0,
      fuelShare: totalTtc > 0 ? fuelTtc / totalTtc : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------------

const W_RECENT = 0.5;
const W_YOY = 0.35;
const W_REALTIME = 0.15;

export function predictStationRevenue(params: RevenuePredictionInput): RevenuePredictionResult {
  const planDate = params.planDate;
  const horizonDays = clamp(params.horizonDays ?? 7, 1, 31);
  const shopVat = params.shopVatRate ?? 0.055;
  const fuelVat = params.fuelVatRate ?? 0.2;
  const servicesVat = 0.2;
  const profile = params.trafficProfile ?? 'mixte';
  const servicesShareFallback = params.servicesShareFallback ?? 0.03;

  const calendar = enrichCalendarDays(params.calendar);
  const weatherByDate = indexByDate(params.weather);
  const trafficByDate = indexByDate(params.traffic);
  const calendarByDate = indexByDate(calendar);
  const daily = aggregateDailyRevenue(params.history);

  const days: DailyRevenueForecast[] = [];

  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDaysIso(planDate, i);
    const wd = weekdayIso(date);
    const wx = weatherByDate.get(date);
    const tr = trafficByDate.get(date);
    const cal = calendarByDate.get(date);

    const pickTotal = (d: DailyCa) => d.totalTtc;
    const pickFuel = (d: DailyCa) => d.fuelTtc;
    const pickShop = (d: DailyCa) => d.shopTtc;
    const pickServices = (d: DailyCa) => d.servicesTtc;

    // 50 % tendance récente (4 semaines + EMA + weekday)
    const recentTotalSeries = seriesLastWeeks(daily, planDate, 4, pickTotal);
    const recentFuelSeries = seriesLastWeeks(daily, planDate, 4, pickFuel);
    const recentShopSeries = seriesLastWeeks(daily, planDate, 4, pickShop);
    const recentServicesSeries = seriesLastWeeks(daily, planDate, 4, pickServices);

    const emaTotal = exponentialSmooth(recentTotalSeries, 0.35);
    const emaFuel = exponentialSmooth(recentFuelSeries, 0.35);
    const emaShop = exponentialSmooth(recentShopSeries, 0.35);
    const emaServices = exponentialSmooth(recentServicesSeries, 0.35);

    const wdTotal = mean(sameWeekdaySamples(daily, planDate, wd, 4, pickTotal));
    const wdFuel = mean(sameWeekdaySamples(daily, planDate, wd, 4, pickFuel));
    const wdShop = mean(sameWeekdaySamples(daily, planDate, wd, 4, pickShop));

    const recentTotal = emaTotal > 0 && wdTotal > 0 ? emaTotal * 0.55 + wdTotal * 0.45 : emaTotal || wdTotal;
    const recentFuel = emaFuel > 0 && wdFuel > 0 ? emaFuel * 0.55 + wdFuel * 0.45 : emaFuel || wdFuel;
    const recentShop = emaShop > 0 && wdShop > 0 ? emaShop * 0.55 + wdShop * 0.45 : emaShop || wdShop;
    const recentServices =
      emaServices > 0 ? emaServices : recentTotal * servicesShareFallback;

    // 35 % N-1 (même weekday calendaire ±3 j autour de J-365)
    const yoyCenter = addDaysIso(date, -365);
    const yoySamples = (pick: (d: DailyCa) => number) => {
      const vals: number[] = [];
      for (let o = -3; o <= 3; o += 1) {
        const v = valueOnDate(daily, addDaysIso(yoyCenter, o), pick);
        if (v > 0) vals.push(v);
      }
      // fallback : même weekday N-1 sur 4 semaines autour
      if (vals.length === 0) {
        for (let w = -2; w <= 2; w += 1) {
          const d = addDaysIso(yoyCenter, w * 7);
          const v = valueOnDate(daily, d, pick);
          if (v > 0) vals.push(v);
        }
      }
      return mean(vals);
    };

    const yoyTotal = yoySamples(pickTotal);
    const yoyFuel = yoySamples(pickFuel);
    const yoyShop = yoySamples(pickShop);
    const yoyServices = yoySamples(pickServices);

    // Si N-1 absent, reporter le poids sur le récent
    const hasYoy = yoyTotal > 0;
    const wRecent = hasYoy ? W_RECENT : W_RECENT + W_YOY;
    const wYoy = hasYoy ? W_YOY : 0;
    const wRt = W_REALTIME;

    // Proxy « temps réel » = ancrage récent (sera multiplié par le contexte ci-dessous)
    const rtFuel = recentFuel;
    const rtShop = recentShop;
    const rtServices = recentServices > 0 ? recentServices : recentTotal * servicesShareFallback;

    // Baseline pondérée 50 % / 35 % / 15 % (avant élasticités contextuelles)
    let baseFuel = recentFuel * wRecent + yoyFuel * wYoy + rtFuel * wRt;
    let baseShop = recentShop * wRecent + yoyShop * wYoy + rtShop * wRt;
    let baseServices =
      (recentServices > 0 ? recentServices : recentTotal * servicesShareFallback) * wRecent +
      (yoyServices > 0 ? yoyServices : 0) * wYoy +
      rtServices * wRt;

    // Normaliser si les piliers sont vides mais total récent existe
    if (baseFuel + baseShop <= 0 && recentTotal > 0) {
      baseFuel = recentTotal * 0.72;
      baseShop = recentTotal * 0.25;
      baseServices = recentTotal * 0.03;
    }

    // Élasticités contextuelles (météo, vacances, Bison Futé) appliquées sur la baseline —
    // arbitrage type directeur d'exploitation, pas un simple amortissement à 15 %.
    const fuelCtx = fuelContextMultiplier(wx, cal, tr);
    const shopMult = shopContextMultipliers(wx, cal, tr);
    const conversion = pisteToShopConversionRate(profile, cal, tr);

    // Baseline "neutre" de conversion (mixte hors pic) pour mesurer l'écart
    const conversionNeutral = pisteToShopConversionRate('mixte');
    const conversionLift = conversion / conversionNeutral;

    // Boutique : moyenne pondérée des multi-catégories + conversion piste
    const shopCatAvg =
      (shopMult.boissons * 0.28 +
        shopMult.frais_sandwichs * 0.22 +
        shopMult.epicerie_snacks * 0.2 +
        shopMult.tabac_presse * 0.12 +
        shopMult.auto_accessoires * 0.1 +
        shopMult.autre_boutique * 0.08) *
      shopMult.cafeHotPenalty;

    const fuelTtc = baseFuel * fuelCtx.factor;
    const shopTtc = baseShop * shopCatAvg * (0.85 + 0.15 * conversionLift);
    const servicesTtc =
      baseServices *
      (cal?.isChasseCroise ? 1.15 : 1) *
      (tr?.trafficScore && tr.trafficScore >= 80 ? 1.08 : 1);
    const totalTtc = fuelTtc + shopTtc + servicesTtc;

    // Répartition carburant
    const fuelShareDefault: Record<FuelGrade, number> = {
      gazole: 0.58,
      sp95_e10: 0.28,
      sp98: 0.1,
      adblue: 0.04,
    };
    // Estimer parts depuis historique récent
    const fuelHist = blankFuelGrades();
    let fuelHistSum = 0;
    for (let i = 1; i <= 28; i += 1) {
      const row = daily.get(addDaysIso(planDate, -i));
      if (!row) continue;
      for (const g of Object.keys(fuelHist) as FuelGrade[]) {
        fuelHist[g] += row.fuelByGrade[g];
        fuelHistSum += row.fuelByGrade[g];
      }
    }
    const fuelParts =
      fuelHistSum > 0
        ? (Object.fromEntries(
            (Object.keys(fuelHist) as FuelGrade[]).map((g) => [g, fuelHist[g] / fuelHistSum])
          ) as Record<FuelGrade, number>)
        : fuelShareDefault;

    const fuelRevenue: FuelRevenueBreakdown = emptyFuel(fuelVat);
    fuelRevenue.total = money(fuelTtc, fuelVat);
    for (const g of Object.keys(fuelParts) as FuelGrade[]) {
      fuelRevenue.byGrade[g] = money(fuelTtc * fuelParts[g], fuelVat);
    }

    // Répartition boutique
    const shopHist = blankShopCats();
    let shopHistSum = 0;
    for (let i = 1; i <= 28; i += 1) {
      const row = daily.get(addDaysIso(planDate, -i));
      if (!row) continue;
      for (const c of Object.keys(shopHist) as ShopCategory[]) {
        shopHist[c] += row.shopByCategory[c];
        shopHistSum += row.shopByCategory[c];
      }
    }
    const shopShareDefault: Record<ShopCategory, number> = {
      frais_sandwichs: 0.22,
      boissons: 0.28,
      epicerie_snacks: 0.2,
      tabac_presse: 0.12,
      auto_accessoires: 0.1,
      autre_boutique: 0.08,
    };
    const shopParts =
      shopHistSum > 0
        ? (Object.fromEntries(
            (Object.keys(shopHist) as ShopCategory[]).map((c) => [c, shopHist[c] / shopHistSum])
          ) as Record<ShopCategory, number>)
        : shopShareDefault;

    // Appliquer multi par catégorie puis renormaliser
    const weighted: Record<ShopCategory, number> = { ...shopParts };
    weighted.boissons *= shopMult.boissons * shopMult.cafeHotPenalty;
    weighted.frais_sandwichs *= shopMult.frais_sandwichs;
    weighted.epicerie_snacks *= shopMult.epicerie_snacks;
    weighted.tabac_presse *= shopMult.tabac_presse;
    weighted.auto_accessoires *= shopMult.auto_accessoires;
    weighted.autre_boutique *= shopMult.autre_boutique;
    const wSum = Object.values(weighted).reduce((a, b) => a + b, 0) || 1;

    const shopRevenue: ShopRevenueBreakdown = emptyShop(shopVat);
    shopRevenue.total = money(shopTtc, shopVat);
    for (const c of Object.keys(weighted) as ShopCategory[]) {
      shopRevenue.byCategory[c] = money(shopTtc * (weighted[c] / wSum), shopVat);
    }

    const servicesRevenue: ServicesRevenueBreakdown = {
      total: money(servicesTtc, servicesVat),
      evCharging: money(servicesTtc * 0.55, servicesVat),
      carWash: money(servicesTtc * 0.45, servicesVat),
    };

    const predictedTotalRevenue = money(totalTtc, shopVat); // mix ; on expose TTC fiable
    predictedTotalRevenue.ht = round2(
      fuelRevenue.total.ht + shopRevenue.total.ht + servicesRevenue.total.ht
    );
    predictedTotalRevenue.ttc = round2(totalTtc);

    // Comparaisons J-7 / N-1
    const j7 = valueOnDate(daily, addDaysIso(date, -7), pickTotal);
    const n1 = yoyTotal;
    const comparison: RevenueComparison = {
      vsJ7: {
        absoluteTtc: round2(totalTtc - j7),
        pct: j7 > 0 ? round2(((totalTtc - j7) / j7) * 100) : null,
        baselineTtc: round2(j7),
      },
      vsN1: {
        absoluteTtc: round2(totalTtc - n1),
        pct: n1 > 0 ? round2(((totalTtc - n1) / n1) * 100) : null,
        baselineTtc: round2(n1),
      },
    };

    // Drivers top 3
    const driverFactors = [...shopMult.drivers, ...fuelCtx.drivers]
      .sort((a, b) => Math.abs(b.impactPct) - Math.abs(a.impactPct))
      .slice(0, 3);

    if (driverFactors.length < 3) {
      driverFactors.push({
        label: `Conversion piste→boutique ${(conversion * 100).toFixed(0)} % (${profile})`,
        impactPct: Math.round((conversionLift - 1) * 100),
        pillar: 'shop',
      });
    }

    // Intervalle de confiance : base ±5 %, élargi si météo/trafic incertains
    let halfWidth = 0.05;
    if (wx?.tempMaxC == null) halfWidth += 0.015;
    if (tr?.trafficScore == null) halfWidth += 0.015;
    if (!hasYoy) halfWidth += 0.02;
    halfWidth = clamp(halfWidth, 0.05, 0.12);

    const confidenceInterval: ConfidenceInterval = {
      halfWidthPct: round2(halfWidth * 100),
      low: {
        ht: round2(predictedTotalRevenue.ht * (1 - halfWidth)),
        ttc: round2(predictedTotalRevenue.ttc * (1 - halfWidth)),
      },
      median: { ...predictedTotalRevenue },
      high: {
        ht: round2(predictedTotalRevenue.ht * (1 + halfWidth)),
        ttc: round2(predictedTotalRevenue.ttc * (1 + halfWidth)),
      },
    };

    days.push({
      date,
      predictedTotalRevenue,
      breakdown: {
        fuelRevenue,
        shopRevenue,
        evChargingAndServicesRevenue: servicesRevenue,
      },
      comparison,
      driverFactors,
      confidenceInterval,
      hourly: buildHourlySlices(totalTtc, shopTtc, fuelTtc, date),
      weights: { recent: wRecent, yoy: wYoy, realtime: wRt },
      conversionRate: round2(conversion * 100) / 100,
      trafficProfile: profile,
    });
  }

  const horizonTotalTtc = days.reduce((s, d) => s + d.predictedTotalRevenue.ttc, 0);
  const horizonTotalHt = days.reduce((s, d) => s + d.predictedTotalRevenue.ht, 0);
  const topDrivers = [...days[0]?.driverFactors ?? []].slice(0, 3);

  return {
    generatedAt: new Date().toISOString(),
    planDate,
    horizonDays,
    days,
    horizonTotal: { ht: round2(horizonTotalHt), ttc: round2(horizonTotalTtc) },
    topDrivers,
  };
}

/** API async compatible (calcul synchrone encapsulé). */
export async function predictStationRevenueAsync(
  params: RevenuePredictionInput
): Promise<RevenuePredictionResult> {
  return predictStationRevenue(params);
}
