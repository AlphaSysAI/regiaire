import { NextRequest, NextResponse } from 'next/server';

function getOwmKey() {
  return process.env.OWM_API_KEY || process.env.NEXT_PUBLIC_OWM_API_KEY;
}

function buildWeatherUrl(base: 'weather' | 'forecast', lat: string | null, lon: string | null, city: string | null) {
  const key = getOwmKey();
  if (lat && lon) {
    return `https://api.openweathermap.org/data/2.5/${base}?lat=${lat}&lon=${lon}&units=metric&appid=${key}&lang=fr`;
  }
  const q = city ? `${city},fr` : 'Paris,fr';
  const cnt = base === 'forecast' ? '&cnt=40' : '';
  return `https://api.openweathermap.org/data/2.5/${base}?q=${encodeURIComponent(q)}&units=metric&appid=${key}&lang=fr${cnt}`;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const city = searchParams.get('city');
  const forecast = searchParams.get('forecast') === 'true';

  const OWM_KEY = getOwmKey();
  if (!OWM_KEY) return NextResponse.json({ error: 'Clé API manquante' }, { status: 500 });

  const fallbackCity = city || 'Paris';

  try {
    if (forecast) {
      const forecastUrl = buildWeatherUrl('forecast', lat, lon, city);
      const forecastRes = await fetch(forecastUrl);
      const forecastData = await forecastRes.json();

      if (forecastData.cod && forecastData.cod !== '200' && forecastData.cod !== 200) {
        throw new Error(forecastData.message || 'Erreur OpenWeather forecast');
      }

      const dailyForecasts: Array<{
        date: string;
        dayName: string;
        temp: number;
        tempMin: number;
        tempMax: number;
        condition: string;
        description: string;
      }> = [];
      const seenDates = new Set<string>();

      (forecastData.list || []).forEach((item: {
        dt: number;
        main: { temp: number; temp_min: number; temp_max: number };
        weather: Array<{ main: string; description: string }>;
      }) => {
        const date = new Date(item.dt * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });

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
            const index = dailyForecasts.findIndex((f) => f.date === dateStr);
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

      const currentUrl = buildWeatherUrl('weather', lat, lon, city);
      const currentRes = await fetch(currentUrl);
      const currentData = await currentRes.json();

      if (!currentData.main) {
        throw new Error(currentData.message || 'Erreur OpenWeather current');
      }

      return NextResponse.json({
        current: {
          temp: currentData.main.temp,
          condition: currentData.weather[0].main,
          description: currentData.weather[0].description,
          city: currentData.name,
        },
        forecast: dailyForecasts.slice(0, 7),
      });
    }

    const url = buildWeatherUrl('weather', lat, lon, city);
    const res = await fetch(url);
    const data = await res.json();

    if (!data.main) {
      throw new Error(data.message || 'Erreur OpenWeather');
    }

    return NextResponse.json({
      temp: data.main.temp,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      city: data.name,
    });
  } catch (err) {
    console.error('Weather API:', err);
    return NextResponse.json({
      temp: 15,
      condition: 'Clear',
      description: 'ciel dégagé',
      city: fallbackCity,
      ...(forecast ? { forecast: [] } : {}),
    });
  }
}
