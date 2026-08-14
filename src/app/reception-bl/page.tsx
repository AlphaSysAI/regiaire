'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import {
  Package, CheckCircle2, AlertCircle, FileText,
  ArrowLeft, X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PageShell, PageHeader, PageBody, Panel, PrimaryButton,
} from '@/components/ui/orbit';

function ScannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('group');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [initialItems, setInitialItems] = useState<any[]>([]);
  const [isReporting, setIsReporting] = useState(false);
  const [lastScanned, setLastScanned] = useState<{ name: string; status: string } | null>(null);

  useEffect(() => {
    const fetchDelivery = async () => {
      let query = supabase
        .from('pending_deliveries')
        .select('*')
        .eq('status', 'pending');

      if (groupId) {
        query = query.eq('delivery_group_id', groupId);
      }

      const { data } = await query;

      if (data) {
        setPendingItems(data);
        setInitialItems(data);
      }
      setLoading(false);
    };
    fetchDelivery();
  }, [groupId]);

  useEffect(() => {
    if (!isReporting && !loading) {
      const startScanner = async () => {
        const html5QrCode = new Html5Qrcode('reader');
        scannerRef.current = html5QrCode;
        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            {
              fps: 20,
              qrbox: (width, height) => ({ width: width * 0.8, height: height * 0.3 }),
            },
            (decodedText) => handleBoxScan(decodedText),
            () => {},
          );
        } catch (err) {
          console.error('Erreur caméra:', err);
        }
      };
      startScanner();

      return () => {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.stop().catch(console.error);
        }
      };
    }
  }, [isReporting, loading]);

  const handleBoxScan = async (ean: string) => {
    const item = pendingItems.find(i => i.ean === ean);

    if (item) {
      const currentReceived = item.colis_received || 0;
      if (currentReceived < item.total_colis) {
        const nextCount = currentReceived + 1;
        const { error } = await supabase
          .from('pending_deliveries')
          .update({
            colis_received: nextCount,
            status: nextCount === item.total_colis ? 'completed' : 'pending',
          })
          .eq('id', item.id);

        if (!error) {
          setLastScanned({ name: item.product_name, status: `Colis ${nextCount}/${item.total_colis}` });
          setPendingItems(prev =>
            prev.map(i => (i.id === item.id ? { ...i, colis_received: nextCount } : i)),
          );
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }
    } else {
      setLastScanned({ name: 'Hors Bon de Livraison', status: 'Produit non attendu ici' });
    }
    setTimeout(() => setLastScanned(null), 2500);
  };

  if (loading) {
    return (
      <PageShell className="flex items-center justify-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Initialisation...
        </p>
      </PageShell>
    );
  }

  if (isReporting) return <ReportView initialItems={initialItems} onBack={() => setIsReporting(false)} />;

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-black text-slate-100">
      {/* HEADER OVERLAY — cyan brand accents */}
      <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-cyan-500/20 bg-slate-900/50 p-3 text-slate-200 backdrop-blur-md hover:border-cyan-500/40 hover:text-cyan-300"
        >
          <ArrowLeft size={20} />
        </button>
        <PrimaryButton onClick={() => setIsReporting(true)} className="shadow-xl shadow-cyan-950/40">
          Clôturer
        </PrimaryButton>
      </header>

      <div className="relative flex-1">
        <div id="reader" className="h-full w-full object-cover" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-40 w-72 items-center justify-center rounded-2xl border-2 border-cyan-400/30">
            <div className="h-[1px] w-full animate-pulse bg-cyan-400/50" />
          </div>
        </div>

        {lastScanned && (
          <div className="absolute left-6 right-6 top-24 flex animate-in slide-in-from-top items-center gap-4 rounded-2xl border-b-4 border-cyan-500 bg-white p-4 shadow-2xl duration-300">
            <div className="rounded-xl bg-cyan-500 p-2 text-white">
              {lastScanned.name === 'Hors Bon de Livraison' ? (
                <AlertCircle size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold uppercase leading-tight text-slate-950">
                {lastScanned.name}
              </p>
              <p className="text-[10px] font-semibold uppercase text-cyan-600">
                {lastScanned.status}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="z-30 h-[40vh] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-950 p-6 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-slate-800 opacity-30" />

        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Pointage Livraison
            </p>
            {groupId && (
              <p className="mt-1 text-[8px] font-medium uppercase text-slate-600">
                ID: #{groupId.slice(0, 8)}
              </p>
            )}
          </div>
          <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold text-cyan-300">
            {pendingItems.filter(i => i.colis_received < i.total_colis).length} RÉFS RESTANTES
          </span>
        </div>

        <div className="space-y-3">
          {pendingItems.length > 0 ? (
            pendingItems.map((item) => {
              const isDone = item.colis_received === item.total_colis;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isDone
                      ? 'border-slate-800 bg-slate-900/50 opacity-30'
                      : 'border-slate-700 bg-slate-900 shadow-lg'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package size={16} className={isDone ? 'text-emerald-400' : 'text-slate-500'} />
                      <div>
                        <p className="text-[11px] font-semibold uppercase leading-tight text-white">
                          {item.product_name}
                        </p>
                        <p className="mt-0.5 text-[8px] font-medium uppercase text-slate-500">
                          Colisage: {item.units_per_colis} pces
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-xs font-bold tabular-nums ${
                          isDone ? 'text-emerald-400' : 'text-cyan-400'
                        }`}
                      >
                        {item.colis_received || 0} / {item.total_colis}
                      </p>
                      <p className="text-[7px] font-medium uppercase text-slate-600">Cartons</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center text-xs font-semibold uppercase text-slate-600 opacity-40">
              Aucun produit en attente pour ce BL
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReceptionBL() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <ScannerContent />
    </Suspense>
  );
}

function ReportView({ initialItems, onBack }: any) {
  return (
    <PageShell className="bg-slate-950">
      <PageHeader
        title="Bilan"
        accent="Réception"
        subtitle="Contrôle de conformité"
        icon={FileText}
        onBack={onBack}
        actions={
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <X size={18} />
          </button>
        }
      />

      <PageBody className="flex min-h-[calc(100vh-5rem)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {initialItems.map((item: any) => {
            const missing = item.total_colis - (item.colis_received || 0);
            return (
              <Panel
                key={item.id}
                className={
                  missing > 0
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-emerald-500/30 bg-emerald-500/5'
                }
              >
                <div className="flex items-center justify-between">
                  <p className="max-w-[70%] text-xs font-semibold uppercase leading-tight">
                    {item.product_name}
                  </p>
                  <div className="text-right">
                    <p
                      className={`text-lg font-bold tabular-nums ${
                        missing > 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {item.colis_received} / {item.total_colis}
                    </p>
                    <p className="text-[8px] font-semibold uppercase text-slate-500">Cartons</p>
                  </div>
                </div>
                {missing > 0 && (
                  <div className="mt-3 flex items-center gap-2 border-t border-rose-500/20 pt-3 text-rose-400">
                    <AlertCircle size={14} />
                    <p className="text-[10px] font-semibold uppercase tracking-tight">
                      Litige : Manque {missing} carton(s)
                    </p>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <PrimaryButton onClick={() => window.print()} className="mt-6 w-full py-4">
          <FileText size={18} />
          Imprimer le rapport
        </PrimaryButton>
      </PageBody>
    </PageShell>
  );
}
