import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Inscription publique désactivée — la liste des aires n'est plus exposée. */
export async function GET() {
  return NextResponse.json(
    { error: 'Endpoint désactivé. Les comptes sont créés par un administrateur OrbitAire.' },
    { status: 410 }
  );
}
