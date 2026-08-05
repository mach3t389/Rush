import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';
import { isDemoSession } from '../data/authStore';
import { authorizeNorthbook } from '../data/northbookIntegrationStore';
import { listMyOrganizations, type MyOrganization } from '../data/studioStore';

const REQUIRED_PARAMS = ['code_challenge', 'state', 'redirect_uri', 'installation_name'] as const;

export function NorthbookAuthorize() {
  const [params] = useSearchParams();
  const demoSession = isDemoSession();
  const [organizations, setOrganizations] = useState<MyOrganization[]>([]);
  const [studioId, setStudioId] = useState('');
  const [loading, setLoading] = useState(!demoSession);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidRequest = REQUIRED_PARAMS.some(key => !params.get(key));

  useEffect(() => {
    if (demoSession) return;
    void listMyOrganizations().then(items => {
      setOrganizations(items);
      setStudioId(items[0]?.studioId ?? '');
      setLoading(false);
    }).catch(() => { setError('Impossible de charger vos organisations.'); setLoading(false); });
  }, [demoSession]);

  const selected = useMemo(() => organizations.find(org => org.studioId === studioId), [organizations, studioId]);
  const connect = async () => {
    if (!studioId || invalidRequest) return;
    setSubmitting(true); setError(null);
    try {
      const redirectUrl = await authorizeNorthbook({
        studioId,
        codeChallenge: params.get('code_challenge')!,
        state: params.get('state')!,
        installationName: params.get('installation_name')!,
        redirectUri: params.get('redirect_uri')!,
      });
      window.location.assign(redirectUrl);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(code === 'admin_required'
        ? 'Seuls un propriétaire ou un administrateur peuvent autoriser Northbook.'
        : code === 'pilot_not_enabled'
          ? "Cette organisation ne fait pas encore partie du pilote Northbook."
          : "L’autorisation n’a pas pu être créée. Réessayez.");
      setSubmitting(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(circle at 15% 0%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 42%), var(--bg)' }}>
      <section style={{ width: 'min(680px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,.22)' }}>
        <div style={{ padding: '30px 34px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#14261f', color: '#baf7d5', border: '1px solid #315b49' }}>
            <SFIcon name="book-open" size={25} color="#baf7d5" />
          </div>
          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase' }}>Connexion comptable</p>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 25, marginTop: 4 }}>Autoriser Northbook</h1>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 5 }}>Reliez ce studio à votre grand livre local sans donner accès à vos reçus ni à vos dépenses détaillées.</p>
          </div>
        </div>

        <div style={{ padding: '26px 34px 32px', display: 'grid', gap: 22 }}>
          {demoSession || invalidRequest ? (
            <div style={{ padding: 16, borderRadius: 10, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)' }}>
              {demoSession ? 'Les comptes de démonstration ne peuvent pas connecter Northbook.' : 'Cette demande d’autorisation est incomplète.'}
            </div>
          ) : (
            <>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Organisation</span>
                <select value={studioId} onChange={event => setStudioId(event.target.value)} disabled={loading || submitting}
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text)', borderRadius: 10, padding: '11px 12px', fontSize: 13 }}>
                  {organizations.map(org => <option value={org.studioId} key={org.studioId}>{org.name} · {org.role}</option>)}
                </select>
              </label>

              <div style={{ display: 'grid', gap: 9, padding: 16, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {[
                  ['users', 'Lire les clients et projets du studio'],
                  ['receipt', 'Recevoir et mettre à jour les demandes de facturation'],
                  ['file-check', 'Publier les factures officielles et leur PDF'],
                  ['chart-no-axes-column', 'Publier uniquement les totaux de rentabilité par projet'],
                ].map(([icon, label]) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}><SFIcon name={icon} size={14} color="var(--accent)" />{label}</div>)}
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>Northbook ne recevra jamais les mots de passe Rush. Les dépenses, fournisseurs, reçus et numéros fiscaux restent sur l’appareil.</p>
              {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                <SFButton variant="ghost" onClick={() => window.close()} disabled={submitting}>Annuler</SFButton>
                <SFButton variant="primary" icon="shield-check" onClick={() => void connect()} disabled={loading || submitting || !selected}>
                  {submitting ? 'Autorisation…' : `Autoriser ${selected?.name ?? 'le studio'}`}
                </SFButton>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
