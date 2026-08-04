import { useMemo, useState } from 'react';
import type { Client, Project } from '../../types';
import { submitBillingRequest, type BillingRequestLine } from '../../data/northbookIntegrationStore';
import { SFButton, SFIcon } from '../ui';

export function BillingRequestPanel({
  open, currency, clients, projects, onClose, onCreated,
}: {
  open: boolean;
  currency: string;
  clients: Client[];
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<BillingRequestLine[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unitAmountMinor: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableProjects = useMemo(() => projects.filter(project => !clientId || project.clientId === clientId), [projects, clientId]);
  const totalMinor = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitAmountMinor), 0);

  if (!open) return null;
  const updateLine = (id: string, patch: Partial<BillingRequestLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
  const submit = async () => {
    if (!clientId || !title.trim() || lines.some(line => !line.description.trim() || line.quantity <= 0 || line.unitAmountMinor < 0)) {
      setError('Complétez le client, le titre et chaque ligne.'); return;
    }
    setSaving(true); setError(null);
    try {
      await submitBillingRequest({ clientId, projectId: projectId || undefined, title, currency, lines, notes });
      onCreated(); onClose();
    } catch {
      setError("La demande n’a pas pu être envoyée à Northbook."); setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none' };
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(5,8,7,.58)', backdropFilter: 'blur(3px)' }} />
    <aside style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 301, width: 'min(560px, 94vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-28px 0 80px rgba(0,0,0,.22)' }}>
      <header style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#14261f' }}><SFIcon name="send" size={17} color="#baf7d5" /></div>
        <div style={{ flex: 1 }}><h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 17 }}>Demander une facturation</h2><p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Northbook vérifiera les taxes et émettra la facture officielle.</p></div>
        <SFButton variant="ghost" icon="x" onClick={onClose} />
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'grid', gap: 16, alignContent: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>CLIENT *</span><select style={inputStyle} value={clientId} onChange={event => { setClientId(event.target.value); setProjectId(''); }}><option value="">Choisir…</option>{clients.filter(client => !client.archived).map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>PROJET</span><select style={inputStyle} value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Sans projet</option>{availableProjects.filter(project => !project.archived).map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        </div>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>OBJET *</span><input style={inputStyle} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} placeholder="Production — acompte 50 %" /></label>
        <section style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>LIGNES PROPOSÉES</span><SFButton size="sm" variant="ghost" icon="plus" onClick={() => setLines(current => [...current, { id: crypto.randomUUID(), description: '', quantity: 1, unitAmountMinor: 0 }])}>Ajouter</SFButton></div>
          {lines.map((line, index) => <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 30px', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <input aria-label={`Description ligne ${index + 1}`} style={inputStyle} value={line.description} onChange={event => updateLine(line.id, { description: event.target.value })} placeholder="Description" />
            <input aria-label={`Quantité ligne ${index + 1}`} style={inputStyle} type="number" min="0.01" step="0.25" value={line.quantity} onChange={event => updateLine(line.id, { quantity: Number(event.target.value) })} />
            <input aria-label={`Prix ligne ${index + 1}`} style={inputStyle} type="number" min="0" step="0.01" value={(line.unitAmountMinor / 100).toFixed(2)} onChange={event => updateLine(line.id, { unitAmountMinor: Math.round(Number(event.target.value) * 100) })} />
            <button aria-label={`Supprimer ligne ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.id !== line.id))} style={{ border: 0, background: 'transparent', color: 'var(--text-3)', cursor: lines.length === 1 ? 'not-allowed' : 'pointer' }}><SFIcon name="trash-2" size={14} /></button>
          </div>)}
        </section>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>NOTE POUR LA COMPTABILITÉ</span><textarea style={{ ...inputStyle, minHeight: 78, resize: 'vertical' }} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      </div>
      <footer style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}><p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>TOTAL PROPOSÉ</p><strong style={{ fontSize: 19 }}>{new Intl.NumberFormat('fr-CA', { style: 'currency', currency }).format(totalMinor / 100)}</strong></div>
        <SFButton variant="secondary" onClick={onClose} disabled={saving}>Annuler</SFButton><SFButton variant="primary" icon="send" onClick={() => void submit()} disabled={saving}>{saving ? 'Envoi…' : 'Envoyer à Northbook'}</SFButton>
      </footer>
    </aside>
  </>;
}
