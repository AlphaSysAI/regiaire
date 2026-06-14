'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { 
  Package, CheckCircle2, AlertCircle, FileText, 
  ArrowLeft, ClipboardCheck, ScanLine, X
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// Composant interne pour utiliser useSearchParams en toute sécurité avec Next.js
function ScannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('group'); // On récupère l'ID du BL sélectionné
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [initialItems, setInitialItems] = useState<any[]>([]);
  const [isReporting, setIsReporting] = useState(false);
  const [lastScanned, setLastScanned] = useState<{name: string, status: string} | null>(null);

  // 1. Charger les produits spécifiquement liés au groupe de livraison
  useEffect(() => {
    const fetchDelivery = async () => {
      let query = supabase
        .from('pending_deliveries')
        .select('*')
        .eq('status', 'pending');

      // Filtrage par ID de groupe si présent
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

  // 2. Scanner Plein Écran
  useEffect(() => {
    if (!isReporting && !loading) {
      const startScanner = async () => {
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            { 
              fps: 20, 
              qrbox: (width, height) => ({ width: width * 0.8, height: height * 0.3 }) 
            },
            (decodedText) => handleBoxScan(decodedText),
            () => {} 
          );
        } catch (err) {
          console.error("Erreur caméra:", err);
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

  // 3. Logique de Pointage avec filtrage groupe
  const handleBoxScan = async (ean: string) => {
    // On cherche uniquement dans les items du BL sélectionné
    const item = pendingItems.find(i => i.ean === ean);

    if (item) {
      const currentReceived = item.colis_received || 0;
      if (currentReceived < item.total_colis) {
        const nextCount = currentReceived + 1;
        const { error } = await supabase
          .from('pending_deliveries')
          .update({ 
            colis_received: nextCount,
            status: nextCount === item.total_colis ? 'completed' : 'pending'
          })
          .eq('id', item.id);

        if (!error) {
          setLastScanned({ name: item.product_name, status: `Colis ${nextCount}/${item.total_colis}` });
          setPendingItems(prev => prev.map(i => i.id === item.id ? { ...i, colis_received: nextCount } : i));
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }
    } else {
      // Cas où le produit est scanné mais n'appartient pas à CE Bon de Livraison
      setLastScanned({ name: "Hors Bon de Livraison", status: "Produit non attendu ici" });
    }
    setTimeout(() => setLastScanned(null), 2500);
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-black italic uppercase tracking-tighter">Initialisation...</div>;

  if (isReporting) return <ReportView initialItems={initialItems} onBack={() => setIsReporting(false)} />;

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      
      {/* HEADER OVERLAY */}
      <header className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => router.back()} className="p-3 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/10">
          <ArrowLeft size={20} />
        </button>
        <button 
          onClick={() => setIsReporting(true)}
          className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-black uppercase italic text-xs shadow-xl active:scale-95 transition-all"
        >
          Clôturer
        </button>
      </header>

      {/* SURFACE DE SCAN (Full Screen) */}
      <div className="relative flex-1">
        <div id="reader" className="w-full h-full object-cover" />
        
        {/* Viseur minimaliste */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-72 h-40 border-2 border-white/30 rounded-[2rem] flex items-center justify-center">
                <div className="w-full h-[1px] bg-orange-500/50 animate-pulse" />
            </div>
        </div>

        {/* Feedback Scan */}
        {lastScanned && (
          <div className="absolute top-24 left-6 right-6 bg-white p-4 rounded-3xl shadow-2xl animate-in slide-in-from-top duration-300 flex items-center gap-4 border-b-4 border-orange-500">
            <div className="bg-orange-500 p-2 rounded-xl text-white">
              {lastScanned.name === "Hors Bon de Livraison" ? <AlertCircle size={20}/> : <CheckCircle2 size={20}/>}
            </div>
            <div className="flex-1">
                <p className="text-[14px] font-black uppercase text-slate-950 leading-tight">{lastScanned.name}</p>
                <p className="text-[10px] font-bold text-orange-600 uppercase italic">{lastScanned.status}</p>
            </div>
          </div>
        )}
      </div>

      {/* LISTE DES ATTENDUS DU BL SÉLECTIONNÉ (Tiroir bas) */}
      <div className="h-[40vh] bg-slate-950 rounded-t-[3rem] border-t border-slate-800 p-6 overflow-y-auto z-30 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6 opacity-30" />
        
        <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic leading-none">Pointage Livraison</p>
              {groupId && <p className="text-[8px] font-bold text-slate-600 uppercase mt-1">ID: #{groupId.slice(0,8)}</p>}
            </div>
            <span className="text-[10px] font-black bg-slate-900 px-3 py-1 rounded-full text-slate-400 border border-slate-800">
                {pendingItems.filter(i => i.colis_received < i.total_colis).length} RÉFS RESTANTES
            </span>
        </div>

        <div className="space-y-3">
            {pendingItems.length > 0 ? pendingItems.map((item) => {
                const isDone = item.colis_received === item.total_colis;

                return (
                    <div key={item.id} className={`p-4 rounded-2xl border transition-all ${isDone ? 'opacity-30 bg-slate-900/50 border-slate-800' : 'bg-slate-900 border-slate-700 shadow-lg'}`}>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Package size={16} className={isDone ? 'text-green-500' : 'text-slate-500'} />
                                <div>
                                    <p className="text-[11px] font-black uppercase italic leading-tight text-white">{item.product_name}</p>
                                    <p className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Colisage: {item.units_per_colis} pces</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-xs font-black italic ${isDone ? 'text-green-500' : 'text-orange-500'}`}>
                                  {item.colis_received || 0} / {item.total_colis}
                                </p>
                                <p className="text-[7px] font-bold text-slate-600 uppercase">Cartons</p>
                            </div>
                        </div>
                    </div>
                );
            }) : (
                <div className="py-10 text-center opacity-20 italic font-black text-xs uppercase">
                    Aucun produit en attente pour ce BL
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

// Composant Root pour gérer Suspense (requis par useSearchParams dans Next.js)
export default function ReceptionBL() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <ScannerContent />
    </Suspense>
  );
}

// Vue rapport simplifiée
function ReportView({ initialItems, onBack }: any) {
  return (
    <div className="min-h-screen bg-white text-slate-950 p-8 flex flex-col">
      <header className="flex justify-between items-start mb-12">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter">Bilan <span className="text-orange-500">Réception</span></h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">Contrôle de conformité</p>
        </div>
        <button onClick={onBack} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors"><X /></button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {initialItems.map((item: any) => {
          const missing = item.total_colis - (item.colis_received || 0);
          return (
            <div key={item.id} className={`p-5 rounded-3xl border-2 transition-all ${missing > 0 ? 'border-red-100 bg-red-50/20' : 'border-green-100 bg-green-50/20'}`}>
              <div className="flex justify-between items-center">
                <p className="font-black uppercase text-xs leading-tight max-w-[70%]">{item.product_name}</p>
                <div className="text-right">
                  <p className={`font-black italic text-lg ${missing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.colis_received} / {item.total_colis}
                  </p>
                  <p className="text-[8px] font-black uppercase opacity-40 italic">Cartons</p>
                </div>
              </div>
              {missing > 0 && (
                <div className="mt-3 pt-3 border-t border-red-100 flex items-center gap-2 text-red-600">
                   <AlertCircle size={14} />
                   <p className="text-[10px] font-black uppercase italic tracking-tight">⚠️ Litige : Manque {missing} carton(s)</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button 
        onClick={() => window.print()} 
        className="mt-8 w-full bg-slate-950 text-white h-16 rounded-[2rem] font-black uppercase italic shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
      >
        <FileText size={20} />
        Imprimer le rapport
      </button>
    </div>
  );
}