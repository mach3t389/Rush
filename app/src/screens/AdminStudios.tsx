// app/src/screens/AdminStudios.tsx
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
import { SFButton } from '../components/ui';

const ADMIN_EMAIL = 'info@alexismorel.ca';

interface StudioResult {
  id: string;
  name: string;
  plan: string;
  billing_seats: number;
  billing_storage_tier: number;
  manual_grant_note: string | null;
  stripe_subscription_id: string | null;
}

const STORAGE_TIER_LABELS = ['Aucun extra', '+50 Go', '+200 Go', '+500 Go', '+1 To', '+2 To', '+4 To'];

export function AdminStudios() {
  const user = getCurrentUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const PAGE_SIZE = 20;

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<StudioResult[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<StudioResult | null>(null);
  const [newPlan, setNewPlan] = useState<'gratuit' | 'studio' | 'agence'>('gratuit');
  const [newSeats, setNewSeats] = useState(2);
  const [newStorageTier, setNewStorageTier] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const search = useCallback(async (q: string, p: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin-search-studios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ query: q, page: p }),
    });
    if (!res.ok) { setResults([]); setTotal(0); return; }
    const data = await res.json();
    setResults(data.studios ?? []);
    setTotal(data.total ?? 0);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => { void search(query, page); }, 300);
    return () => clearTimeout(timer);
  }, [query, page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectStudio = (s: StudioResult) => {
    setSelected(s);
    setNewPlan(s.plan as 'gratuit' | 'studio' | 'agence');
    setNewSeats(s.billing_seats ?? 2);
    setNewStorageTier(s.billing_storage_tier ?? 0);
    setNote(s.manual_grant_note ?? '');
    setMessage(null);
  };

  const applyGrant = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-set-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ studioId: selected.id, plan: newPlan, seats: newSeats, storageTier: newStorageTier, note }),
      });
      if (!res.ok) throw new Error('Request failed');
      setMessage('Plan mis à jour.');
      const updated = { ...selected, plan: newPlan, billing_seats: newSeats, billing_storage_tier: newStorageTier, manual_grant_note: note };
      setSelected(updated);
      setResults(prev => prev.map(r => (r.id === updated.id ? updated : r)));
    } catch (err) {
      console.error('Failed to set plan', err);
      setMessage('Échec de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Accès refusé.</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 40, boxSizing: 'border-box' }}>
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--ff-text)' }}>
      <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Octroi manuel d'accès
      </h1>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un studio par nom… (laisser vide pour voir tous les studios)"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
              boxSizing: 'border-box',
            }}
          />

          {results.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              {results.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectStudio(s)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: selected?.id === s.id ? 'var(--surface-3)' : 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  }}>
                  <span>{s.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.plan !== 'gratuit' && !s.stripe_subscription_id && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 4, padding: '2px 6px',
                      }}>
                        Manuel
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{s.plan}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>Aucun studio trouvé.</p>
          )}

          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <SFButton variant="secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                Précédent
              </SFButton>
              <span style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>
                Page {page + 1} / {totalPages}
              </span>
              <SFButton variant="secondary" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Suivant
              </SFButton>
            </div>
          )}
        </div>

        <div style={{ width: 320, flexShrink: 0, position: 'sticky', top: 0 }}>
          {!selected && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Sélectionne un studio dans la liste pour modifier son plan.</p>
            </div>
          )}
          {selected && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 20, background: 'var(--surface)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: selected.plan !== 'gratuit' && !selected.stripe_subscription_id ? 4 : 16 }}>
            {selected.name}
          </p>

          {selected.plan !== 'gratuit' && !selected.stripe_subscription_id && (
            <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--accent)', marginBottom: 16 }}>
              ⚠ Accès offert manuellement — aucun abonnement Stripe réel.
            </p>
          )}

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Plan
          </label>
          <select
            value={newPlan}
            onChange={e => setNewPlan(e.target.value as 'gratuit' | 'studio' | 'agence')}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
              boxSizing: 'border-box',
            }}>
            <option value="gratuit">Gratuit</option>
            <option value="studio">Studio</option>
            <option value="agence">Agence</option>
          </select>

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Nombre de sièges
          </label>
          <input
            type="number"
            min={1}
            value={newSeats}
            onChange={e => setNewSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
              boxSizing: 'border-box',
            }}
          />

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Stockage extra
          </label>
          <select
            value={newStorageTier}
            onChange={e => setNewStorageTier(parseInt(e.target.value, 10))}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
              boxSizing: 'border-box',
            }}>
            {STORAGE_TIER_LABELS.map((label, tier) => (
              <option key={tier} value={tier}>{label}</option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Note (optionnelle)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Ex. Partenaire X — bêta gratuite"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, marginBottom: 16,
              resize: 'vertical', fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
            }}
          />

          <SFButton variant="primary" onClick={applyGrant} disabled={saving}>
            {saving ? 'Application…' : 'Appliquer'}
          </SFButton>

          {message && (
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 12 }}>{message}</p>
          )}
        </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
