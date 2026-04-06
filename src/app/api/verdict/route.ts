import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!, // clé secrète côté serveur uniquement
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { temp, condition, city, isVacances, products, totalLoss, expiringSoon, aireId, forecast, traffic, trafficForecast } = body;

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ verdict: "Système prêt. Analyse impossible : base de données vide." }), {
        status: 200,
      });
    }

    const lowStocks = products.filter((p: any) => (p.current_stock || 0) <= (p.min_threshold || 5));

    // ANALYSE ENRICHIE DES DONNÉES
    const now = new Date();
    const jourSemaine = now.toLocaleDateString('fr-FR', { weekday: 'long' });
    const heure = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const mois = now.getMonth() + 1; // 1-12
    const saison = mois >= 3 && mois <= 5 ? 'Printemps' : mois >= 6 && mois <= 8 ? 'Été' : mois >= 9 && mois <= 11 ? 'Automne' : 'Hiver';
    const picTrafic = (heure >= 7 && heure <= 9) || (heure >= 17 && heure <= 19) || isWeekend;

    // Détecter les changements de période (fin/début de vacances) - EN PARALLÈLE avec l'historique
    let vacancesContext = "";
    const vacancesCheckPromise = (async () => {
      if (isVacances) {
        // Vérifier si les vacances se terminent dans les 7 prochains jours
        try {
          const in7Days = new Date(now);
          in7Days.setDate(in7Days.getDate() + 7);
          const response = await fetch(
            `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=start_date%20<=%20"${in7Days.toISOString().split('T')[0]}"%20and%20end_date%20>=%20"${now.toISOString().split('T')[0]}"%20and%20end_date%20<=%20"${in7Days.toISOString().split('T')[0]}"&limit=1`
          );
          const data = await response.json();
          if (data.total_count > 0) {
            const endDate = new Date(data.results[0].record.fields.end_date);
            const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (daysUntilEnd <= 7 && daysUntilEnd > 0) {
              return `\n⚠️ FIN DE VACANCES DANS ${daysUntilEnd} JOUR${daysUntilEnd > 1 ? 'S' : ''} (${endDate.toLocaleDateString('fr-FR')}) → Forte affluence attendue avant la fin, puis retour au calme.\n`;
            }
          }
        } catch (err) {
          // Ignore si erreur API vacances
        }
      } else {
        // Vérifier si les vacances commencent dans les 7 prochains jours
        try {
          const in7Days = new Date(now);
          in7Days.setDate(in7Days.getDate() + 7);
          const response = await fetch(
            `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=start_date%20>=%20"${now.toISOString().split('T')[0]}"%20and%20start_date%20<=%20"${in7Days.toISOString().split('T')[0]}"&limit=1`
          );
          const data = await response.json();
          if (data.total_count > 0) {
            const startDate = new Date(data.results[0].record.fields.start_date);
            const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (daysUntilStart <= 7 && daysUntilStart > 0) {
              return `\n🎓 DÉBUT DE VACANCES DANS ${daysUntilStart} JOUR${daysUntilStart > 1 ? 'S' : ''} (${startDate.toLocaleDateString('fr-FR')}) → Augmentation progressive du trafic attendue.\n`;
            }
          }
        } catch (err) {
          // Ignore si erreur API vacances
        }
      }
      return "";
    })();

    // Analyse par catégories
    const categoriesRupture = lowStocks.reduce((acc: any, p: any) => {
      const cat = p.category || 'Divers';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    const categoriesRuptureStr = Object.entries(categoriesRupture).map(([cat, count]) => `${count} ${cat}`).join(', ') || 'Aucune';

    // Analyse des DLC critiques
    const dlcCritiques = expiringSoon.filter((e: any) => {
      const expiryDate = new Date(e.expiry_date);
      const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      return diffDays <= 1;
    });
    const dlcCritiquesStr = dlcCritiques.length > 0 
      ? `${dlcCritiques.length} lots périment DEMAIN (${dlcCritiques.reduce((sum: number, e: any) => sum + (e.quantity || 0), 0)} unités)`
      : '';

    // ANALYSE DES PRÉVISIONS MÉTÉO (7 jours)
    let forecastContext = "";
    let weekendForecast = "";
    let weekForecast = "";
    
    if (forecast && Array.isArray(forecast) && forecast.length > 0) {
      const now = new Date();
      const joursSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      
      // Analyser les prévisions pour identifier les tendances
      const weekendDays = forecast.filter((f: any) => {
        const date = new Date(f.date);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6; // Samedi ou dimanche
      });
      
      const weekDays = forecast.filter((f: any) => {
        const date = new Date(f.date);
        const dayOfWeek = date.getDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6; // Jours de semaine
      });

      // Températures moyennes
      const avgWeekendTemp = weekendDays.length > 0 
        ? weekendDays.reduce((sum: number, f: any) => sum + f.temp, 0) / weekendDays.length 
        : null;
      const avgWeekTemp = weekDays.length > 0
        ? weekDays.reduce((sum: number, f: any) => sum + f.temp, 0) / weekDays.length
        : null;
      const minTemp = Math.min(...forecast.map((f: any) => f.tempMin));
      const maxTemp = Math.max(...forecast.map((f: any) => f.tempMax));

      // Détecter les tendances
      const hasColdWeekend = avgWeekendTemp !== null && avgWeekendTemp < 10;
      const hasHotWeekend = avgWeekendTemp !== null && avgWeekendTemp > 25;
      const hasRainWeekend = weekendDays.some((f: any) => f.condition === 'Rain');
      const tempVariation = maxTemp - minTemp;

      // Construire le contexte prévisions
      forecastContext = "\n\n📅 PRÉVISIONS MÉTÉO SUR 7 JOURS :\n";
      forecast.slice(0, 7).forEach((f: any, idx: number) => {
        const date = new Date(f.date);
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const prefix = isToday ? "AUJOURD'HUI" : isTomorrow ? "DEMAIN" : f.dayName.toUpperCase();
        forecastContext += `${prefix} : ${Math.round(f.temp)}°C (${f.condition})`;
        if (idx < 6) forecastContext += "\n";
      });

      // Analyse weekend
      if (weekendDays.length > 0) {
        const weekendStart = weekendDays[0];
        const weekendEnd = weekendDays[weekendDays.length - 1];
        weekendForecast = `\n\n🎯 WEEKEND À VENIR (${weekendStart.dayName}-${weekendEnd.dayName}) :\n`;
        weekendForecast += `- Température moyenne : ${Math.round(avgWeekendTemp!)}°C\n`;
        if (hasColdWeekend) {
          weekendForecast += `- ⚠️ WEEKEND FROID PRÉVU (< 10°C) → Anticiper boissons chaudes, soupes\n`;
        }
        if (hasHotWeekend) {
          weekendForecast += `- 🔥 WEEKEND CHAUD PRÉVU (> 25°C) → Anticiper boissons froides, glaces\n`;
        }
        if (hasRainWeekend) {
          weekendForecast += `- 🌧️ PLUIE PRÉVUE → Impact négatif sur trafic, ajuster stocks\n`;
        }
        weekendForecast += `- Conditions : ${weekendDays.map((f: any) => f.condition).join(', ')}\n`;
      }

      // Analyse semaine
      if (weekDays.length > 0 && avgWeekTemp !== null) {
        weekForecast = `\n📊 SEMAINE À VENIR :\n`;
        weekForecast += `- Température moyenne : ${Math.round(avgWeekTemp)}°C\n`;
        weekForecast += `- Amplitude : ${Math.round(minTemp)}°C à ${Math.round(maxTemp)}°C\n`;
        if (tempVariation > 10) {
          weekForecast += `- ⚠️ FORTE VARIATION DE TEMPÉRATURE → Adapter stocks selon jours\n`;
        }
      }
    }

    // ANALYSE DES PRÉVISIONS TRAFIC (7 jours)
    let trafficForecastContext = "";
    if (trafficForecast && Array.isArray(trafficForecast) && trafficForecast.length > 0) {
      trafficForecastContext = "\n\n🚗 PRÉVISIONS TRAFIC SUR 7 JOURS :\n";
      trafficForecast.slice(0, 7).forEach((tf: any, idx: number) => {
        const date = new Date(tf.date);
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const prefix = isToday ? "AUJOURD'HUI" : isTomorrow ? "DEMAIN" : tf.dayName.toUpperCase();
        trafficForecastContext += `${prefix} : ${tf.trafficLevel} (Score: ${tf.trafficScore}/100) - ${tf.congestion}`;
        if (idx < 6) trafficForecastContext += "\n";
      });
      
      // Détecter les pics de trafic à venir
      const highTrafficDays = trafficForecast.filter((tf: any) => tf.trafficScore >= 80);
      if (highTrafficDays.length > 0) {
        const days = highTrafficDays.map((tf: any) => tf.dayName).join(', ');
        trafficForecastContext += `\n\n⚠️ PICS DE TRAFIC PRÉVUS : ${days} → Anticiper forte affluence ces jours-là.\n`;
      }
    }

    // Récupérer l'historique similaire ET vérifier vacances EN PARALLÈLE
    let historyContext = "";
    const historyPromise = (async () => {
      if (aireId) {
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const tempNum = parseFloat(temp || '15');

          const { data: similarVerdicts } = await supabase
            .from('ai_verdicts')
            .select('*')
            .eq('aire_id', aireId)
            .eq('is_vacances', isVacances)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);

          // Filtrer par température similaire (±5°C) et prioriser feedback positif
          const filtered = (similarVerdicts || []).filter((v: any) => {
            const verdictTemp = parseFloat(v.temperature || '15');
            return Math.abs(verdictTemp - tempNum) <= 5;
          });

          const sorted = filtered.sort((a: any, b: any) => {
            const aScore = (a.feedback === 'positive' ? 10 : 0) + (a.expiring_count === expiringSoon.length ? 5 : 0);
            const bScore = (b.feedback === 'positive' ? 10 : 0) + (b.expiring_count === expiringSoon.length ? 5 : 0);
            return bScore - aScore;
          });

          if (sorted.length > 0) {
            let context = "\n\n📊 HISTORIQUE SIMILAIRE (situations passées validées) :\n";
            sorted.slice(0, 3).forEach((h: any, idx: number) => {
              const date = new Date(h.created_at).toLocaleDateString('fr-FR');
              const feedback = h.feedback === 'positive' ? '✅ Validé' : h.feedback === 'negative' ? '❌ Rejeté' : '⏳ En attente';
              context += `${idx + 1}. ${date} - ${h.temperature}°C, Vacances: ${h.is_vacances ? 'OUI' : 'NON'}, DLC: ${h.expiring_count}\n`;
              context += `   Verdict: "${h.verdict}" (${feedback})\n`;
            });
            context += "\nUtilise ces exemples validés pour affiner ta recommandation actuelle.\n";
            return context;
          }
        } catch (historyErr) {
          console.error('Erreur récupération historique:', historyErr);
        }
      }
      return "";
    })();

    // Attendre les deux en parallèle
    [vacancesContext, historyContext] = await Promise.all([vacancesCheckPromise, historyPromise]);

    const prompt = `
Tu es un expert logistique pour aires d'autoroute. Ton rôle est de donner des recommandations IMMÉDIATES pour aujourd'hui et d'ANTICIPER les jours à venir.

📋 FORMAT DE SORTIE OBLIGATOIRE (2 parties) :
[ALERTE] ... (si urgence : DLC < 24h, ruptures critiques)
[ACTION JOURNÉE] ... (actions IMMÉDIATES pour ${jourSemaine} : maintenir magasin rempli, traiter DLC, gérer affluence, etc. Sois concret et actionnable)
[JOURS À VENIR] ... (anticipation sur 3-7 jours : changements de tendance, fin/début vacances, évolution météo, ajustements de commandes. Formule comme : "Retour au calme après...", "Ne surchargez pas...", "La météo ne se prête pas à...")

📊 DONNÉES ACTUELLES :
- 📍 Ville : ${city}
- 📅 Nous sommes : ${jourSemaine} ${isWeekend ? '(WEEKEND)' : '(SEMAINE)'}, ${saison}, ${heure}h ${picTrafic ? '(PIC TRAFIC)' : ''}
- 🌡️ Météo aujourd'hui : ${temp}°C (${condition})
- 🎓 Vacances scolaires : ${isVacances ? "OUI" : "NON"}${vacancesContext}
- 🚗 TRAFIC ROUTIER (Bison Futé) : ${traffic?.trafficLevel || 'normal'} (Score: ${traffic?.trafficScore || 50}/100)${traffic?.congestion ? ` - ${traffic.congestion}` : ''}${traffic?.incidents ? ` - ${traffic.incidents} incident(s) signalé(s)` : ''} → Impact sur affluence aire : ${traffic?.impactAire || 'normal'}
- 📦 Produits en base : ${products.length}
- ⚠️ Ruptures de stock : ${lowStocks.length} (${categoriesRuptureStr})
- 💰 Pertes financières : ${totalLoss}€
- 🚨 DLC critiques : ${expiringSoon.length} lots périment dans < 72h${dlcCritiquesStr ? ` | ${dlcCritiquesStr}` : ''}

${forecastContext}${weekendForecast}${weekForecast}${trafficForecastContext}

${historyContext}

📝 EXEMPLES DE VERDICTS VALIDÉS (format ACTION JOURNÉE / JOURS À VENIR) :
1. Situation : Fin de période vacances (dans 2 jours), trafic très dense (Score 90), forte affluence aujourd'hui
   → "[ACTION JOURNÉE] Fin de période de vacances scolaires + trafic très dense (Score 90) → Forte affluence attendue aujourd'hui, maintenez magasin rempli, vérifiez stocks snacking et boissons. [JOURS À VENIR] Retour au calme après les vacances dans 2 jours → Trafic normalisé prévu, ne surchargez pas les commandes pour la semaine prochaine."

2. Situation : Mardi 15°C, Trafic dense (Score 70), Prévisions weekend froid (5°C samedi-dimanche)
   → "[ACTION JOURNÉE] Mardi : Trafic dense (heures de pointe) → Affluence modérée, maintenez stocks optimaux. [JOURS À VENIR] Weekend froid prévu (5°C) → Augmentez commandes boissons chaudes +30% pour vendredi. Trafic réduit prévu (météo défavorable)."

3. Situation : Vendredi 22°C, Trafic très dense (Score 85 - départ weekend), Prévisions weekend chaud (28°C)
   → "[ACTION JOURNÉE] Vendredi : Trafic très dense (départ weekend) → Pic d'affluence attendu, augmentez stocks snacking +25% et boissons +30% dès maintenant. [JOURS À VENIR] Weekend chaud prévu (28°C) + trafic dense → Préparez commande : augmentez boissons froides +40% et glaces +50% pour samedi-dimanche."

4. Situation : Dimanche 18°C, Trafic très dense (Score 90 - retour weekend), 1 DLC
   → "[ALERTE] 1 lot périment lundi → Traiter dimanche. [ACTION JOURNÉE] Dimanche : Trafic très dense (retour weekend) → Pic d'affluence en cours, maintenez magasin rempli. [JOURS À VENIR] Retour au calme lundi (trafic normalisé) → Ne surchargez pas les commandes pour la semaine."

🎯 RÈGLES CONTEXTUELLES SELON LE JOUR + TRAFIC :
- LUNDI-MARDI : Période normale, focus optimisation stocks. Si trafic dense → Affluence modérée.
- MERCREDI-JEUDI : Anticiper weekend à venir. Si trafic dense → Augmenter stocks de 15-20%.
- VENDREDI : Préparation weekend. Si trafic très dense (Score > 80) → Augmenter stocks de 30-40% dès maintenant.
- SAMEDI-DIMANCHE : Gestion pic trafic. Si trafic très dense (Score > 85) → Maintenir magasin rempli, éviter ruptures.
- WEEKEND + VACANCES + TRAFIC TRÈS DENSE : Triple effet → Augmenter stocks de 40-60%
- TRAFIC NORMAL (Score < 50) : Affluence faible → Ne pas surcharger les commandes
- TRAFIC DENSE (Score 65-80) : Affluence modérée → Ajuster stocks de +15-25%
- TRAFIC TRÈS DENSE (Score > 80) : Forte affluence → Augmenter stocks de +30-50%

🎯 RÈGLES GÉNÉRALES - FORMAT ACTION JOURNÉE / JOURS À VENIR :
1. PRIORITÉ : DLC < 24h > Ruptures > Actions immédiates > Anticipation
2. [ACTION JOURNÉE] : Focus sur ACTIONS IMMÉDIATES pour ${jourSemaine} :
   - UTILISE LE TRAFIC ROUTIER : Si trafic très dense (Score > 80) → "Trafic très dense → Forte affluence attendue, maintenez magasin rempli"
   - Maintenir magasin rempli (si trafic dense ou affluence attendue)
   - Traiter DLC critiques
   - Gérer ruptures de stock
   - Adapter stocks selon trafic réel (Score trafic)
   - Sois concret : "Pensez à...", "Maintenez...", "Vérifiez..."
3. [JOURS À VENIR] : Focus sur ANTICIPATION et CHANGEMENTS DE TENDANCE :
   - Fin/début de vacances → Impact sur affluence
   - Évolution météo → Ajustements de commandes
   - Évolution trafic → "Trafic normalisé prévu" ou "Pic trafic attendu"
   - Formule comme : "Retour au calme après...", "Ne surchargez pas...", "La météo ne se prête pas à...", "Augmentez... pour..."
4. DÉTECTE LES CHANGEMENTS :
   - Fin de vacances proche → "Forte affluence attendue, puis retour au calme"
   - Début de vacances proche → "Augmentation progressive du trafic"
   - Changement météo → "La météo ne se prête pas à un afflux massif" ou "Pic chaleur → Augmentez..."
   - Trafic très dense → "Pic d'affluence en cours" ou "Forte affluence attendue"
   - Trafic normal → "Affluence normale" ou "Ne surchargez pas les commandes"
5. MENTIONNE OBLIGATOIREMENT :
   - ${city} dans [JOURS À VENIR]
   - Le jour actuel (${jourSemaine}) dans [ACTION JOURNÉE]
   - Les jours à venir avec températures dans [JOURS À VENIR]
   - Le niveau de trafic (si trafic dense/très dense) dans [ACTION JOURNÉE]
6. MAX 3 lignes au total, ton direct et professionnel
7. Si historique fourni, aligne-toi sur les verdicts validés ✅
8. CONTEXTE TEMPOREL + TRAFIC : ${isWeekend ? 'Tu es en WEEKEND → [ACTION JOURNÉE] gère le pic trafic actuel' : jourSemaine === 'vendredi' ? 'Tu es VENDREDI → [ACTION JOURNÉE] prépare le weekend (trafic très dense attendu), [JOURS À VENIR] anticipe samedi-dimanche' : jourSemaine === 'mardi' || jourSemaine === 'mercredi' || jourSemaine === 'jeudi' ? `Tu es ${jourSemaine.toUpperCase()} → [ACTION JOURNÉE] optimise aujourd'hui (trafic: ${traffic?.trafficLevel || 'normal'}), [JOURS À VENIR] anticipe le weekend (${jourSemaine === 'mardi' ? 'dans 4 jours' : jourSemaine === 'mercredi' ? 'dans 3 jours' : 'dans 2 jours'})` : 'Tu es en SEMAINE → [ACTION JOURNÉE] actions immédiates, [JOURS À VENIR] anticipe les tendances'}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 180, // Augmenté pour permettre plus de détails structurés
    });

    const verdict = completion.choices[0].message?.content?.trim() || "Analyse impossible";

    // Enregistrer le verdict dans l'historique
    let verdictId = null;
    if (aireId) {
      try {
        const { data, error } = await supabase
          .from('ai_verdicts')
          .insert([{
            aire_id: aireId,
            verdict,
            temperature: parseFloat(temp || '15'),
            condition,
            city,
            is_vacances: isVacances,
            products_count: products.length,
            low_stocks_count: lowStocks.length,
            total_loss: parseFloat(totalLoss || '0'),
            expiring_count: expiringSoon.length,
            feedback: null
          }])
          .select()
          .single();
        
        if (!error && data) {
          verdictId = data.id;
        }
      } catch (saveErr) {
        console.error('Erreur sauvegarde verdict:', saveErr);
        // On continue même si la sauvegarde échoue
      }
    }

    return new Response(JSON.stringify({ verdict, verdictId }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ verdict: "Erreur lors de la génération du diagnostic IA." }), { status: 500 });
  }
}