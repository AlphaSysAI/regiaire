import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const response = await fetch(
      `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=start_date%20<=%20"${today}"%20and%20end_date%20>=%20"${today}"&limit=1`
    );
    const data = await response.json();
    return NextResponse.json({ isVacances: data.total_count > 0 });
  } catch (error) {
    return NextResponse.json({ isVacances: false });
  }
}