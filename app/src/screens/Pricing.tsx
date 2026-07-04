import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';

// ── Data ─────────────────────────────────────────────────────────────────────

const PLANS = [
  { key: 'gratuit', nameKey: 'settings.planSolo',   descKey: 'settings.planSoloDesc',   priceM: 0,  priceY: 0,   storage: '5 Go',   cta: 'pricing.startFree',   link: '/register', popular: false },
  { key: 'studio',  nameKey: 'settings.planStudio',  descKey: 'settings.planStudioDesc', priceM: 19, priceY: 182, storage: '50 Go',  cta: 'pricing.choosePlan',  link: '/register', popular: true  },
  { key: 'agence',  nameKey: 'settings.planAgence',  descKey: 'settings.planAgenceDesc', priceM: 49, priceY: 470, storage: '50 Go', cta: 'pricing.chooseAgency',link: '/register', popular: false },
];

const STORAGE_BLOCKS = [
  { label: '5 Go',   priceM: 0,  priceY: 0   },
  { label: '+50 Go', priceM: 5,  priceY: 48  },
  { label: '+200 Go',priceM: 15, priceY: 144 },
  { label: '+500 Go',priceM: 35, priceY: 336 },
  { label: '+1 To',  priceM: 50, priceY: 480 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Check({ ok }: { ok: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      background: ok ? 'rgba(0,210,120,0.12)' : 'var(--surface-3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
    }}>
      <SFIcon name={ok ? 'check' : 'x'} size={11} color={ok ? 'var(--ok)' : 'var(--text-3)'} />
    </div>
  );
}

function CellValue({ v }: { v: boolean | string }) {
  if (typeof v === 'boolean') return <Check ok={v} />;
  return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>{v}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Pricing() {
  const { t } = useTranslation();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);

  const COMPARE_SECTIONS = [
    {
      title: t('pricing.sectionProjects'),
      rows: [
        { label: t('pricing.featProjects'), values: ['3', t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featMembers'),  values: [t('pricing.upTo5'), t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featStorage'),  values: ['5 Go', '50 Go', '50 Go'] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionPortal'),
      rows: [
        { label: t('pricing.featPortal'),   values: [t('pricing.brandedPortal'), t('pricing.whiteLabel'), t('pricing.whiteLabel')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionFeatures'),
      rows: [
        { label: t('pricing.featTemplatesPreset'), values: [true, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featTemplatesCustom'), values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featAI'),              values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featFinances'),        values: [false, true, true] as [boolean, boolean, boolean] },
      ],
    },
    {
      title: t('pricing.sectionIntegrations'),
      rows: [
        { label: t('pricing.featGoogleCalendar'),        values: [t('pricing.comingSoon'), t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featCreativeIntegrations'),  values: [false, t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionSupport'),
      rows: [
        { label: t('pricing.featSupport'), values: [t('pricing.supportEmail'), t('pricing.supportEmail'), t('pricing.supportPriority')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featAPI'),     values: [false, false, true] as [boolean, boolean, boolean] },
      ],
    },
  ];

  const FAQS = [
    { q: t('pricing.faq1Q'), a: t('pricing.faq1A') },
    { q: t('pricing.faq2Q'), a: t('pricing.faq2A') },
    { q: t('pricing.faq3Q'), a: t('pricing.faq3A') },
    { q: t('pricing.faq4Q'), a: t('pricing.faq4A') },
  ];

  const colStyle = (i: number): React.CSSProperties => ({
    textAlign: 'center',
    padding: '12px 8px',
    borderLeft: '1px solid var(--border)',
    background: i === 1 ? 'rgba(249,255,0,0.03)' : 'transparent',
  });

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg)', overflowX: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--border)', background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={12} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('pricing.alreadyAccount')}</span>
          <Link to="/login" style={{
            fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', fontFamily: 'var(--ff-text)',
            background: 'var(--accent)', borderRadius: 8, padding: '6px 14px', textDecoration: 'none',
          }}>{t('auth.signIn')}</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', padding: '72px 0 56px' }}>
          <h1 style={{
            fontSize: 48, fontWeight: 900, fontFamily: 'var(--ff-display)',
            letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 16,
            background: 'linear-gradient(135deg, var(--text) 60%, var(--accent))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {t('pricing.title')}
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-2)', marginBottom: 36, lineHeight: 1.6 }}>
            {t('pricing.subtitle')}
          </p>

          {/* Billing toggle */}
          <div style={{ display: 'inline-flex', borderRadius: 12, border: '1px solid var(--border)', overflow: 'visible', background: 'var(--surface-2)', position: 'relative' }}>
            {(['monthly', 'yearly'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                position: 'relative', padding: '9px 22px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--ff-text)', transition: 'all 0.15s',
                borderRadius: b === 'monthly' ? '11px 0 0 11px' : '0 11px 11px 0',
                background: billing === b ? 'var(--accent)' : 'transparent',
                color: billing === b ? 'var(--on-accent)' : 'var(--text-2)',
              }}>
                {t(b === 'monthly' ? 'settings.planToggleMonthly' : 'settings.planToggleYearly')}
                {b === 'yearly' && (
                  <span style={{
                    position: 'absolute', top: -10, right: -10,
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--ok)',
                    background: 'rgba(0,210,120,0.15)', border: '1px solid rgba(0,210,120,0.4)',
                    borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap',
                    visibility: billing === 'yearly' ? 'visible' : 'hidden',
                  }}>
                    {t('settings.planYearlySaving')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Plan cards ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 80 }}>
          {PLANS.map(plan => {
            const price = billing === 'monthly' ? plan.priceM : plan.priceY;
            const isFree = price === 0;
            return (
              <div key={plan.key} style={{
                borderRadius: 18, padding: '28px 24px',
                border: `2px solid ${plan.popular ? 'var(--accent)' : 'var(--border)'}`,
                background: plan.popular ? 'rgba(249,255,0,0.04)' : 'var(--surface)',
                display: 'flex', flexDirection: 'column', position: 'relative',
              }}>
                {plan.popular && (
                  <span style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--on-accent)', background: 'var(--accent)',
                    borderRadius: 20, padding: '3px 12px', whiteSpace: 'nowrap',
                  }}>
                    {t('settings.planPopularBadge')}
                  </span>
                )}

                <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 4 }}>{t(plan.nameKey)}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.4 }}>{t(plan.descKey)}</p>

                <div style={{ marginBottom: 6 }}>
                  {isFree ? (
                    <span style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--ff-display)' }}>{t('settings.planFree')}</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--ff-display)' }}>{price} $</span>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t(billing === 'monthly' ? 'pricing.monthly' : 'pricing.yearly')} CA</span>
                    </div>
                  )}
                  <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginTop: 3, visibility: billing === 'yearly' && !isFree ? 'visible' : 'hidden' }}>
                    {t('pricing.billedYearly')}
                  </p>
                </div>

                {!isFree && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <SFIcon name="clock" size={12} color="var(--ok)" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)' }}>{t('pricing.trialBadge')}</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 24, width: 'fit-content' }}>
                  <SFIcon name="hard-drive" size={11} color="var(--text-3)" />
                  <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', fontWeight: 600 }}>{plan.storage} {t('pricing.storageIncluded')}</span>
                </div>

                <div style={{ flex: 1 }} />

                <Link to={plan.link} style={{
                  display: 'block', width: '100%', padding: '12px', borderRadius: 11,
                  background: plan.popular ? 'var(--accent)' : 'var(--surface-3)',
                  color: plan.popular ? 'var(--on-accent)' : 'var(--text-2)',
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                  textDecoration: 'none', textAlign: 'center', transition: 'opacity 0.15s',
                }}>
                  {t(plan.cta)}
                </Link>
              </div>
            );
          })}
        </div>

        {/* ── Tableau comparatif ───────────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.5px', marginBottom: 8 }}>{t('pricing.compareTitle')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)' }}>{t('pricing.compareSubtitle')}</p>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ padding: '16px 20px' }} />
              {PLANS.map((plan, i) => (
                <div key={plan.key} style={{
                  ...colStyle(i),
                  padding: '16px 8px',
                  borderTop: plan.popular ? `3px solid var(--accent)` : '3px solid transparent',
                }}>
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--ff-display)', color: plan.popular ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{t(plan.nameKey)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                    {billing === 'monthly' ? plan.priceM === 0 ? t('settings.planFree') : `${plan.priceM} $/mois` : plan.priceY === 0 ? t('settings.planFree') : `${plan.priceY} $/an`}
                  </p>
                </div>
              ))}
            </div>

            {/* Sections + rows */}
            {COMPARE_SECTIONS.map((section, si) => (
              <div key={si}>
                {/* Section header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ padding: '9px 20px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>{section.title}</span>
                  </div>
                  {[0, 1, 2].map(i => <div key={i} style={{ ...colStyle(i), padding: '9px 8px' }} />)}
                </div>

                {/* Rows */}
                {section.rows.map((row, ri) => (
                  <div key={ri} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    borderBottom: ri < section.rows.length - 1 || si < COMPARE_SECTIONS.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{row.label}</span>
                    </div>
                    {row.values.map((v, i) => (
                      <div key={i} style={{ ...colStyle(i), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CellValue v={v} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            {/* Footer CTA row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ padding: '16px 20px' }} />
              {PLANS.map((plan, i) => (
                <div key={plan.key} style={{ ...colStyle(i), padding: '16px 12px' }}>
                  <Link to={plan.link} style={{
                    display: 'block', padding: '9px 0', borderRadius: 9,
                    background: plan.popular ? 'var(--accent)' : 'var(--surface-3)',
                    color: plan.popular ? 'var(--on-accent)' : 'var(--text-2)',
                    fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-text)',
                    textDecoration: 'none', textAlign: 'center',
                  }}>
                    {t(plan.cta)}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stockage ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.4px', marginBottom: 8 }}>{t('pricing.storageTitle')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>{t('pricing.storageDesc')}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {STORAGE_BLOCKS.map(block => {
              const price = billing === 'monthly' ? block.priceM : block.priceY;
              return (
                <div key={block.label} style={{
                  borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)',
                  padding: '16px 22px', textAlign: 'center', minWidth: 110,
                }}>
                  <SFIcon name="hard-drive" size={20} color="var(--text-3)" />
                  <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-display)', marginTop: 8, marginBottom: 4 }}>{block.label}</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                    {price === 0 ? t('pricing.storageIncluded') : `+${price} $ CA${billing === 'monthly' ? '/mois' : '/an'}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 80, maxWidth: 680, margin: '0 auto 80px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.4px', marginBottom: 24, textAlign: 'center' }}>{t('pricing.faqTitle')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 20px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--ff-text)' }}>{faq.q}</span>
                  <SFIcon name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color="var(--text-3)" />
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 20px 16px', background: 'var(--surface)' }}>
                    <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA final ────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', padding: '60px 40px', marginBottom: 60,
          borderRadius: 20, border: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(249,255,0,0.05) 0%, transparent 100%)',
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--ff-display)', letterSpacing: '-0.8px', marginBottom: 12 }}>{t('pricing.ctaTitle')}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28 }}>{t('pricing.ctaDesc')}</p>
          <Link to="/register" style={{
            display: 'inline-block', padding: '14px 32px', borderRadius: 12,
            background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: 15, fontWeight: 700, fontFamily: 'var(--ff-text)', textDecoration: 'none',
          }}>
            {t('pricing.ctaButton')}
          </Link>
        </div>

      </div>
    </div>
  );
}
