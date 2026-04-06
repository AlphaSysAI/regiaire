import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET : Récupérer l'historique similaire
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const aireId = searchParams.get('aire_id');
    const temp = searchParams.get('temp');
    const isVacances = searchParams.get('isVacances') === 'true';
    const expiringCount = parseInt(searchParams.get('expiringCount') || '0');

    if (!aireId) {
      return NextResponse.json({ history: [] }, { status: 200 });
    }

    // Recherche de situations similaires (même météo, même période vacances)
    // On cherche dans les 30 derniers jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: similarVerdicts } = await supabase
      .from('ai_verdicts')
      .select('*')
      .eq('aire_id', aireId)
      .eq('is_vacances', isVacances)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    // Filtrer par température similaire (±5°C)
    const tempNum = parseFloat(temp || '15');
    const filtered = (similarVerdicts || []).filter((v: any) => {
      const verdictTemp = parseFloat(v.temperature || '15');
      return Math.abs(verdictTemp - tempNum) <= 5;
    });

    // Prioriser ceux avec feedback positif
    const sorted = filtered.sort((a: any, b: any) => {
      const aScore = (a.feedback === 'positive' ? 10 : 0) + (a.expiring_count === expiringCount ? 5 : 0);
      const bScore = (b.feedback === 'positive' ? 10 : 0) + (b.expiring_count === expiringCount ? 5 : 0);
      return bScore - aScore;
    });

    return NextResponse.json({ history: sorted.slice(0, 3) }, { status: 200 });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    return NextResponse.json({ history: [] }, { status: 200 });
  }
}

// POST : Enregistrer un nouveau verdict
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      aire_id, 
      verdict, 
      temperature, 
      condition, 
      city, 
      is_vacances, 
      products_count, 
      low_stocks_count, 
      total_loss, 
      expiring_count 
    } = body;

    if (!aire_id || !verdict) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_verdicts')
      .insert([{
        aire_id,
        verdict,
        temperature: parseFloat(temperature || '15'),
        condition,
        city,
        is_vacances,
        products_count: parseInt(products_count || '0'),
        low_stocks_count: parseInt(low_stocks_count || '0'),
        total_loss: parseFloat(total_loss || '0'),
        expiring_count: parseInt(expiring_count || '0'),
        feedback: null
      }])
      .select()
      .single();

    if (error) {
      console.error('Erreur insertion verdict:', error);
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id }, { status: 200 });
  } catch (error) {
    console.error('Erreur POST verdict:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH : Mettre à jour le feedback
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { verdict_id, feedback } = body;

    if (!verdict_id || !feedback) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
    }

    const { error } = await supabase
      .from('ai_verdicts')
      .update({ feedback })
      .eq('id', verdict_id);

    if (error) {
      console.error('Erreur mise à jour feedback:', error);
      return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Erreur PATCH feedback:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}


