# 🧠 Système d'Apprentissage IA - RégiAire

## 📋 Vue d'ensemble

Le système d'apprentissage permet à l'IA d'améliorer ses recommandations en se basant sur :
- **L'historique des situations similaires** passées
- **Le feedback utilisateur** (👍/👎) sur les verdicts

## 🚀 Installation

### 1. Créer la table Supabase

Exécute le fichier SQL `supabase-ai-verdicts.sql` dans l'éditeur SQL de Supabase :

```sql
-- Le fichier contient :
-- - La table ai_verdicts
-- - Les index pour les performances
-- - Les politiques RLS (Row Level Security)
```

### 2. Variables d'environnement

Assure-toi d'avoir ces variables dans ton `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # Optionnel, pour les opérations serveur
```

## 🎯 Comment ça fonctionne

Le verdict IA est généré **automatiquement** à chaque chargement du dashboard, en analysant :
- La météo actuelle
- Les vacances scolaires
- L'état des stocks
- Les DLC courtes
- L'historique des situations similaires

### Flux d'apprentissage

```
1. Au chargement du dashboard, le verdict est généré automatiquement
   ↓
2. L'IA cherche dans l'historique des situations similaires
   (même météo, même période vacances, ±5°C)
   ↓
3. L'IA génère un verdict enrichi avec l'historique
   ↓
4. Le verdict est sauvegardé dans la base et affiché sur le dashboard
   ↓
5. L'utilisateur peut donner son feedback (👍/👎) directement sur le verdict
   ↓
6. Le feedback est enregistré
   ↓
7. Les prochains verdicts (au prochain chargement) utiliseront ce feedback pour s'améliorer
```

### Critères de similarité

L'IA considère deux situations comme similaires si :
- ✅ Même **aire_id**
- ✅ Même période **vacances scolaires** (OUI/NON)
- ✅ Température à **±5°C** près
- ✅ Dans les **30 derniers jours**

### Priorisation

Les verdicts historiques sont triés par :
1. **Feedback positif** (+10 points)
2. **Même nombre de DLC courtes** (+5 points)
3. **Date récente** (plus récent = mieux)

## 📊 Structure de la table

```sql
ai_verdicts
├── id (UUID)
├── aire_id (UUID) → Référence à aires
├── verdict (TEXT) → Le verdict généré par l'IA
├── temperature (DECIMAL) → Température du jour
├── condition (TEXT) → Condition météo (Clear, Rain, etc.)
├── city (TEXT) → Ville
├── is_vacances (BOOLEAN) → Période de vacances
├── products_count (INTEGER) → Nombre de produits
├── low_stocks_count (INTEGER) → Nombre de ruptures
├── total_loss (DECIMAL) → Pertes financières
├── expiring_count (INTEGER) → Nombre de DLC courtes
├── feedback (TEXT) → 'positive', 'negative', ou NULL
└── created_at (TIMESTAMP) → Date de création
```

## 🔧 API Routes

### `POST /api/verdict`

Génère un verdict IA avec historique.

**Body :**
```json
{
  "temp": 28,
  "condition": "Clear",
  "city": "Capendu",
  "isVacances": true,
  "products": [...],
  "expiringSoon": [...],
  "totalLoss": 50,
  "aireId": "uuid-here"
}
```

**Response :**
```json
{
  "verdict": "Recommandation IA...",
  "verdictId": "uuid-du-verdict-sauvegardé"
}
```

### `GET /api/verdict-history`

Récupère l'historique similaire.

**Query params :**
- `aire_id` : UUID de l'aire
- `temp` : Température
- `isVacances` : true/false
- `expiringCount` : Nombre de DLC courtes

**Response :**
```json
{
  "history": [
    {
      "id": "uuid",
      "verdict": "...",
      "temperature": 28,
      "feedback": "positive",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### `PATCH /api/verdict-history`

Enregistre le feedback utilisateur.

**Body :**
```json
{
  "verdict_id": "uuid",
  "feedback": "positive" // ou "negative"
}
```

## 🎨 Interface utilisateur

### Boutons de feedback

Sur le dashboard, sous chaque verdict IA, deux boutons apparaissent :
- 👍 **Utile** : Le verdict était pertinent
- 👎 **Pas utile** : Le verdict n'était pas adapté

### Affichage

```tsx
{!loading && currentVerdictId && feedbackSent === null && (
  <div className="flex items-center gap-3">
    <span>Ce verdict est-il utile ?</span>
    <button onClick={handlePositiveFeedback}>
      <ThumbsUp />
    </button>
    <button onClick={handleNegativeFeedback}>
      <ThumbsDown />
    </button>
  </div>
)}
```

## 📈 Amélioration continue

### Exemple concret

**Jour 1 :**
- Situation : 28°C, Vacances OUI, 2 DLC
- Verdict IA : "Augmente boissons de 15%"
- Feedback : 👍
- → Sauvegardé comme exemple positif

**Jour 5 :**
- Situation : 27°C, Vacances OUI, 3 DLC
- L'IA voit l'historique du Jour 1
- Verdict IA : "Augmente boissons de 18% (basé sur l'historique, 15% était correct)"
- → Plus précis grâce à l'apprentissage !

## 🔒 Sécurité

- **RLS activé** : Les utilisateurs ne voient que les verdicts de leur aire
- **Validation** : Le feedback doit être 'positive' ou 'negative'
- **Isolation** : Chaque aire a son propre historique

## 🐛 Dépannage

### L'historique ne s'affiche pas

1. Vérifie que la table `ai_verdicts` existe
2. Vérifie les politiques RLS
3. Vérifie que `aireId` est bien envoyé dans la requête

### Le feedback ne s'enregistre pas

1. Vérifie que `verdictId` est bien retourné par l'API
2. Vérifie la console pour les erreurs
3. Vérifie les permissions RLS sur la table

## 🚀 Prochaines améliorations possibles

- [ ] Analyse statistique des patterns (ex: "Quand temp > 25°C, ventes +35%")
- [ ] Fine-tuning du modèle OpenAI sur tes données spécifiques
- [ ] Dashboard d'analyse des verdicts (taux de satisfaction, etc.)
- [ ] Suggestions automatiques basées sur l'historique

---

**Note** : Plus tu donnes de feedback, plus l'IA s'améliore ! 🎯

