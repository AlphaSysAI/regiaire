# Guide Planning Timefold

## Architecture

Le système de planning est composé de deux parties :

1. **Backend Timefold** (Java/Spring Boot) : Optimiseur de planning
2. **Frontend Next.js** : Interface utilisateur et API de communication

## Installation

### 1. Backend Timefold

```bash
cd timefold-backend
mvn clean install
mvn spring-boot:run
```

Le backend démarre sur le port **8080**.

### 2. Variables d'environnement

Ajoutez dans `.env.local` :

```env
TIMEFOLD_API_URL=http://localhost:8080
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
```

### 3. Base de données

Exécutez le script SQL `supabase-planning-tables.sql` dans Supabase pour créer les tables nécessaires.

## Utilisation

1. **Ajouter des employés** : Cliquez sur "Ajouter" dans la section Employés
2. **Sélectionner le mois** : Cliquez sur le bouton calendrier
3. **Donner des instructions** (optionnel) : Cliquez sur "Instructions" et ajoutez des contraintes spéciales
4. **Générer le planning** : Cliquez sur "Générer avec Timefold"
5. **Visualiser** : Le planning s'affiche en tableau Excel-like
6. **Exporter en PDF** : Cliquez sur l'icône de téléchargement

## Contraintes Timefold

### Hard Constraints (obligatoires)
- Minimum/maximum d'employés par shift
- Respect des heures contractuelles (tolérance 5h)
- Minimum 4 jours travaillés par semaine

### Soft Constraints (optimisation)
- Nombre idéal d'employés par shift (2 pour matin/après-midi, 1 pour nuit)
- Préférence pour les quarts choisis
- Répartition équitable de la charge de travail

## Format des shifts

- **CM** : Matin (6h-14h)
- **CS** : Après-midi (14h-22h)
- **CN** : Nuit (22h-6h)

## Dépannage

### Le backend ne démarre pas
- Vérifiez que Java 17+ est installé : `java -version`
- Vérifiez que Maven est installé : `mvn -version`
- Vérifiez que le port 8080 est libre

### Erreur de connexion au backend
- Vérifiez que `TIMEFOLD_API_URL` est correct dans `.env.local`
- Vérifiez que le backend est bien démarré sur le port 8080

### Erreur de permissions Supabase
- Vérifiez que `SUPABASE_SERVICE_ROLE_KEY` est défini
- Vérifiez que les politiques RLS sont correctement configurées

