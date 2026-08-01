// Minimal HTML-escape helper for interpolating user-supplied text (comment
// bodies, message text, titles) into transactional email HTML. Prevents a
// comment/message containing `<`/`&`/etc. from breaking the email markup or
// injecting arbitrary HTML into a recipient's inbox.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
