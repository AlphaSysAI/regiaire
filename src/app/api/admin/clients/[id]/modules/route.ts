import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminFromRequest } from '@/lib/auth-profile';
import { normalizeModules } from '@/lib/modules';

export const runtime = 'nodejs';

const patchSchema = z.object({
  modules: z.array(z.string()).min(1),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/clients/:id/modules */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminFromRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Données invalides' }, { status: 400 });
    }

    const modules = normalizeModules(parsed.data.modules);
    if (modules.length === 0) {
      return NextResponse.json({ success: false, error: 'Au moins un module requis' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('profiles')
      .update({ enabled_modules: modules })
      .eq('id', id)
      .neq('role', 'admin');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, modules });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
