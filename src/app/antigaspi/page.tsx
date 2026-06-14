'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, BrainCircuit, Sparkles, Tag, Timer, 
  AlertCircle, CheckCircle2, Trash2, Loader2
} from "lucide-react";
import { useRouter } from 'next/navigation';

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
      console.error("Erreur fetch:", error);
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
      // 1. On enregistre la perte dans waste_logs (comme la fonction casse)
      const { error: logError } = await supabase.from('waste_logs').insert([{
        product_id: item.product_id,
        aire_id: item.aire_id,
        quantity: item.quantity,
        reason: 'Périmé (AntiGaspi)',
        cost_loss: (item.products?.price_ht || 0) * item.quantity
      }]);
  
      if (logError) throw logError;
  
      // 2. On met à jour le stock : on passe la quantité à 0
      // Note: Dans un produit fini, on pourrait faire "quantity - item.quantity" 
      // mais ici, comme on traite tout le lot périmé, on le vide.
      const { error: stockError } = await supabase
        .from('product_stocks')
        .update({ quantity: 0 })
        .eq('id', item.id);
  
      if (stockError) throw stockError;
  
      // 3. Mise à jour visuelle : on retire l'item de la liste locale
      setExpiringItems(prev => prev.filter(i => i.id !== item.id));
  
    } catch (error) {
      console.error("Erreur lors du retrait du stock:", error);
      alert("Erreur lors de la mise à jour du stock.");
    } finally {
      setActionLoading(null);
    }
  };

  const totalLossPossible = expiringItems.reduce((acc, item) => 
    acc + ((item.products?.price_ht || 0) * item.quantity), 0
  );

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
      <BrainCircuit className="animate-pulse text-orange-500 mb-4" size={50} />
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Synchro inventaire...</p>
    </div>
  );

  return (
    <div className="p-4 space-y-6 min-h-screen bg-slate-950 text-white pb-32 font-sans">
      <header className="flex items-center gap-4 pt-4">
        <button onClick={() => router.back()} className="p-2 bg-slate-900 rounded-xl border border-slate-800">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black uppercase italic leading-none text-white">Plan <span className="text-orange-500">AntiGaspi</span></h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">Actions Correctives</p>
        </div>
      </header>

      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-2xl">
        <div className="flex justify-between items-end mb-4">
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Risque perte brute</p>
            <p className="text-3xl font-black italic text-white">{totalLossPossible.toFixed(2)}€</p>
          </div>
          <div className="bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
            <p className="text-[10px] font-black text-orange-500 uppercase">{expiringItems.length} alertes</p>
          </div>
        </div>
        <div className="bg-orange-600/10 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-4">
          <Sparkles className="text-orange-500" size={18} />
          <p className="text-[10px] font-bold italic text-orange-100">
            Traitez ces lots pour sauvegarder votre marge brute.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {expiringItems.map((item) => {
          const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
          const isProcessing = actionLoading === item.id;

          return (
            <div key={item.id} className={`bg-slate-900/40 p-5 rounded-[2.2rem] border border-slate-800 transition-all ${isProcessing ? 'opacity-30' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3">
                  <div className={`p-3 rounded-xl ${daysLeft <= 1 ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-800 text-slate-500'}`}>
                    <Timer size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase italic text-white leading-tight">{item.products?.name}</h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">{item.quantity} unités • DLC : {new Date(item.expiry_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${daysLeft <= 1 ? 'bg-orange-600' : 'bg-slate-800 text-slate-400'}`}>
                  J-{daysLeft}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handlePromo(item.id)}
                  disabled={!!actionLoading}
                  className="bg-white text-slate-950 h-12 rounded-xl flex items-center justify-center gap-2 font-black uppercase italic text-[10px] active:scale-95 transition-all"
                >
                  {actionLoading === item.id ? <Loader2 className="animate-spin" size={14}/> : <Tag size={14} />}
                  Mise en Promo
                </button>
                <button 
                  onClick={() => handleWaste(item)}
                  disabled={!!actionLoading}
                  className="bg-slate-800 text-red-500 h-12 rounded-xl flex items-center justify-center gap-2 font-black uppercase italic text-[10px] active:scale-95 transition-all"
                >
                  <Trash2 size={14} />
                  Retirer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {expiringItems.length === 0 && (
        <div className="text-center py-20">
          <CheckCircle2 className="mx-auto text-slate-800 mb-4 shadow-sm" size={48} />
          <p className="text-slate-600 font-black uppercase text-[10px] italic">Aucune action requise</p>
        </div>
      )}
    </div>
  );
}