// Thin client for app/api/send-email.ts (Resend-backed). Fire-and-forget,
// like pushToGoogleCalendar in eventStore.ts — a failed email must never
// block or roll back the Rush-side action that triggered it (creating an
// invitation, posting a comment, etc.).
//
// Demo sessions never send real email (no real recipient, would be
// pointless/spammy against a fake address) — callers should check
// isDemoSession() themselves before calling this, same as every other
// demo/real dual-path store in this app.

import { supabase } from './supabaseClient';

interface SendEmailOpts {
  // Quand les deux sont fournis, l'API vérifie les notif_prefs du
  // destinataire pour cette clé d'événement et saute l'envoi en silence
  // s'il a désactivé ce courriel — voir NOTIF_EVENTS dans notifPrefsStore.ts.
  eventKey?: string;
  recipientUserId?: string;
}

// Enveloppe commune pour tous les courriels transactionnels de l'app —
// avant ça, chaque appelant réinventait son propre <div style="font-family:
// sans-serif...">, certains sans aucun lien ni pied de page. Un pied de page
// cohérent (marque + "pourquoi vous recevez ceci") aide autant la lisibilité
// que la délivrabilité : les filtres anti-spam traitent plus favorablement
// les courriels transactionnels structurés que les blocs de texte nus avec
// un seul bouton, qui ressemblent à un modèle d'hameçonnage classique.
export function wrapEmailHtml(bodyHtml: string, opts?: { ctaLabel?: string; ctaLink?: string }): string {
  const cta = opts?.ctaLink ? `
      <p style="margin: 24px 0 8px;">
        <a href="${opts.ctaLink}" style="display: inline-block; padding: 10px 20px; background: #f9ff00; color: #14140a; text-decoration: none; border-radius: 8px; font-weight: 600; font-family: sans-serif;">${opts.ctaLabel ?? 'Ouvrir dans Rush'}</a>
      </p>
      <p style="color: #888; font-size: 12px; font-family: sans-serif;">Si le bouton ne fonctionne pas, copiez ce lien : ${opts.ctaLink}</p>` : '';

  return `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
      <p style="font-weight: 700; font-size: 15px; letter-spacing: -0.2px; margin-bottom: 20px;">Rush</p>
      ${bodyHtml}
      ${cta}
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 28px 0 14px;" />
      <p style="color: #999; font-size: 12px; font-family: sans-serif; margin: 0;">
        Vous recevez ce courriel parce que vous êtes concerné par cette activité sur Rush. Vous pouvez gérer vos préférences de notifications depuis Paramètres → Notifications dans l'application.
      </p>
    </div>`;
}

// Fire-and-forget, comme pushToGoogleCalendar dans eventStore.ts — un
// échec de courriel ne doit jamais bloquer ni annuler l'action Rush qui
// l'a déclenché.
export async function sendEmail(to: string, subject: string, html: string, opts?: SendEmailOpts): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ to, subject, html, eventKey: opts?.eventKey, recipientUserId: opts?.recipientUserId }),
    });
    if (!res.ok) console.error('sendEmail failed', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}
