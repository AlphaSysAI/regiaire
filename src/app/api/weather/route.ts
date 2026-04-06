import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = req.url ? new URL(req.url) : {};
  const lat = searchParams?.get('lat');
  const lon = searchParams?.get('lon');
  const forecast = searchParams?.get('forecast') === 'true'; // Nouveau paramètre pour les prévisions

  const OWM_KEY = process.env.OWM_API_KEY;
  if (!OWM_KEY) return NextResponse.json({ error: 'Clé API manquante' }, { status: 500 });

  try {
    if (forecast) {
      // Récupérer les prévisions sur 7 jours
      const forecastUrl = lat && lon
        ? `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}&lang=fr&cnt=40`
        : `https://api.openweathermap.org/data/2.5/forecast?q=Capendu,fr&units=metric&appid=${OWM_KEY}&lang=fr&cnt=40`;
      
      const forecastRes = await fetch(forecastUrl);
      const forecastData = await forecastRes.json();
      
      // Extraire les prévisions par jour (1 prévision par jour sur 7 jours)
      const dailyForecasts: any[] = [];
      const seenDates = new Set<string>();
      
      forecastData.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        
        // Prendre une prévision par jour (vers 12h de préférence, sinon la première disponible)
        if (!seenDates.has(dateStr) || (date.getHours() >= 11 && date.getHours() <= 14)) {
          if (!seenDates.has(dateStr)) {
            dailyForecasts.push({
              date: dateStr,
              dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
              temp: item.main.temp,
              tempMin: item.main.temp_min,
              tempMax: item.main.temp_max,
              condition: item.weather[0].main,
              description: item.weather[0].description,
            });
            seenDates.add(dateStr);
          } else {
            // Remplacer si c'est une meilleure heure (midi)
            const index = dailyForecasts.findIndex(f => f.date === dateStr);
            if (index !== -1 && date.getHours() >= 11 && date.getHours() <= 14) {
              dailyForecasts[index] = {
                date: dateStr,
                dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
                temp: item.main.temp,
                tempMin: item.main.temp_min,
                tempMax: item.main.temp_max,
                condition: item.weather[0].main,
                description: item.weather[0].description,
              };
            }
          }
        }
      });

      // Récupérer aussi les données actuelles
      const currentUrl = lat && lon
        ? `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}&lang=fr`
        : `https://api.openweathermap.org/data/2.5/weather?q=Capendu,fr&units=metric&appid=${OWM_KEY}&lang=fr`;
      
      const currentRes = await fetch(currentUrl);
      const currentData = await currentRes.json();

      return NextResponse.json({
        current: {
          temp: currentData.main.temp,
          condition: currentData.weather[0].main,
          description: currentData.weather[0].description,
          city: currentData.name,
        },
        forecast: dailyForecasts.slice(0, 7), // 7 jours de prévisions
      });
    } else {
      // Mode actuel (données du jour)
  const url = lat && lon
    ? `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_KEY}&lang=fr`
    : `https://api.openweathermap.org/data/2.5/weather?q=Capendu,fr&units=metric&appid=${OWM_KEY}&lang=fr`;

    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json({
      temp: data.main.temp,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      city: data.name,
    });
    }
  } catch (err) {
    return NextResponse.json({
      temp: 15,
      condition: "Clear",
      description: "ciel dégagé",
      city: "Capendu",
      ...(forecast ? { forecast: [] } : {}),
    });
  }
}