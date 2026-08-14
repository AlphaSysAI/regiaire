import { NextRequest, NextResponse } from 'next/server';

const EDUCATION_CALENDAR_API =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';

type HolidayRecord = { start_date?: string; end_date?: string };
type HolidayApiResponse = { results?: HolidayRecord[]; total_count?: number };

function isoOnly(v: string): string {
  return v.slice(0, 10);
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/**
 * GET /api/vacances
 *   (sans paramètre)      → { isVacances } pour aujourd'hui (compat historique)
 *   ?date=YYYY-MM-DD       → { isVacances, date } pour cette date précise
 *   ?start=YYYY-MM-DD&days=7 → { days: [{ date, isVacances }, ...] } sur l'horizon
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const singleDate = searchParams.get('date');
  const start = searchParams.get('start');
  const daysParam = searchParams.get('days');

  const today = new Date().toISOString().split('T')[0];

  try {
    if (start && daysParam) {
      const horizon = Math.max(1, Math.min(31, parseInt(daysParam, 10) || 7));
      const rangeStart = start;
      const rangeEnd = addDaysIso(start, horizon - 1);

      const response = await fetch(
        `${EDUCATION_CALENDAR_API}?where=start_date%20<=%20"${rangeEnd}"%20and%20end_date%20>=%20"${rangeStart}"&limit=50`
      );
      const data = (await response.json()) as HolidayApiResponse;
      const periods = (data.results ?? [])
        .map((r) => ({
          start: r.start_date ? isoOnly(r.start_date) : null,
          end: r.end_date ? isoOnly(r.end_date) : null,
        }))
        .filter((p): p is { start: string; end: string } => !!p.start && !!p.end);

      const days = Array.from({ length: horizon }, (_, i) => {
        const date = addDaysIso(rangeStart, i);
        const isVacances = periods.some((p) => date >= p.start && date <= p.end);
        return { date, isVacances };
      });

      return NextResponse.json({ days });
    }

    const target = singleDate || today;
    const response = await fetch(
      `${EDUCATION_CALENDAR_API}?where=start_date%20<=%20"${target}"%20and%20end_date%20>=%20"${target}"&limit=1`
    );
    const data = (await response.json()) as HolidayApiResponse;
    return NextResponse.json({ isVacances: (data.total_count ?? 0) > 0, date: target });
  } catch {
    if (start && daysParam) {
      const horizon = Math.max(1, Math.min(31, parseInt(daysParam, 10) || 7));
      return NextResponse.json({
        days: Array.from({ length: horizon }, (_, i) => ({
          date: addDaysIso(start, i),
          isVacances: false,
        })),
      });
    }
    return NextResponse.json({ isVacances: false, date: singleDate || today });
  }
}
