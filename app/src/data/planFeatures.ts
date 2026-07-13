// app/src/data/planFeatures.ts
// Single source of truth for what each Rush plan allows. Consumed by every
// gate point in the app, plus Pricing.tsx and Parametres.tsx's plan cards —
// avoids the copy/enforcement drifting apart (it already had, once: the
// Gratuit plan's marketing copy said "up to 5 members" while the seat
// billing logic enforced 2).

export type PlanKey = 'gratuit' | 'studio' | 'agence';
export type GatedFeature = 'ai' | 'finances' | 'customTemplates' | 'customLogo';

export const PLAN_FEATURES: Record<PlanKey, Record<GatedFeature, boolean>> = {
  gratuit: { ai: false, finances: false, customTemplates: false, customLogo: false },
  studio:  { ai: true,  finances: true,  customTemplates: true,  customLogo: true  },
  agence:  { ai: true,  finances: true,  customTemplates: true,  customLogo: true  },
};

export const PLAN_LIMITS: Record<PlanKey, { maxProjects: number | null; maxSeats: number }> = {
  gratuit: { maxProjects: 3,    maxSeats: 2  },
  studio:  { maxProjects: null, maxSeats: 10 },
  agence:  { maxProjects: null, maxSeats: 50 },
};

export function canUseFeature(plan: PlanKey, feature: GatedFeature): boolean {
  return PLAN_FEATURES[plan][feature];
}
