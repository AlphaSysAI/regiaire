'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  CheckCircle2, Circle, MessageSquare, Send, Clock, Users, 
  Loader2, Lock, Calendar as CalendarIcon, History, X, MapPin 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// Fonction pour déterminer le quart selon l'heure actuelle
const getAutomaticShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return "Matin";
  if (hour >= 14 && hour < 22) return "Après-midi";
  return "Nuit";
};

export default function EquipePage() {
  const router = useRouter();
  const [view, setView] = useState<'checklist' | 'history'>('checklist');
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // États Checklist
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState(getAutomaticShift());
  const [note, setNote] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);

  // États Historique
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [notesHistory, setNotesHistory] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any>(null);

  // 1. Initialisation Auth & Profil
  useEffect(() => {
    async function initAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.push('/login');

        const { data: profile } = await supabase
          .from('profiles')
          .select(`*, aires!aire_id (*)`)
          .eq('id', user.id)
          .single();

        if (profile) {
          setUserProfile(profile);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Erreur Auth:", error);
        setLoading(false);
      }
    }
    initAuth();
  }, [router]);

  // 2. Fonctions de chargement
  const fetchTasks = useCallback(async () => {
    if (!userProfile?.aire_id) return;
    const { data } = await supabase
        .from('shift_tasks')
        .select('*')
        .eq('aire_id', userProfile.aire_id)
        .order('category', { ascending: true });
    if (data) setTasks(data);
    setLoading(false);
  }, [userProfile]);

  const fetchHistory = useCallback(async () => {
    if (!userProfile?.aire_id) return;
    const { data } = await supabase
      .from('shift_notes')
      .select('*')
      .eq('aire_id', userProfile.aire_id)
      .gte('created_at', `${historyDate}T00:00:00`)
      .lte('created_at', `${historyDate}T23:59:59`)
      .order('created_at', { ascending: false });
    if (data) setNotesHistory(data);
  }, [userProfile, historyDate]);

  const checkLockStatus = useCallback((shift: string) => {
    const lock = localStorage.getItem(`lock_${shift}_${new Date().toLocaleDateString()}`);
    setIsLocked(!!lock);
  }, []);

  useEffect(() => {
    if (userProfile) {
      fetchTasks();
      checkLockStatus(activeShift);
      if (view === 'history') fetchHistory();
    }
  }, [userProfile, activeShift, view, historyDate, fetchTasks, fetchHistory, checkLockStatus]);

  // 3. Actions
  async function toggleTask(id: string, currentStatus: boolean) {
    if (isLocked || !userProfile) return;
    const { error } = await supabase
        .from('shift_tasks')
        .update({ 
            is_completed: !currentStatus, 
            completed_at: !currentStatus ? new Date().toISOString() : null,
            completed_by: !currentStatus ? activeShift : null 
        })
        .eq('id', id);
    
    if (!error) {
      setTasks(tasks.map(t => t.id === id ? { ...t, is_completed: !currentStatus, completed_by: !currentStatus ? activeShift : null } : t));
    }
  }

  async function sendNoteAndCloseShift() {
    if (!note.trim() || isLocked || !userProfile) return;

    const uncompletedTasks = tasks.filter(t => !t.is_completed).map(t => t.task_name);
    const progress = Math.round((tasks.filter(t => t.is_completed).length / tasks.length) * 100);
    
    if (!confirm(`Clôturer le service ${activeShift} à ${progress}% ?`)) return;

    setSendingNote(true);
    const { error: noteError } = await supabase.from('shift_notes').insert([{ 
      content: note, 
      created_by: activeShift,
      completion_rate: progress,
      missing_tasks: uncompletedTasks,
      aire_id: userProfile.aire_id 
    }]);

    if (!noteError) {
      await supabase.from('shift_tasks')
        .update({ is_completed: false, completed_by: null, completed_at: null })
        .eq('aire_id', userProfile.aire_id);
        
      localStorage.setItem(`lock_${activeShift}_${new Date().toLocaleDateString()}`, 'true');
      setIsLocked(true);
      setNote("");
      fetchTasks();
      alert("Service clôturé avec succès !");
    }
    setSendingNote(false);
  }

  const currentAutoShift = getAutomaticShift();

  return (
    <div className="min-h-screen p-4 pb-32 bg-slate-950 text-white font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pt-2">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter italic">Équipe <span className="text-orange-500">RégiAire</span></h1>
          <div className="flex items-center gap-1.5 mt-1">
             <MapPin size={10} className="text-orange-500" />
             <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{userProfile?.aires?.name}</span>
          </div>
        </div>
      </div>

      {/* Navigation Onglets */}
      <div className="flex bg-slate-900 p-1 rounded-2xl mb-8 border border-slate-800">
        <button onClick={() => setView('checklist')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'checklist' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500'}`}><CheckCircle2 size={14} /> Saisie</button>
        <button onClick={() => setView('history')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'history' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500'}`}><History size={14} /> Historique</button>
      </div>

      {view === 'checklist' ? (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          
          {/* Sélecteur de Quart - VERROUILLÉ SI PAS LE BON QUART */}
          <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-3xl border border-slate-800">
            {['Matin', 'Après-midi', 'Nuit'].map((shift) => {
              const isAuto = currentAutoShift === shift;
              return (
                <button 
                  key={shift} 
                  disabled={!isAuto} // VERROUILLAGE ICI
                  onClick={() => setActiveShift(shift)} 
                  className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase transition-all relative ${activeShift === shift ? 'bg-orange-600 text-white shadow-md' : 'text-slate-500'} ${!isAuto ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
                >
                  {shift}
                  {isAuto && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full animate-pulse"></span>}
                </button>
              );
            })}
          </div>

          {!isLocked && activeShift !== currentAutoShift && (
             <p className="text-center text-[8px] font-black uppercase text-red-500 tracking-widest animate-pulse">
               ⚠️ Shift hors plage horaire - accès limité
             </p>
          )}

          {/* Liste des Tâches */}
          <div className={`space-y-3 ${isLocked ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
            {tasks.map((task) => (
              <button key={task.id} onClick={() => toggleTask(task.id, task.is_completed)} className="w-full p-4 rounded-3xl border border-slate-800 bg-slate-900 flex items-center gap-4 text-left active:scale-[0.98] transition-transform">
                {task.is_completed ? <CheckCircle2 className="text-green-500" /> : <Circle className="text-slate-700" />}
                <div>
                    <p className={`font-bold text-sm ${task.is_completed ? 'line-through text-slate-500 italic' : 'text-white'}`}>{task.task_name}</p>
                    <p className="text-[8px] font-black uppercase text-orange-500 mt-1">{task.category}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Zone de Clôture */}
          {!isLocked ? (
            <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-orange-500" />
                <span className="text-[10px] font-black uppercase text-slate-400">Note de passation</span>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Détails du quart..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm outline-none min-h-[120px] text-white focus:border-orange-500/50" />
              <button onClick={sendNoteAndCloseShift} disabled={!note.trim() || sendingNote} className="w-full bg-white text-slate-950 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50">
                {sendingNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Clôturer & Transmettre
              </button>
            </div>
          ) : (
            <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-3 text-center">
              <Lock size={20} className="text-orange-500" />
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Service clôturé</p>
            </div>
          )}
        </div>
      ) : (
        /* VUE HISTORIQUE */
        <div className="space-y-6 animate-in slide-in-from-left duration-300">
          <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex items-center gap-4">
            <CalendarIcon className="text-orange-500" size={20} />
            <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="bg-transparent border-none outline-none text-white font-black uppercase text-xs w-full color-scheme-dark" />
          </div>
          <div className="space-y-3">
            {notesHistory.length > 0 ? notesHistory.map((h) => (
              <button key={h.id} onClick={() => setSelectedNote(h)} className="w-full bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                <div className="text-left">
                  <p className="text-[10px] text-slate-500 font-black uppercase mb-1">{new Date(h.created_at).toLocaleTimeString()}</p>
                  <p className="font-black text-white uppercase italic">{h.created_by}</p>
                </div>
                <div className={`px-4 py-2 rounded-xl font-black text-xs ${h.completion_rate === 100 ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                  {h.completion_rate}%
                </div>
              </button>
            )) : <p className="text-center py-20 text-slate-600 font-bold uppercase text-[10px] italic">Aucun rapport ce jour</p>}
          </div>
        </div>
      )}

      {/* POP-UP DÉTAIL RAPPORT (Logique X pour fermer) */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[3rem] p-8 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <button onClick={() => setSelectedNote(null)} className="absolute top-6 right-6 p-2 text-slate-400"><X size={20}/></button>
            <h2 className="text-2xl font-black text-white mb-4 uppercase italic italic">Rapport {selectedNote.created_by}</h2>
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 mb-6 italic text-slate-200">"{selectedNote.content}"</div>
            <button onClick={() => setSelectedNote(null)} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase italic">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}