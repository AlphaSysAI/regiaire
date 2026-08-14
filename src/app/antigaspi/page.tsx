'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BrainCircuit, Sparkles, Tag, Timer,
  CheckCircle2, Trash2, Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  PageShell, PageHeader, PageBody, Panel, PanelTitle, KpiTile, PrimaryButton,
} from '@/components/ui/orbit';

export default function AntiGaspi() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expiringItems, setExpiringItems] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const { data: profile } = await supabase.from('profiles').select('aire_id').eq('id', user.id).single();

      if (profile?.aire_id) {
        const dateLimite = new Date();
        dateLimite.setDate(dateLimite.getDate() + 7);

        const { data } = await supabase
          .from('product_stocks')
          .select('*, products(name, category, price_ht)')
          .eq('aire_id', profile.aire_id)
          .eq('is_promo', false)
          .lte('expiry_date', dateLimite.toISOString().split('T')[0])
          .gt('quantity', 0)
          .order('expiry_date', { ascending: true });

        setExpiringItems(data || []);
      }
    } catch (error) {
      console.error('Erreur fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handlePromo = async (itemId: string) => {
    setActionLoading(itemId);
    const { error } = await supabase
      .from('product_stocks')
      .update({ is_promo: true })
      .eq('id', itemId);

    if (!error) {
      setExpiringItems(prev => prev.filter(item => item.id !== itemId));
    }
    setActionLoading(null);
  };

  const handleWaste = async (item: any) => {
    setActionLoading(item.id);

    try {
      const { error: logError } = await supabase.from('waste_logs').insert([{
        product_id: item.product_id,
        aire_id: item.aire_id,
        quantity: item.quantity,
        reason: 'Périmé (AntiGaspi)',
        cost_loss: (item.products?.price_ht || 0) * item.quantity,
      }]);

      if (logError) throw logError;

      const { error: stockError } = await supabase
        .from('product_stocks')
        .update({ quantity: 0 })
        .eq('id', item.id);

      if (stockError) throw stockError;

      setExpiringItems(prev => prev.filter(i => i.id !== item.id));
    } catch (error) {
      console.error('Erreur lors du retrait du stock:', error);
      alert('Erreur lors de la mise à jour du stock.');
    } finally {
      setActionLoading(null);
    }
  };

  const totalLossPossible = expiringItems.reduce(
    (acc, item) => acc + ((item.products?.price_ht || 0) * item.quantity),
    0,
  );

  if (loading) {
    return (
      <PageShell className="flex flex-col items-center justify-center">
        <BrainCircuit className="mb-4 animate-pulse text-cyan-400" size={50} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          Synchro inventaire...
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Plan"
        accent="AntiGaspi"
        subtitle="Actions correctives"
        icon={Sparkles}
        onBack={() => router.back()}
      />

      <PageBody>
        <Panel>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <PanelTitle hint="Exposition DLC ≤ 7 jours">Risque perte brute</PanelTitle>
              <p className="text-3xl font-bold tabular-nums text-white">
                {totalLossPossible.toFixed(2)}€
              </p>
            </div>
            <KpiTile
              label="Alertes"
              value={expiringItems.length}
              tone={expiringItems.length > 0 ? 'cyan' : 'default'}
            />
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <Sparkles className="shrink-0 text-cyan-400" size={18} />
            <p className="text-[10px] font-medium text-cyan-100">
              Traitez ces lots pour sauvegarder votre marge brute.
            </p>
          </div>
        </Panel>

        <div className="space-y-4">
          {expiringItems.map((item) => {
            const daysLeft = Math.ceil(
              (new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
            );
            const isProcessing = actionLoading === item.id;

            return (
              <Panel
                key={item.id}
                className={`transition-all ${isProcessing ? 'opacity-30' : ''}`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex gap-3">
                    <div
                      className={`rounded-xl p-3 ${
                        daysLeft <= 1
                          ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-400'
                          : 'border border-slate-800 bg-slate-950 text-slate-500'
                      }`}
                    >
                      <Timer size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold uppercase leading-tight text-white">
                        {item.products?.name}
                      </h3>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {item.quantity} unités • DLC :{' '}
                        {new Date(item.expiry_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                      daysLeft <= 1
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    J-{daysLeft}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <PrimaryButton
                    onClick={() => handlePromo(item.id)}
                    disabled={!!actionLoading}
                    className="h-12"
                  >
                    {actionLoading === item.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Tag size={14} />
                    )}
                    Mise en Promo
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => handleWaste(item)}
                    disabled={!!actionLoading}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    Retirer
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>

        {expiringItems.length === 0 && (
          <Panel className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-4 text-slate-700" size={48} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Aucune action requise
            </p>
          </Panel>
        )}
      </PageBody>
    </PageShell>
  );
}
