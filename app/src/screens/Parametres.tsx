import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon } from '../components/ui';
import { MonEquipe } from './MonEquipe';
import { Modeles } from './Modeles';
import { getLogoFull, getLogoSquare, setLogoFull, setLogoSquare } from '../data/studioLogoStore';
import { ProfileEditPanel, loadProfile, loadPhoto } from '../components/profile/ProfileEditPanel';
import { NOTIF_EVENTS, loadNotifPrefs, saveNotifPrefs, type NotifPrefs } from '../data/notifPrefsStore';
import { USERS } from '../data/mock';
import {
  getPaymentMethods, updatePaymentMethod, subscribePaymentMethods, type PaymentMethod,
  getInvoiceDefaults, setInvoiceDefaults, subscribeInvoiceDefaults, type InvoiceDefaults,
  TAX_PRESETS, type TaxLine,
} from '../data/financeStore';

function LogoUploader({ label, hint, aspectLabel, previewW, previewH, getter, setter }: {
  label: string; hint: string; aspectLabel: string; previewW: number; previewH: number;
  getter: () => string | null; setter: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(getter);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setSrc(dataUrl);
      setter(dataUrl);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>{label}</p>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          borderRadius: 9, border: `1.5px dashed ${src ? 'var(--accent)' : 'var(--border-2)'}`,
          background: 'var(--surface-2)', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '20px 12px', minHeight: 96, position: 'relative',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!src) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'; }}
        onMouseLeave={e => { if (!src) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
      >
        {src ? (
          <>
            <img src={src} alt={label} style={{ maxWidth: previewW, maxHeight: previewH, objectFit: 'contain', borderRadius: 4 }} />
            <button
              onClick={e => { e.stopPropagation(); setSrc(null); setter(null); if (inputRef.current) inputRef.current.value = ''; }}
              style={{
                position: 'absolute', top: 6, right: 6,
                width: 20, height: 20, borderRadius: '50%', border: 'none',
                background: 'var(--surface-3)', color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <SFIcon name="x" size={10} />
            </button>
          </>
        ) : (
          <>
            <SFIcon name="upload" size={20} color="var(--text-3)" />
            <p style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.4 }}>{t('upload.dragDrop')}</p>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>PNG, JPG, SVG · {aspectLabel}</p>
          </>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{hint}</p>
    </div>
  );
}

function PaymentMethodsSettings() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<PaymentMethod[]>(getPaymentMethods);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDetails, setEditDetails] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editStripe, setEditStripe] = useState('');
  const [editName, setEditName] = useState('');

  useEffect(() => subscribePaymentMethods(() => setMethods(getPaymentMethods())), []);

  const startEdit = (m: PaymentMethod) => {
    setEditId(m.id);
    setEditName(m.name);
    setEditDetails(m.details);
    setEditFee(String(m.feePercent ?? 0));
    setEditStripe(m.stripeLink ?? '');
  };
  const saveEdit = (id: string) => {
    updatePaymentMethod(id, { name: editName, details: editDetails, feePercent: parseFloat(editFee) || 0, feeLabel: parseFloat(editFee) > 0 ? `+${editFee}% de frais` : undefined, stripeLink: editStripe || undefined });
    setEditId(null);
  };

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 12, padding: '6px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20, marginBottom: 6 }}>{t('settings.paymentMethodsTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('settings.paymentMethodsDesc')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...methods].sort((a, b) => a.sortOrder - b.sortOrder).map(m => (
          <div key={m.id} style={{ background: 'var(--surface)', border: `1px solid ${editId === m.id ? 'var(--border-2)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Row */}
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Toggle */}
              <button
                onClick={() => updatePaymentMethod(m.id, { isEnabled: !m.isEnabled })}
                style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', transition: 'background 0.2s', background: m.isEnabled ? 'var(--ok)' : 'var(--surface-3)' }}
              >
                <span style={{ position: 'absolute', top: 2, left: m.isEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
              </button>

              {/* Icon */}
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFIcon name={m.icon} size={15} color="var(--text-2)" />
              </div>

              {/* Name + badges */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  {m.isRecommended && (
                    <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'rgba(249,255,0,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {t('settings.pmRecommended')}
                    </span>
                  )}
                  {(m.feePercent ?? 0) > 0 && (
                    <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 20, padding: '1px 7px' }}>
                      +{m.feePercent}%
                    </span>
                  )}
                </div>
                {!editId && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.details.split('\n')[0]}</p>}
              </div>

              {/* Recommended toggle */}
              <button
                onClick={() => updatePaymentMethod(m.id, { isRecommended: !m.isRecommended })}
                title={t('settings.pmRecommended')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.isRecommended ? 'var(--accent)' : 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}
              >
                <SFIcon name="star" size={14} color={m.isRecommended ? 'var(--accent)' : 'var(--text-3)'} />
              </button>

              {/* Edit toggle */}
              <button
                onClick={() => editId === m.id ? setEditId(null) : startEdit(m)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}
              >
                <SFIcon name={editId === m.id ? 'chevron-up' : 'settings-2'} size={14} />
              </button>
            </div>

            {/* Edit panel */}
            {editId === m.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)' }}>
                <div>
                  <label style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.pmName')}</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.pmDetails')}</label>
                  <textarea value={editDetails} onChange={e => setEditDetails(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.pmFee')} (%)</label>
                    <input type="number" min="0" step="0.1" value={editFee} onChange={e => setEditFee(e.target.value)} style={inputStyle} />
                  </div>
                  {m.type === 'stripe' && (
                    <div>
                      <label style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.pmStripeLink')}</label>
                      <input value={editStripe} onChange={e => setEditStripe(e.target.value)} placeholder="https://buy.stripe.com/..." style={inputStyle} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditId(null)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('finance.cancel')}</button>
                  <button onClick={() => saveEdit(m.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}>{t('finance.save')}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'CHF', 'AUD'];
const TERMS_OPTIONS = [7, 14, 15, 30, 45, 60, 90];

function InvoiceDefaultsSettings() {
  const { t } = useTranslation();
  const [defs, setDefs] = useState<InvoiceDefaults>(getInvoiceDefaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => subscribeInvoiceDefaults(() => setDefs(getInvoiceDefaults())), []);

  const save = () => {
    setInvoiceDefaults(defs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13,
    fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  };
  const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('settings.billingTitle')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('settings.billingDesc')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tax preset */}
        <div style={{ ...row, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>{t('settings.taxPreset')}</label>
          <select
            defaultValue=""
            onChange={e => {
              const key = e.target.value;
              if (!key) return;
              const preset = TAX_PRESETS[key];
              if (preset) setDefs(d => ({ ...d, taxLines: preset.lines.map(l => ({ ...l })) }));
              e.target.value = '';
            }}
            style={{ ...fieldStyle, cursor: 'pointer' }}
          >
            <option value="" disabled>{t('settings.taxPreset')}…</option>
            {Object.entries(TAX_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Tax lines editor */}
        <div style={{ ...row, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>{t('settings.taxLinesLabel')}</label>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{t('settings.taxLinesDesc')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(defs.taxLines ?? []).map((line: TaxLine, idx: number) => (
              <div key={line.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDefs(d => ({ ...d, taxLines: d.taxLines.map((l: TaxLine, i: number) => i === idx ? { ...l, enabled: !l.enabled } : l) }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: line.enabled ? 'var(--ok)' : 'var(--text-3)', display: 'flex', flexShrink: 0 }}
                >
                  <SFIcon name={line.enabled ? 'toggle-right' : 'toggle-left'} size={18} />
                </button>
                <input
                  value={line.name}
                  onChange={e => setDefs(d => ({ ...d, taxLines: d.taxLines.map((l: TaxLine, i: number) => i === idx ? { ...l, name: e.target.value } : l) }))}
                  placeholder={t('finance.taxName')}
                  style={{ ...fieldStyle, flex: 1, padding: '6px 8px', fontSize: 12, opacity: line.enabled ? 1 : 0.5 }}
                />
                <input
                  type="number" min="0" step="0.001"
                  value={line.rate}
                  onChange={e => setDefs(d => ({ ...d, taxLines: d.taxLines.map((l: TaxLine, i: number) => i === idx ? { ...l, rate: parseFloat(e.target.value) || 0 } : l) }))}
                  style={{ ...fieldStyle, width: 70, padding: '6px 8px', fontSize: 12, textAlign: 'right', opacity: line.enabled ? 1 : 0.5 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>%</span>
                <button
                  type="button"
                  onClick={() => setDefs(d => ({ ...d, taxLines: d.taxLines.filter((_: TaxLine, i: number) => i !== idx) }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 3, flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDefs(d => ({ ...d, taxLines: [...(d.taxLines ?? []), { id: `tax_${Date.now()}`, name: '', rate: 0, enabled: true }] }))}
              style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}
            >
              {t('finance.addTax')}
            </button>
          </div>
        </div>

        {/* Currency */}
        <div style={row}>
          <label style={labelStyle}>{t('settings.defaultCurrency')}</label>
          <select value={defs.currency} onChange={e => setDefs(d => ({ ...d, currency: e.target.value }))} style={fieldStyle}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Payment terms */}
        <div style={row}>
          <label style={labelStyle}>{t('settings.defaultPaymentTerms')}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TERMS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDefs(prev => ({ ...prev, paymentTermsDays: d }))}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--ff-mono)',
                  border: '1px solid var(--border-2)', cursor: 'pointer',
                  background: defs.paymentTermsDays === d ? 'var(--accent)' : 'var(--surface-2)',
                  color: defs.paymentTermsDays === d ? 'var(--on-accent)' : 'var(--text)',
                  fontWeight: defs.paymentTermsDays === d ? 700 : 400,
                }}
              >Net {d}</button>
            ))}
          </div>
        </div>

        {/* Invoice prefix */}
        <div style={row}>
          <label style={labelStyle}>{t('settings.invoicePrefix')}</label>
          <input
            type="text" maxLength={12}
            value={defs.numberPrefix}
            onChange={e => setDefs(d => ({ ...d, numberPrefix: e.target.value }))}
            placeholder="INV"
            style={fieldStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('settings.invoicePrefixHint')}</span>
        </div>
      </div>

      {/* Default notes */}
      <div style={row}>
        <label style={labelStyle}>{t('settings.defaultNotes')}</label>
        <textarea
          rows={3}
          value={defs.notes}
          onChange={e => setDefs(d => ({ ...d, notes: e.target.value }))}
          placeholder={t('settings.defaultNotesPlaceholder')}
          style={{ ...fieldStyle, resize: 'vertical', minHeight: 64 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SFButton variant="primary" onClick={save}>{t('finance.save')}</SFButton>
        {saved && <span style={{ fontSize: 12, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <SFIcon name="check" size={13} color="var(--ok)" /> {t('settings.saved') || 'Enregistré'}
        </span>}
      </div>
    </div>
  );
}

const SECTIONS = [
  { groupKey: 'settings.groupStudio', items: [{ key: 'infos', labelKey: 'settings.sectionStudioInfo' }, { key: 'team', labelKey: 'settings.sectionInternalTeam' }, { key: 'portail', labelKey: 'settings.sectionClientPortal' }, { key: 'paiements', labelKey: 'settings.sectionPaymentMethods' }, { key: 'facturation', labelKey: 'settings.sectionBilling' }, { key: 'modeles', labelKey: 'settings.sectionModels' }] },
  { groupKey: 'settings.groupAccount', items: [{ key: 'profil', labelKey: 'settings.sectionProfile' }, { key: 'notifs', labelKey: 'settings.sectionNotifications' }, { key: 'securite', labelKey: 'settings.sectionSecurity' }] },
  { groupKey: 'settings.groupCustomization', items: [{ key: 'polices', labelKey: 'settings.sectionFonts' }, { key: 'langue', labelKey: 'settings.sectionLanguage' }] },
  { groupKey: 'settings.groupIntegrations', items: [{ key: 'integrations', labelKey: 'settings.sectionConnectionsSync' }, { key: 'plugins', labelKey: 'settings.sectionPluginsTools' }] },
  { groupKey: 'settings.groupBilling', items: [{ key: 'plan', labelKey: 'settings.sectionPlanSubscription' }, { key: 'historique', labelKey: 'settings.sectionHistory' }] },
];

const ACCENT_COLORS = ['#f9ff00', '#ff6b35', '#00c2ff', '#7c6af7', '#00d4a0', '#ff4081'];

const LANGUAGE_OPTIONS = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    i18n.changeLanguage(code);
  };

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.languageTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.languageDesc')}</p>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {LANGUAGE_OPTIONS.map(option => (
          <button
            key={option.code}
            onClick={() => handleLanguageChange(option.code)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 10,
              border: `2px solid ${selectedLanguage === option.code ? 'var(--accent)' : 'var(--border)'}`,
              background: selectedLanguage === option.code ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontSize: 14,
              fontWeight: 500,
              color: selectedLanguage === option.code ? 'var(--text)' : 'var(--text-2)',
              fontFamily: 'var(--ff-text)',
            }}
            onMouseEnter={e => {
              if (selectedLanguage !== option.code) {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)';
              }
            }}
            onMouseLeave={e => {
              if (selectedLanguage !== option.code) {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }
            }}
          >
            <span style={{ fontSize: 20 }}>{option.flag}</span>
            <span>{option.label}</span>
            {selectedLanguage === option.code && (
              <span style={{ marginLeft: 'auto' }}>
                <SFIcon name="check" size={14} color="var(--accent)" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const PORTAL_ACCENT_KEY = 'sf_portal_accent';

function applyPortalAccent(color: string) {
  try { localStorage.setItem(PORTAL_ACCENT_KEY, color); } catch { /* noop */ }
  document.documentElement.style.setProperty('--accent', color);
  // Compute a readable on-accent color (black for light, white for dark)
  const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  document.documentElement.style.setProperty('--on-accent', lum > 0.55 ? '#0a0a0a' : '#ffffff');
}

function loadPortalAccent(): string {
  try { return localStorage.getItem(PORTAL_ACCENT_KEY) ?? '#f9ff00'; } catch { return '#f9ff00'; }
}

// Panneau « Portail client » — perso de la couleur accent (appliquée + persistée en live).
function PortalAccentSettings() {
  const { t } = useTranslation();
  const [accentColor, setAccentColor] = useState(loadPortalAccent);
  const [hexInput, setHexInput] = useState(loadPortalAccent);
  const onAccent = (c: string) => { setAccentColor(c); setHexInput(c); applyPortalAccent(c); };
  const readable = (c: string) => {
    const r = parseInt(c.slice(1, 3) || 'f9', 16), g = parseInt(c.slice(3, 5) || 'ff', 16), b = parseInt(c.slice(5, 7) || '00', 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#0a0a0a' : '#ffffff';
  };
  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.portalTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.portalDesc')}</p>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.portalAccentColor')}</label>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('settings.portalAccentColorDesc')}</p>
        </div>

        {/* Swatches */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACCENT_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onAccent(color)}
              title={color}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: color,
                border: accentColor === color ? '3px solid var(--text)' : '3px solid transparent',
                outline: accentColor === color ? `2px solid ${color}` : 'none',
                outlineOffset: 2,
                cursor: 'pointer', flexShrink: 0, transition: 'border 0.1s',
              }}
            />
          ))}
        </div>

        {/* Custom color picker + hex input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label title={t('settings.openColorPicker')} style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, background: accentColor, border: '2px solid var(--border-2)', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#f9ff00'}
              onChange={e => onAccent(e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
            />
            <SFIcon name="pipette" size={14} color={readable(accentColor)} />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden', flex: 1, maxWidth: 200 }}>
            <span style={{ padding: '0 10px', fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)', userSelect: 'none' }}>#</span>
            <input
              value={hexInput.replace(/^#/, '')}
              onFocus={e => e.target.select()}
              onChange={e => {
                const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                const raw = '#' + cleaned;
                setHexInput(raw);
                if (/^#[0-9a-fA-F]{6}$/.test(raw)) { setAccentColor(raw); applyPortalAccent(raw); }
              }}
              onBlur={e => {
                let cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                if (cleaned.length === 3) cleaned = cleaned.split('').map(c => c + c).join('');
                if (cleaned.length === 6) onAccent('#' + cleaned);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="f9ff00"
              style={{ flex: 1, padding: '8px 10px 8px 0', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-mono)', outline: 'none' }}
            />
          </div>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{t('settings.currentColor')}</span>
        </div>

        {/* Live preview */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: readable(accentColor), fontFamily: 'var(--ff-display)' }}>S</span>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t('settings.portalPreview')}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('settings.portalPreviewDesc')}</p>
          </div>
          <button style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: 'none', background: accentColor, color: readable(accentColor), fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('settings.viewPortal')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Font Picker ────────────────────────────────────────────────────────────────

const HEADING_FONTS = [
  { label: 'Montserrat',          value: "'Montserrat',sans-serif",           google: 'Montserrat:wght@700;900' },
  { label: 'Playfair Display',    value: "'Playfair Display',serif",           google: 'Playfair+Display:wght@700' },
  { label: 'Raleway',             value: "'Raleway',sans-serif",               google: 'Raleway:wght@700;800' },
  { label: 'Cormorant Garamond',  value: "'Cormorant Garamond',serif",         google: 'Cormorant+Garamond:wght@600;700' },
  { label: 'Space Grotesk',       value: "'Space Grotesk',sans-serif",         google: 'Space+Grotesk:wght@600;700' },
  { label: 'DM Serif Display',    value: "'DM Serif Display',serif",           google: 'DM+Serif+Display' },
  { label: 'Bebas Neue',          value: "'Bebas Neue',sans-serif",            google: 'Bebas+Neue' },
  { label: 'Georgia',             value: "Georgia,'Times New Roman',serif",    google: null },
];

const BODY_FONTS = [
  { label: 'Montserrat',          value: "'Montserrat',sans-serif",            google: 'Montserrat:wght@300;400;500' },
  { label: 'Inter',               value: "'Inter',sans-serif",                 google: 'Inter:wght@300;400;500' },
  { label: 'Lato',                value: "'Lato',sans-serif",                  google: 'Lato:wght@300;400;700' },
  { label: 'IBM Plex Sans',       value: "'IBM Plex Sans',sans-serif",         google: 'IBM+Plex+Sans:wght@300;400;500' },
  { label: 'Merriweather',        value: "'Merriweather',serif",               google: 'Merriweather:wght@300;400' },
  { label: 'Source Serif 4',      value: "'Source Serif 4',serif",             google: 'Source+Serif+4:wght@300;400' },
  { label: 'Georgia',             value: "Georgia,'Times New Roman',serif",    google: null },
  { label: 'System UI',           value: "system-ui,sans-serif",              google: null },
];

const FONT_STORAGE_KEY = 'sf_ui_fonts';

function loadUiFonts() {
  try {
    const s = localStorage.getItem(FONT_STORAGE_KEY);
    if (s) return JSON.parse(s) as { heading: string; body: string };
  } catch { /* noop */ }
  return { heading: "'Montserrat',sans-serif", body: "'Montserrat',sans-serif" };
}

function saveUiFonts(heading: string, body: string) {
  try { localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ heading, body })); } catch { /* noop */ }
  document.documentElement.style.setProperty('--ff-display', heading);
  document.documentElement.style.setProperty('--ff-text', body);
}

function loadGoogleFont(googleQuery: string | null) {
  if (!googleQuery) return;
  const id = `gf-${googleQuery.replace(/[^a-z0-9]/gi, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleQuery}&display=swap`;
  document.head.appendChild(link);
}

function FontCard({ font, selected, type, onSelect }: { font: typeof HEADING_FONTS[0]; selected: boolean; type: 'heading' | 'body'; onSelect: () => void }) {
  const { t } = useTranslation();
  useEffect(() => { loadGoogleFont(font.google); }, [font.google]);
  const preview = type === 'heading' ? t('settings.fontPreviewHeading') : t('settings.fontPreviewBody');
  const fs = type === 'heading' ? 18 : 14;
  const fw = type === 'heading' ? 700 : 400;
  return (
    <button onClick={onSelect} style={{
      padding: '12px 14px', borderRadius: 10,
      border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      background: selected ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
      cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: selected ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{font.label}</span>
        {selected && <SFIcon name="check" size={12} color="var(--accent)" />}
      </div>
      <span style={{ fontFamily: font.value, fontSize: fs, fontWeight: fw, color: 'var(--text)', lineHeight: 1.3 }}>{preview}</span>
    </button>
  );
}

function CustomFontImport({ onImported }: { onImported: (name: string, value: string) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<string | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const url = URL.createObjectURL(f);
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:'${name}';src:url('${url}');}`;
    document.head.appendChild(style);
    setImported(name);
    onImported(name, `'${name}',sans-serif`);
  };

  return (
    <div style={{ border: '1.5px dashed var(--border-2)', borderRadius: 10, padding: '16px 14px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={onFile} style={{ display: 'none' }} />
      {imported ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SFIcon name="check-circle" size={16} color="var(--ok)" />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('settings.fontImportedPrefix')} <strong style={{ fontFamily: `'${imported}',sans-serif`, color: 'var(--text)' }}>{imported}</strong> {t('settings.fontImportedSuffix')}</span>
          <button onClick={() => { setImported(null); if(inputRef.current) inputRef.current.value=''; }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={12} /></button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
          <SFIcon name="upload" size={16} color="var(--text-3)" />
          {t('settings.importFont')}
        </button>
      )}
    </div>
  );
}

// Interrupteur on/off réutilisable
function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => { if (!disabled) onChange?.(!on); }}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      style={{ width: 38, height: 22, borderRadius: 999, border: 'none', background: on ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'background 0.15s', flexShrink: 0, padding: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
    </button>
  );
}

// Sessions actives — mock (l'auth réelle nécessite un backend)
const MOCK_SESSIONS = [
  { device: 'Windows · Chrome', location: 'Montréal, QC', current: true,  lastKey: 'settings.sessionNow' },
  { device: 'iPhone · Safari',  location: 'Montréal, QC', current: false, lastKey: 'settings.sessionHoursAgo' },
  { device: 'macOS · Chrome',   location: 'Paris, FR',    current: false, lastKey: 'settings.sessionYesterday' },
];

export function Parametres() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState('infos');
  const [uiFonts, setUiFonts] = useState(loadUiFonts);
  const [customHeadings, setCustomHeadings] = useState<typeof HEADING_FONTS>([]);
  const [customBodies, setCustomBodies] = useState<typeof BODY_FONTS>([]);

  // ── Compte ──────────────────────────────────────────────────────────────────
  const me = USERS.lea; // utilisateur courant (cf. Sidebar)
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(() => {
    const o = loadProfile(me.id);
    return {
      name: o.name ?? me.name,
      role: o.role ?? me.role,
      email: o.email ?? 'alexismorel11@hotmail.ca',
      phone: o.phone ?? '',
      photo: loadPhoto(me.id),
    };
  });

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(loadNotifPrefs);
  const [notifSaved, setNotifSaved] = useState(false);
  const setChannel = (key: string, channel: 'inapp' | 'email', value: boolean) =>
    setNotifPrefs(p => ({ ...p, [key]: { ...p[key], [channel]: value } }));
  const saveNotifs = () => { saveNotifPrefs(notifPrefs); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2000); };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Sub-nav */}
      <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0 }}>
        {SECTIONS.map(section => (
          <div key={section.groupKey}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 4 }}>
              {t(section.groupKey)}
            </p>
            {section.items.map(item => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 9,
                  border: 'none',
                  background: activeSection === item.key ? 'var(--surface-3)' : 'transparent',
                  color: activeSection === item.key ? 'var(--text)' : 'var(--text-2)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--ff-text)',
                }}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: activeSection === 'modeles' ? 'hidden' : 'auto', padding: activeSection === 'modeles' ? 0 : 32, position: 'relative' }}>
        {activeSection === 'infos' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.studioInfoTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.studioInfoDesc')}</p>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { label: t('settings.studioName'), value: 'StudioFlow Production', type: 'text' },
                { label: t('settings.studioSector'), value: 'Production vidéo', type: 'text' },
                { label: t('settings.studioWebsite'), value: 'https://studioflow.fr', type: 'text' },
              ].map(field => (
                <div key={field.label}>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {field.label}
                  </label>
                  <input
                    defaultValue={field.value}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{t('settings.address')}</label>
                <textarea
                  defaultValue={"42 rue de la Paix\n75001 Paris\nFrance"}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--ff-text)' }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.studioLogos')}</label>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('settings.studioLogosDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Logo complet */}
                <LogoUploader
                  label={t('settings.fullLogo')}
                  hint={t('settings.fullLogoHint')}
                  aspectLabel={t('settings.aspectHorizontal')}
                  previewW={140}
                  previewH={48}
                  getter={getLogoFull}
                  setter={setLogoFull}
                />
                {/* Icône carrée */}
                <LogoUploader
                  label={t('settings.squareLogo')}
                  hint={t('settings.squareLogoHint')}
                  aspectLabel={t('settings.aspectSquare')}
                  previewW={48}
                  previewH={48}
                  getter={getLogoSquare}
                  setter={setLogoSquare}
                />
              </div>
            </div>


            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SFButton variant="primary">{t('settings.saveChanges')}</SFButton>
            </div>
          </div>
        )}
        {activeSection === 'team' && (
          <MonEquipe />
        )}

        {/* ── Portail client ── */}
        {activeSection === 'portail' && <PortalAccentSettings />}
        {activeSection === 'paiements' && <PaymentMethodsSettings />}
        {activeSection === 'facturation' && <InvoiceDefaultsSettings />}

        {/* ── Profil ── */}
        {activeSection === 'profil' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.profileTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.profileDesc')}</p>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: me.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                {profile.photo
                  ? <img src={profile.photo} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : me.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 700 }}>{profile.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{profile.role}</p>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.email}{profile.phone ? `  ·  ${profile.phone}` : ''}
                </p>
              </div>
              <SFButton variant="secondary" icon="square-pen" onClick={() => setProfileOpen(true)}>{t('settings.edit')}</SFButton>
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {activeSection === 'notifs' && (
          <div style={{ maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.notificationsTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.notificationsDesc')}</p>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.colEvent')}</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{t('settings.colInApp')}</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{t('settings.colEmail')}</span>
              </div>
              {NOTIF_EVENTS.map((ev, i) => (
                <div key={ev.key} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 12, alignItems: 'center', padding: '12px 20px', borderBottom: i < NOTIF_EVENTS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={ev.icon} size={14} color="var(--text-2)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{ev.label}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{ev.desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle on={!!notifPrefs[ev.key]?.inapp} onChange={v => setChannel(ev.key, 'inapp', v)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle on={!!notifPrefs[ev.key]?.email} onChange={v => setChannel(ev.key, 'email', v)} />
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {t('settings.notificationsHint')}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
              {notifSaved && <span style={{ fontSize: 12, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 5 }}><SFIcon name="check" size={13} color="var(--ok)" /> {t('settings.preferencesSaved')}</span>}
              <SFButton variant="primary" onClick={saveNotifs}>{t('settings.save')}</SFButton>
            </div>
          </div>
        )}

        {/* ── Sécurité (scaffold — auth non connectée) ── */}
        {activeSection === 'securite' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.securityTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.securityDesc')}</p>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,180,0,0.3)', background: 'rgba(255,180,0,0.06)', alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', flexShrink: 0, marginTop: 1 }}><SFIcon name="info" size={16} color="var(--warn)" /></span>
              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {t('settings.securityPreviewNoticePrefix')} <strong style={{ color: 'var(--text)' }}>{t('settings.securityPreviewNoticeWord')}</strong> {t('settings.securityPreviewNoticeSuffix')}
              </p>
            </div>

            {/* Mot de passe */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.password')}</label>
              {[t('settings.currentPassword'), t('settings.newPassword'), t('settings.confirmNewPassword')].map(ph => (
                <input key={ph} type="password" placeholder={ph} disabled
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', opacity: 0.6, cursor: 'not-allowed', boxSizing: 'border-box' }} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button disabled style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', opacity: 0.6, fontFamily: 'var(--ff-text)', fontWeight: 500 }}>{t('settings.updatePassword')}</button>
              </div>
            </div>

            {/* 2FA */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{t('settings.twoFactorAuth')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.twoFactorAuthDesc')}</p>
              </div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.soon')}</span>
              <Toggle on={false} disabled />
            </div>

            {/* Sessions actives */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px' }}>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.activeSessions')}</label>
              </div>
              {MOCK_SESSIONS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                  <SFIcon name={s.device.startsWith('iPhone') ? 'smartphone' : 'monitor'} size={16} color="var(--text-3)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{s.device} {s.current && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--ok)', background: 'rgba(78,201,148,0.12)', borderRadius: 4, padding: '1px 6px', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.thisDevice')}</span>}</p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.location} · {t(s.lastKey)}</p>
                  </div>
                  <button disabled style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'not-allowed', opacity: 0.5, fontFamily: 'var(--ff-text)' }}>
                    {s.current ? t('settings.sessionCurrent') : t('settings.sessionLogout')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'polices' && (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.fontsTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.fontsDesc')}</p>
            </div>

            {/* Heading font */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.headingFont')}</label>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('settings.headingFontDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[...HEADING_FONTS, ...customHeadings].map(f => (
                  <FontCard key={f.value} font={f} selected={uiFonts.heading === f.value} type="heading" onSelect={() => setUiFonts(p => ({ ...p, heading: f.value }))} />
                ))}
              </div>
              <CustomFontImport onImported={(name, value) => {
                const f = { label: name, value, google: null };
                setCustomHeadings(p => [...p.filter(x=>x.value!==value), f]);
                setUiFonts(p => ({ ...p, heading: value }));
              }} />
            </div>

            {/* Body font */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{t('settings.bodyFont')}</label>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('settings.bodyFontDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[...BODY_FONTS, ...customBodies].map(f => (
                  <FontCard key={f.value} font={f} selected={uiFonts.body === f.value} type="body" onSelect={() => setUiFonts(p => ({ ...p, body: f.value }))} />
                ))}
              </div>
              <CustomFontImport onImported={(name, value) => {
                const f = { label: name, value, google: null };
                setCustomBodies(p => [...p.filter(x=>x.value!==value), f]);
                setUiFonts(p => ({ ...p, body: value }));
              }} />
            </div>

            {/* Preview */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.preview')}</label>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontFamily: uiFonts.heading, fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('settings.previewHeadingSample')}</p>
                <p style={{ fontFamily: uiFonts.body, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{t('settings.previewBodySample')}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontFamily: uiFonts.heading, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: 'var(--accent)', color: 'var(--on-accent)' }}>{t('settings.previewPrimaryButton')}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border-2)', color: 'var(--text-2)' }}>{t('settings.previewMonoLabel')}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setUiFonts({ heading: "'Montserrat',sans-serif", body: "'Montserrat',sans-serif" }); saveUiFonts("'Montserrat',sans-serif", "'Montserrat',sans-serif"); }} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                {t('settings.reset')}
              </button>
              <SFButton variant="primary" onClick={() => saveUiFonts(uiFonts.heading, uiFonts.body)}>{t('settings.applyFonts')}</SFButton>
            </div>
          </div>
        )}
        {activeSection === 'langue' && <LanguageSettings />}
        {activeSection === 'integrations' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.integrationsTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.integrationsDesc')}</p>
            </div>

            {/* Google Calendar */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Google Calendar logo mark */}
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="1.5"/>
                    <rect x="3" y="3" width="18" height="5" rx="2" fill="#4285F4"/>
                    <rect x="3" y="6" width="18" height="2" fill="#4285F4"/>
                    <text x="12" y="18" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="8" fill="#4285F4">31</text>
                    <line x1="8" y1="3" x2="8" y2="6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="16" y1="3" x2="16" y2="6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Google Calendar</p>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.25)', color: 'var(--accent)', letterSpacing: '0.06em' }}>{t('settings.comingSoon')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.googleCalendarDesc')}</p>
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.whatThisEnables')}</p>
                {[
                  { icon: 'calendar', text: t('settings.gcalFeatureAutoAdd') },
                  { icon: 'refresh-cw', text: t('settings.gcalFeatureBidirectional') },
                  { icon: 'users', text: t('settings.gcalFeatureShare') },
                  { icon: 'bell', text: t('settings.gcalFeatureReminders') },
                ].map(item => (
                  <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button disabled style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--ff-text)', fontWeight: 500, opacity: 0.6 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
                  {t('settings.connectGoogleCalendar')}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('settings.availableNextUpdate')}</p>
              </div>
            </div>

            {/* Placeholder for future integrations */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { name: 'Slack', desc: t('settings.integrationSlackDesc'), color: '#611f69' },
                { name: 'Notion', desc: t('settings.integrationNotionDesc'), color: '#000' },
                { name: 'Dropbox', desc: t('settings.integrationDropboxDesc'), color: '#0061FF' },
                { name: 'Zapier', desc: t('settings.integrationZapierDesc'), color: '#FF4A00' },
              ].map(app => (
                <div key={app.name} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: app.color, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{app.desc}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{t('settings.soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeSection === 'plugins' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.pluginsTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.pluginsDesc')}</p>
            </div>

            {/* Premiere Pro */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#00005b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--ff-text)', fontWeight: 900, fontSize: 15, color: '#9999ff', letterSpacing: '-1px' }}>Pr</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Adobe Premiere Pro</p>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.25)', color: 'var(--accent)', letterSpacing: '0.06em' }}>{t('settings.comingSoon')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.premiereDesc')}</p>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.panelFeatures')}</p>
                {[
                  { icon: 'message-square', text: t('settings.premiereFeatureComments') },
                  { icon: 'clock', text: t('settings.premiereFeatureTimecode') },
                  { icon: 'check-circle', text: t('settings.premiereFeatureResolve') },
                  { icon: 'layers', text: t('settings.premiereFeatureAccess') },
                ].map(item => (
                  <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button disabled style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--ff-text)', fontWeight: 500, opacity: 0.6 }}>
                  <SFIcon name="download" size={14} color="var(--text-3)" />
                  {t('settings.downloadPlugin')}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('settings.premiereCompat')}</p>
              </div>
            </div>

            {/* DaVinci Resolve */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--ff-text)', fontWeight: 900, fontSize: 13, color: '#e8b4a0', letterSpacing: '-0.5px' }}>Da</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>DaVinci Resolve</p>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.25)', color: 'var(--accent)', letterSpacing: '0.06em' }}>{t('settings.comingSoon')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.resolveDesc')}</p>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.features')}</p>
                {[
                  { icon: 'message-square', text: t('settings.resolveFeaturePanel') },
                  { icon: 'clock', text: t('settings.resolveFeatureTimecode') },
                  { icon: 'refresh-cw', text: t('settings.resolveFeatureSync') },
                ].map(item => (
                  <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button disabled style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--ff-text)', fontWeight: 500, opacity: 0.6 }}>
                  <SFIcon name="download" size={14} color="var(--text-3)" />
                  {t('settings.downloadScript')}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('settings.resolveCompat')}</p>
              </div>
            </div>

            {/* How it connects */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{t('settings.howItConnects')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('settings.howItConnectsDesc')}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SFIcon name="key" size={13} color="var(--text-3)" />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{t('settings.apiKey')}</span>
                <div style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                  sk-rush-••••••••••••••••••••••••••••••••
                </div>
                <button disabled style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'not-allowed', opacity: 0.5, fontFamily: 'var(--ff-text)' }}>{t('settings.copy')}</button>
              </div>
            </div>
          </div>
        )}
        {activeSection === 'modeles' && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <Modeles />
          </div>
        )}
        {!['infos', 'team', 'portail', 'paiements', 'facturation', 'modeles', 'profil', 'notifs', 'securite', 'polices', 'integrations', 'plugins'].includes(activeSection) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
            <SFIcon name="clock" size={24} color="var(--border-2)" />
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
              {t('settings.sectionComingSoon', { section: (() => { const it = SECTIONS.flatMap(s => s.items).find(it => it.key === activeSection); return it ? t(it.labelKey) : t('settings.thisSection'); })() })}
            </p>
          </div>
        )}
      </div>

      {/* Drawer profil (éditeur complet réutilisé) */}
      {profileOpen && (
        <ProfileEditPanel
          userId={me.id}
          initialName={me.name}
          initialRole={me.role}
          initialEmail={profile.email}
          initialPhone={profile.phone}
          initialInitials={me.initials}
          initialColor={me.avatarColor}
          isSelf
          isAdmin={me.role === 'Admin'}
          onClose={() => setProfileOpen(false)}
          onSave={data => setProfile({ name: data.name, role: data.role, email: data.email, phone: data.phone, photo: data.photoUrl })}
        />
      )}
    </div>
  );
}
