'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, FileText, Calendar, CheckCircle2, 
  AlertTriangle, ChevronRight, Search, Truck, ScanLine
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ArchivesLivraisons() {
  const router = useRouter();
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchives() {
      // On récupère toutes les livraisons (traitées ou en litige)
      const { data } = await supabase
        .from('pending_deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      setArchives(data || []);
      setLoading(false);
    }
    fetchArchives();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 pb-10 font-sans">
      {/* HEADER */}
      <header className="flex items-center gap-4 py-6">
        <button onClick={() => router.push('/')} className="p-2 bg-slate-900 rounded-xl border border-slate-800">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black uppercase italic leading-none text-white">
            Journal des <span className="text-orange-500">Livraisons</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 italic tracking-widest">
            Historique des réceptions
          </p>
        </div>
      </header>

      {/* BOUTON DE SCAN DIRECT (Secours ou Nouveau) */}
      <button 
        onClick={() => router.push('/reception-bl')}
        className="w-full mb-6 bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex items-center justify-between active:scale-95 transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="bg-orange-500/10 p-3 rounded-2xl text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
            <ScanLine size={20} />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-slate-500 italic">Scan Manuel</p>
            <p className="text-sm font-black uppercase italic text-white">Scanner sans document</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-700" />
      </button>

      {/* STATS RAPIDES */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-3xl">
          <p className="text-[8px] font-black text-slate-500 uppercase italic">Livraisons total</p>
          <p className="text-xl font-black italic">{archives.length}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-3xl">
          <p className="text-[8px] font-black text-red-500 uppercase italic">Litiges détectés</p>
          <p className="text-xl font-black italic text-red-500">
            {archives.filter(a => a.colis_received < a.total_colis).length}
          </p>
        </div>
      </div>

      {/* LISTE DES BONS DE LIVRAISON */}
      <div className="space-y-4">
        <p className="text-[10px] font-black uppercase text-slate-500 italic px-2">Réceptions récentes</p>
        
        {loading ? (
          <div className="py-20 text-center text-slate-500 animate-pulse uppercase font-black text-[10px]">Chargement du journal...</div>
        ) : archives.length > 0 ? (
          archives.map((bl) => {
            const isPending = bl.status === 'pending';
            const hasLitige = bl.colis_received < bl.total_colis && !isPending;
            
            return (
              <div 
                key={bl.id}
                className="bg-slate-900/40 p-5 rounded-[2.2rem] border border-slate-800 flex items-center justify-between group active:scale-95 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${hasLitige ? 'bg-red-500/10 text-red-500' : isPending ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase italic leading-tight text-white/90">{bl.product_name}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <p className="text-[9px] font-bold text-slate-500 uppercase italic">
                        {new Date(bl.created_at).toLocaleDateString()}
                      </p>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                        hasLitige ? 'bg-red-600' : isPending ? 'bg-orange-600' : 'bg-green-600'
                      } text-white`}>
                        {hasLitige ? 'LITIGE' : isPending ? 'EN COURS' : 'CONFORME'}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-700" />
              </div>
            );
          })
        ) : (
          <div className="py-20 text-center border-2 border-dashed border-slate-900 rounded-[3rem]">
            <Truck size={40} className="mx-auto text-slate-800 mb-4 opacity-20" />
            <p className="text-[10px] font-black uppercase italic text-slate-600">Aucun historique de livraison</p>
          </div>
        )}
      </div>
    </div>
  );
}