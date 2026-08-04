import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// API « Verdict IA détaillé » — agrège les KPIs de vente (via la fonction SQL
// verdict_analytics) et produit un verdict stratégique pour le directeur en
// tenant compte des ventes, des comparaisons N-1, de la météo et du trafic
// routier (TomTom / Bison Futé).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
const pct = (n: number | null | undefined) =>
  n == null ? "n/a" : `${n > 0 ? "+" : ""}${n}%`;

type Kpi = { ca: number; ca_n1: number; delta_pct: number | null; qty?: number };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      aireId,
      city = "",
      temp,
      condition,
      isVacances = false,
      traffic,
      trafficForecast = [],
      refDate = null,
    } = body || {};

    if (!aireId) {
      return Response.json({ error: "aireId manquant" }, { status: 400 });
    }

    // 1. Agrégations de vente (KPIs, comparaisons N-1, top/flop, séries)
    const { data: analytics, error } = await supabase.rpc("verdict_analytics", {
      p_aire: aireId,
      p_ref: refDate,
    });

    if (error) {
      console.error("Erreur verdict_analytics:", error);
      return Response.json({ error: "Analytics indisponible" }, { status: 500 });
    }

    if (!analytics || analytics.empty) {
      return Response.json({
        analytics: analytics || { empty: true },
        verdict: "Aucune donnée de vente disponible pour cette aire.",
      });
    }

    const jour: Kpi = analytics.jour;
    const semaine: Kpi = analytics.semaine;
    const m30: Kpi = analytics.trente_jours;
    const mois: Kpi = analytics.mois_calendaire;
    const annee: Kpi = analytics.annee;
    const top = analytics.top || [];
    const flop = analytics.flop || [];

    const trafficLevel = traffic?.trafficLevel || "normal";
    const trafficScore = traffic?.trafficScore ?? 50;
    const congestion = traffic?.congestion || "";
    const peakDays = (trafficForecast || [])
      .filter((t: any) => (t.trafficScore ?? 0) >= 80)
      .map((t: any) => t.dayName)
      .join(", ");

    // 2. Prompt IA orienté « bras droit du directeur »
    const topStr = top
      .map((p: any) => `${p.name} (${eur(p.ca)}, ${pct(p.delta_pct)} vs N-1)`)
      .join(" · ");
    const flopStr = flop
      .map((p: any) => `${p.name} (${eur(p.ca)}, ${pct(p.delta_pct)} vs N-1)`)
      .join(" · ");

    const prompt = `
Tu es l'analyste business d'une aire d'autoroute, bras droit du directeur.
Objectif : lui faire GAGNER DU TEMPS avec une synthèse actionnable et chiffrée.
Réponds en français, ton direct et professionnel, SANS markdown, en 4 sections
préfixées EXACTEMENT ainsi (une ligne chacune, 1 à 2 phrases max) :

[BILAN] Synthèse du chiffre d'affaires du jour et de la tendance vs l'an dernier.
[LEVIERS] Produits à pousser (qui performent) et à surveiller (en recul).
[TRAFIC & MÉTÉO] Ce que le trafic routier et la météo impliquent pour l'affluence à venir.
[PLAN D'ACTION] 2 actions concrètes et prioritaires pour aujourd'hui/demain.

DONNÉES (aire de ${city}) :
- CA du jour (${analytics.ref_date}) : ${eur(jour.ca)} (${pct(jour.delta_pct)} vs même jour N-1, ${jour.qty} articles)
- CA 7 jours : ${eur(semaine.ca)} (${pct(semaine.delta_pct)} vs N-1)
- CA 30 jours : ${eur(m30.ca)} (${pct(m30.delta_pct)} vs N-1)
- CA mois en cours : ${eur(mois.ca)} (${pct(mois.delta_pct)} vs N-1)
- CA année glissante : ${eur(annee.ca)} (${pct(annee.delta_pct)} vs N-1)
- Top produits (30j) : ${topStr}
- Produits en retrait (30j) : ${flopStr}
- Météo : ${temp != null ? Math.round(temp) + "°C" : "n/a"} (${condition || "n/a"})
- Vacances scolaires : ${isVacances ? "OUI" : "NON"}
- Trafic routier (TomTom/Bison Futé) : ${trafficLevel} (score ${trafficScore}/100)${congestion ? " - " + congestion : ""}
- Pics de trafic prévus : ${peakDays || "aucun notable"}

Sois concret : cite des produits et des chiffres. Relie explicitement le trafic
et la météo à l'affluence et aux stocks à prévoir.`.trim();

    // 3. Appel IA (avec repli si pas de clé / erreur)
    let verdict = fallbackVerdict(analytics, { city, temp, condition, isVacances, trafficLevel, trafficScore, peakDays });
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 380,
        });
        verdict = completion.choices[0]?.message?.content?.trim() || verdict;
      } catch (aiErr) {
        console.error("Erreur IA verdict-detail, repli local:", aiErr);
      }
    }

    return Response.json({ analytics, verdict });
  } catch (err) {
    console.error("Erreur verdict-detail:", err);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// Verdict de repli calculé localement (aucun appel externe requis)
function fallbackVerdict(a: any, ctx: any): string {
  const jour: Kpi = a.jour;
  const annee: Kpi = a.annee;
  const top = (a.top || [])[0];
  const flop = (a.flop || [])[0];
  const tendJour = (jour.delta_pct ?? 0) >= 0 ? "en hausse" : "en repli";
  const tendAn = (annee.delta_pct ?? 0) >= 0 ? "positive" : "négative";

  const bilan = `[BILAN] CA du jour ${eur(jour.ca)} (${pct(jour.delta_pct)} vs N-1), ${tendJour}. Dynamique annuelle ${tendAn} : ${eur(annee.ca)} sur 12 mois (${pct(annee.delta_pct)}).`;
  const leviers = `[LEVIERS] À pousser : ${top ? `${top.name} (${pct(top.delta_pct)})` : "n/a"}. À surveiller : ${flop ? `${flop.name} (${pct(flop.delta_pct)})` : "n/a"}.`;

  let tm = `[TRAFIC & MÉTÉO] Trafic ${ctx.trafficLevel} (score ${ctx.trafficScore}/100)`;
  if (ctx.trafficScore >= 80) tm += " → forte affluence attendue, maintenez le magasin rempli.";
  else if (ctx.trafficScore <= 40) tm += " → affluence modérée, évitez le surstock.";
  else tm += " → affluence normale.";
  if (ctx.temp != null && ctx.temp >= 25) tm += ` Chaleur (${Math.round(ctx.temp)}°C) : renforcez boissons fraîches.`;
  else if (ctx.temp != null && ctx.temp <= 8) tm += ` Froid (${Math.round(ctx.temp)}°C) : poussez cafés et boissons chaudes.`;
  if (ctx.peakDays) tm += ` Pics prévus : ${ctx.peakDays}.`;

  const action = `[PLAN D'ACTION] 1) Réassort prioritaire sur les tops (${top ? top.name : "produits phares"}) avant le prochain pic. 2) ${flop ? `Analyser le recul de ${flop.name} (promo/rotation/DLC)` : "Vérifier les rotations lentes"}.`;

  return [bilan, leviers, tm, action].join("\n");
}
