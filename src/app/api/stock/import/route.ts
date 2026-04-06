import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseWorksheetToRows } from '@/lib/stock-import';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization');
  const token = auth?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('aire_id')
    .eq('id', user.id)
    .single();

  if (!profile?.aire_id) {
    return NextResponse.json({ error: 'Aire non définie pour ce compte' }, { status: 400 });
  }

  const aireId = profile.aire_id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const file = form.get('file');
  const mode = form.get('mode') === 'replace' ? 'replace' : 'add';
  const defaultExpiryRaw = form.get('defaultExpiry');
  const defaultExpiry =
    defaultExpiryRaw && String(defaultExpiryRaw).trim()
      ? String(defaultExpiryRaw).trim().slice(0, 10)
      : null;

  if (!file || typeof (file as Blob).arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  }

  const buffer = await (file as Blob).arrayBuffer();
  const { rows, issues, headerError } = parseWorksheetToRows(buffer, defaultExpiry);

  if (headerError) {
    return NextResponse.json({ error: headerError, issues }, { status: 400 });
  }

  if (rows.length === 0 && issues.length === 0) {
    return NextResponse.json(
      { error: 'Aucune ligne de données exploitable.', issues },
      { status: 400 }
    );
  }

  const applied: { line: number; ean: string; action: string }[] = [];
  const errors = [...issues];

  if (mode === 'replace') {
    const uniqueEans = [...new Set(rows.map((r) => r.ean))];
    for (const ean of uniqueEans) {
      const { data: prod } = await supabase
        .from('products')
        .select('id')
        .eq('ean', ean)
        .eq('aire_id', aireId)
        .maybeSingle();
      if (!prod) continue;
      await supabase
        .from('product_stocks')
        .update({ quantity: 0 })
        .eq('product_id', prod.id)
        .eq('aire_id', aireId);
      await supabase.from('products').update({ current_stock: 0 }).eq('id', prod.id).eq('aire_id', aireId);
    }
  }

  for (const row of rows) {
    let { data: product } = await supabase
      .from('products')
      .select('id, current_stock')
      .eq('ean', row.ean)
      .eq('aire_id', aireId)
      .maybeSingle();

    let created = false;
    if (!product) {
      const { data: newProd, error: insErr } = await supabase
        .from('products')
        .insert([
          {
            ean: row.ean,
            name: row.name || `Produit ${row.ean}`,
            price_ht: row.priceHt ?? 0,
            category: row.category || 'Divers',
            current_stock: 0,
            aire_id: aireId,
          },
        ])
        .select('id, current_stock')
        .single();

      if (insErr) {
        errors.push({ line: row.line, message: insErr.message });
        continue;
      }
      product = newProd;
      created = true;
    }

    const { error: stockErr } = await supabase.from('product_stocks').insert([
      {
        product_id: product.id,
        quantity: row.quantity,
        expiry_date: row.expiryDate,
        aire_id: aireId,
      },
    ]);

    if (stockErr) {
      errors.push({ line: row.line, message: stockErr.message });
      continue;
    }

    const newTotal = (product.current_stock || 0) + row.quantity;
    const { error: updErr } = await supabase
      .from('products')
      .update({ current_stock: newTotal })
      .eq('id', product.id);

    if (updErr) {
      errors.push({ line: row.line, message: updErr.message });
      continue;
    }

    const action = created ? 'créé' : mode === 'replace' ? 'remplacé (lot)' : 'ajouté';
    applied.push({ line: row.line, ean: row.ean, action });
  }

  return NextResponse.json({
    ok: true,
    mode,
    imported: applied.length,
    applied,
    errors,
  });
}
