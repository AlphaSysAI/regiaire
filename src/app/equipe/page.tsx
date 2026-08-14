'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2, Circle, MessageSquare, Send, Users,
  Loader2, Lock, Calendar as CalendarIcon, History, X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  PanelTitle,
  PrimaryButton,
  SegmentedTabs,
} from '@/components/ui/orbit';

const getAutomaticShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Matin';
  if (hour >= 14 && hour < 22) return 'Après-midi';
  return 'Nuit';
};

export default function EquipePage() {
  const router = useRouter();
  const [view, setView] = useState<'checklist' | 'history'>('checklist');
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState(getAutomaticShift());
  const [note, setNote] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);

  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [notesHistory, setNotesHistory] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any>(null);

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
        console.error('Erreur Auth:', error);
        setLoading(false);
      }
    }
    initAuth();
  }, [router]);

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

  async function toggleTask(id: string, currentStatus: boolean) {
    if (isLocked || !userProfile) return;
    const { error } = await supabase
      .from('shift_tasks')
      .update({
        is_completed: !currentStatus,
        completed_at: !currentStatus ? new Date().toISOString() : null,
        completed_by: !currentStatus ? activeShift : null,
      })
      .eq('id', id);

    if (!error) {
      setTasks(tasks.map((t) =>
        t.id === id
          ? { ...t, is_completed: !currentStatus, completed_by: !currentStatus ? activeShift : null }
          : t
      ));
    }
  }

  async function sendNoteAndCloseShift() {
    if (!note.trim() || isLocked || !userProfile) return;

    const uncompletedTasks = tasks.filter((t) => !t.is_completed).map((t) => t.task_name);
    const progress = Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100);

    if (!confirm(`Clôturer le service ${activeShift} à ${progress}% ?`)) return;

    setSendingNote(true);
    const { error: noteError } = await supabase.from('shift_notes').insert([{
      content: note,
      created_by: activeShift,
      completion_rate: progress,
      missing_tasks: uncompletedTasks,
      aire_id: userProfile.aire_id,
    }]);

    if (!noteError) {
      await supabase.from('shift_tasks')
        .update({ is_completed: false, completed_by: null, completed_at: null })
        .eq('aire_id', userProfile.aire_id);

      localStorage.setItem(`lock_${activeShift}_${new Date().toLocaleDateString()}`, 'true');
      setIsLocked(true);
      setNote('');
      fetchTasks();
      alert('Service clôturé avec succès !');
    }
    setSendingNote(false);
  }

  const currentAutoShift = getAutomaticShift();

  return (
    <PageShell>
      <PageHeader
        title="Équipe"
        accent="OrbitAire"
        subtitle={userProfile?.aires?.name || 'Checklist de service'}
        icon={Users}
      />

      <PageBody>
        <SegmentedTabs
          value={view}
          onChange={setView}
          options={[
            { value: 'checklist', label: 'Saisie', icon: CheckCircle2 },
            { value: 'history', label: 'Historique', icon: History },
          ]}
        />

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-cyan-400" size={28} />
          </div>
        ) : view === 'checklist' ? (
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
              {['Matin', 'Après-midi', 'Nuit'].map((shift) => {
                const isAuto = currentAutoShift === shift;
                const active = activeShift === shift;
                return (
                  <button
                    key={shift}
                    type="button"
                    disabled={!isAuto}
                    onClick={() => setActiveShift(shift)}
                    className={`relative flex-1 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 shadow-sm shadow-cyan-950/30'
                        : 'text-slate-500'
                    } ${!isAuto ? 'cursor-not-allowed opacity-30' : 'hover:text-slate-300'}`}
                  >
                    {shift}
                    {isAuto && (
                      <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 animate-pulse rounded-full bg-cyan-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {!isLocked && activeShift !== currentAutoShift && (
              <p className="text-center text-xs font-medium text-rose-400">
                Shift hors plage horaire — accès limité
              </p>
            )}

            <div className={`space-y-2 ${isLocked ? 'pointer-events-none opacity-40 grayscale' : ''}`}>
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggleTask(task.id, task.is_completed)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left transition active:scale-[0.98]"
                >
                  {task.is_completed ? (
                    <CheckCircle2 className="shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="shrink-0 text-slate-600" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${task.is_completed ? 'text-slate-500 line-through' : 'text-white'}`}>
                      {task.task_name}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                      {task.category}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {!isLocked ? (
              <Panel>
                <PanelTitle hint="Transmettez le contexte au prochain quart">
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={14} className="text-cyan-400" />
                    Note de passation
                  </span>
                </PanelTitle>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Détails du quart…"
                  className="mb-3 min-h-[120px] w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-white outline-none focus:border-cyan-500/50"
                />
                <PrimaryButton
                  onClick={sendNoteAndCloseShift}
                  disabled={!note.trim() || sendingNote}
                  className="w-full"
                >
                  {sendingNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Clôturer &amp; Transmettre
                </PrimaryButton>
              </Panel>
            ) : (
              <Panel className="flex flex-col items-center gap-3 border-cyan-500/30 bg-cyan-500/10 text-center">
                <Lock size={20} className="text-cyan-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  Service clôturé
                </p>
              </Panel>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Panel className="flex items-center gap-4">
              <CalendarIcon className="text-cyan-400" size={20} />
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="w-full border-none bg-transparent text-sm font-medium text-white outline-none color-scheme-dark"
              />
            </Panel>

            <div className="space-y-2">
              {notesHistory.length > 0 ? (
                notesHistory.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedNote(h)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-cyan-950/10"
                  >
                    <div className="text-left">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {new Date(h.created_at).toLocaleTimeString()}
                      </p>
                      <p className="font-semibold text-white">{h.created_by}</p>
                    </div>
                    <div
                      className={`rounded-xl px-4 py-2 text-xs font-bold tabular-nums ${
                        h.completion_rate === 100
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {h.completion_rate}%
                    </div>
                  </button>
                ))
              ) : (
                <p className="py-16 text-center text-sm text-slate-500">Aucun rapport ce jour</p>
              )}
            </div>
          </div>
        )}
      </PageBody>

      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
          <div className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedNote(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h2
              className="mb-4 pr-8 text-xl font-semibold text-white"
              style={{ fontFamily: 'var(--font-display), system-ui' }}
            >
              Rapport {selectedNote.created_by}
            </h2>
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-200">
              &ldquo;{selectedNote.content}&rdquo;
            </div>
            <PrimaryButton onClick={() => setSelectedNote(null)} className="w-full">
              Fermer
            </PrimaryButton>
          </div>
        </div>
      )}
    </PageShell>
  );
}
