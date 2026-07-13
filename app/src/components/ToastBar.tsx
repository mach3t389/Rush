import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getToast, subscribeToast, dismissToast } from '../data/toastStore';
import { SFIcon } from './ui';

export function ToastBar() {
  const { t } = useTranslation();
  const [toast, setToast] = useState(getToast);
  const [visible, setVisible] = useState(false);
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToast(() => setToast(getToast()));
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (toast) {
      if (toast.id !== prevId.current) {
        prevId.current = toast.id;
        setVisible(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      }
    } else {
      setVisible(false);
    }
  }, [toast]);

  if (!toast) return null;

  const isSection = toast.type === 'section';
  const isSubtask = toast.type === 'subtask';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '20px'})`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        zIndex: 9000,
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: isSection ? 12 : 10,
        padding: isSection ? '12px 20px' : isSubtask ? '7px 14px' : '10px 16px',
        borderRadius: isSection ? 16 : 10,
        background: isSection ? 'var(--surface-3)' : 'var(--surface-2)',
        border: `1px solid ${isSection ? 'rgba(249,255,0,0.25)' : 'var(--border)'}`,
        boxShadow: isSection
          ? '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,255,0,0.1)'
          : '0 4px 20px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)',
        minWidth: isSubtask ? 0 : 260,
        maxWidth: 420,
      }}>
        {/* Icon / emoji */}
        {isSection ? (
          <span style={{ fontSize: 22, lineHeight: 1 }}>🎉</span>
        ) : isSubtask ? (
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="check" size={9} color="white" />
          </div>
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="check" size={11} color="white" />
          </div>
        )}

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: isSection ? 14 : isSubtask ? 12 : 13,
            fontWeight: isSection ? 700 : 500,
            color: 'var(--text)',
            fontFamily: 'var(--ff-text)',
            whiteSpace: 'nowrap',
          }}>
            {toast.message}
          </p>
          {toast.subMessage && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)', marginTop: 1 }}>
              {toast.subMessage}
            </p>
          )}
        </div>

        {/* Undo button */}
        {toast.onUndo && (
          <button
            onClick={() => { toast.onUndo!(); dismissToast(); }}
            style={{
              padding: '4px 10px',
              borderRadius: 7,
              border: '1px solid var(--border-2)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              fontSize: 12,
              fontFamily: 'var(--ff-text)',
              cursor: 'pointer',
              flexShrink: 0,
              fontWeight: 500,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
          >
            {t('toast.undo')}
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={dismissToast}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="x" size={12} />
        </button>
      </div>
    </div>
  );
}
