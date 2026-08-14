/**
 * Jeux de données mockés — validation du moteur CA OrbitAire
 * Exécution : npx tsx src/services/orbitaire/revenuePredictionEngine.scenarios.ts
 */

import {
  predictStationRevenue,
  type RevenueHistoryPoint,
  type RevenuePredictionInput,
} from './revenuePredictionEngine';
import type { CalendarDayInput, TrafficDayInput, WeatherDayInput } from './predictiveEngine';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Génère 8 semaines d'historique CA station (hiver calme). */
function buildWinterHistory(planDate: string): RevenueHistoryPoint[] {
  const rows: RevenueHistoryPoint[] = [];
  for (let i = 56; i >= 1; i -= 1) {
    const date = addDaysIso(planDate, -i);
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dim
    const weekend = dow === 0 || dow === 6;
    const fuel = weekend ? 8200 : 7100;
    const shop = weekend ? 2400 : 1900;
    const services = weekend ? 280 : 220;
    rows.push({
      date,
      totalRevenueTtc: fuel + shop + services,
      fuelRevenueTtc: fuel,
      shopRevenueTtc: shop,
      servicesRevenueTtc: services,
      shopByCategory: {
        boissons: shop * 0.25,
        frais_sandwichs: shop * 0.22,
        epicerie_snacks: shop * 0.2,
        tabac_presse: shop * 0.15,
        auto_accessoires: shop * 0.1,
        autre_boutique: shop * 0.08,
      },
      fuelByGrade: {
        gazole: fuel * 0.6,
        sp95_e10: fuel * 0.28,
        sp98: fuel * 0.08,
        adblue: fuel * 0.04,
      },
    });
  }
  // N-1 approximatif (même pattern un an avant)
  for (let i = 56; i >= 1; i -= 1) {
    const date = addDaysIso(addDaysIso(planDate, -365), -i);
    rows.push({
      date,
      totalRevenueTtc: 9000,
      fuelRevenueTtc: 6500,
      shopRevenueTtc: 2200,
      servicesRevenueTtc: 300,
    });
  }
  return rows;
}

function scenarioWeekdayWinter(): void {
  const planDate = '2026-01-14'; // mercredi hiver
  const weather: WeatherDayInput[] = [
    { date: planDate, tempMaxC: 6, condition: 'Clouds', precipMm: 0, alertLevel: 'none' },
  ];
  const traffic: TrafficDayInput[] = [
    { date: planDate, trafficScore: 48, lightVehicleShare: 0.7, heavyVehicleShare: 0.3 },
  ];
  const calendar: CalendarDayInput[] = [
    { date: planDate, isSchoolHoliday: false, isChasseCroise: false },
  ];

  const input: RevenuePredictionInput = {
    planDate,
    horizonDays: 1,
    history: buildWinterHistory(planDate),
    weather,
    traffic,
    calendar,
    trafficProfile: 'vl_pendulaire',
  };

  const result = predictStationRevenue(input);
  const day = result.days[0];
  assert(day.predictedTotalRevenue.ttc > 5000, 'CA hiver trop bas');
  assert(day.predictedTotalRevenue.ttc < 14000, 'CA hiver trop haut pour jour ouvrable');
  assert(
    day.breakdown.fuelRevenue.total.ttc > day.breakdown.shopRevenue.total.ttc,
    'Carburant doit dominer en hiver pendulaire'
  );
  assert(day.conversionRate <= 0.3, 'Conversion pendulaire doit rester faible');
  console.log('✓ scenarioWeekdayWinter', {
    ca: day.predictedTotalRevenue.ttc,
    fuel: day.breakdown.fuelRevenue.total.ttc,
    shop: day.breakdown.shopRevenue.total.ttc,
    conversion: day.conversionRate,
  });
}

function scenarioSummerHolidaySaturday(): void {
  const planDate = '2026-07-11'; // samedi été
  const history = buildWinterHistory(planDate).map((h) => {
    // Booster l'historique récent type été
    if (h.date >= addDaysIso(planDate, -28) && h.fuelRevenueTtc) {
      return {
        ...h,
        fuelRevenueTtc: h.fuelRevenueTtc * 1.25,
        shopRevenueTtc: (h.shopRevenueTtc ?? 0) * 1.35,
        totalRevenueTtc:
          h.fuelRevenueTtc * 1.25 + (h.shopRevenueTtc ?? 0) * 1.35 + (h.servicesRevenueTtc ?? 0),
      };
    }
    return h;
  });

  const weather: WeatherDayInput[] = [
    { date: planDate, tempMaxC: 32, condition: 'Clear', precipMm: 0, alertLevel: 'orange' },
  ];
  const traffic: TrafficDayInput[] = [
    { date: planDate, trafficScore: 92, lightVehicleShare: 0.82, heavyVehicleShare: 0.18 },
  ];
  const calendar: CalendarDayInput[] = [
    {
      date: planDate,
      isSchoolHoliday: true,
      isChasseCroise: true,
      isEuropeanTransitPeak: true,
      zones: ['A', 'C'],
    },
  ];

  const result = predictStationRevenue({
    planDate,
    horizonDays: 1,
    history,
    weather,
    traffic,
    calendar,
    trafficProfile: 'vl_transit',
  });

  const day = result.days[0];
  const shop = day.breakdown.shopRevenue;
  assert(day.predictedTotalRevenue.ttc > 10000, 'CA samedi rouge trop bas');
  assert(shop.byCategory.boissons.ttc > shop.byCategory.tabac_presse.ttc, 'Boissons > tabac sous canicule');
  assert(day.conversionRate >= 0.4, 'Conversion transit vacances élevée');
  assert(day.driverFactors.length >= 1, 'Au moins un driver causal');
  assert(
    day.driverFactors.some((d) => /chaleur|canicule|chassé|vacances|trafic|samedi/i.test(d.label)),
    'Driver doit mentionner contexte été/vacances'
  );
  assert(
    day.confidenceInterval.high.ttc > day.confidenceInterval.median.ttc &&
      day.confidenceInterval.low.ttc < day.confidenceInterval.median.ttc,
    'Intervalle de confiance cohérent'
  );

  console.log('✓ scenarioSummerHolidaySaturday', {
    ca: day.predictedTotalRevenue.ttc,
    boissons: shop.byCategory.boissons.ttc,
    frais: shop.byCategory.frais_sandwichs.ttc,
    drivers: day.driverFactors.map((d) => d.label),
    vsJ7pct: day.comparison.vsJ7.pct,
  });
}

function scenarioRainyTuesday(): void {
  const planDate = '2026-03-10';
  const weather: WeatherDayInput[] = [
    { date: planDate, tempMaxC: 12, condition: 'Rain', precipMm: 8, alertLevel: 'yellow' },
  ];
  const traffic: TrafficDayInput[] = [{ date: planDate, trafficScore: 55 }];
  const calendar: CalendarDayInput[] = [{ date: planDate, isSchoolHoliday: false }];

  const result = predictStationRevenue({
    planDate,
    horizonDays: 1,
    history: buildWinterHistory(planDate),
    weather,
    traffic,
    calendar,
    trafficProfile: 'mixte',
  });

  const day = result.days[0];
  assert(
    day.driverFactors.some((d) => /intemp|pluie|snacking/i.test(d.label)) ||
      day.breakdown.shopRevenue.byCategory.epicerie_snacks.ttc > 0,
    'Pluie doit booster snacking / driver'
  );
  assert(day.hourly.length === 24, '24 tranches horaires');
  const peak = Math.max(...day.hourly.map((h) => h.predictedTotalTtc));
  const night = day.hourly[3].predictedTotalTtc;
  assert(peak > night * 2, 'Pic diurne > nuit');
  console.log('✓ scenarioRainyTuesday', {
    ca: day.predictedTotalRevenue.ttc,
    snacks: day.breakdown.shopRevenue.byCategory.epicerie_snacks.ttc,
  });
}

function main(): void {
  scenarioWeekdayWinter();
  scenarioSummerHolidaySaturday();
  scenarioRainyTuesday();
  console.log('\nTous les scénarios CA OrbitAire sont OK.');
}

main();
