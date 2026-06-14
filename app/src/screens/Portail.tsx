import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PROJECTS, VIDEO_CORRECTIONS } from '../data/mock';
import { SFPill, SFBar, SFButton, SFIcon } from '../components/ui';

// Vue client standalone — pas d'AppShell, pas de sidebar interne (PRD §6.4)
export function Portail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const project = PROJECTS.find(p => p.id === projectId) ?? PROJECTS[0];
  const [approved, setApproved] = useState(false);
  const [requestedCorrections, setRequestedCorrections] = useState(false);

  const LIVRABLES = [
    { name: 'Rough Cut Final — V4', version: 'V4', type: 'Vidéo', status: 'review' as const, label: 'En révision', date: '8 juin 2025', pending: true },
    { name: 'Scénario V3',          version: 'V3', type: 'Script', status: 'ok'     as const, label: 'Approuvé',    date: '1 juin 2025', pending: false },
    { name: 'Rough Cut V3',         version: 'V3', type: 'Vidéo', status: 'danger'  as const, label: 'Corrections', date: '28 mai 2025', pending: false },
    { name: 'Rough Cut V2',         version: 'V2', type: 'Vidéo', status: 'ok'      as const, label: 'Approuvé',    date: '20 mai 2025', pending: false },
  ];

  const pendingLivrable = LIVRABLES[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header fixe */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo studio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--on-accent)', fontFamily: 'var(--ff-display)' }}>S</span>
          </div>
          <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 14 }}>StudioFlow</span>
        </div>

        {/* Projet au centre */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{project.clientName}</p>
        </div>

        {/* Client connecté + retour app */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(`/projets/${project.id}`)}
            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}
          >
            ← Vue studio
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
      <div style={{ flex: 1, padding: '32px 32px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>

        {/* Colonne principale */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Livrable en attente d'approbation */}
          {!approved && !requestedCorrections && (
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)',
              padding: 24,
            }}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                EN ATTENTE DE VOTRE APPROBATION
              </p>

              {/* Video placeholder */}
              <div style={{
                aspectRatio: '16/9',
                borderRadius: 10,
                background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 11px), var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
                border: '1px solid var(--border)',
                cursor: 'pointer',
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
                    {pendingLivrable.type} · {pendingLivrable.version} · Partagé le {pendingLivrable.date}
                  </p>
                </div>
                <SFPill status={pendingLivrable.status} small>{pendingLivrable.label}</SFPill>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <SFButton
                  variant="primary"
                  icon="check"
                  onClick={() => setApproved(true)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Approuver
                </SFButton>
                <SFButton
                  variant="secondary"
                  icon="message-circle"
                  onClick={() => setRequestedCorrections(true)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Demander des corrections
                </SFButton>
              </div>
            </div>
          )}

          {/* Confirmation après action */}
          {(approved || requestedCorrections) && (
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: `1px solid ${approved ? 'var(--ok)' : 'var(--warn)'}`,
              padding: 24,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <SFIcon name={approved ? 'check-circle' : 'message-circle'} size={28} color={approved ? 'var(--ok)' : 'var(--warn)'} />
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {approved ? 'Livrable approuvé' : 'Corrections demandées'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {approved
                    ? 'L\'équipe a été notifiée. Merci !'
                    : 'L\'équipe a été notifiée et prendra en compte vos demandes.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Historique des livrables */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Historique des livrables</p>
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

          {/* Avancement du projet */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Avancement du projet</p>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-2)' }}>{project.progress}%</span>
            </div>
            <SFBar value={project.progress} height={6} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              {[
                { label: 'Préproduction', done: true },
                { label: 'Production',    done: true },
                { label: 'Postproduction',done: false },
                { label: 'Livraison',     done: false },
              ].map((phase, i) => (
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
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Corrections en cours</p>
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
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Contact studio</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b4f8f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                SM
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500 }}>Sarah Martin</p>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Directrice créative</p>
              </div>
            </div>
            <SFButton variant="secondary" icon="message-circle" style={{ width: '100%', justifyContent: 'center' }}>
              Envoyer un message
            </SFButton>
          </div>

          {/* Livraison prévue */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Livraison prévue</p>
            <p style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--ff-display)' }}>{project.deliveryDate}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
