/** Emails super-admin OrbitAire (côté client — liste publique NEXT_PUBLIC ou fallback). */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw =
    process.env.NEXT_PUBLIC_ORBIT_ADMIN_EMAILS ||
    // Fallback connu en local si la var publique n'est pas définie
    'contact@alphasys-ai.fr,contact@alphasys.tech';
  const list = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
