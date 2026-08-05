// Extracts plain text from an HTML string — used for tooltip/preview text
// where a task description (now stored as Tiptap-generated HTML) needs to
// read as plain text instead of showing raw markup.
export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim();
}
