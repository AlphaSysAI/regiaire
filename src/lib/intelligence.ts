/* =========================
   1. API VACANCES SCOLAIRES
========================= */

export async function checkVacancesStatus(): Promise<boolean> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch(
        `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=start_date%20<=%20"${today}"%20and%20end_date%20>=%20"${today}"&limit=1`
      );
      const data = await response.json();
      return data.total_count > 0;
    } catch {
      return false;
    }
  }
  
  /* =========================
     2. API MÉTÉO
  ========================= */
  
  export async function getWeatherData(lat?: number, lon?: number) {
    const OWM_KEY = process.env.NEXT_PUBLIC_OWM_API_KEY; // clé publique pour client
    const url = lat && lon
      ? `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}&lang=fr`
      : `https://api.openweathermap.org/data/2.5/weather?q=Capendu,fr&units=metric&appid=${OWM_KEY}&lang=fr`;
  
    try {
      const res = await fetch(url);
      const data = await res.json();
  
      return {
        temp: data.main.temp,
        condition: data.weather[0].main,
        description: data.weather[0].description,
        city: data.name,
      };
    } catch {
      return {
        temp: 15,
        condition: "Clear",
        description: "ciel dégagé",
        city: "Capendu",
      };
    }
  }