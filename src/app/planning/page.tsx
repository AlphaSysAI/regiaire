'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Calendar, Plus, Users, Clock, FileDown, MessageSquare, 
  X, Loader2, CheckCircle, AlertCircle, Trash2, ChevronLeft, ChevronRight,
  Send, Sparkles
} from 'lucide-react';
import jsPDF from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface Employee {
  id?: string;
  prenom: string;
  nom: string;
  heures_semaine: number;
  heures_mois: number;
  quart_prefere: string[];
  quart_obligatoire?: string;
}

interface Schedule {
  id: string;
  periode_debut: string;
  periode_fin: string;
  planning_data: any;
  instructions_speciales?: string;
  created_at: string;
}

// Composant MonthPicker
function MonthPicker({ selectedMonth, onSelect }: { selectedMonth: string; onSelect: (month: string) => void }) {
  const [currentYear, setCurrentYear] = useState(() => {
    const [year] = selectedMonth.split('-');
    return parseInt(year);
  });
  
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentYear(currentYear - 1)}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ChevronLeft size={20} className="text-slate-300" />
        </button>
        <span className="text-lg font-semibold text-white">{currentYear}</span>
        <button
          onClick={() => setCurrentYear(currentYear + 1)}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ChevronRight size={20} className="text-slate-300" />
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {months.map((month, index) => {
          const monthValue = `${currentYear}-${String(index + 1).padStart(2, '0')}`;
          const isSelected = monthValue === selectedMonth;
          return (
            <button
              key={index}
              onClick={() => onSelect(monthValue)}
              className={`p-3 rounded-lg font-medium transition-all ${
                isSelected
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {month}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanningPage() {
  const [aireId, setAireId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Nouvel employé
  const [newEmployee, setNewEmployee] = useState<Employee>({
    prenom: '',
    nom: '',
    heures_semaine: 35,
    heures_mois: 151,
    quart_prefere: [],
    quart_obligatoire: '',
  });

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('aire_id')
        .eq('id', user.id)
        .single();

      if (profile?.aire_id) {
        setAireId(profile.aire_id);
        loadEmployees(profile.aire_id);
        loadSchedules(profile.aire_id);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function loadEmployees(aireId: string) {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('aire_id', aireId)
      .order('nom', { ascending: true });
    
    if (data) {
      setEmployees(data.map(emp => ({
        ...emp,
        quart_prefere: Array.isArray(emp.quart_prefere) ? emp.quart_prefere : 
                      emp.quart_prefere ? [emp.quart_prefere] : []
      })));
    }
  }

  async function loadSchedules(aireId: string) {
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('aire_id', aireId)
      .order('created_at', { ascending: false });
    
    if (data) setSchedules(data);
  }

  async function handleAddEmployee() {
    if (!aireId || !newEmployee.prenom || !newEmployee.nom) return;

    const { data, error } = await supabase
      .from('employees')
      .insert({
        aire_id: aireId,
        prenom: newEmployee.prenom,
        nom: newEmployee.nom,
        heures_semaine: newEmployee.heures_semaine,
        heures_mois: newEmployee.heures_mois,
        quart_prefere: newEmployee.quart_prefere,
        quart_obligatoire: newEmployee.quart_obligatoire || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur ajout employé:', error);
      alert('Erreur lors de l\'ajout de l\'employé');
      return;
    }

    setEmployees([...employees, data]);
    setNewEmployee({
      prenom: '',
      nom: '',
      heures_semaine: 35,
      heures_mois: 151,
      quart_prefere: [],
      quart_obligatoire: '',
    });
    setShowAddEmployee(false);
  }

  async function handleDeleteEmployee(id: string) {
    if (!confirm('Supprimer cet employé ?')) return;
    
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erreur suppression:', error);
      return;
    }

    setEmployees(employees.filter(e => e.id !== id));
  }

  async function handleGeneratePlanning() {
    if (!aireId || employees.length === 0) {
      alert('Ajoutez au moins un employé');
      return;
    }

    setGenerating(true);
    setShowChat(false);

    try {
      const instructions = chatMessages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');

      const response = await fetch('/api/planning/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aire_id: aireId,
          employees,
          instructions,
          month: selectedMonth,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        const errorMessage = errorData.error || `Erreur HTTP ${response.status}`;
        alert(`Erreur: ${errorMessage}`);
        setChatMessages([...chatMessages, {
          role: 'assistant',
          content: `❌ Erreur: ${errorMessage}`
        }]);
        return;
      }

      const result = await response.json();

      if (!result.success) {
        alert(`Erreur: ${result.error}`);
        setChatMessages([...chatMessages, {
          role: 'assistant',
          content: `❌ Erreur: ${result.error}`
        }]);
        return;
      }

      // Ajouter message de confirmation
      setChatMessages([...chatMessages, {
        role: 'assistant',
        content: `✅ Planning généré avec succès pour ${selectedMonth} !`
      }]);

      await loadSchedules(aireId);
      if (result.schedule) {
        setSelectedSchedule(result.schedule);
      }
    } catch (error: any) {
      console.error('Erreur génération:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!confirm('Supprimer ce planning ?')) return;

    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erreur suppression:', error);
      return;
    }

    await supabase.from('schedule_shifts').delete().eq('schedule_id', id);
    setSchedules(schedules.filter(s => s.id !== id));
    if (selectedSchedule?.id === id) setSelectedSchedule(null);
  }

  function handleExportPDF(schedule: Schedule) {
    if (!schedule.planning_data?.planning) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const planning = schedule.planning_data.planning;
    const employeesList = [...new Set<string>(
      planning.flatMap((day: any) => 
        day.shifts?.map((s: any) => s.employee) || []
      )
    )].sort();

    const startDate = new Date(schedule.periode_debut + 'T12:00:00');
    const endDate = new Date(schedule.periode_fin + 'T12:00:00');
    const days: Date[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    // En-tête
    doc.setFontSize(16);
    doc.text('Planning Mensuel', 14, 15);
    doc.setFontSize(10);
    doc.text(
      `${startDate.toLocaleDateString('fr-FR')} - ${endDate.toLocaleDateString('fr-FR')}`,
      14,
      22
    );

    // Tableau
    const tableData: any[][] = [];
    employeesList.forEach(emp => {
      const row: any[] = [emp];
      days.forEach(day => {
        const dayStr = day.toISOString().split('T')[0];
        const dayData = planning.find((d: any) => d.date === dayStr);
        const shifts = dayData?.shifts?.filter((s: any) => s.employee === emp) || [];
        const codes = shifts.map((s: any) => {
          if (s.quart === '6-14') return 'CM';
          if (s.quart === '14-22') return 'CS';
          if (s.quart === '22-6') return 'CN';
          return '';
        }).join(' ');
        row.push(codes || '');
      });
      tableData.push(row);
    });

    const headers = ['Employé', ...days.map(d => d.getDate().toString())];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22] },
      alternateRowStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`planning-${schedule.periode_debut}-${schedule.periode_fin}.pdf`);
  }

  function renderPlanningTable(schedule: Schedule) {
    if (!schedule.planning_data?.planning) return null;

    const planning = schedule.planning_data.planning;
    const employeesList = [...new Set<string>(
      planning.flatMap((day: any) => 
        day.shifts?.map((s: any) => s.employee) || []
      )
    )].sort();

    const startDate = new Date(schedule.periode_debut + 'T12:00:00');
    const endDate = new Date(schedule.periode_fin + 'T12:00:00');
    const days: Date[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    // Calculer heures par employé
    const hoursByEmployee: Record<string, number> = {};
    employeesList.forEach(emp => {
      hoursByEmployee[emp] = planning.reduce((total: number, day: any) => {
        const empShifts = day.shifts?.filter((s: any) => s.employee === emp) || [];
        return total + empShifts.reduce((sum: number, s: any) => sum + (s.heures || 8), 0);
      }, 0);
    });

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-slate-700 text-white p-2 border border-slate-600 text-left sticky left-0 z-10">
                  Employé
                </th>
                {days.map((day, idx) => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <th
                      key={idx}
                      className={`p-2 border border-slate-600 text-center text-xs ${
                        isWeekend ? 'bg-blue-900/30' : 'bg-slate-700'
                      } text-white`}
                    >
                      {day.getDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employeesList.map((emp, empIdx) => {
                const employee = employees.find(e => `${e.prenom} ${e.nom}` === emp);
                return (
                  <tr key={empIdx} className={empIdx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-850'}>
                    <td className="p-2 border border-slate-600 text-white font-medium sticky left-0 z-10 bg-slate-800">
                      {emp}
                    </td>
                    {days.map((day, dayIdx) => {
                      const dayStr = day.toISOString().split('T')[0];
                      const dayData = planning.find((d: any) => d.date === dayStr);
                      const shifts = dayData?.shifts?.filter((s: any) => s.employee === emp) || [];
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const codes = shifts.map((s: any) => {
                        if (s.quart === '6-14') return 'CM';
                        if (s.quart === '14-22') return 'CS';
                        if (s.quart === '22-6') return 'CN';
                        return '';
                      }).join(' ');

                      return (
                        <td
                          key={dayIdx}
                          className={`p-2 border border-slate-600 text-center text-sm ${
                            isWeekend ? 'bg-blue-900/20' : ''
                          }`}
                        >
                          <span className="text-white font-semibold">{codes || '-'}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Résumé heures */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">Cumul des heures par employé</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {employeesList.map(emp => {
              const employee = employees.find(e => `${e.prenom} ${e.nom}` === emp);
              const totalHours = hoursByEmployee[emp] || 0;
              const expectedHours = employee?.heures_mois || 0;
              const deviation = totalHours - expectedHours;
              const percent = expectedHours > 0 ? Math.round((totalHours / expectedHours) * 100) : 0;

              return (
                <div
                  key={emp}
                  className="bg-slate-700 rounded p-2 border border-slate-600"
                >
                  <div className="text-white font-medium text-sm">{emp}</div>
                  <div className="text-slate-300 text-xs mt-1">
                    {totalHours}h / {expectedHours}h ({percent}%)
                  </div>
                  {Math.abs(deviation) > 5 && (
                    <div className={`text-xs mt-1 ${deviation > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                      {deviation > 0 ? '+' : ''}{deviation}h
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-orange-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="text-orange-600" size={28} />
        <h1 className="text-2xl font-bold text-white">Planning</h1>
      </div>

      {/* Section Employés */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Users size={20} />
            Employés ({employees.length})
          </h2>
          <button
            onClick={() => setShowAddEmployee(true)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={18} />
            Ajouter
          </button>
        </div>

        {employees.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            Aucun employé. Ajoutez-en un pour commencer.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map(emp => (
              <div
                key={emp.id}
                className="bg-slate-700 rounded-lg p-4 border border-slate-600"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold">
                      {emp.prenom} {emp.nom}
                    </h3>
                    <div className="text-slate-300 text-sm mt-1">
                      {emp.heures_semaine}h/sem • {emp.heures_mois}h/mois
                    </div>
                    {emp.quart_prefere && emp.quart_prefere.length > 0 && (
                      <div className="text-slate-400 text-xs mt-1">
                        Préféré: {emp.quart_prefere.join(', ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteEmployee(emp.id!)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Génération */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Sparkles size={20} />
            Génération Planning
          </h2>
          <button
            onClick={() => setShowChat(!showChat)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <MessageSquare size={18} />
            {showChat ? 'Masquer' : 'Instructions'}
          </button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setShowMonthPicker(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Calendar size={18} />
            {new Date(`${selectedMonth}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </button>
          <button
            onClick={handleGeneratePlanning}
            disabled={generating || employees.length === 0}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
          >
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Générer le planning
              </>
            )}
          </button>
        </div>

        {showChat && (
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 mt-4">
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {chatMessages.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  Donnez des instructions spéciales pour la génération du planning...
                </p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded ${
                      msg.role === 'user'
                        ? 'bg-orange-600/20 text-orange-200 ml-4'
                        : 'bg-slate-700 text-slate-300 mr-4'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    setChatMessages([...chatMessages, { role: 'user', content: chatInput }]);
                    setChatInput('');
                  }
                }}
                placeholder="Ex: Éviter les nuits consécutives pour Jean..."
                className="flex-1 bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600"
              />
              <button
                onClick={() => {
                  if (chatInput.trim()) {
                    setChatMessages([...chatMessages, { role: 'user', content: chatInput }]);
                    setChatInput('');
                  }
                }}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section Planning générés */}
      {schedules.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Plannings générés</h2>
          <div className="space-y-3">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className="bg-slate-700 rounded-lg p-4 border border-slate-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-white font-medium">
                      {new Date(schedule.periode_debut + 'T12:00:00').toLocaleDateString('fr-FR')} -{' '}
                      {new Date(schedule.periode_fin + 'T12:00:00').toLocaleDateString('fr-FR')}
                    </span>
                    <span className="text-slate-400 text-sm ml-2">
                      {new Date(schedule.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedSchedule(selectedSchedule?.id === schedule.id ? null : schedule)}
                      className="text-blue-400 hover:text-blue-300 p-1"
                    >
                      {selectedSchedule?.id === schedule.id ? 'Masquer' : 'Voir'}
                    </button>
                    <button
                      onClick={() => handleExportPDF(schedule)}
                      className="text-green-400 hover:text-green-300 p-1"
                    >
                      <FileDown size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                {selectedSchedule?.id === schedule.id && (
                  <div className="mt-4">
                    {renderPlanningTable(schedule)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Ajout Employé */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Nouvel employé</h3>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm mb-1">Prénom</label>
                <input
                  type="text"
                  value={newEmployee.prenom}
                  onChange={(e) => setNewEmployee({ ...newEmployee, prenom: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 text-white px-3 py-2 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-1">Nom</label>
                <input
                  type="text"
                  value={newEmployee.nom}
                  onChange={(e) => setNewEmployee({ ...newEmployee, nom: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 text-white px-3 py-2 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm mb-1">Heures/semaine</label>
                  <input
                    type="number"
                    value={newEmployee.heures_semaine}
                    onChange={(e) => setNewEmployee({ ...newEmployee, heures_semaine: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-700 border border-slate-600 text-white px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-1">Heures/mois</label>
                  <input
                    type="number"
                    value={newEmployee.heures_mois}
                    onChange={(e) => setNewEmployee({ ...newEmployee, heures_mois: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-700 border border-slate-600 text-white px-3 py-2 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-2">Quarts préférés</label>
                <div className="flex gap-3">
                  {['6-14', '14-22', '22-6'].map(quart => (
                    <label key={quart} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newEmployee.quart_prefere.includes(quart)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewEmployee({
                              ...newEmployee,
                              quart_prefere: [...newEmployee.quart_prefere, quart],
                            });
                          } else {
                            setNewEmployee({
                              ...newEmployee,
                              quart_prefere: newEmployee.quart_prefere.filter(q => q !== quart),
                            });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-300 text-sm">{quart}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-1">Quart obligatoire (optionnel)</label>
                <select
                  value={newEmployee.quart_obligatoire || ''}
                  onChange={(e) => setNewEmployee({ ...newEmployee, quart_obligatoire: e.target.value || undefined })}
                  className="w-full bg-slate-700 border border-slate-600 text-white px-3 py-2 rounded-lg"
                >
                  <option value="">Aucun</option>
                  <option value="6-14">6-14</option>
                  <option value="14-22">14-22</option>
                  <option value="22-6">22-6</option>
                </select>
              </div>
              <button
                onClick={handleAddEmployee}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg transition-colors"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sélection Mois */}
      {showMonthPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Sélectionner le mois</h3>
              <button
                onClick={() => setShowMonthPicker(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <MonthPicker
              selectedMonth={selectedMonth}
              onSelect={(month) => {
                setSelectedMonth(month);
                setShowMonthPicker(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
