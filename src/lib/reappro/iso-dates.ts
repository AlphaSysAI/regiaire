/* =========================
   Utilitaires dates ISO — moteur réappro
   (alignement semaine ISO, fenêtres glissantes)
========================= */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseParts(iso: string): { y: number; m: number; d: number } {
  if (!ISO_DATE.test(iso)) {
    throw new Error(`Date ISO invalide : ${iso}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Ajoute des jours calendaires à une date ISO (UTC). */
export function addDaysIso(iso: string, delta: number): string {
  const { y, m, d } = parseParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** Semaine ISO (1–53) et jour ISO (1=lundi … 7=dimanche). */
export function getIsoWeekAndWeekday(iso: string): {
  isoYear: number;
  week: number;
  weekday: number;
} {
  const { y, m, d } = parseParts(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();

  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + (4 - weekday));

  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1;

  return { isoYear, week, weekday };
}

/** Fenêtre glissante de N jours se terminant à `endDate` (inclus). */
export function dateWindowEnding(endDate: string, days: number): string[] {
  if (days < 1) throw new Error('window days must be >= 1');
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(addDaysIso(endDate, -i));
  }
  return out;
}

export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}
