'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { OrderRecommendation, RiskStatus } from '@/services/orbitaire/predictiveEngine';
import type {
  OrderActionResult,
  OrderExportPayload,
  OrderStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  UrgencyLevel,
} from '@/types/purchase-orders';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const qtySchema = z.number().finite().min(0).max(1_000_000);

const recommendationSchema = z.object({
  productId: z.string().min(1),
  ean: z.string().optional(),
  name: z.string(),
  category: z.string(),
  currentStock: z.number(),
  estimatedSalesJ3: z.number(),
  suggestedOrderQty: z.number(),
  riskStatus: z.enum(['normal', 'vigilance', 'rupture_imminente']),
  confidencePct: z.number(),
  justification: z.object({
    summary: z.string(),
    drivers: z.array(z.object({ label: z.string(), contributionPct: z.number() })),
  }),
});

// ---------------------------------------------------------------------------
// Mappers DB ↔ domaine
// ---------------------------------------------------------------------------

type DbOrder = {
  id: string;
  station_id: string;
  order_number: string;
  status: OrderStatus;
  category: string | null;
  plan_date: string;
  total_estimated_ht: number | string;
  validated_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  delivery_date: string | null;
  notes: string | null;
  export_payload: OrderExportPayload | null;
  created_at: string;
  updated_at: string;
};

type DbItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  category: string;
  ean: string | null;
  current_stock: number | string;
  suggested_qty: number | string;
  adjusted_qty: number | string;
  unit_price_ht: number | string;
  is_validated: boolean;
  urgency_level: UrgencyLevel;
  reason_code: string | null;
  estimated_sales_j3: number | string | null;
  confidence_pct: number | string | null;
  justification_summary: string | null;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapItem(row: DbItem): PurchaseOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    category: row.category,
    ean: row.ean,
    currentStock: num(row.current_stock),
    suggestedQty: num(row.suggested_qty),
    adjustedQty: num(row.adjusted_qty),
    unitPriceHT: num(row.unit_price_ht),
    isValidated: !!row.is_validated,
    urgencyLevel: row.urgency_level,
    reasonCode: row.reason_code,
    estimatedSalesJ3: num(row.estimated_sales_j3),
    confidencePct: num(row.confidence_pct),
    justificationSummary: row.justification_summary,
  };
}

function mapOrder(row: DbOrder, items: PurchaseOrderItem[]): PurchaseOrder {
  return {
    id: row.id,
    stationId: row.station_id,
    orderNumber: row.order_number,
    status: row.status,
    category: row.category,
    planDate: String(row.plan_date).slice(0, 10),
    totalEstimatedHT: num(row.total_estimated_ht),
    validatedAt: row.validated_at,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    deliveryDate: row.delivery_date ? String(row.delivery_date).slice(0, 10) : null,
    notes: row.notes,
    exportPayload: row.export_payload,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function riskToUrgency(risk: RiskStatus): UrgencyLevel {
  if (risk === 'rupture_imminente') return 'CRITICAL';
  if (risk === 'vigilance') return 'WARNING';
  return 'NORMAL';
}

function reasonFromRecommendation(rec: OrderRecommendation): string | null {
  const top = rec.justification.drivers[0];
  if (!top) return null;
  return top.label
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function fail<T>(error: string): OrderActionResult<T> {
  return { success: false, error };
}

function ok<T>(data: T): OrderActionResult<T> {
  return { success: true, data };
}

async function loadOrderFull(orderId: string): Promise<PurchaseOrder | null> {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('urgency_level', { ascending: true })
    .order('product_name', { ascending: true });

  if (itemsError) return null;
  const mapped = ((items ?? []) as DbItem[]).map(mapItem);
  const rank: Record<UrgencyLevel, number> = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };
  mapped.sort((a, b) => {
    const r = rank[a.urgencyLevel] - rank[b.urgencyLevel];
    if (r !== 0) return r;
    return a.productName.localeCompare(b.productName, 'fr');
  });
  return mapOrder(order as DbOrder, mapped);
}

/** Total HT des lignes validées (qty > 0). */
function computeValidatedTotalHT(items: PurchaseOrderItem[]): number {
  return Math.round(
    items
      .filter((i) => i.isValidated && i.adjustedQty > 0)
      .reduce((s, i) => s + i.adjustedQty * i.unitPriceHT, 0) * 100
  ) / 100;
}

async function recalculateOrderTotals(orderId: string): Promise<PurchaseOrder | null> {
  const supabase = getSupabaseAdmin();
  const order = await loadOrderFull(orderId);
  if (!order) return null;

  const total = computeValidatedTotalHT(order.items);
  const allNeeded = order.items.filter((i) => i.adjustedQty > 0);
  const allValidated =
    allNeeded.length > 0 && allNeeded.every((i) => i.isValidated);

  const patch: Record<string, unknown> = {
    total_estimated_ht: total,
  };

  if (allValidated && order.status === 'DRAFT') {
    patch.status = 'VALIDATED';
    patch.validated_at = new Date().toISOString();
  } else if (!allValidated && order.status === 'VALIDATED') {
    patch.status = 'DRAFT';
    patch.validated_at = null;
  }

  const { error } = await supabase.from('purchase_orders').update(patch).eq('id', orderId);
  if (error) return null;
  return loadOrderFull(orderId);
}

async function nextOrderNumber(stationId: string, planDate: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const [y, m] = planDate.split('-');
  const prefix = `ORD-${y}-${m}-`;

  const { data } = await supabase
    .from('purchase_orders')
    .select('order_number')
    .eq('station_id', stationId)
    .like('order_number', `${prefix}%`)
    .order('order_number', { ascending: false })
    .limit(1);

  const last = data?.[0]?.order_number as string | undefined;
  let seq = 1;
  if (last) {
    const tail = Number(last.split('-').pop());
    if (Number.isFinite(tail)) seq = tail + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

async function fetchUnitPrices(
  stationId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('products')
    .select('id, price_ht')
    .eq('aire_id', stationId)
    .in('id', productIds);
  for (const row of data ?? []) {
    map.set(row.id as string, num(row.price_ht as number));
  }
  return map;
}

function buildCsv(order: PurchaseOrder, items: PurchaseOrderItem[]): string {
  const header = 'ean;nom;categorie;qte;prix_ht;ligne_ht;urgence;raison';
  const lines = items.map((i) => {
    const lineHt = Math.round(i.adjustedQty * i.unitPriceHT * 100) / 100;
    return [
      i.ean || i.productId,
      i.productName.replace(/;/g, ','),
      i.category.replace(/;/g, ','),
      i.adjustedQty,
      i.unitPriceHT,
      lineHt,
      i.urgencyLevel,
      (i.reasonCode || '').replace(/;/g, ','),
    ].join(';');
  });
  return [header, ...lines, `# ${order.orderNumber};total_ht;${order.totalEstimatedHT}`].join(
    '\n'
  );
}

function buildExportPayload(
  order: PurchaseOrder,
  items: PurchaseOrderItem[],
  deliveryDate: string | null
): OrderExportPayload {
  const fuelLike = /carbur|diesel|gazole|sp95|sp98|adblue|gpl/i;
  let boutiqueUnits = 0;
  let fuelLitresApprox = 0;
  for (const i of items) {
    if (fuelLike.test(i.category) || fuelLike.test(i.productName)) {
      fuelLitresApprox += i.adjustedQty;
    } else {
      boutiqueUnits += i.adjustedQty;
    }
  }

  const csv = buildCsv({ ...order, totalEstimatedHT: computeValidatedTotalHT(items) }, items);

  return {
    orderNumber: order.orderNumber,
    stationId: order.stationId,
    status: 'SENT',
    sentAt: new Date().toISOString(),
    deliveryDate,
    totalEstimatedHT: computeValidatedTotalHT(items),
    itemCount: items.length,
    validatedItemCount: items.length,
    volumes: { boutiqueUnits, fuelLitresApprox },
    items: items.map((i) => ({
      productId: i.productId,
      ean: i.ean,
      productName: i.productName,
      category: i.category,
      qty: i.adjustedQty,
      unitPriceHT: i.unitPriceHT,
      lineHT: Math.round(i.adjustedQty * i.unitPriceHT * 100) / 100,
      urgencyLevel: i.urgencyLevel,
    })),
    csv,
    webhookReady: {
      event: 'purchase_order.sent',
      orderId: order.id,
      orderNumber: order.orderNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Actions publiques
// ---------------------------------------------------------------------------

export type DraftSeedInput = {
  planDate?: string;
  recommendations: OrderRecommendation[];
};

/**
 * Récupère le brouillon actif (DRAFT/VALIDATED) du jour, ou en crée un
 * à partir des suggestions du moteur prédictif.
 */
export async function getOrCreateDraftOrder(
  stationId: string,
  seed?: DraftSeedInput
): Promise<OrderActionResult<PurchaseOrder>> {
  try {
    const parsedId = uuidSchema.safeParse(stationId);
    if (!parsedId.success) return fail('stationId invalide');

    const planDate = seed?.planDate?.slice(0, 10) || todayIso();
    const supabase = getSupabaseAdmin();

    const { data: existing, error: findError } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('station_id', stationId)
      .eq('plan_date', planDate)
      .in('status', ['DRAFT', 'VALIDATED'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError && !/does not exist|relation/i.test(findError.message)) {
      return fail(findError.message);
    }

    if (existing?.id) {
      const order = await loadOrderFull(existing.id);
      if (!order) return fail('Brouillon introuvable');

      // Enrichir avec de nouvelles suggestions non encore présentes
      if (seed?.recommendations?.length) {
        const existingIds = new Set(order.items.map((i) => i.productId));
        const toAdd = seed.recommendations.filter(
          (r) => !existingIds.has(r.productId) && r.suggestedOrderQty > 0
        );
        if (toAdd.length > 0) {
          const prices = await fetchUnitPrices(
            stationId,
            toAdd.map((r) => r.productId)
          );
          const rows = toAdd.map((rec) => ({
            order_id: order.id,
            product_id: rec.productId,
            product_name: rec.name,
            category: rec.category,
            ean: rec.ean ?? null,
            current_stock: rec.currentStock,
            suggested_qty: rec.suggestedOrderQty,
            adjusted_qty: rec.suggestedOrderQty,
            unit_price_ht: prices.get(rec.productId) ?? 0,
            is_validated: false,
            urgency_level: riskToUrgency(rec.riskStatus),
            reason_code: reasonFromRecommendation(rec),
            estimated_sales_j3: rec.estimatedSalesJ3,
            confidence_pct: rec.confidencePct,
            justification_summary: rec.justification.summary,
          }));
          await supabase.from('purchase_order_items').insert(rows);
          const refreshed = await loadOrderFull(order.id);
          if (refreshed) return ok(refreshed);
        }
      }
      return ok(order);
    }

    if (!seed?.recommendations?.length) {
      return fail('Aucune suggestion pour initialiser la commande');
    }

    const recsParsed = z.array(recommendationSchema).safeParse(seed.recommendations);
    if (!recsParsed.success) return fail('Suggestions invalides');

    const actionable = seed.recommendations.filter((r) => r.suggestedOrderQty > 0).slice(0, 80);
    if (actionable.length === 0) {
      return fail('Aucune quantité suggérée > 0');
    }

    const orderNumber = await nextOrderNumber(stationId, planDate);
    const prices = await fetchUnitPrices(
      stationId,
      actionable.map((r) => r.productId)
    );

    const { data: created, error: createError } = await supabase
      .from('purchase_orders')
      .insert({
        station_id: stationId,
        order_number: orderNumber,
        status: 'DRAFT',
        category: 'BOUTIQUE',
        plan_date: planDate,
        total_estimated_ht: 0,
        notes: 'Généré par OrbitAire — matrice de commande optimisée',
      })
      .select('*')
      .single();

    if (createError || !created) {
      return fail(createError?.message || 'Création commande impossible');
    }

    const rows = actionable.map((rec) => ({
      order_id: created.id,
      product_id: rec.productId,
      product_name: rec.name,
      category: rec.category,
      ean: rec.ean ?? null,
      current_stock: rec.currentStock,
      suggested_qty: rec.suggestedOrderQty,
      adjusted_qty: rec.suggestedOrderQty,
      unit_price_ht: prices.get(rec.productId) ?? 0,
      is_validated: false,
      urgency_level: riskToUrgency(rec.riskStatus),
      reason_code: reasonFromRecommendation(rec),
      estimated_sales_j3: rec.estimatedSalesJ3,
      confidence_pct: rec.confidencePct,
      justification_summary: rec.justification.summary,
    }));

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(rows);
    if (itemsError) {
      await supabase.from('purchase_orders').delete().eq('id', created.id);
      return fail(itemsError.message);
    }

    const order = await loadOrderFull(created.id);
    if (!order) return fail('Commande créée mais illisible');
    return ok(order);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur getOrCreateDraftOrder');
  }
}

export async function toggleOrderItemValidation(
  itemId: string,
  isValidated: boolean
): Promise<OrderActionResult<PurchaseOrder>> {
  try {
    if (!uuidSchema.safeParse(itemId).success) return fail('itemId invalide');
    const supabase = getSupabaseAdmin();

    const { data: item, error } = await supabase
      .from('purchase_order_items')
      .update({ is_validated: isValidated })
      .eq('id', itemId)
      .select('order_id')
      .single();

    if (error || !item) return fail(error?.message || 'Ligne introuvable');

    const order = await recalculateOrderTotals(item.order_id as string);
    if (!order) return fail('Recalcul impossible');
    return ok(order);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur toggle validation');
  }
}

export async function updateOrderItemQuantity(
  itemId: string,
  adjustedQty: number
): Promise<OrderActionResult<PurchaseOrder>> {
  try {
    if (!uuidSchema.safeParse(itemId).success) return fail('itemId invalide');
    const qty = qtySchema.safeParse(adjustedQty);
    if (!qty.success) return fail('Quantité invalide');

    const supabase = getSupabaseAdmin();

    // qty = 0 → retire de la commande (annule la validation). Sinon conserve l'état
    // pour permettre de modifier librement après un « Annuler » sans re-valider auto.
    const patch: { adjusted_qty: number; is_validated?: boolean } = {
      adjusted_qty: qty.data,
    };
    if (qty.data === 0) {
      patch.is_validated = false;
    }

    const { data: item, error } = await supabase
      .from('purchase_order_items')
      .update(patch)
      .eq('id', itemId)
      .select('order_id')
      .single();

    if (error || !item) return fail(error?.message || 'Ligne introuvable');

    const order = await recalculateOrderTotals(item.order_id as string);
    if (!order) return fail('Recalcul impossible');
    return ok(order);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur update quantité');
  }
}

export async function bulkValidateItems(
  orderId: string,
  itemIds?: string[]
): Promise<OrderActionResult<PurchaseOrder>> {
  try {
    if (!uuidSchema.safeParse(orderId).success) return fail('orderId invalide');
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('purchase_order_items')
      .update({ is_validated: true })
      .eq('order_id', orderId)
      .gt('adjusted_qty', 0);

    if (itemIds && itemIds.length > 0) {
      const ids = itemIds.filter((id) => uuidSchema.safeParse(id).success);
      if (ids.length === 0) return fail('Aucun itemId valide');
      query = query.in('id', ids);
    }

    const { error } = await query;
    if (error) return fail(error.message);

    const order = await recalculateOrderTotals(orderId);
    if (!order) return fail('Recalcul impossible');
    return ok(order);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur validation groupée');
  }
}

export async function finalizeAndSendOrder(
  orderId: string,
  deliveryDate?: string | Date | null
): Promise<OrderActionResult<{ order: PurchaseOrder; export: OrderExportPayload }>> {
  try {
    if (!uuidSchema.safeParse(orderId).success) return fail('orderId invalide');

    const order = await loadOrderFull(orderId);
    if (!order) return fail('Commande introuvable');
    if (order.status === 'SENT' || order.status === 'RECEIVED') {
      return fail('Commande déjà transmise');
    }
    if (order.status === 'CANCELLED') return fail('Commande annulée');

    const validated = order.items.filter((i) => i.isValidated && i.adjustedQty > 0);
    if (validated.length === 0) {
      return fail('Aucune ligne validée à transmettre');
    }

    let deliveryIso: string | null = null;
    if (deliveryDate instanceof Date) {
      deliveryIso = deliveryDate.toISOString().slice(0, 10);
    } else if (typeof deliveryDate === 'string' && deliveryDate) {
      deliveryIso = deliveryDate.slice(0, 10);
    } else {
      deliveryIso = addDaysIso(todayIso(), 2);
    }

    const payload = buildExportPayload(order, validated, deliveryIso);
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'SENT',
        sent_at: now,
        validated_at: order.validatedAt || now,
        delivery_date: deliveryIso,
        total_estimated_ht: payload.totalEstimatedHT,
        export_payload: payload,
      })
      .eq('id', orderId);

    if (error) return fail(error.message);

    const refreshed = await loadOrderFull(orderId);
    if (!refreshed) return fail('Commande envoyée mais illisible');
    return ok({ order: refreshed, export: payload });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur finalisation');
  }
}

/** 5 dernières commandes transmises / réceptionnées. */
export async function listRecentOrders(
  stationId: string,
  limit = 5
): Promise<OrderActionResult<PurchaseOrder[]>> {
  try {
    if (!uuidSchema.safeParse(stationId).success) return fail('stationId invalide');
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('station_id', stationId)
      .in('status', ['SENT', 'RECEIVED'])
      .order('created_at', { ascending: false })
      .limit(Math.min(20, Math.max(1, limit)));

    if (error) return fail(error.message);

    const orders: PurchaseOrder[] = [];
    for (const row of (data ?? []) as DbOrder[]) {
      const full = await loadOrderFull(row.id);
      if (full) orders.push(full);
    }
    return ok(orders);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur historique');
  }
}

/** Retélécharge le payload d'export (CSV inclus). */
export async function getOrderExport(
  orderId: string
): Promise<OrderActionResult<OrderExportPayload>> {
  try {
    if (!uuidSchema.safeParse(orderId).success) return fail('orderId invalide');
    const order = await loadOrderFull(orderId);
    if (!order) return fail('Commande introuvable');
    if (order.exportPayload) return ok(order.exportPayload);

    const validated = order.items.filter((i) => i.isValidated && i.adjustedQty > 0);
    if (validated.length === 0) return fail('Aucune ligne exportable');
    return ok(buildExportPayload(order, validated, order.deliveryDate));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erreur export');
  }
}
