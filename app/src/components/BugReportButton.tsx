import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toJpeg } from 'html-to-image';
import { SFIcon } from './ui';
import { BugReportModal } from './BugReportModal';

// Capture plafonnée à 4 Mo de dataURL base64 (même seuil que la route
// backend) — au-delà on abandonne la capture plutôt que d'envoyer une
// requête vouée à être rejetée par la limite de taille du corps de requête
// Vercel (~4,5 Mo). Timeout de 4s : sur une page très longue/complexe,
// toJpeg peut rester bloqué indéfiniment sans jamais rejeter.
const CAPTURE_TIMEOUT_MS = 4000;
const MAX_SCREENSHOT_DATA_URL_LENGTH = 4_000_000;

export function BugReportButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const handleClick = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('capture_timeout')), CAPTURE_TIMEOUT_MS));
      const dataUrl = await Promise.race([toJpeg(document.body, { quality: 0.8, pixelRatio: 1 }), timeout]);
      setScreenshotDataUrl(dataUrl.length <= MAX_SCREENSHOT_DATA_URL_LENGTH ? dataUrl : null);
    } catch {
      // Capture indisponible (ex. contenu protégé par CORS, ou trop lente) —
      // le rapport part quand même, juste sans image (voir BugReportModal,
      // qui affiche déjà l'avertissement quand screenshotDataUrl est null).
      setScreenshotDataUrl(null);
    }
    setCapturing(false);
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={capturing}
        title={t('bugReport.buttonTitle')}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 90,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: capturing ? 'default' : 'pointer',
          opacity: capturing ? 0.7 : 1,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => { if (capturing) return; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
        onMouseLeave={e => { if (capturing) return; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
      >
        {capturing
          ? <SFIcon name="loader-2" size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
          : <SFIcon name="bug" size={18} />}
      </button>
      <BugReportModal
        open={open}
        onClose={() => setOpen(false)}
        screenshotDataUrl={screenshotDataUrl}
      />
    </>
  );
}
