import { NextResponse } from 'next/server';
import { buildTemplateWorkbook } from '@/lib/stock-import';

export const runtime = 'nodejs';

export async function GET() {
  const buf = buildTemplateWorkbook();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-stock.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
