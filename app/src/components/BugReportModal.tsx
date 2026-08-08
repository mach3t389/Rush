import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFModal, SFButton, SFIcon } from './ui';
import { supabase } from '../data/supabaseClient';
import { getCurrentUser, isDemoSession } from '../data/authStore';
import { showToast } from '../data/toastStore';

export function BugReportModal({ open, onClose, screenshotDataUrl }: {
  open: boolean;
  onClose: () => void;
  screenshotDataUrl: string | null;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [reproduction, setReproduction] = useState('');
  const [keepScreenshot, setKeepScreenshot] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDescription('');
    setReproduction('');
    setKeepScreenshot(true);
    setError(null);
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  if (isDemoSession()) {
    return (
      <SFModal open={open} onClose={close} title={t('bugReport.modalTitle')} width={420}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('bugReport.demoNotice')}</p>
      </SFModal>
    );
  }

  const handleSend = async () => {
    if (!description.trim() || !reproduction.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError(t('bugReport.sendError'));
        setSending(false);
        return;
      }
      const user = getCurrentUser();
      const res = await fetch('/api/integrations/v1/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          description: description.trim(),
          reproduction: reproduction.trim(),
          page: window.location.pathname,
          screenResolution: `${window.innerWidth}×${window.innerHeight}`,
          userAgent: navigator.userAgent,
          userName: user?.name ?? '',
          userEmail: user?.email ?? '',
          studioName: user?.studioName ?? '',
          screenshotDataUrl: keepScreenshot ? (screenshotDataUrl ?? undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { code?: string } } | null;
        setError(body?.error?.code === 'not_configured' ? t('bugReport.notConfiguredError') : t('bugReport.sendError'));
        setSending(false);
        return;
      }
      showToast({ type: 'task', message: t('bugReport.sentToast') });
      reset();
      setSending(false);
      onClose();
    } catch {
      setError(t('bugReport.sendError'));
      setSending(false);
    }
  };

  return (
    <SFModal open={open} onClose={close} title={t('bugReport.modalTitle')} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('bugReport.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('bugReport.descriptionPlaceholder')}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('bugReport.reproductionLabel')}
          </label>
          <textarea
            value={reproduction}
            onChange={e => setReproduction(e.target.value)}
            placeholder={t('bugReport.reproductionPlaceholder')}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none' }}
          />
        </div>

        {screenshotDataUrl ? (
          keepScreenshot ? (
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {t('bugReport.screenshotLabel')}
              </label>
              <div style={{ position: 'relative', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                <img src={screenshotDataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                <button
                  onClick={() => setKeepScreenshot(false)}
                  title={t('bugReport.removeScreenshot')}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}
                >
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            </div>
          ) : null
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('bugReport.screenshotUnavailable')}</p>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <SFButton variant="secondary" onClick={close} disabled={sending}>{t('tasks.cancel')}</SFButton>
          <SFButton
            variant="primary"
            onClick={handleSend}
            disabled={sending || !description.trim() || !reproduction.trim()}
          >
            {sending ? t('bugReport.sending') : t('bugReport.send')}
          </SFButton>
        </div>
      </div>
    </SFModal>
  );
}
