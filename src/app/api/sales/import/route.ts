import { createClient } from "@supabase/supabase-js";

// API d'ingestion des ventes — cible du futur import nocturne (export de caisse
// déposé par e-mail, lu par le SaaS). Upsert idempotent sur (aire, produit, date)
// pour pouvoir rejouer un import sans doublonner.
//
// Corps attendu :
// {
//   "aireId": "uuid",
//   "source": "caisse-email",            // optionnel, défaut 'caisse-email'
//   "rows": [
//     { "ean": "5449000000996", "sale_date": "2026-08-03", "quantity": 42, "revenue_ttc": 55.44, "revenue_ht": 52.55, "product_name": "...", "category": "..." }
//   ]
// }
// Les produits sont rattachés par EAN (aire_id + ean). Les lignes sans produit
// correspondant sont insérées avec product_id NULL (rattachables plus tard).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { aireId, rows, source = "caisse-email" } = await req.json();

    if (!aireId || !Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "aireId et rows[] requis" }, { status: 400 });
    }

    // Table de correspondance EAN -> produit pour cette aire
    const { data: products } = await supabase
      .from("products")
      .select("id, ean, name, category, price_ht")
      .eq("aire_id", aireId);
    const byEan = new Map((products || []).map((p: any) => [String(p.ean), p]));

    const payload = rows
      .filter((r: any) => r && r.sale_date)
      .map((r: any) => {
        const p = r.ean ? byEan.get(String(r.ean)) : undefined;
        const qty = Number(r.quantity) || 0;
        const revHt =
          r.revenue_ht != null
            ? Number(r.revenue_ht)
            : p
            ? Number((qty * Number(p.price_ht)).toFixed(2))
            : 0;
        return {
          aire_id: aireId,
          product_id: p?.id ?? null,
          ean: r.ean ?? p?.ean ?? null,
          product_name: r.product_name ?? p?.name ?? "Produit inconnu",
          category: r.category ?? p?.category ?? "Divers",
          sale_date: r.sale_date,
          quantity: qty,
          revenue_ht: revHt,
          revenue_ttc: r.revenue_ttc != null ? Number(r.revenue_ttc) : revHt,
          source,
        };
      });

    const { error, count } = await supabase
      .from("sales")
      .upsert(payload, { onConflict: "aire_id,product_id,sale_date", count: "exact" });

    if (error) {
      console.error("Erreur import ventes:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, imported: count ?? payload.length });
  } catch (err) {
    console.error("Erreur POST import ventes:", err);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
