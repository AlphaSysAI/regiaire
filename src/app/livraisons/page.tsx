'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  FileText, ChevronRight, Truck, ScanLine,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  PageShell, PageHeader, PageBody, Panel, PanelTitle, KpiTile, PrimaryButton,
} from '@/components/ui/orbit';

export default function ArchivesLivraisons() {
  const router = useRouter();
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchives() {
      const { data } = await supabase
        .from('pending_deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      setArchives(data || []);
      setLoading(false);
    }
    fetchArchives();
  }, []);

  const litiges = archives.filter(a => a.colis_received < a.total_colis).length;

  return (
    <PageShell>
      <PageHeader
        title="Journal"
        accent="Livraisons"
        subtitle="Historique des réceptions"
        icon={Truck}
        backHref="/"
      />

      <PageBody>
        <button
          type="button"
          onClick={() => router.push('/reception-bl')}
          className="group flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-cyan-950/10 transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-400 transition group-hover:border-cyan-400/50 group-hover:bg-cyan-500/20">
              <ScanLine size={20} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Scan manuel
              </p>
              <p className="text-sm font-semibold text-white">Scanner sans document</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-600" />
        </button>

        <div className="grid grid-cols-2 gap-3">
          <KpiTile label="Livraisons total" value={archives.length} tone="default" />
          <KpiTile
            label="Litiges détectés"
            value={litiges}
            tone={litiges > 0 ? 'rose' : 'default'}
          />
        </div>

        <div className="space-y-3">
          <PanelTitle>Réceptions récentes</PanelTitle>

          {loading ? (
            <Panel className="py-16 text-center">
              <p className="animate-pulse text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Chargement du journal...
              </p>
            </Panel>
          ) : archives.length > 0 ? (
            archives.map((bl) => {
              const isPending = bl.status === 'pending';
              const hasLitige = bl.colis_received < bl.total_colis && !isPending;

              return (
                <Panel
                  key={bl.id}
                  className="flex items-center justify-between transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`rounded-xl border p-3 ${
                        hasLitige
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          : isPending
                            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      <FileText size={20} />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase leading-tight text-slate-100">
                        {bl.product_name}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-3">
                        <p className="text-[9px] font-medium uppercase text-slate-500">
                          {new Date(bl.created_at).toLocaleDateString()}
                        </p>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[8px] font-bold uppercase ${
                            hasLitige
                              ? 'bg-rose-500/20 text-rose-300'
                              : isPending
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {hasLitige ? 'LITIGE' : isPending ? 'EN COURS' : 'CONFORME'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-600" />
                </Panel>
              );
            })
          ) : (
            <Panel className="border-dashed py-16 text-center">
              <Truck size={40} className="mx-auto mb-4 text-slate-700 opacity-40" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Aucun historique de livraison
              </p>
              <PrimaryButton
                className="mx-auto mt-4"
                onClick={() => router.push('/reception-bl')}
              >
                <ScanLine size={14} />
                Lancer un scan
              </PrimaryButton>
            </Panel>
          )}
        </div>
      </PageBody>
    </PageShell>
  );
}
