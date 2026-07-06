import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';

// ── Data ─────────────────────────────────────────────────────────────────────

const PLANS = [
  { key: 'gratuit', nameKey: 'settings.planSolo',   descKey: 'settings.planSoloDesc',   priceM: 0,  priceY: 0,   storage: '5 Go',   cta: 'pricing.startFree',   link: '/register', popular: false, includedSeats: 2, seatPriceM: 0, seatPriceY: 0 },
  { key: 'studio',  nameKey: 'settings.planStudio',  descKey: 'settings.planStudioDesc', priceM: 19, priceY: 182, storage: '50 Go',  cta: 'pricing.choosePlan',  link: '/register', popular: true,  includedSeats: 2, seatPriceM: 3, seatPriceY: 29 },
  { key: 'agence',  nameKey: 'settings.planAgence',  descKey: 'settings.planAgenceDesc', priceM: 49, priceY: 470, storage: '50 Go', cta: 'pricing.chooseAgency',link: '/register', popular: false, includedSeats: 2, seatPriceM: 2, seatPriceY: 19 },
];

const STORAGE_BLOCKS = [
  { label: '5 Go',   priceM: 0,   priceY: 0    },
  { label: '+50 Go', priceM: 2,   priceY: 19   },
  { label: '+200 Go',priceM: 6,   priceY: 58   },
  { label: '+500 Go',priceM: 15,  priceY: 144  },
  { label: '+1 To',  priceM: 30,  priceY: 288  },
  { label: '+2 To',  priceM: 60,  priceY: 576  },
  { label: '+4 To',  priceM: 120, priceY: 1152 },
];

const STORAGE_TOTALS = ['50 Go', '100 Go', '250 Go', '550 Go', '1 050 Go', '2 050 Go', '4 050 Go']; // aligné index-à-index avec STORAGE_BLOCKS

function planTotal(plan: typeof PLANS[number], seats: number, storageIdx: number, billing: 'monthly' | 'yearly') {
  const base = billing === 'monthly' ? plan.priceM : plan.priceY;
  const seatPrice = billing === 'monthly' ? plan.seatPriceM : plan.seatPriceY;
  const extraSeats = Math.max(0, seats - plan.includedSeats);
  const storagePrice = billing === 'monthly' ? STORAGE_BLOCKS[storageIdx].priceM : STORAGE_BLOCKS[storageIdx].priceY;
  return base + extraSeats * seatPrice + storagePrice;
}

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

function Stepper({ label, onDec, onInc, disableDec, disableInc, editable, value, min, max, onChangeValue }: {
  label: string; onDec: () => void; onInc: () => void; disableDec: boolean; disableInc: boolean;
  editable?: boolean; value?: number; min?: number; max?: number; onChangeValue?: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={onDec} disabled={disableDec} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableDec ? 'default' : 'pointer', opacity: disableDec ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="minus" size={10} color="var(--text-2)" />
      </button>
      {editable ? (
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const parsed = parseInt(e.target.value, 10);
            if (Number.isNaN(parsed)) return;
            onChangeValue?.(Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)));
          }}
          className="sf-pricing-seat-input"
          style={{
            width: 44, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)',
            color: 'var(--text)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 0',
          }}
        />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)', minWidth: 52, textAlign: 'center' }}>{label}</span>
      )}
      <button onClick={onInc} disabled={disableInc} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableInc ? 'default' : 'pointer', opacity: disableInc ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="plus" size={10} color="var(--text-2)" />
      </button>
    </div>
  );
}

function InfoTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timerRef = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    timerRef.current = window.setTimeout(() => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    }, 300);
  };
  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setRect(null);
  };

  useEffect(() => {
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-flex', cursor: 'help' }}>
      {children}
      {rect && (
        <div style={{
          position: 'fixed', top: rect.bottom + 8, left: rect.left, zIndex: 500,
          maxWidth: 260, padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-3)', border: '1px solid var(--border-2)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, fontFamily: 'var(--ff-text)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function RowLabel({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
      <InfoTooltip text={desc}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      </InfoTooltip>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Pricing() {
  const { t } = useTranslation();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
  const [studioSeats, setStudioSeats] = useState(2);
  const [studioStorageIdx, setStudioStorageIdx] = useState(0);
  const [agenceSeats, setAgenceSeats] = useState(2);
  const [agenceStorageIdx, setAgenceStorageIdx] = useState(0);

  function headerPriceLabel(plan: typeof PLANS[number]) {
    if (plan.key === 'gratuit') return t('settings.planFree');
    const seats = plan.key === 'studio' ? studioSeats : agenceSeats;
    const storageIdx = plan.key === 'studio' ? studioStorageIdx : agenceStorageIdx;
    const total = planTotal(plan, seats, storageIdx, billing);
    return `${total} $/${billing === 'monthly' ? 'mois' : 'an'}`;
  }

  const OTHER_SECTIONS = [
    {
      title: t('pricing.sectionPortal'),
      rows: [
        { label: t('pricing.featPortal'), desc: t('pricing.descPortal'), values: [t('pricing.brandedPortal'), t('pricing.whiteLabel'), t('pricing.whiteLabel')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionFeatures'),
      rows: [
        { label: t('pricing.featTemplatesPreset'), desc: t('pricing.descTemplatesPreset'), values: [true, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featTemplatesCustom'), desc: t('pricing.descTemplatesCustom'), values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featAI'),              desc: t('pricing.descAI'),              values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featFinances'),        desc: t('pricing.descFinances'),        values: [false, true, true] as [boolean, boolean, boolean] },
      ],
    },
    {
      title: t('pricing.sectionIntegrations'),
      rows: [
        { label: t('pricing.featGoogleCalendar'),        desc: t('pricing.descGoogleCalendar'),        values: [t('pricing.comingSoon'), t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featCreativeIntegrations'),  desc: t('pricing.descCreativeIntegrations'),  values: [false, t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionSupport'),
      rows: [
        { label: t('pricing.featSupport'), desc: t('pricing.descSupport'), values: [t('pricing.supportEmail'), t('pricing.supportEmail'), t('pricing.supportPriority')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featAPI'),     desc: t('pricing.descAPI'),     values: [false, false, true] as [boolean, boolean, boolean] },
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
      <style>{`
        .sf-pricing-seat-input::-webkit-outer-spin-button,
        .sf-pricing-seat-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .sf-pricing-seat-input { -moz-appearance: textfield; }
      `}</style>

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
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--on-accent)',
                    background: 'var(--ok)', border: '1px solid var(--ok)',
                    borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
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
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--ff-display)', color: plan.popular ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>{t(plan.nameKey)}</p>
                  <p style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--ff-display)', color: plan.popular ? 'var(--accent)' : 'var(--text)' }}>
                    {headerPriceLabel(plan)}
                  </p>
                </div>
              ))}
            </div>

            {/* Section Projets & équipe (interactive) */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '9px 20px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>{t('pricing.sectionProjects')}</span>
              </div>
              {[0, 1, 2].map(i => <div key={i} style={{ ...colStyle(i), padding: '9px 8px' }} />)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <RowLabel label={t('pricing.featProjects')} desc={t('pricing.descProjects')} />
              {['3', t('pricing.unlimited'), t('pricing.unlimited')].map((v, i) => (
                <div key={i} style={{ ...colStyle(i), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CellValue v={v} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <RowLabel label={t('pricing.featMembers')} desc={t('pricing.descMembers')} />
              <div style={{ ...colStyle(0), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CellValue v={t('pricing.included2')} />
              </div>
              <div style={{ ...colStyle(1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  editable value={studioSeats} min={2} max={50}
                  label={String(studioSeats)}
                  onChangeValue={setStudioSeats}
                  onDec={() => setStudioSeats(s => Math.max(2, s - 1))}
                  onInc={() => setStudioSeats(s => Math.min(50, s + 1))}
                  disableDec={studioSeats <= 2}
                  disableInc={studioSeats >= 50}
                />
              </div>
              <div style={{ ...colStyle(2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  editable value={agenceSeats} min={2} max={50}
                  label={String(agenceSeats)}
                  onChangeValue={setAgenceSeats}
                  onDec={() => setAgenceSeats(s => Math.max(2, s - 1))}
                  onInc={() => setAgenceSeats(s => Math.min(50, s + 1))}
                  disableDec={agenceSeats <= 2}
                  disableInc={agenceSeats >= 50}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <RowLabel label={t('pricing.featGuests')} desc={t('pricing.descGuests')} />
              {[t('pricing.unlimited'), t('pricing.unlimited'), t('pricing.unlimited')].map((v, i) => (
                <div key={i} style={{ ...colStyle(i), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CellValue v={v} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <RowLabel label={t('pricing.featStorage')} desc={t('pricing.descStorage')} />
              <div style={{ ...colStyle(0), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CellValue v="5 Go" />
              </div>
              <div style={{ ...colStyle(1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  label={STORAGE_TOTALS[studioStorageIdx]}
                  onDec={() => setStudioStorageIdx(i => Math.max(0, i - 1))}
                  onInc={() => setStudioStorageIdx(i => Math.min(STORAGE_TOTALS.length - 1, i + 1))}
                  disableDec={studioStorageIdx <= 0}
                  disableInc={studioStorageIdx >= STORAGE_TOTALS.length - 1}
                />
              </div>
              <div style={{ ...colStyle(2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  label={STORAGE_TOTALS[agenceStorageIdx]}
                  onDec={() => setAgenceStorageIdx(i => Math.max(0, i - 1))}
                  onInc={() => setAgenceStorageIdx(i => Math.min(STORAGE_TOTALS.length - 1, i + 1))}
                  disableDec={agenceStorageIdx <= 0}
                  disableInc={agenceStorageIdx >= STORAGE_TOTALS.length - 1}
                />
              </div>
            </div>

            {/* Sections + rows */}
            {OTHER_SECTIONS.map((section, si) => (
              <div key={si}>
                {/* Section header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ padding: '9px 20px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>{section.title}</span>
                  </div>
                  {[0, 1, 2].map(i => <div key={i} style={{ ...colStyle(i), padding: '9px 8px' }} />)}
                </div>

                {/* Rows */}
                {section.rows.map((row, ri) => (
                  <div key={ri} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    borderBottom: ri < section.rows.length - 1 || si < OTHER_SECTIONS.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <RowLabel label={row.label} desc={row.desc} />
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
                <div key={plan.key} style={{ ...colStyle(i), padding: '16px 20px' }}>
                  <Link to={plan.link} style={{
                    display: 'block', padding: '10px 0', borderRadius: 9,
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
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 16 }}>
            {t('pricing.membersNote')}
          </p>
        </div>

        {/* ── Auto-hébergement ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.4px', marginBottom: 8 }}>{t('pricing.selfHostTitle')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>{t('pricing.selfHostDesc')}</p>
          </div>

          <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', border: '1px solid var(--border)', borderRadius: 18, padding: 32, background: 'var(--surface)' }}>
            <span style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-2)', background: 'var(--surface-3)',
              border: '1px solid var(--border-2)', borderRadius: 20, padding: '3px 12px', whiteSpace: 'nowrap',
            }}>
              {t('pricing.selfHostBadge')}
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              {/* Licence unique */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <SFIcon name="server" size={16} color="var(--accent)" />
                  <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-display)' }}>{t('pricing.selfHostLicenseTitle')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--ff-display)' }}>{t('pricing.selfHostLicensePrice')}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('pricing.selfHostLicenseSuffix')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[t('pricing.selfHostLicenseFeat1'), t('pricing.selfHostLicenseFeat2'), t('pricing.selfHostLicenseFeat3')].map(feat => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <SFIcon name="check" size={13} color="var(--ok)" />
                      <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mises à jour continues */}
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <SFIcon name="refresh-cw" size={16} color="var(--ok)" />
                  <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-display)' }}>{t('pricing.selfHostUpdatesTitle')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--ff-display)' }}>{t('pricing.selfHostUpdatesPrice')}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('pricing.selfHostUpdatesSuffix')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[t('pricing.selfHostUpdatesFeat1'), t('pricing.selfHostUpdatesFeat2'), t('pricing.selfHostUpdatesFeat3')].map(feat => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <SFIcon name="check" size={13} color="var(--ok)" />
                      <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <a href="mailto:hebergement@rush.app" style={{
              display: 'block', width: '100%', marginTop: 28, padding: '12px', borderRadius: 11,
              background: 'var(--surface-3)', color: 'var(--text)', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--ff-text)', textDecoration: 'none', textAlign: 'center',
            }}>
              {t('pricing.selfHostCta')}
            </a>
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
