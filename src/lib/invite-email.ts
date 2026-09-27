import { Resend } from 'resend';
import { siteUrl } from '@/lib/auth-profile';

export async function sendClientInviteEmail(params: {
  to: string;
  firstName: string;
  companyName: string;
  inviteLink: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY manquant — lien à transmettre manuellement' };
  }

  try {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL || 'OrbitAire <onboarding@resend.dev>';
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: 'Bienvenue sur OrbitAire — activez votre espace',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h1 style="font-size:20px">Bonjour ${escapeHtml(params.firstName) || ''},</h1>
          <p>Votre espace <strong>OrbitAire</strong> pour
            <strong>${escapeHtml(params.companyName)}</strong> est prêt.</p>
          <p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et accéder à votre tableau de bord.</p>
          <p style="margin:28px 0">
            <a href="${params.inviteLink}"
               style="background:#0891b2;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">
              Activer mon compte
            </a>
          </p>
          <p style="font-size:12px;color:#64748b">
            Si le bouton ne fonctionne pas, copiez ce lien :<br/>
            <a href="${params.inviteLink}">${params.inviteLink}</a>
          </p>
          <p style="font-size:12px;color:#64748b">Lien de secours connexion :
            <a href="${siteUrl()}/login">${siteUrl()}/login</a>
          </p>
        </div>
      `,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Envoi email impossible' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
