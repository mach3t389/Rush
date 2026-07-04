import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { VIDEO_CORRECTIONS } from '../data/mock';
import { findProject, subscribeProjects } from '../data/projectStore';
import { addNotif } from '../data/notificationStore';
import { getDeliverables, updateTask, subscribeStore } from '../data/taskStore';
import { getDeliverableDisplay } from '../data/deliverableStatus';
import { SFPill, SFBar, SFButton, SFIcon, formatDisplay } from '../components/ui';
import { getInvoicesByProject, getEnabledPaymentMethods, formatMoney, type Invoice } from '../data/financeStore';
import type { Task, DeliverableType, Project } from '../types';

const DELIVERABLE_TYPE_ICON: Record<DeliverableType, string> = {
  video: 'video', photo: 'image', audio: 'music', document: 'file-text', web: 'globe',
  graphique: 'pen-tool', service: 'briefcase', produit: 'package-2', autre: 'circle-dashed',
};

const DELIVERABLE_TYPE_LABEL: Record<DeliverableType, string> = {
  video: 'overview.delivVideo', photo: 'overview.delivPhoto', audio: 'overview.delivAudio',
  document: 'overview.delivDocument', web: 'overview.delivWeb', graphique: 'overview.delivGraphic',
  service: 'overview.delivService', produit: 'overview.delivProduct', autre: 'overview.delivOther',
};

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
  const [project, setProject] = useState<Project | undefined>(() => findProject(projectId ?? ''));

  useEffect(() => {
    return subscribeProjects(() => setProject(findProject(projectId ?? '')));
  }, [projectId]);

  const [showMessage, setShowMessage] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Task[]>(() => project ? getDeliverables(project.id).filter(d => d.sharedWithClient) : []);

  useEffect(() => {
    if (!project) return;
    const id = project.id;
    return subscribeStore(() => setDeliverables(getDeliverables(id).filter(d => d.sharedWithClient)));
  }, [project]);

  // For real (Supabase-backed) sessions, the project list loads asynchronously —
  // on a fresh page load/reload this component can mount before the fetch
  // resolves. The subscribeProjects() effect above will populate it once the
  // fetch completes. This guard sits after every hook call so hook order
  // never changes between renders.
  if (!project) {
    return <div style={{ padding: 40, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>{t('common.loading')}</div>;
  }

  const openInvoices = getInvoicesByProject(project.id).filter(i => ['sent', 'viewed', 'overdue'].includes(i.status));
  const paymentMethods = getEnabledPaymentMethods();

  const currentPhaseIdx = PHASE_ORDER.indexOf(project.phase);
  const phases = [
    { label: t('portal.phasePreproduction'),  done: currentPhaseIdx >= 0 },
    { label: t('portal.phaseProduction'),     done: currentPhaseIdx >= 1 },
    { label: t('portal.phasePostproduction'), done: currentPhaseIdx >= 2 },
    { label: t('portal.phaseDelivery'),       done: currentPhaseIdx >= 3 },
  ];

  const pendingDeliverables = deliverables.filter(d => d.status === 'review');
  const historyDeliverables = deliverables.filter(d => d.status !== 'review');

  const handleApprove = (dl: Task) => {
    updateTask(project.id, dl.id, { status: 'ok', correctionsRequested: false });
    addNotif({
      kind: 'deliverableApproved',
      actor: project.clientName,
      text: `a approuvé le livrable "${dl.title}"`,
      taskId: dl.id,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };

  const handleCorrections = (dl: Task) => {
    updateTask(project.id, dl.id, { correctionsRequested: true });
    addNotif({
      kind: 'comment',
      actor: project.clientName,
      text: `a demandé des corrections sur "${dl.title}"`,
      taskId: dl.id,
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

          {deliverables.length === 0 ? (
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 32, textAlign: 'center' }}>
              <SFIcon name="package" size={28} color="var(--text-3)" />
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>{t('portal.noDeliverablesShared')}</p>
            </div>
          ) : (
            <>
              {/* Livrables en attente d'approbation */}
              {pendingDeliverables.map(dl => {
                const typeIcon = DELIVERABLE_TYPE_ICON[dl.deliverableType ?? 'autre'];
                const typeLabel = t(DELIVERABLE_TYPE_LABEL[dl.deliverableType ?? 'autre']);
                return (
                  <div key={dl.id} style={{
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
                      marginBottom: 16, border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <SFIcon name={typeIcon} size={22} color="var(--accent)" />
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{dl.title}</p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                        {typeLabel} · {t('portal.sharedOn', { date: formatDisplay(dl.dueDate) })}
                      </p>
                    </div>

                    {dl.correctionsRequested && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: '#a85f3e18', border: '1px solid #a85f3e44' }}>
                        <SFIcon name="alert-triangle" size={13} color="#a85f3e" />
                        <span style={{ fontSize: 12, color: '#a85f3e' }}>{t('portal.correctionsRequestedNote')}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <SFButton variant="primary" icon="check" onClick={() => handleApprove(dl)} style={{ flex: 1, justifyContent: 'center' }}>
                        {t('portal.approve')}
                      </SFButton>
                      {!dl.correctionsRequested && (
                        <SFButton variant="secondary" icon="message-circle" onClick={() => handleCorrections(dl)} style={{ flex: 1, justifyContent: 'center' }}>
                          {t('portal.requestCorrections')}
                        </SFButton>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Historique des livrables */}
              {historyDeliverables.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{t('portal.deliverableHistory')}</p>
                  {historyDeliverables.map((item, i) => {
                    const display = getDeliverableDisplay(item);
                    const typeIcon = DELIVERABLE_TYPE_ICON[item.deliverableType ?? 'autre'];
                    const typeLabel = t(DELIVERABLE_TYPE_LABEL[item.deliverableType ?? 'autre']);
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: i < historyDeliverables.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{
                          width: 48, height: 32, borderRadius: 6, flexShrink: 0,
                          background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 9px), var(--surface-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <SFIcon name={typeIcon} size={12} color="var(--text-3)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</p>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                            {typeLabel} · {formatDisplay(item.dueDate)}
                          </p>
                        </div>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: display.color, background: `${display.color}18`, border: `1px solid ${display.color}44`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                          {t(display.labelKey)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

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
