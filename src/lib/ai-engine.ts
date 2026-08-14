/**
 * @deprecated Utiliser `@/services/orbitaire/predictiveEngine`.
 * Conservé pour compatibilité avec d'anciens appels.
 */
import { classifyCategory, runPredictiveEngine } from '@/services/orbitaire/predictiveEngine';

export function calculateSmartOrder(
  products: Array<{
    id?: string;
    name?: string;
    category?: string;
    current_stock?: number;
    min_threshold?: number;
    target_stock?: number;
  }>,
  weather: { temp?: number; condition?: string },
  isVacances: boolean
) {
  const planDate = new Date().toISOString().split('T')[0];
  const result = runPredictiveEngine({
    planDate,
    horizonDays: 3,
    salesHistory: [],
    weather: [
      {
        date: planDate,
        tempMaxC: weather.temp ?? 15,
        condition: weather.condition,
        alertLevel: 'none',
      },
    ],
    traffic: [{ date: planDate, trafficScore: 55 }],
    calendar: [{ date: planDate, isSchoolHoliday: isVacances }],
    stocks: products.map((p, i) => ({
      productId: p.id || `p-${i}`,
      name: p.name || 'Produit',
      category: p.category || 'Divers',
      currentStock: p.current_stock ?? 0,
      minThreshold: p.min_threshold,
      targetStock: p.target_stock,
    })),
  });

  return result.recommendations.map((r) => ({
    id: r.productId,
    name: r.name,
    category: r.category,
    categoryKind: classifyCategory(r.category),
    current_stock: r.currentStock,
    suggestedQuantity: r.suggestedOrderQty,
    reason: r.justification.summary,
    priority: r.riskStatus === 'rupture_imminente' ? 'Haute' : 'Normale',
    confidencePct: r.confidencePct,
    riskStatus: r.riskStatus,
  }));
}
