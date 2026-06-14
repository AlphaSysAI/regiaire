'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileText, Camera, Upload, X, 
  Loader2, CheckCircle, AlertCircle, Database, Sparkles
} from 'lucide-react';

type ImportType = 'invoice' | 'stock_status' | null;

export default function IAUpload({ aireId, onComplete }: { aireId: string, onComplete: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [importType, setImportType] = useState<ImportType>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [capturedImages, setCapturedImages] = useState<string[]>([]);

  const toBase64 = (file: File) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });

  const processAnalysis = async (images: string[]) => {
    if (!importType) return;
    setStatus('parsing');
    
    // On génère un ID unique pour ce groupe de documents (le Bon de Livraison)
    const deliveryGroupId = crypto.randomUUID();

    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images, 
          aireId, 
          mode: importType 
        })
      });

      const { items } = await res.json();
      
      if (items?.length > 0) {
        if (importType === 'invoice') {
          // MODE FACTURE : On lie tout au même delivery_group_id
          const formatted = items.map((item: any) => ({
            aire_id: aireId,
            delivery_group_id: deliveryGroupId, // <--- CRUCIAL pour le multi-BL
            ean: item.ean || null,
            product_name: item.product_name,
            total_colis: item.total_colis || 1,
            units_per_colis: item.units_per_colis || 1,
            expected_total_qty: item.expected_total_qty || 0,
            colis_received: 0,
            status: 'pending'
          }));
          await supabase.from('pending_deliveries').insert(formatted);
        } else {
          // MODE ÉTAT DES STOCKS : Mise à jour directe
          for (const item of items) {
            await supabase
              .from('product_stocks')
              .update({ quantity: item.current_stock })
              .eq('aire_id', aireId)
              .eq('ean', item.ean);
          }
        }
      }
      
      setStatus('success');
      setTimeout(() => {
        setCapturedImages([]);
        setStatus('idle');
        setImportType(null);
        setShowModal(false);
        onComplete();
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file) as string;
    setCapturedImages(prev => [...prev, base64]);
  };

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="w-full bg-white text-slate-950 rounded-[2.5rem] p-7 flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-all group"
      >
        <div className="bg-orange-500 p-2 rounded-xl text-white group-hover:rotate-12 transition-transform">
          <Upload size={20} />
        </div>
        <span className="font-black uppercase italic text-sm">Ajouter un document</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => !capturedImages.length && status === 'idle' && setShowModal(false)} />
          
          <div className="relative bg-slate-900 w-full max-w-sm rounded-[3rem] border border-slate-800 p-8 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => { setShowModal(false); setCapturedImages([]); setImportType(null); }}
              className="absolute top-6 right-6 text-slate-500 hover:text-white"
            >
              <X size={20} />
            </button>

            {status === 'idle' ? (
              <div className="space-y-6">
                {!importType ? (
                  <>
                    <div className="text-center mb-8">
                      <h2 className="text-xl font-black uppercase italic text-white leading-none">Type de document</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 italic tracking-widest">IA Vision Analysis</p>
                    </div>

                    <div className="grid gap-4">
                      <button 
                        onClick={() => setImportType('invoice')}
                        className="flex items-center gap-4 p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-orange-500 transition-all text-left group"
                      >
                        <div className="bg-orange-500/10 p-3 rounded-2xl text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
                          <FileText size={24} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-500">Logistique</p>
                          <p className="text-sm font-black uppercase italic text-white">Facture / BL</p>
                        </div>
                      </button>

                      <button 
                        onClick={() => setImportType('stock_status')}
                        className="flex items-center gap-4 p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-blue-500 transition-all text-left group"
                      >
                        <div className="bg-blue-500/10 p-3 rounded-2xl text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                          <Database size={24} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-500">Inventaire</p>
                          <p className="text-sm font-black uppercase italic text-white">État des Stocks</p>
                        </div>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center mb-4">
                      <div className="flex items-center justify-center gap-2 text-orange-500 mb-2">
                         <Camera size={16} />
                         <h2 className="text-lg font-black uppercase italic text-white">
                           {importType === 'invoice' ? 'Scan Livraison' : 'Scan Inventaire'}
                         </h2>
                      </div>
                      <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 italic leading-tight">Photographiez toutes les pages du document</p>
                    </div>

                    {capturedImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800 max-h-40 overflow-y-auto">
                        {capturedImages.map((img, i) => (
                          <div key={i} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-700">
                            <img src={img} className="object-cover w-full h-full opacity-80" alt={`page-${i}`} />
                            <div className="absolute top-1 right-1 bg-black/50 px-1 rounded text-[8px] font-black uppercase">P.{i+1}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-3xl cursor-pointer hover:bg-slate-700 transition-all border border-slate-700">
                        <Camera size={20} className="text-orange-500" />
                        <span className="text-[9px] font-black uppercase">Capturer</span>
                        <input type="file" className="hidden" onChange={handleCapture} accept="image/*" capture="environment" />
                      </label>
                      <button 
                        disabled={capturedImages.length === 0}
                        onClick={() => processAnalysis(capturedImages)}
                        className={`rounded-3xl font-black uppercase text-[10px] flex flex-col items-center justify-center gap-2 italic transition-all ${
                          capturedImages.length > 0 ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-800 text-slate-600'
                        }`}
                      >
                        <Upload size={20} />
                        Analyser {capturedImages.length > 0 && `(${capturedImages.length})`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ÉCRAN DE TRAITEMENT IA */
              <div className="flex flex-col items-center py-10 text-center animate-in zoom-in">
                {status === 'parsing' && (
                  <>
                    <div className="relative mb-6">
                      <Loader2 className="animate-spin text-orange-500" size={60} />
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 animate-pulse" size={24} />
                    </div>
                    <p className="text-sm font-black uppercase text-white italic tracking-widest">Analyse Intelligente</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 italic animate-pulse">Extraction des lignes en cours...</p>
                  </>
                )}
                {status === 'success' && (
                  <>
                    <div className="bg-green-500/20 p-6 rounded-full mb-6 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                      <CheckCircle className="text-green-500" size={48} />
                    </div>
                    <p className="text-lg font-black uppercase text-green-500 italic">Succès !</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 italic tracking-widest">Le BL est prêt pour le pointage</p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <div className="bg-red-500/20 p-6 rounded-full mb-6 border border-red-500/30">
                      <AlertCircle className="text-red-500" size={48} />
                    </div>
                    <p className="text-lg font-black uppercase text-red-500 italic">Échec</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 italic">Format non reconnu ou erreur serveur</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}