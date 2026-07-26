import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SFIcon } from '../components/ui';
import { getPublicForm, submitPublicForm, uploadPublicFormFile, type PublicFormData } from '../data/formSubmissionsStore';
import { FormFillBody, type FormQuestion } from './ResourceDetail';

// Public, fully unauthenticated page for filling out a "Formulaire" resource
// — see docs/superpowers/specs/2026-07-25-public-form-submission-migration.sql.
// Anyone with the link (copied from FormView's "Partager" button) can open
// this and submit; there is no account, no session, nothing to log in to.

const btnBase: React.CSSProperties = { padding: '12px 32px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--ff-text)', fontWeight: 700 };

export function PublicFormFill() {
  const { resourceId = '' } = useParams<{ resourceId: string }>();
  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [form, setForm] = useState<PublicFormData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [respondentName, setRespondentName] = useState('');
  const [respondentEmail, setRespondentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!resourceId) { setLoadState('invalid'); return; }
      const data = await getPublicForm(resourceId);
      if (cancelled) return;
      if (!data) { setLoadState('invalid'); return; }
      setForm(data);
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [resourceId]);

  const toggleCheck = (qid: string, val: string) => {
    setAnswers(prev => {
      const cur = (prev[qid] as string[] | undefined) ?? [];
      return { ...prev, [qid]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    const result = await submitPublicForm(
      resourceId,
      answers,
      form?.collectIdentity ? respondentName.trim() || undefined : undefined,
      form?.collectIdentity ? respondentEmail.trim() || undefined : undefined
    );
    if (!result.ok) {
      setError('Une erreur est survenue. Veuillez réessayer.');
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
    setSubmitting(false);
  };

  const shellStyle: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg)', padding: '48px 24px' };

  if (loadState === 'loading') {
    return <div style={shellStyle}><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></div>;
  }

  if (loadState === 'invalid') {
    return (
      <div style={shellStyle}>
        <div style={{ maxWidth: 440, margin: '80px auto 0', textAlign: 'center' }}>
          <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px', color: 'var(--text)' }}>
            Formulaire introuvable
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Ce lien n'existe plus ou n'est plus valide.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={shellStyle}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '80px 40px', background: 'var(--surface)', borderRadius: 20, border: '1.5px solid var(--border)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: '0 0 10px', color: 'var(--text)', fontFamily: 'var(--ff-display)', fontSize: 22 }}>Réponse enregistrée</h2>
          <p style={{ color: 'var(--text-2)', fontFamily: 'var(--ff-text)', fontSize: 14 }}>Merci pour vos réponses.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <style>{`
        .fv-preview-input{width:100%;padding:10px 14px;border-radius:8px;border:1.5px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--ff-text);outline:none;transition:border-color .15s}
        .fv-preview-input:focus{border-color:var(--accent)}
      `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1.5px solid var(--accent)', marginBottom: 24 }}>
          <div style={{ height: 10, background: 'var(--accent)' }} />
          <div style={{ padding: '28px 32px', background: 'var(--surface)' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--ff-display)', marginBottom: 8 }}>{form!.title}</h1>
            {form!.description && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--ff-text)', lineHeight: 1.6 }}>{form!.description}</p>}
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>
              <span style={{ color: 'var(--danger)' }}>*</span> Champ obligatoire
            </p>
          </div>
        </div>

        {form!.collectIdentity && (
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '24px 28px', marginBottom: 16, display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--ff-text)' }}>Votre nom</p>
              <input className="fv-preview-input" value={respondentName} onChange={e => setRespondentName(e.target.value)} placeholder="Nom et prénom" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--ff-text)' }}>Votre courriel</p>
              <input className="fv-preview-input" type="email" value={respondentEmail} onChange={e => setRespondentEmail(e.target.value)} placeholder="vous@exemple.com" />
            </div>
          </div>
        )}

        <FormFillBody
          questions={(form!.questions as FormQuestion[])}
          answers={answers}
          onAnswer={(qid, val) => setAnswers(p => ({ ...p, [qid]: val }))}
          onToggleCheck={toggleCheck}
          onUpload={(_qid, file) => uploadPublicFormFile(resourceId, file)}
        />

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)' }}>
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...btnBase, background: submitting ? 'var(--surface-3)' : 'var(--accent)', color: submitting ? 'var(--text-3)' : 'var(--on-accent)', cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? '…' : 'Soumettre'}
          </button>
        </div>
      </div>
    </div>
  );
}
