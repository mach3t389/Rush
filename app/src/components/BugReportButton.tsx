import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toJpeg } from 'html-to-image';
import { SFIcon } from './ui';
import { BugReportModal } from './BugReportModal';

export function BugReportButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const handleClick = async () => {
    try {
      const dataUrl = await toJpeg(document.body, { quality: 0.8, pixelRatio: 1 });
      setScreenshotDataUrl(dataUrl);
    } catch {
      // Capture indisponible (ex. contenu protégé par CORS) — le rapport
      // part quand même, juste sans image (voir BugReportModal, qui affiche
      // déjà l'avertissement quand screenshotDataUrl est null).
      setScreenshotDataUrl(null);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={t('bugReport.buttonTitle')}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 80,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
      >
        <SFIcon name="bug" size={18} />
      </button>
      <BugReportModal
        open={open}
        onClose={() => setOpen(false)}
        screenshotDataUrl={screenshotDataUrl}
      />
    </>
  );
}
