// Extracts plain text from an HTML string — used for tooltip/preview text
// where a task description (now stored as Tiptap-generated HTML) needs to
// read as plain text instead of showing raw markup.
export function stripHtml(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim();
}
