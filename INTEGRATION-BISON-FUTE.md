# 🚗 Intégration API Trafic Routier - Guide

## 📋 État actuel

L'API `/api/traffic` est **déjà créée** et fonctionnelle. Elle utilise **TomTom Traffic API** (alternative à Bison Futé) avec un fallback sur estimation si pas de clé API.

## 🔌 Structure actuelle

L'API retourne :
```json
{
  "city": "Capendu",
  "trafficLevel": "normal|dense|très dense",
  "trafficScore": 0-100,
  "congestion": "Description du trafic",
  "incidents": 0,
  "impactAire": "faible|normal|élevé|très élevé",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## 🎯 Intégration dans le verdict IA

Le verdict IA utilise maintenant ces données :
- **Score trafic** pour estimer l'affluence
- **Niveau de trafic** pour adapter les recommandations
- **Incidents** pour alerter sur les perturbations

## ✅ API TomTom Traffic - DÉJÀ INTÉGRÉE

L'API TomTom Traffic est **déjà intégrée** dans `/src/app/api/traffic/route.ts`.

### 🚀 Pour activer l'API réelle :

1. **Créer un compte gratuit** : https://developer.tomtom.com/
   - Plan gratuit : 2,500 requêtes/jour
   - Plus que suffisant pour ton usage

2. **Créer une clé API** :
   - Va dans "My Apps" → "Create a new app"
   - Active "Traffic Flow API" et "Traffic Incidents API"
   - Copie ta clé API

3. **Ajouter la clé dans `.env.local`** :
```env
TOMTOM_API_KEY=ta_cle_api_ici
```

4. **Redémarrer le serveur** : `npm run dev`

C'est tout ! L'API utilisera automatiquement TomTom si la clé est présente, sinon elle utilisera l'estimation.

### 📝 Option 1 : API Bison Futé (Alternative - Abonnement requis)

Si tu préfères Bison Futé :

1. **Créer un compte** : https://developer.tomtom.com/
2. **Récupérer la clé API**
3. **Modifier** `/src/app/api/traffic/route.ts` :

```typescript
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
const response = await fetch(
  `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${TOMTOM_API_KEY}`
);
const tomtomData = await response.json();

// Convertir les données TomTom au format attendu
const trafficScore = tomtomData.flowSegmentData.currentSpeed / tomtomData.flowSegmentData.freeFlowSpeed * 100;
```

### Option 3 : Google Maps Traffic API

1. **Créer un projet** : https://console.cloud.google.com/
2. **Activer Traffic API**
3. **Récupérer la clé API**
4. **Modifier** `/src/app/api/traffic/route.ts` :

```typescript
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const response = await fetch(
  `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lon}&destinations=${lat},${lon}&departure_time=now&traffic_model=best_guess&key=${GOOGLE_API_KEY}`
);
```

## 🔧 Variables d'environnement

Ajouter dans `.env.local` :
```env
# Pour Bison Futé
BISON_FUTE_API_KEY=ta_cle_ici

# OU pour TomTom
TOMTOM_API_KEY=ta_cle_ici

# OU pour Google Maps
GOOGLE_MAPS_API_KEY=ta_cle_ici
```

## ✅ Vérification

Une fois intégré, vérifie que :
1. L'API `/api/traffic` retourne des données réelles
2. Le verdict IA mentionne le trafic dans ses recommandations
3. Les scores de trafic sont cohérents avec la réalité

## 📊 Impact sur le verdict IA

Avec les données réelles, l'IA pourra :
- ✅ Détecter les pics de trafic réels (pas juste estimés)
- ✅ Adapter les stocks selon l'affluence réelle
- ✅ Anticiper les bouchons et leurs impacts
- ✅ Recommander des ajustements précis

---

**Note** : L'API actuelle fonctionne avec des estimations. Pour des données réelles, il faut s'abonner à un service de trafic routier.

