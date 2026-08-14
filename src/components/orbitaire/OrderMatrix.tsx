'use client';

import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import {
  Check,
  CheckCheck,
  Download,
  Loader2,
  Pencil,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  bulkValidateItems,
  finalizeAndSendOrder,
  getOrCreateDraftOrder,
  getOrderExport,
  listRecentOrders,
  toggleOrderItemValidation,
  updateOrderItemQuantity,
} from '@/actions/orbitaire/orders';
import { IconButton } from '@/components/ui/IconButton';
import type { OrderRecommendation } from '@/services/orbitaire/predictiveEngine';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  UrgencyLevel,
} from '@/types/purchase-orders';

type Props = {
  stationId: string | null;
  planDate: string | null;
  recommendations: OrderRecommendation[];
  predictLoading: boolean;
};

function urgencyLabel(u: UrgencyLevel): string {
  if (u === 'CRITICAL') return 'Critique';
  if (u === 'WARNING') return 'Vigilance';
  return 'Normal';
}

function urgencyClasses(u: UrgencyLevel): string {
  if (u === 'CRITICAL') return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
  if (u === 'WARNING') return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
}

function statusBadge(status: string): string {
  switch (status) {
    case 'SENT':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
    case 'RECEIVED':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    case 'VALIDATED':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/40';
    case 'CANCELLED':
      return 'bg-slate-500/15 text-slate-400 border-slate-500/40';
    default:
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  }
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applyOptimisticItems(
  order: PurchaseOrder,
  action:
    | { type: 'toggle'; itemId: string; isValidated: boolean }
    | { type: 'qty'; itemId: string; qty: number }
    | { type: 'bulk'; itemIds?: string[] }
    | { type: 'remove'; itemId: string }
): PurchaseOrder {
  const items = order.items.map((item) => {
    if (action.type === 'toggle' && item.id === action.itemId) {
      return { ...item, isValidated: action.isValidated };
    }
    if (action.type === 'qty' && item.id === action.itemId) {
      return { ...item, adjustedQty: action.qty };
    }
    if (action.type === 'remove' && item.id === action.itemId) {
      return { ...item, adjustedQty: 0, isValidated: false };
    }
    if (action.type === 'bulk') {
      if (action.itemIds && !action.itemIds.includes(item.id)) return item;
      if (item.adjustedQty > 0) return { ...item, isValidated: true };
    }
    return item;
  });
  const totalEstimatedHT =
    Math.round(
      items
        .filter((i) => i.isValidated && i.adjustedQty > 0)
        .reduce((s, i) => s + i.adjustedQty * i.unitPriceHT, 0) * 100
    ) / 100;
  return { ...order, items, totalEstimatedHT };
}

export default function OrderMatrix({
  stationId,
  planDate,
  recommendations,
  predictLoading,
}: Props) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [history, setHistory] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [localQty, setLocalQty] = useState<Record<string, number>>({});
  const [, startTransition] = useTransition();

  const [optimisticOrder, applyOptimistic] = useOptimistic(
    order,
    (current, action: Parameters<typeof applyOptimisticItems>[1]) =>
      current ? applyOptimisticItems(current, action) : current
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  const refreshHistory = async (aireId: string) => {
    const res = await listRecentOrders(aireId, 5);
    if (res.success && res.data) setHistory(res.data);
  };

  const seedKey = useMemo(
    () =>
      recommendations
        .slice(0, 80)
        .map((r) => `${r.productId}:${r.suggestedOrderQty}:${r.riskStatus}`)
        .join('|'),
    [recommendations]
  );

  useEffect(() => {
    if (!stationId || !planDate || recommendations.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const res = await getOrCreateDraftOrder(stationId, {
        planDate,
        recommendations,
      });
      if (cancelled) return;
      if (!res.success || !res.data) {
        setError(res.error || 'Impossible de charger la commande');
        setOrder(null);
      } else {
        setOrder(res.data);
        const qtyMap: Record<string, number> = {};
        for (const item of res.data.items) qtyMap[item.id] = item.adjustedQty;
        setLocalQty(qtyMap);
        const d = new Date();
        d.setDate(d.getDate() + 2);
        setDeliveryDate(d.toISOString().slice(0, 10));
      }
      await refreshHistory(stationId);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // seedKey capture le contenu utile des recommendations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, planDate, seedKey]);

  const display = optimisticOrder ?? order;
  const items = display?.items ?? [];
  const validatedCount = items.filter((i) => i.isValidated && i.adjustedQty > 0).length;
  const totalLines = items.filter((i) => i.adjustedQty > 0).length;
  const criticalCount = items.filter((i) => i.urgencyLevel === 'CRITICAL').length;
  const totalHT = display?.totalEstimatedHT ?? 0;

  const onToggle = (item: PurchaseOrderItem) => {
    if (!display || display.status === 'SENT' || display.status === 'RECEIVED') return;
    const next = !item.isValidated;
    startTransition(async () => {
      applyOptimistic({ type: 'toggle', itemId: item.id, isValidated: next });
      setSaving(true);
      const res = await toggleOrderItemValidation(item.id, next);
      setSaving(false);
      if (!res.success || !res.data) {
        setError(res.error || 'Échec validation');
        return;
      }
      setOrder(res.data);
      showToast(next ? 'Ligne validée' : 'Validation annulée — vous pouvez modifier la quantité');
    });
  };

  const persistQty = (item: PurchaseOrderItem, qty: number) => {
    if (!display || display.status === 'SENT' || display.status === 'RECEIVED' || item.isValidated)
      return;
    const safe = Math.max(0, qty);
    startTransition(async () => {
      applyOptimistic({ type: 'qty', itemId: item.id, qty: safe });
      setSaving(true);
      const res = await updateOrderItemQuantity(item.id, safe);
      setSaving(false);
      if (!res.success || !res.data) {
        setError(res.error || 'Échec sauvegarde quantité');
        return;
      }
      setOrder(res.data);
      showToast(
        safe === 0 ? 'Article retiré de la commande' : 'Quantité enregistrée'
      );
    });
  };

  /** Annule la validation et remet la qty à 0 pour exclure l'article de la commande. */
  const onRemoveFromOrder = (item: PurchaseOrderItem) => {
    if (!display || display.status === 'SENT' || display.status === 'RECEIVED') return;
    startTransition(async () => {
      applyOptimistic({ type: 'remove', itemId: item.id });
      setLocalQty((prev) => ({ ...prev, [item.id]: 0 }));
      setSaving(true);
      if (item.isValidated) {
        const t = await toggleOrderItemValidation(item.id, false);
        if (!t.success) {
          setSaving(false);
          setError(t.error || 'Échec annulation');
          return;
        }
      }
      const res = await updateOrderItemQuantity(item.id, 0);
      setSaving(false);
      if (!res.success || !res.data) {
        setError(res.error || 'Échec retrait');
        return;
      }
      setOrder(res.data);
      showToast('Article retiré de la commande');
    });
  };

  const onBulkValidate = () => {
    if (!display || display.status === 'SENT') return;
    startTransition(async () => {
      applyOptimistic({ type: 'bulk' });
      setSaving(true);
      const res = await bulkValidateItems(display.id);
      setSaving(false);
      if (!res.success || !res.data) {
        setError(res.error || 'Échec validation groupée');
        return;
      }
      setOrder(res.data);
      showToast('Toutes les suggestions validées');
    });
  };

  const onTransmit = () => {
    if (!display) return;
    startTransition(async () => {
      setSaving(true);
      const res = await finalizeAndSendOrder(display.id, deliveryDate || null);
      setSaving(false);
      if (!res.success || !res.data) {
        setError(res.error || 'Échec transmission');
        return;
      }
      setOrder(res.data.order);
      setShowConfirm(false);
      downloadText(
        `${res.data.export.orderNumber}.csv`,
        res.data.export.csv,
        'text/csv;charset=utf-8'
      );
      downloadText(
        `${res.data.export.orderNumber}.json`,
        JSON.stringify(res.data.export, null, 2),
        'application/json'
      );
      if (stationId) await refreshHistory(stationId);
      showToast(`Commande ${res.data.export.orderNumber} transmise`);
    });
  };

  const redownload = async (orderId: string, orderNumber: string) => {
    const res = await getOrderExport(orderId);
    if (!res.success || !res.data) {
      setError(res.error || 'Export indisponible');
      return;
    }
    downloadText(`${orderNumber}.csv`, res.data.csv, 'text/csv;charset=utf-8');
  };

  const validatedItems = items.filter((i) => i.isValidated && i.adjustedQty > 0);
  const volumes = (() => {
    const fuelLike = /carbur|diesel|gazole|sp95|sp98|adblue|gpl/i;
    let boutique = 0;
    let fuel = 0;
    for (const i of validatedItems) {
      if (fuelLike.test(i.category) || fuelLike.test(i.productName)) fuel += i.adjustedQty;
      else boutique += i.adjustedQty;
    }
    return { boutique, fuel };
  })();

  const locked = display?.status === 'SENT' || display?.status === 'RECEIVED';

  return (
    <section className="lg:col-span-12 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-cyan-950/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: 'var(--font-display), system-ui' }}
          >
            Matrice de commande optimisée
          </h2>
              <p className="text-xs text-slate-400">
                Pipeline persistant · actions icônes · qty éditable hors validation
                {display ? ` · ${display.orderNumber}` : ''}
                {saving && (
                  <span className="ml-2 inline-flex items-center gap-1 text-cyan-400">
                    <Loader2 size={10} className="animate-spin" /> sauvegarde…
                  </span>
                )}
              </p>
        </div>
      </div>

      {/* Barre synthèse */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="text-xs text-slate-300">
          <span className="font-semibold text-white tabular-nums">
            {validatedCount}
          </span>{' '}
          / {totalLines} lignes validées
          <span className="mx-2 text-slate-600">•</span>
          Total estimé{' '}
          <span className="font-semibold text-cyan-300 tabular-nums">
            {totalHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT
          </span>
        </p>
        {criticalCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-300">
            <ShieldAlert size={12} />
            {criticalCount} critique{criticalCount > 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <IconButton
            label="Valider toutes les suggestions"
            variant="validate"
            size="md"
            disabled={!display || locked || totalLines === 0 || saving}
            onClick={onBulkValidate}
          >
            <CheckCheck size={18} />
          </IconButton>
          <button
            type="button"
            disabled={!display || locked || validatedCount === 0 || saving}
            onClick={() => setShowConfirm(true)}
            title="Confirmer et générer la commande"
            aria-label="Confirmer et générer la commande"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} />
            <span className="hidden sm:inline">Générer la commande</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
          {/does not exist|relation|purchase_orders/i.test(error) && (
            <span className="mt-1 block text-rose-200/80">
              Exécutez <code className="text-[10px]">supabase-purchase-orders.sql</code> dans
              Supabase.
            </span>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Référence</th>
              <th className="px-3 py-2 font-semibold">Catégorie</th>
              <th className="px-3 py-2 font-semibold">Stock</th>
              <th className="px-3 py-2 font-semibold">Est. J+3</th>
              <th className="px-3 py-2 font-semibold">Commande</th>
              <th className="px-3 py-2 font-semibold">Risque</th>
              <th className="px-3 py-2 font-semibold">Confiance</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 40).map((row) => {
              const qty = localQty[row.id] ?? row.adjustedQty;
              return (
                <tr
                  key={row.id}
                  className={`border-t border-slate-800/80 hover:bg-slate-950/50 ${
                    row.isValidated ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-100">{row.productName}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-2">
                      {row.justificationSummary}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{row.category}</td>
                  <td className="px-3 py-2 tabular-nums">{row.currentStock}</td>
                  <td className="px-3 py-2 tabular-nums">{row.estimatedSalesJ3}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        disabled={locked || row.isValidated}
                        title={
                          row.isValidated
                            ? 'Annulez la validation pour modifier la quantité'
                            : undefined
                        }
                        value={qty}
                        onChange={(e) =>
                          setLocalQty((prev) => ({
                            ...prev,
                            [row.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        onBlur={() => {
                          if (row.isValidated) return;
                          const next = localQty[row.id] ?? row.adjustedQty;
                          if (next !== row.adjustedQty) persistQty(row, next);
                        }}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 tabular-nums outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {row.isValidated && !locked && (
                        <IconButton
                          label="Modifier la quantité (annuler la validation)"
                          variant="edit"
                          disabled={saving}
                          onClick={() => onToggle(row)}
                        >
                          <Pencil size={14} />
                        </IconButton>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${urgencyClasses(row.urgencyLevel)}`}
                    >
                      {urgencyLabel(row.urgencyLevel)}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">
                    {row.confidencePct}%
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={
                          row.isValidated
                            ? 'Annuler la validation'
                            : 'Valider cette ligne'
                        }
                        variant={row.isValidated ? 'neutral' : 'validate'}
                        disabled={locked || saving}
                        onClick={() => onToggle(row)}
                      >
                        {row.isValidated ? <X size={16} /> : <Check size={16} />}
                      </IconButton>
                      {!locked && (row.isValidated || row.adjustedQty > 0) && (
                        <IconButton
                          label="Retirer de la commande"
                          variant="danger"
                          disabled={saving}
                          onClick={() => onRemoveFromOrder(row)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(loading || predictLoading) && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Génération / synchronisation de la commande…
                </td>
              </tr>
            )}
            {!loading && !predictLoading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Aucune ligne de commande
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Historique */}
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Historique des commandes
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">N°</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Montant HT</th>
                <th className="px-3 py-2">Envoyée</th>
                <th className="px-3 py-2">Bon</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 font-medium text-slate-200">{h.orderNumber}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(h.status)}`}
                    >
                      {h.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {h.totalEstimatedHT.toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    €
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {h.sentAt
                      ? new Date(h.sentAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <IconButton
                      label={`Télécharger le bon ${h.orderNumber}`}
                      variant="download"
                      onClick={() => redownload(h.id, h.orderNumber)}
                    >
                      <Download size={15} />
                    </IconButton>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Aucune commande transmise pour l’instant
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale confirmation */}
      {showConfirm && display && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3
                  className="text-lg font-semibold text-white"
                  style={{ fontFamily: 'var(--font-display), system-ui' }}
                >
                  Confirmer la commande
                </h3>
                <p className="text-xs text-slate-400">{display.orderNumber}</p>
              </div>
              <IconButton
                label="Fermer"
                variant="neutral"
                onClick={() => setShowConfirm(false)}
              >
                <X size={16} />
              </IconButton>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-slate-500">Total HT</p>
                <p className="text-lg font-bold tabular-nums text-cyan-300">
                  {totalHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-slate-500">Volumes</p>
                <p className="font-semibold text-slate-200">
                  {volumes.boutique} u. boutique
                </p>
                <p className="text-slate-400">{volumes.fuel} L carburant approx.</p>
              </div>
            </div>

            <label className="mb-3 block text-xs text-slate-400">
              Date de livraison estimée
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </label>

            <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-800 p-2 text-xs">
              {validatedItems.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-2 border-b border-slate-800/60 py-1.5 last:border-0"
                >
                  <span className="text-slate-200">{i.productName}</span>
                  <span className="tabular-nums text-slate-400">
                    ×{i.adjustedQty} ·{' '}
                    {(i.adjustedQty * i.unitPriceHT).toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    €
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled={saving || validatedItems.length === 0}
              onClick={onTransmit}
              title="Transmettre la commande"
              aria-label="Transmettre la commande"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/50 bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Transmettre la commande
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-2 text-xs font-medium text-emerald-300 shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}
