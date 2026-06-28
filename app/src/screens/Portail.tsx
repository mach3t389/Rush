import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { VIDEO_CORRECTIONS } from '../data/mock';
import { findProject } from '../data/projectStore';
import { addNotif } from '../data/notificationStore';
import { SFPill, SFBar, SFButton, SFIcon } from '../components/ui';
import { getInvoicesByProject, getEnabledPaymentMethods, formatMoney, type Invoice } from '../data/financeStore';

const PHASE_ORDER = ['preproduction', 'production', 'postproduction', 'livraison'];

// ── Message modal ─────────────────────────────────────────────────────────────

function MessageModal({ projectId, clientName, onClose }: { projectId: string; clientName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const send = () => {
    if (!text.trim()) return;
    addNotif({
      kind: 'comment',
      actor: clientName,
      text: `a envoyé un message : "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
      timestamp: Date.now(),
      projectId,
    });
    setSent(true);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 420, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {sent ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SFIcon name="check-circle" size={28} color="var(--ok)" />
              <div>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{t('portal.messageSent')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('portal.studioTeamNotified')}</p>
              </div>
            </div>
            <SFButton variant="secondary" onClick={onClose} style={{ alignSelf: 'flex-end' }}>{t('portal.close')}</SFButton>
          </>
        ) : (
          <>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{t('portal.sendMessageToStudio')}</p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={t('portal.yourMessagePlaceholder')}
              rows={4}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
                fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={onClose}>{t('portal.cancel')}</SFButton>
              <SFButton variant="primary" icon="send" onClick={send} disabled={!text.trim()}>{t('portal.send')}</SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Portail ───────────────────────────────────────────────────────────────────

export function Portail() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const project = findProject(projectId ?? '') ?? findProject('pj1')!;

  const [approved, setApproved] = useState(false);
  const [requestedCorrections, setRequestedCorrections] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);

  const openInvoices = getInvoicesByProject(project.id).filter(i => ['sent', 'viewed', 'overdue'].includes(i.status));
  const paymentMethods = getEnabledPaymentMethods();

  const currentPhaseIdx = PHASE_ORDER.indexOf(project.phase);
  const phases = [
    { label: t('portal.phasePreproduction'),  done: currentPhaseIdx >= 0 },
    { label: t('portal.phaseProduction'),     done: currentPhaseIdx >= 1 },
    { label: t('portal.phasePostproduction'), done: currentPhaseIdx >= 2 },
    { label: t('portal.phaseDelivery'),       done: currentPhaseIdx >= 3 },
  ];

  const LIVRABLES = [
    { name: 'Rough Cut Final — V4', version: 'V4', type: t('portal.deliverableTypeVideo'),  status: 'review' as const, label: t('portal.statusInReview'),    date: '8 juin 2025',  pending: true  },
    { name: 'Scénario V3',          version: 'V3', type: t('portal.deliverableTypeScript'), status: 'ok'     as const, label: t('portal.statusApproved'),    date: '1 juin 2025',  pending: false },
    { name: 'Rough Cut V3',         version: 'V3', type: t('portal.deliverableTypeVideo'),  status: 'danger'  as const, label: t('portal.statusCorrections'), date: '28 mai 2025',  pending: false },
    { name: 'Rough Cut V2',         version: 'V2', type: t('portal.deliverableTypeVideo'),  status: 'ok'      as const, label: t('portal.statusApproved'),    date: '20 mai 2025',  pending: false },
  ];
  const pendingLivrable = LIVRABLES[0];

  const handleApprove = () => {
    setApproved(true);
    addNotif({
      kind: 'status',
      actor: project.clientName,
      text: `a approuvé le livrable "${pendingLivrable.name}"`,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };

  const handleCorrections = () => {
    setRequestedCorrections(true);
    addNotif({
      kind: 'comment',
      actor: project.clientName,
      text: `a demandé des corrections sur "${pendingLivrable.name}"`,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 32px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo Rush */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--on-accent)', fontFamily: 'var(--ff-display)', lineHeight: 1 }}>R</span>
          </div>
          <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 900, fontSize: 14, letterSpacing: '-0.01em' }}>Rush</span>
        </div>

        {/* Projet au centre */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{project.clientName}</p>
        </div>

        {/* Actions droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(`/projets/${project.id}`)}
            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}
          >
            ← {t('portal.studioView')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{project.clientName}</span>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: project.clientColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {project.clientName.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <div style={{ flex: 1, padding: '32px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Colonne principale */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Livrable en attente */}
          {!approved && !requestedCorrections && (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)', padding: 24,
            }}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                {t('portal.awaitingYourApproval')}
              </p>

              <div style={{
                aspectRatio: '16/9', borderRadius: 10,
                background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 11px), var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, border: '1px solid var(--border)', cursor: 'pointer',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="play" size={22} color="var(--accent)" />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{pendingLivrable.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                    {pendingLivrable.type} · {pendingLivrable.version} · {t('portal.sharedOn', { date: pendingLivrable.date })}
                  </p>
                </div>
                <SFPill status={pendingLivrable.status} small>{pendingLivrable.label}</SFPill>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <SFButton variant="primary" icon="check" onClick={handleApprove} style={{ flex: 1, justifyContent: 'center' }}>
                  {t('portal.approve')}
                </SFButton>
                <SFButton variant="secondary" icon="message-circle" onClick={handleCorrections} style={{ flex: 1, justifyContent: 'center' }}>
                  {t('portal.requestCorrections')}
                </SFButton>
              </div>
            </div>
          )}

          {/* Confirmation après action */}
          {(approved || requestedCorrections) && (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--radius)',
              border: `1px solid ${approved ? 'var(--ok)' : 'var(--warn)'}`,
              padding: 24, display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <SFIcon name={approved ? 'check-circle' : 'message-circle'} size={28} color={approved ? 'var(--ok)' : 'var(--warn)'} />
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {approved ? t('portal.deliverableApproved') : t('portal.correctionsRequested')}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {approved
                    ? t('portal.teamNotifiedThanks')
                    : t('portal.teamNotifiedCorrections')
                  }
                </p>
              </div>
            </div>
          )}

          {/* Historique des livrables */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{t('portal.deliverableHistory')}</p>
            {LIVRABLES.slice(1).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: i < LIVRABLES.length - 2 ? '1px solid var(--border)' : 'none' }}>
                <div style={{
                  width: 48, height: 32, borderRadius: 6, flexShrink: 0,
                  background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 9px), var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="film" size={12} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                    {item.type} · {item.version} · {item.date}
                  </p>
                </div>
                <SFPill status={item.status} small>{item.label}</SFPill>
              </div>
            ))}
          </div>

          {/* Avancement */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{t('portal.projectProgress')}</p>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-2)' }}>{project.progress}%</span>
            </div>
            <SFBar value={project.progress} height={6} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              {phases.map((phase, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.done ? 'var(--ok)' : 'var(--border-2)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: phase.done ? 'var(--text-2)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {phase.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Colonne droite */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Corrections en cours */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{t('portal.correctionsInProgress')}</p>
            {VIDEO_CORRECTIONS.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', width: 20, flexShrink: 0, marginTop: 2 }}>{c.num}</span>
                <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4, color: 'var(--text-2)' }}>{c.label}</span>
                <SFPill status={c.status} small>{c.statusLabel}</SFPill>
              </div>
            ))}
          </div>

          {/* Contact studio */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{t('portal.studioContact')}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b4f8f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                SM
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500 }}>Sarah Martin</p>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('portal.creativeDirector')}</p>
              </div>
            </div>
            <SFButton
              variant="secondary"
              icon="message-circle"
              onClick={() => setShowMessage(true)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {t('portal.sendMessage')}
            </SFButton>
          </div>

          {/* Livraison prévue */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('portal.expectedDelivery')}</p>
            <p style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--ff-display)' }}>{project.deliveryDate}</p>
          </div>

          {/* Statut */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('portal.projectStatus')}</p>
            <SFPill status={project.status}>{project.statusLabel}</SFPill>
          </div>

          {/* Factures */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{t('portal.invoicesTitle')}</p>
            {openInvoices.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>{t('portal.invoiceNone')}</p>
            ) : openInvoices.map(inv => (
              <div key={inv.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{inv.title}</p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: inv.status === 'overdue' ? 'var(--danger)' : 'var(--text-3)', marginTop: 2 }}>
                      {t('portal.invoiceDue')} {inv.dueDate}
                    </p>
                  </div>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{formatMoney(inv.total, inv.currency)}</span>
                </div>
                <SFButton variant="primary" onClick={() => setPayInvoice(inv)} style={{ width: '100%', justifyContent: 'center' }}>
                  {t('portal.payNow')}
                </SFButton>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {payInvoice && (
        <>
          <div onClick={() => setPayInvoice(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 94vw)', zIndex: 201, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15 }}>{t('portal.payWith')}</p>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{payInvoice.title} · {formatMoney(payInvoice.total, payInvoice.currency)}</p>
              </div>
              <button onClick={() => setPayInvoice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}>
                <SFIcon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paymentMethods.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>{t('portal.noPaymentMethods')}</p>
              ) : paymentMethods.map(pm => (
                <div key={pm.id} style={{ background: 'var(--surface-2)', borderRadius: 11, border: `1px solid ${pm.isRecommended ? 'var(--accent)' : 'var(--border)'}`, padding: '13px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <SFIcon name={pm.icon} size={15} color="var(--text-2)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{pm.name}</span>
                      {pm.isRecommended && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'rgba(249,255,0,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('settings.pmRecommended')}</span>}
                      {(pm.feePercent ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{pm.feeLabel}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{pm.details}</p>
                    <div style={{ marginTop: 10 }}>
                      {pm.type === 'stripe' && pm.stripeLink ? (
                        <a href={pm.stripeLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', textDecoration: 'none' }}>
                          <SFIcon name="credit-card" size={13} color="var(--on-accent)" />
                          {t('portal.openStripe')}
                        </a>
                      ) : (
                        <button
                          onClick={() => { navigator.clipboard.writeText(pm.details).then(() => { setCopied(pm.id); setTimeout(() => setCopied(null), 2000); }); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                          <SFIcon name={copied === pm.id ? 'check' : 'copy'} size={12} color={copied === pm.id ? 'var(--ok)' : 'var(--text-3)'} />
                          {copied === pm.id ? t('portal.copied') : t('portal.copyInfo')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showMessage && (
        <MessageModal
          projectId={project.id}
          clientName={project.clientName}
          onClose={() => setShowMessage(false)}
        />
      )}
    </div>
  );
}
