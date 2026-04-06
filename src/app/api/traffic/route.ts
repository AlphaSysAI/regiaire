import { NextRequest, NextResponse } from 'next/server';

// API pour récupérer les informations de trafic routier
// Utilise TomTom Traffic API (alternative à Bison Futé)

export async function GET(req: NextRequest) {
  const { searchParams } = req.url ? new URL(req.url) : {};
  const lat = searchParams?.get('lat');
  const lon = searchParams?.get('lon');
  const city = searchParams?.get('city') || 'Capendu';
  const forecast = searchParams?.get('forecast') === 'true'; // Prévisions sur 7 jours

  const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
  const now = new Date();
  
  // Si demande de prévisions sur 7 jours
  if (forecast) {
    return getTrafficForecast(city, now);
  }
  
  // Si pas de clé API TomTom, utiliser l'estimation basée sur l'heure
  if (!TOMTOM_API_KEY) {
    return getEstimatedTraffic(city, now);
  }

  try {
    // Coordonnées par défaut pour Capendu si non fournies
    const defaultLat = lat || '43.1856';
    const defaultLon = lon || '2.4719';

    // 1. Récupérer les données de flux de trafic (Flow Segment Data)
    const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${defaultLat},${defaultLon}&key=${TOMTOM_API_KEY}`;
    const flowRes = await fetch(flowUrl);
    
    if (!flowRes.ok) {
      throw new Error('TomTom API error');
    }
    
    const flowData = await flowRes.json();
    
    // 2. Récupérer les incidents de trafic (Incidents)
    const incidentsUrl = `https://api.tomtom.com/traffic/services/4/incidentDetails?key=${TOMTOM_API_KEY}&bbox=${parseFloat(defaultLon) - 0.1},${parseFloat(defaultLat) - 0.1},${parseFloat(defaultLon) + 0.1},${parseFloat(defaultLat) + 0.1}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,startTime,from,to,length,delay,roadNumbers,events{description,code,iconCategory}}}}`;
    const incidentsRes = await fetch(incidentsUrl);
    const incidentsData = incidentsRes.ok ? await incidentsRes.json() : { incidents: [] };

    // Calculer le score de trafic basé sur les données réelles
    const currentSpeed = flowData.flowSegmentData?.currentSpeed || 0;
    const freeFlowSpeed = flowData.flowSegmentData?.freeFlowSpeed || 60;
    const speedRatio = freeFlowSpeed > 0 ? (currentSpeed / freeFlowSpeed) : 0.5;
    
    // Convertir en score 0-100 (plus le score est élevé, plus le trafic est dense)
    const trafficScore = Math.round((1 - speedRatio) * 100);
    
    // Déterminer le niveau de trafic
    let trafficLevel = 'normal';
    if (trafficScore >= 80) {
      trafficLevel = 'très dense';
    } else if (trafficScore >= 60) {
      trafficLevel = 'dense';
    }
    
    // Compter les incidents
    const incidents = incidentsData.incidents?.length || 0;
    
    // Description de la congestion
    let congestion = '';
    if (trafficScore >= 80) {
      congestion = 'Trafic très dense - Fort ralentissement';
    } else if (trafficScore >= 60) {
      congestion = 'Trafic dense - Ralentissements';
    } else if (speedRatio > 0.8) {
      congestion = 'Circulation fluide';
    } else {
      congestion = 'Circulation normale';
    }
    
    // Impact sur l'affluence des aires
    let impactAire = 'normal';
    if (trafficScore >= 80) {
      impactAire = 'très élevé';
    } else if (trafficScore >= 65) {
      impactAire = 'élevé';
    } else if (trafficScore <= 30) {
      impactAire = 'faible';
    }

    return NextResponse.json({
      city,
      trafficLevel,
      trafficScore,
      congestion,
      incidents,
      impactAire,
      timestamp: now.toISOString(),
      source: 'TomTom Traffic API',
      currentSpeed: Math.round(currentSpeed),
      freeFlowSpeed: Math.round(freeFlowSpeed),
    });
  } catch (err) {
    console.error('Erreur API TomTom, utilisation estimation:', err);
    // En cas d'erreur, utiliser l'estimation
    return getEstimatedTraffic(city, now);
  }
}

// Fonction de fallback : estimation basée sur l'heure et le jour
function getEstimatedTraffic(city: string, now: Date) {
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  let trafficLevel = 'normal';
  let trafficScore = 50;
  let incidents = 0;
  let congestion = '';
  
  // Heures de pointe
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    trafficLevel = 'dense';
    trafficScore = 70;
    congestion = 'Heures de pointe';
  }
  
  // Weekend
  if (isWeekend && (hour >= 10 && hour <= 18)) {
    trafficLevel = 'dense';
    trafficScore = 75;
    congestion = 'Weekend - Forte affluence touristique';
  }
  
  // Vendredi après-midi
  if (dayOfWeek === 5 && hour >= 14) {
    trafficLevel = 'très dense';
    trafficScore = 85;
    congestion = 'Départ en weekend - Pic de trafic';
  }
  
  // Dimanche soir
  if (dayOfWeek === 0 && hour >= 17) {
    trafficLevel = 'très dense';
    trafficScore = 90;
    congestion = 'Retour de weekend - Pic de trafic';
  }
  
  // Impact sur l'affluence
  let impactAire = 'normal';
  if (trafficScore >= 80) {
    impactAire = 'très élevé';
  } else if (trafficScore >= 65) {
    impactAire = 'élevé';
  } else if (trafficScore <= 30) {
    impactAire = 'faible';
  }

  return NextResponse.json({
    city,
    trafficLevel,
    trafficScore,
    congestion,
    incidents,
    impactAire,
    timestamp: now.toISOString(),
    source: 'Estimation (pas de clé API)',
  });
}

// Fonction pour générer des prévisions de trafic sur 7 jours
function getTrafficForecast(city: string, now: Date) {
  const forecast: any[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    
    const dayOfWeek = date.getDay();
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFriday = dayOfWeek === 5;
    const isSunday = dayOfWeek === 0;
    
    // Estimation du trafic pour ce jour
    let trafficLevel = 'normal';
    let trafficScore = 50;
    let congestion = 'Circulation normale';
    
    // Vendredi = départ en weekend
    if (isFriday) {
      trafficLevel = 'très dense';
      trafficScore = 85;
      congestion = 'Départ en weekend - Pic de trafic attendu';
    }
    // Samedi = weekend actif
    else if (dayOfWeek === 6) {
      trafficLevel = 'dense';
      trafficScore = 75;
      congestion = 'Weekend - Forte affluence touristique';
    }
    // Dimanche = retour de weekend
    else if (isSunday) {
      trafficLevel = 'très dense';
      trafficScore = 90;
      congestion = 'Retour de weekend - Pic de trafic attendu';
    }
    // Jours de semaine
    else {
      trafficLevel = 'normal';
      trafficScore = 50;
      congestion = 'Circulation normale';
    }
    
    // Impact sur l'affluence
    let impactAire = 'normal';
    if (trafficScore >= 80) {
      impactAire = 'très élevé';
    } else if (trafficScore >= 65) {
      impactAire = 'élevé';
    }
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
      trafficLevel,
      trafficScore,
      congestion,
      impactAire,
      isWeekend,
    });
  }
  
  return NextResponse.json({
    city,
    current: getEstimatedTrafficData(city, now),
    forecast,
    source: 'Prévisions basées sur patterns historiques',
  });
}

// Fonction helper pour les données de trafic estimées
function getEstimatedTrafficData(city: string, now: Date) {
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  let trafficLevel = 'normal';
  let trafficScore = 50;
  let congestion = 'Circulation normale';
  
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    trafficLevel = 'dense';
    trafficScore = 70;
    congestion = 'Heures de pointe';
  }
  
  if (isWeekend && (hour >= 10 && hour <= 18)) {
    trafficLevel = 'dense';
    trafficScore = 75;
    congestion = 'Weekend - Forte affluence touristique';
  }
  
  if (dayOfWeek === 5 && hour >= 14) {
    trafficLevel = 'très dense';
    trafficScore = 85;
    congestion = 'Départ en weekend - Pic de trafic';
  }
  
  if (dayOfWeek === 0 && hour >= 17) {
    trafficLevel = 'très dense';
    trafficScore = 90;
    congestion = 'Retour de weekend - Pic de trafic';
  }
  
  let impactAire = 'normal';
  if (trafficScore >= 80) {
    impactAire = 'très élevé';
  } else if (trafficScore >= 65) {
    impactAire = 'élevé';
  } else if (trafficScore <= 30) {
    impactAire = 'faible';
  }
  
  return {
    trafficLevel,
    trafficScore,
    congestion,
    impactAire,
  };
}

