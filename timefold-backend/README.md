# Timefold Planning Backend

Backend Spring Boot avec Timefold Solver pour l'optimisation de planning d'employés.

## Prérequis

- Java 17+
- Maven 3.6+

## Installation

```bash
mvn clean install
```

## Lancement

```bash
mvn spring-boot:run
```

Le serveur démarre sur le port **8080**.

## API

### POST /api/planning/solve

Génère un planning optimisé pour une période donnée.

**Request Body:**
```json
{
  "employees": [
    {
      "id": "emp1",
      "name": "Jean Dupont",
      "contractHoursPerWeek": 35,
      "contractHoursPerMonth": 151,
      "preferredShifts": ["6-14", "14-22"],
      "mandatoryShift": null
    }
  ],
  "period": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  },
  "instructions": "Instructions spéciales..."
}
```

**Response:**
```json
{
  "assignments": [
    {
      "date": "2026-01-01",
      "employeeName": "Jean Dupont",
      "shiftType": "6-14",
      "hours": 8,
      "startTime": "06:00",
      "endTime": "14:00"
    }
  ],
  "error": null
}
```
