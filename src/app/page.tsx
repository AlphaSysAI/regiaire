'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Sun, TrendingUp, CloudRain, Sparkles, Navigation, 
  RefreshCw, AlertTriangle, ChevronRight, Truck, 
  ScanLine, ClipboardCheck, X, FileText, ThumbsUp, ThumbsDown
} from "lucide-react";
import { useRouter } from 'next/navigation';
import IAUpload from '@/components/IAUpload'; 
import { checkVacancesStatus, getWeatherData } from '@/lib/intelligence';

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState({ temp: 15, condition: 'Clear', city: 'Capendu' });
  const [aiVerdict, setAiVerdict] = useState("Analyse des flux...");
  const [stats, setStats] = useState({ totalLoss: 0, expiringCount: 0, pendingBLCount: 0 });
  const [selectedAire, setSelectedAire] = useState<string | null>(null);
  const [currentVerdictId, setCurrentVerdictId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<'positive' | 'negative' | null>(null);
  const [verdictContext, setVerdictContext] = useState<any>(null); // Stocke le contexte du verdict pour le feedback
  
  const [showBLList, setShowBLList] = useState(false);
  const [pendingGroups, setPendingGroups] = useState<any[]>([]);

  const runCoreLogic = async (aireId: string) => {
    setLoading(true);
    try {
      const dateLimiteStr = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

      // PARALLÉLISER TOUS LES APPELS INITIAUX
      const [weatherData, vacancesActive, wasteRes, expiringRes, pendingRes, productsRes, forecastRes] = await Promise.all([
        getWeatherData(), // Météo actuelle
        checkVacancesStatus(), // Vacances
        supabase.from('waste_logs').select('cost_loss').eq('aire_id', aireId),
        supabase.from('product_stocks').select('*, products(name)').eq('aire_id', aireId).lte('expiry_date', dateLimiteStr).gt('quantity', 0),
        supabase.from('pending_deliveries').select('*').eq('aire_id', aireId).eq('status', 'pending'),
        supabase.from('products').select('*').eq('aire_id', aireId),
        fetch("/api/weather?forecast=true").then(r => r.json()) // Prévisions météo en parallèle
      ]);

      // Récupérer les données trafic (actuel + prévisions sur 7 jours)
      const trafficRes = await fetch(`/api/traffic?city=${encodeURIComponent(weatherData.city || 'Capendu')}&forecast=true`)
        .then(r => r.json())
        .catch(() => ({ 
          current: { trafficLevel: 'normal', trafficScore: 50, impactAire: 'normal', congestion: '' },
          forecast: []
        }));
      
      const trafficData = trafficRes.current || trafficRes; // Compatibilité avec l'ancien format
      const trafficForecast = trafficRes.forecast || [];

      // Afficher la météo IMMÉDIATEMENT (sans attendre le verdict)
      setWeather(weatherData);
  
      const totalLoss = (wasteRes.data || []).reduce((acc, curr) => acc + (Number(curr.cost_loss) || 0), 0);
      
      let groupsArray = [];
      if (pendingRes.data) {
        const groups = pendingRes.data.reduce((acc: any, item: any) => {
          const id = item.delivery_group_id || 'sans-id';
          if (!acc[id]) {
            acc[id] = { 
              id, 
              count: 0, 
              time: new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              date: new Date(item.created_at).toLocaleDateString('fr-FR')
            };
          }
          acc[id].count++;
          return acc;
        }, {});
        groupsArray = Object.values(groups);
        setPendingGroups(groupsArray);
      }

      setStats({
        totalLoss,
        expiringCount: (expiringRes.data || []).length,
        pendingBLCount: groupsArray.length
      });

      // Appel verdict (le plus long, mais météo déjà affichée)
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          temp: weatherData.temp, 
          condition: weatherData.condition, 
          city: weatherData.city,
          forecast: forecastRes.forecast || [], // Prévisions météo sur 7 jours
          isVacances: vacancesActive, 
          products: productsRes.data || [], 
          expiringSoon: expiringRes.data || [], 
          totalLoss,
          aireId: aireId,
          traffic: trafficData, // Données trafic actuelles
          trafficForecast: trafficForecast // Prévisions trafic sur 7 jours
        })
      });
      const dataVerdict = await res.json();
      setAiVerdict(dataVerdict.verdict);
      setFeedbackSent(null); // Reset feedback quand nouveau verdict
      
      // Toujours stocker le contexte pour permettre le feedback
      setVerdictContext({
        temp: weatherData.temp,
        condition: weatherData.condition,
        city: weatherData.city,
        isVacances: vacancesActive,
        expiringCount: expiringRes.data?.length || 0,
        productsCount: productsRes.data?.length || 0,
        totalLoss: totalLoss
      });
      
      // Stocker l'ID du verdict retourné par l'API (peut être null si la table n'existe pas)
      if (dataVerdict.verdictId) {
        setCurrentVerdictId(dataVerdict.verdictId);
      } else {
        // Si pas d'ID, on met 'pending' pour permettre quand même le feedback
        setCurrentVerdictId('pending');
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data: profile } = await supabase.from('profiles').select('aire_id').eq('id', user.id).single();
      if (profile) { setSelectedAire(profile.aire_id); runCoreLogic(profile.aire_id); }
    }
    init();
  }, [router]);

  return (
    <div className="p-4 space-y-6 min-h-screen bg-slate-950 text-white pb-32 font-sans relative">
      
      {/* HEADER */}
      <header className="flex justify-between items-start pt-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter italic text-white">
            OptiRoute<span className="text-orange-500">IA</span>
          </h1>
          <div className="flex items-center gap-1.5 mt-2 bg-slate-900/50 px-2 py-1 rounded-lg border border-slate-800">
            <Navigation size={10} className="text-orange-500" />
            <span className="text-[9px] font-black uppercase text-slate-400 italic">{weather.city}</span>
            <RefreshCw size={8} className={`ml-1 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </div>
        </div>
        <div className="bg-slate-900 px-4 py-2 rounded-2xl border border-slate-800 flex items-center gap-2 shadow-lg">
             {weather.condition === 'Rain' ? <CloudRain size={14} className="text-blue-400" /> : <Sun size={14} className="text-orange-500" />}
             <span className="text-[11px] font-black italic">{Math.round(weather.temp)}°C</span>
        </div>
      </header>

      {/* VERDICT IA CARD */}
      <div className="bg-orange-600 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden border-t border-white/20">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
             <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md"><Sparkles size={18} className="text-white animate-pulse" /></div>
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 italic">Verdict IA</span>
          </div>
          <h3 className="text-[15px] font-bold text-white leading-relaxed mb-4 italic">
            {loading ? "Calcul en cours..." : `"${aiVerdict}"`}
          </h3>
          {stats.expiringCount > 0 && (
            <div className="flex items-center gap-2 bg-black/20 w-fit px-3 py-1 rounded-full border border-white/10 mb-4">
              <AlertTriangle size={12} className="text-yellow-400" />
              <span className="text-[9px] font-black uppercase text-white">{stats.expiringCount} DLC Courtes</span>
            </div>
          )}
          
          {/* BOUTONS DE FEEDBACK */}
          {!loading && aiVerdict && aiVerdict !== "Analyse des flux..." && aiVerdict !== "Analyse impossible" && feedbackSent === null && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/20">
              <span className="text-[9px] font-black uppercase text-white/70 italic">Ce verdict est-il utile ?</span>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      if (currentVerdictId && currentVerdictId !== 'pending') {
                        // Si on a un ID valide, on met à jour le feedback
                        await fetch('/api/verdict-history', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ verdict_id: currentVerdictId, feedback: 'positive' })
                        });
                      } else if (verdictContext && selectedAire) {
                        // Si pas d'ID (table pas créée ou erreur), on sauvegarde quand même le verdict avec feedback
                        await fetch('/api/verdict-history', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            aire_id: selectedAire,
                            verdict: aiVerdict,
                            temperature: verdictContext.temp,
                            condition: verdictContext.condition,
                            city: verdictContext.city,
                            is_vacances: verdictContext.isVacances,
                            products_count: verdictContext.productsCount || 0,
                            low_stocks_count: 0,
                            total_loss: verdictContext.totalLoss || 0,
                            expiring_count: verdictContext.expiringCount,
                            feedback: 'positive'
                          })
                        });
                      }
                      setFeedbackSent('positive');
                    } catch (err) {
                      console.error('Erreur feedback:', err);
                      // On affiche quand même le message de confirmation
                      setFeedbackSent('positive');
                    }
                  }}
                  className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-all active:scale-95"
                >
                  <ThumbsUp size={16} className="text-white" />
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (currentVerdictId && currentVerdictId !== 'pending') {
                        await fetch('/api/verdict-history', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ verdict_id: currentVerdictId, feedback: 'negative' })
                        });
                      } else if (verdictContext && selectedAire) {
                        await fetch('/api/verdict-history', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            aire_id: selectedAire,
                            verdict: aiVerdict,
                            temperature: verdictContext.temp,
                            condition: verdictContext.condition,
                            city: verdictContext.city,
                            is_vacances: verdictContext.isVacances,
                            products_count: verdictContext.productsCount || 0,
                            low_stocks_count: 0,
                            total_loss: verdictContext.totalLoss || 0,
                            expiring_count: verdictContext.expiringCount,
                            feedback: 'negative'
                          })
                        });
                      }
                      setFeedbackSent('negative');
                    } catch (err) {
                      console.error('Erreur feedback:', err);
                      setFeedbackSent('negative');
                    }
                  }}
                  className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-all active:scale-95"
                >
                  <ThumbsDown size={16} className="text-white" />
                </button>
              </div>
            </div>
          )}
          {feedbackSent && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-[9px] font-black uppercase text-white/70 italic">
                {feedbackSent === 'positive' ? '✅ Merci ! Ce verdict aidera l\'IA à mieux te conseiller.' : '❌ Merci pour ton retour, l\'IA apprendra de cela.'}
              </p>
            </div>
          )}
        </div>
        <TrendingUp size={160} className="absolute -right-10 -bottom-10 opacity-10 text-white transform rotate-6" />
      </div>

      {/* BOUTON IMPORT DOCUMENT */}
      <section className="space-y-4">
        <div className="px-2 font-black italic uppercase text-[10px] text-slate-500 tracking-widest">Documents & Arrivages</div>
        <IAUpload aireId={selectedAire!} onComplete={() => runCoreLogic(selectedAire!)} />
      </section>

      {/* KPI GRID (Rétablie ici) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center shadow-xl">
          <p className="text-[8px] font-black text-slate-500 uppercase mb-1 italic opacity-60">Profit Sécurisé</p>
          <p className="text-2xl font-black text-green-500 italic">+{(stats.totalLoss * 0.42).toFixed(2)}€</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center shadow-xl">
          <p className="text-[8px] font-black text-slate-500 uppercase mb-1 italic opacity-60">Perte du mois</p>
          <p className="text-2xl font-black text-white italic">-{stats.totalLoss.toFixed(2)}€</p>
        </div>
      </div>

      {/* SECTION OPÉRATIONS */}
      <section className="space-y-4">
        <div className="px-2 font-black italic uppercase text-[10px] text-slate-500 tracking-widest">Opérations Magasin</div>
        
        <div className="grid gap-3">
          {/* BOUTON RÉCEPTION DYNAMIQUE */}
          {stats.pendingBLCount > 0 && (
            <button 
              onClick={() => setShowBLList(true)}
              className="w-full p-6 rounded-[2.5rem] flex items-center justify-between shadow-xl bg-blue-600 animate-in slide-in-from-left duration-500 active:scale-95 transition-all"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="bg-white text-blue-600 p-3 rounded-2xl shadow-inner">
                  <ClipboardCheck size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-100 tracking-widest">Arrivages à pointer</p>
                  <p className="text-md font-black uppercase italic text-white leading-tight">
                    {stats.pendingBLCount > 1 ? `${stats.pendingBLCount} Livraisons` : '1 Livraison'}
                  </p>
                  <p className="text-[8px] font-bold text-blue-200 mt-1 uppercase italic">Choisir un bon de livraison</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white opacity-50" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => router.push('/scanner')}
              className="p-5 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-2 group active:scale-95 transition-all"
            >
              <div className="bg-slate-800 p-3 rounded-2xl text-slate-400 group-hover:text-orange-500 transition-colors">
                <ScanLine size={20} />
              </div>
              <p className="text-[10px] font-black uppercase italic text-center leading-tight">Gérer Stocks</p>
            </button>

            <button 
              onClick={() => router.push('/livraisons')} 
              className="p-5 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-2 group active:scale-95 transition-all"
            >
              <div className="bg-slate-800 p-3 rounded-2xl text-slate-400 group-hover:text-orange-500 transition-colors">
                <Truck size={20} />
              </div>
              <p className="text-[10px] font-black uppercase italic text-center leading-tight">Archive</p>
            </button>
          </div>
        </div>
      </section>

      {/* TIROIR DE SÉLECTION BL */}
      {showBLList && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-slate-900 rounded-t-[3rem] p-8 pb-12 shadow-2xl border-t border-slate-800 animate-in slide-in-from-bottom duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-black uppercase italic">Livraisons <span className="text-blue-500">en attente</span></h2>
              </div>
              <button onClick={() => setShowBLList(false)} className="p-3 bg-slate-800 rounded-2xl text-slate-400"><X size={20}/></button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
              {pendingGroups.map((group) => (
                <button 
                  key={group.id}
                  onClick={() => router.push(`/reception-bl?group=${group.id}`)}
                  className="w-full p-5 bg-slate-950 border border-slate-800 rounded-3xl flex items-center justify-between group active:border-blue-500 transition-all shadow-lg"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="bg-blue-500/10 p-3 rounded-2xl text-blue-500 transition-all"><FileText size={20} /></div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Reçu à {group.time}</p>
                      <p className="text-sm font-black uppercase italic text-white">Livraison #{group.id.slice(0, 6)}</p>
                      <p className="text-[8px] font-bold text-blue-400 mt-1 uppercase italic">{group.count} articles</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-700" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}