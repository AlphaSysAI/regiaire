import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeModules, type ModuleKey } from '@/lib/modules';

export type AppRole = 'admin' | 'client' | 'manager';

export interface AppProfile {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  role: AppRole;
  aireId: string | null;
  profileCompleted: boolean;
  enabledModules: ModuleKey[];
  passwordSetAt: string | null;
}

function parseAdminEmails(): string[] {
  return (process.env.ORBIT_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.trim().toLowerCase());
}

function mapProfile(row: Record<string, unknown>): AppProfile {
  const roleRaw = String(row.role || 'client');
  const role: AppRole =
    roleRaw === 'admin' ? 'admin' : roleRaw === 'manager' ? 'manager' : 'client';
  return {
    id: String(row.id),
    email: (row.email as string) || null,
    firstName: (row.first_name as string) || null,
    lastName: (row.last_name as string) || null,
    fullName: (row.full_name as string) || null,
    phone: (row.phone as string) || null,
    companyName: (row.company_name as string) || null,
    role,
    aireId: (row.aire_id as string) || null,
    profileCompleted: Boolean(row.profile_completed),
    enabledModules: normalizeModules(row.enabled_modules),
    passwordSetAt: (row.password_set_at as string) || null,
  };
}

/** Client serveur authentifié via Bearer JWT (routes API). */
export function supabaseFromAuthHeader(authHeader: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getProfileByUserId(userId: string): Promise<AppProfile | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as Record<string, unknown>);
}

export async function requireAdminFromRequest(req: Request): Promise<
  | { ok: true; userId: string; email: string; profile: AppProfile }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Non authentifié' };
  }
  const client = supabaseFromAuthHeader(authHeader);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, error: 'Session invalide' };
  }

  let profile = await getProfileByUserId(user.id);
  const email = user.email || profile?.email || '';

  // Bootstrap : email listé dans ORBIT_ADMIN_EMAILS → forcer role admin
  if (isAdminEmail(email) && profile && profile.role !== 'admin') {
    const admin = getSupabaseAdmin();
    await admin
      .from('profiles')
      .update({
        role: 'admin',
        profile_completed: true,
        enabled_modules: [
          'pilotage',
          'stock',
          'antigaspi',
          'equipe',
          'planning',
          'reappro',
          'verdict',
          'livraisons',
        ],
      })
      .eq('id', user.id);
    profile = await getProfileByUserId(user.id);
  }

  if (!profile) {
    return { ok: false, status: 403, error: 'Profil introuvable' };
  }
  if (profile.role !== 'admin' && !isAdminEmail(email)) {
    return { ok: false, status: 403, error: 'Accès admin requis' };
  }

  return { ok: true, userId: user.id, email, profile };
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}
