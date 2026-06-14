export type AireLocation = {
  lat?: number | null;
  lon?: number | null;
  city?: string | null;
  name?: string | null;
};

export function parseAireCoords(aire: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  city?: string | null;
  name?: string | null;
} | null): AireLocation {
  if (!aire) return {};
  const lat = aire.latitude != null ? Number(aire.latitude) : undefined;
  const lon = aire.longitude != null ? Number(aire.longitude) : undefined;
  return {
    lat: lat != null && !Number.isNaN(lat) ? lat : undefined,
    lon: lon != null && !Number.isNaN(lon) ? lon : undefined,
    city: aire.city ?? null,
    name: aire.name ?? null,
  };
}

/** Paramètres query pour /api/weather (lat/lon prioritaire, sinon ville). */
export function weatherQueryParams(loc: AireLocation): string {
  if (loc.lat != null && loc.lon != null) {
    return `lat=${loc.lat}&lon=${loc.lon}`;
  }
  const q = loc.city || loc.name;
  if (q) return `city=${encodeURIComponent(q)}`;
  return '';
}

export function aireDisplayLabel(loc: AireLocation): string {
  return loc.name || loc.city || '';
}
