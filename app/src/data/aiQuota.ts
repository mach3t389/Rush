// Shared between the client (Paramètres usage display) and the ai-chat
// serverless function (quota enforcement) — single source of truth so the
// two never drift apart.
export const AI_QUOTAS: Record<string, number> = {
  studio: 300,
  agence: 1000,
};
