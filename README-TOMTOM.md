# 🚗 Configuration TomTom Traffic API

## 🎯 Quick Start

1. **Créer un compte** : https://developer.tomtom.com/user/register
2. **Créer une app** : https://developer.tomtom.com/user/apps
   - Nom : "RégiAire"
   - Services : Active "Traffic Flow API" et "Traffic Incidents API"
3. **Copier la clé API**
4. **Ajouter dans `.env.local`** :
```env
TOMTOM_API_KEY=ta_cle_api_ici
```
5. **Redémarrer** : `npm run dev`

## 📊 Plan Gratuit

- **2,500 requêtes/jour** (gratuit)
- **Trafic en temps réel**
- **Incidents routiers**
- **Données précises**

## ✅ Vérification

Une fois configuré, vérifie dans les logs que tu vois :
```
source: 'TomTom Traffic API'
```

Au lieu de :
```
source: 'Estimation (pas de clé API)'
```

## 🔧 Fonctionnalités

L'API récupère :
- ✅ Vitesse actuelle vs vitesse libre
- ✅ Score de trafic (0-100)
- ✅ Incidents routiers (accidents, travaux, bouchons)
- ✅ Niveau de congestion
- ✅ Impact sur l'affluence des aires

---

**Note** : Sans clé API, l'application fonctionne avec une estimation basée sur l'heure et le jour.

