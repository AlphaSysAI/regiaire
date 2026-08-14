/* =========================
   Règles de multiplicateurs de demande — moteur réappro
   v1 heuristique, inspirée d'OrbitAire, adaptée à OrbitAire
   (pas de zone Bison Futé admin : on utilise le score trafic
   déjà calculé par /api/traffic comme proxy d'affluence).
========================= */

export type DemandMultiplierRule = {
  id: string;
  label: string;
  /** Catégories ciblées (comparaison insensible à la casse, "contains") ; vide = toutes */
  categories: string[];
  factor: number;
};

export const DEMAND_MULTIPLIER_RULES: DemandMultiplierRule[] = [
  {
    id: 'heat-drinks',
    label: 'Forte chaleur (≥ 28°C) → boissons ×1,6',
    categories: ['boisson'],
    factor: 1.6,
  },
  {
    id: 'heat-ice-cream',
    label: 'Chaleur (≥ 25°C) → glaces ×2',
    categories: ['glace'],
    factor: 2,
  },
  {
    id: 'high-traffic',
    label: 'Trafic très dense (score ≥ 80) → toutes catégories ×1,8',
    categories: [],
    factor: 1.8,
  },
  {
    id: 'school-holidays',
    label: 'Vacances scolaires → toutes catégories ×1,3',
    categories: [],
    factor: 1.3,
  },
];

const HEAT_DRINKS_THRESHOLD_C = 28;
const HEAT_ICE_THRESHOLD_C = 25;
const HIGH_TRAFFIC_SCORE = 80;

export type DayDemandContext = {
  date: string;
  tempMaxC: number | null;
  trafficScore: number | null;
  isOnHoliday: boolean;
};

function categoryMatches(category: string, targets: string[]): boolean {
  if (targets.length === 0) return true;
  const c = category.toLowerCase();
  return targets.some((t) => c.includes(t));
}

/**
 * Multiplicateurs applicables pour une catégorie et un jour donné.
 * Retourne le produit des facteurs et les libellés des règles déclenchées.
 */
export function getCategoryMultipliersForDay(
  category: string,
  ctx: DayDemandContext
): { factor: number; reasons: string[] } {
  let factor = 1;
  const reasons: string[] = [];

  for (const rule of DEMAND_MULTIPLIER_RULES) {
    if (!categoryMatches(category, rule.categories)) continue;

    let triggered = false;
    switch (rule.id) {
      case 'heat-drinks':
        triggered = ctx.tempMaxC != null && ctx.tempMaxC >= HEAT_DRINKS_THRESHOLD_C;
        break;
      case 'heat-ice-cream':
        triggered = ctx.tempMaxC != null && ctx.tempMaxC >= HEAT_ICE_THRESHOLD_C;
        break;
      case 'high-traffic':
        triggered = ctx.trafficScore != null && ctx.trafficScore >= HIGH_TRAFFIC_SCORE;
        break;
      case 'school-holidays':
        triggered = ctx.isOnHoliday;
        break;
      default:
        break;
    }

    if (triggered) {
      factor *= rule.factor;
      reasons.push(rule.label);
    }
  }

  return { factor, reasons };
}
