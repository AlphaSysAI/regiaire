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
  
  export async function getWeatherData(
    lat?: number,
    lon?: number,
    city?: string
  ) {
    try {
      const params = new URLSearchParams();
      if (lat != null && lon != null) {
        params.set('lat', String(lat));
        params.set('lon', String(lon));
      } else if (city) {
        params.set('city', city);
      }
      const qs = params.toString();
      const res = await fetch(`/api/weather${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      return {
        temp: data.temp ?? 15,
        condition: data.condition ?? 'Clear',
        description: data.description ?? '',
        city: data.city ?? city ?? '',
      };
    } catch {
      return {
        temp: 15,
        condition: 'Clear',
        description: 'ciel dégagé',
        city: city ?? '',
      };
    }
  }