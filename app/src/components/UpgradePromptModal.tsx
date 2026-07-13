// app/src/components/UpgradePromptModal.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from './ui';
import { getUpgradePrompt, subscribeUpgradePrompt, dismissUpgradePrompt } from '../data/upgradePromptStore';
import type { GatedFeature } from '../data/planFeatures';

const FEATURE_LABEL_KEYS: Record<GatedFeature, string> = {
  ai: 'settings.planFeatAI',
  finances: 'settings.planFeatFinances',
  customTemplates: 'settings.planFeatTemplatesCustom',
  customLogo: 'upgradePrompt.customLogoLabel',
};

export function UpgradePromptModal() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState(getUpgradePrompt);

  useEffect(() => subscribeUpgradePrompt(() => setPrompt(getUpgradePrompt())), []);

  if (!prompt) return null;

  const reason = 'reason' in prompt ? prompt.reason : null;
  const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
    : reason === 'projects' ? t('upgradePrompt.projectsTitle')
    : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitTitle')
    : t('upgradePrompt.featureTitle');
  const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
    : reason === 'projects' ? t('upgradePrompt.projectsBody')
    : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
      onClick={dismissUpgradePrompt}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '32px', maxWidth: 380, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <SFIcon name="lock" size={20} color="var(--accent)" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={dismissUpgradePrompt} style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
            {t('common.cancel')}
          </button>
          <Link to="/parametres?section=plan" onClick={dismissUpgradePrompt} style={{ flex: 1, padding: '11px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('upgradePrompt.cta')}
          </Link>
        </div>
      </div>
    </div>
  );
}
