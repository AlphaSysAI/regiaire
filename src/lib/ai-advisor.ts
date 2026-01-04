import { supabase } from './supabase';

export async function getPersonalizedAIVerdict(aireId: string, stats: any, weather: any) {
  try {
    // 1. On récupère les 3 produits les plus jetés pour personnaliser l'avis
    const { data: topLosses } = await supabase
      .from('waste_logs')
      .select('products(name), cost_loss')
      .eq('aire_id', aireId)
      .order('cost_loss', { ascending: false })
      .limit(3);

    const lossNames = topLosses?.map(l => (l.products as any)?.name).join(', ');

    // 2. Préparation du "Prompt" (l'instruction envoyée à l'IA)
    // En mode démo, on simule la réponse de l'IA pour économiser les tokens
    // Mais voici la logique que l'IA traiterait :
    
    let verdict = "";
    
    if (stats.totalLoss > 100) {
      verdict = `Attention, vos pertes sur les produits ${lossNames} impactent fortement votre marge ce mois-ci. Réduisez les commandes fraîches de 15% le mardi.`;
    } else if (weather.temp > 25) {
      verdict = `Le pic de chaleur à ${Math.round(weather.temp)}°C est une opportunité. Placez vos boissons en tête de gondole dès 10h pour maximiser le flux.`;
    } else {
      verdict = "Gestion exemplaire ce jour. Vos stocks sont alignés avec le flux prévisionnel. RAS.";
    }

    return verdict;
  } catch (error) {
    return "Analyse indisponible pour le moment.";
  }
}