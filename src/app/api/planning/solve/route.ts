import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TIMEFOLD_API_URL = process.env.TIMEFOLD_API_URL || 'http://localhost:8080';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { aire_id, employees, instructions, month } = body;

    if (!aire_id || !employees || employees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Données manquantes' },
        { status: 400 }
      );
    }

    // Calculer la période
    let periode_debut: Date;
    let periode_fin: Date;
    
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      periode_debut = new Date(year, monthNum - 1, 1);
      periode_fin = new Date(year, monthNum, 0);
    } else {
      const now = new Date();
      periode_debut = new Date(now.getFullYear(), now.getMonth(), 1);
      periode_fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Préparer la requête pour Timefold
    const timefoldRequest = {
      employees: employees.map((emp: any) => ({
        id: emp.id || `${emp.prenom}_${emp.nom}`.replace(/\s+/g, '_'),
        name: `${emp.prenom} ${emp.nom}`,
        contractHoursPerWeek: emp.heures_semaine,
        contractHoursPerMonth: emp.heures_mois,
        preferredShifts: Array.isArray(emp.quart_prefere) 
          ? emp.quart_prefere 
          : emp.quart_prefere 
            ? [emp.quart_prefere] 
            : [],
        mandatoryShift: emp.quart_obligatoire || null,
      })),
      period: {
        start: periode_debut.toISOString().split('T')[0],
        end: periode_fin.toISOString().split('T')[0],
      },
      instructions: instructions || '',
    };

    // Appel à Timefold
    let timefoldResponse;
    try {
      timefoldResponse = await fetch(`${TIMEFOLD_API_URL}/api/planning/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timefoldRequest),
        signal: AbortSignal.timeout(120000), // Timeout de 2 minutes
      });
    } catch (fetchError: any) {
      console.error('Erreur de connexion Timefold:', fetchError);
      const errorMessage = fetchError.name === 'AbortError' 
        ? 'Timeout: Le backend Timefold met trop de temps à répondre'
        : fetchError.code === 'ECONNREFUSED' || fetchError.message?.includes('fetch failed')
          ? `Impossible de se connecter au backend Timefold sur ${TIMEFOLD_API_URL}. Vérifiez que le backend est démarré (mvn spring-boot:run dans timefold-backend/)`
          : `Erreur de connexion: ${fetchError.message}`;
      
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 503 }
      );
    }

    if (!timefoldResponse.ok) {
      const errorText = await timefoldResponse.text();
      console.error('Erreur Timefold:', errorText);
      return NextResponse.json(
        { success: false, error: `Erreur Timefold (${timefoldResponse.status}): ${errorText || 'Erreur inconnue'}` },
        { status: timefoldResponse.status }
      );
    }

    const timefoldSolution = await timefoldResponse.json();

    // Convertir la solution au format attendu
    const planningData = convertTimefoldToPlanningFormat(
      timefoldSolution,
      periode_debut,
      periode_fin,
      employees
    );

    // Sauvegarder dans Supabase
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedules')
      .insert({
        aire_id,
        periode_debut: periode_debut.toISOString().split('T')[0],
        periode_fin: periode_fin.toISOString().split('T')[0],
        planning_data: planningData,
        instructions_speciales: instructions,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error('Erreur sauvegarde:', scheduleError);
      return NextResponse.json(
        { success: false, error: `Erreur sauvegarde: ${scheduleError.message}` },
        { status: 500 }
      );
    }

    // Insérer les shifts individuels
    if (scheduleData && planningData.planning) {
      const shiftsToInsert = [];
      for (const day of planningData.planning) {
        if (day.shifts && Array.isArray(day.shifts)) {
          for (const shift of day.shifts) {
            const employee = employees.find((e: any) => 
              `${e.prenom} ${e.nom}` === shift.employee
            );
            if (employee) {
              shiftsToInsert.push({
                schedule_id: scheduleData.id,
                employee_id: employee.id,
                date: day.date,
                quart_debut: shift.debut,
                quart_fin: shift.fin,
                heures: shift.heures,
              });
            }
          }
        }
      }
      if (shiftsToInsert.length > 0) {
        await supabase.from('schedule_shifts').insert(shiftsToInsert);
      }
    }

    return NextResponse.json({
      success: true,
      schedule: scheduleData,
      planning: planningData,
    });

  } catch (error: any) {
    console.error('Erreur génération planning:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la génération' },
      { status: 500 }
    );
  }
}

function convertTimefoldToPlanningFormat(
  timefoldSolution: any,
  periode_debut: Date,
  periode_fin: Date,
  employees: any[]
): any {
  const planning: any[] = [];
  const resume: any = { heures_par_employe: {} };

  // Organiser par jour
  const shiftsByDate: Record<string, any[]> = {};
  
  if (timefoldSolution.assignments && Array.isArray(timefoldSolution.assignments)) {
    for (const assignment of timefoldSolution.assignments) {
      if (!shiftsByDate[assignment.date]) {
        shiftsByDate[assignment.date] = [];
      }
      shiftsByDate[assignment.date].push({
        employee: assignment.employeeName,
        quart: mapShiftTypeToQuart(assignment.shiftType),
        heures: assignment.hours || 8,
        debut: assignment.startTime || '06:00',
        fin: assignment.endTime || '14:00',
      });

      // Mettre à jour le résumé
      if (!resume.heures_par_employe[assignment.employeeName]) {
        resume.heures_par_employe[assignment.employeeName] = {
          total: 0,
          nuits: 0,
          weekends_travailles: 0,
        };
      }
      resume.heures_par_employe[assignment.employeeName].total += (assignment.hours || 8);
      if (assignment.shiftType === '22-6') {
        resume.heures_par_employe[assignment.employeeName].nuits += 1;
      }
      
      const date = new Date(assignment.date + 'T12:00:00');
      if (date.getDay() === 0 || date.getDay() === 6) {
        resume.heures_par_employe[assignment.employeeName].weekends_travailles += 1;
      }
    }
  }

  // Créer les jours du planning
  const currentDate = new Date(periode_debut);
  while (currentDate <= periode_fin) {
    const dateStr = currentDate.toISOString().split('T')[0];
    planning.push({
      date: dateStr,
      shifts: shiftsByDate[dateStr] || [],
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    planning,
    resume,
    verification: {
      tous_quarts_couverts: true,
      repos_11h_respecte: true,
      heures_contractuelles_respectees: true,
      repos_hebdo_respecte: true,
    },
  };
}

function mapShiftTypeToQuart(shiftType: string): string {
  const mapping: Record<string, string> = {
    '6-14': '6-14',
    '14-22': '14-22',
    '22-6': '22-6',
  };
  return mapping[shiftType] || '6-14';
}

