import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminFromRequest, siteUrl } from '@/lib/auth-profile';
import { normalizeModules } from '@/lib/modules';
import { sendClientInviteEmail } from '@/lib/invite-email';

export const runtime = 'nodejs';

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(6).max(40),
  companyName: z.string().trim().min(1).max(200),
  modules: z.array(z.string()).min(1),
});

/** GET — liste des clients (hors admin) */
export async function GET(req: NextRequest) {
  const gate = await requireAdminFromRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .select(
      'id, email, first_name, last_name, phone, company_name, role, enabled_modules, profile_completed, invited_at, created_at, aire_id'
    )
    .neq('role', 'admin')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    clients: (data || []).map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      companyName: row.company_name,
      modules: normalizeModules(row.enabled_modules),
      profileCompleted: row.profile_completed,
      invitedAt: row.invited_at,
      createdAt: row.created_at,
      aireId: row.aire_id,
    })),
  });
}

/** POST — créer une entreprise (1 user) + invite */
export async function POST(req: NextRequest) {
  const gate = await requireAdminFromRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, phone, companyName, modules } = parsed.data;
    const emailNorm = email.toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const enabledModules = normalizeModules(modules);
    if (enabledModules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Sélectionnez au moins un module valide' },
        { status: 400 }
      );
    }
    const admin = getSupabaseAdmin();

    // 1) Tenant technique interne (invisible UI) — 1 entreprise = 1 aire technique
    const { data: aire, error: aireError } = await admin
      .from('aires')
      .insert({
        name: companyName,
        city: null,
      })
      .select('id')
      .single();

    if (aireError || !aire) {
      return NextResponse.json(
        { success: false, error: aireError?.message || 'Création entreprise impossible' },
        { status: 500 }
      );
    }

    // 2) Compte Auth (sans mot de passe définitif — l'invite le définira)
    const tempPassword = `Tmp!${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: emailNorm,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        phone,
        company_name: companyName,
        aire_id: aire.id,
      },
    });

    if (createError || !created.user) {
      await admin.from('aires').delete().eq('id', aire.id);
      return NextResponse.json(
        { success: false, error: createError?.message || 'Création utilisateur impossible' },
        { status: 500 }
      );
    }

    const userId = created.user.id;

    // 3) Profil métier
    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      email: emailNorm,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      phone,
      company_name: companyName,
      aire_id: aire.id,
      role: 'client',
      profile_completed: false,
      enabled_modules: enabledModules,
      invited_at: new Date().toISOString(),
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from('aires').delete().eq('id', aire.id);
      return NextResponse.json({ success: false, error: profileError.message }, { status: 500 });
    }

    // 4) Lien d'invitation (choix du mot de passe)
    const redirectTo = `${siteUrl()}/invite/setup`;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: emailNorm,
      options: { redirectTo },
    });

    const inviteLink =
      linkData?.properties?.action_link ||
      `${siteUrl()}/invite/setup?email=${encodeURIComponent(emailNorm)}`;

    if (linkError) {
      console.warn('generateLink warning:', linkError.message);
    }

    const mail = await sendClientInviteEmail({
      to: emailNorm,
      firstName,
      companyName,
      inviteLink,
    });

    return NextResponse.json({
      success: true,
      client: {
        id: userId,
        email: emailNorm,
        companyName,
        modules: enabledModules,
      },
      inviteLink,
      emailSent: mail.sent,
      emailError: mail.error || null,
    });
  } catch (e) {
    console.error('admin create client', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
