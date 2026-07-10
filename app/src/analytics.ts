import { inject } from '@vercel/analytics';

// Set in the browser console to exclude this device from Vercel Web
// Analytics — useful for the developer's own testing sessions, which would
// otherwise inflate visitor counts. See README/IDEES_FUTURES for the exact
// console command.
const DEV_VISITOR_KEY = 'dev_visitor';

/**
 * Starts Vercel Web Analytics, unless this browser has opted itself out via
 * localStorage (see DEV_VISITOR_KEY). Call once, after the auth gate has
 * resolved, so login/register attempts aren't counted as visits.
 */
export function initAnalytics(): void {
  if (localStorage.getItem(DEV_VISITOR_KEY)) return;
  inject();
}
