/* =========================
   1. API VACANCES SCOLAIRES
========================= */

export async function checkVacancesStatus() {
    try {
      const res = await fetch("/api/vacances");
      const data = await res.json();
      return data.isVacances;
    } catch {
      return false;
    }
  }
  
  /* =========================
     2. API MÉTÉO
  ========================= */
  
  export async function getWeatherData(lat?: number, lon?: number) {
    try {
      const params = lat && lon ? `?lat=${lat}&lon=${lon}` : "";
      const res = await fetch(`/api/weather${params}`);
      const data = await res.json();
      return data;
    } catch {
      return {
        temp: 15,
        condition: "Clear",
        description: "ciel dégagé",
        city: "Capendu",
      };
    }
  }