import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSpeechLang } from '../i18n/useI18n';
import { registerAIToggle, registerAIClose } from './aiChatBridge';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import { getShortcuts as getShortcutsFn, matchesShortcut as matchesShortcutFn } from '../data/shortcutsStore';
import { useNavigate } from 'react-router-dom';
import { SFIcon } from './ui';
import { useAIAgentChat, renderMarkdown } from './ai/aiAgentCore';

// ── Speech Recognition ───────────────────────────────────────────────────────

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// ── Composant principal ───────────────────────────────────────────────────────

export function AIChat() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speechLang, setSpeechLang] = useState(() => defaultSpeechLang(i18n.language));
  const [autoSend, setAutoSend] = useState(false);
  const { messages, loading, quota, send, clear } = useAIAgentChat(navigate);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const LANGS = [
    { id: 'fr-FR', label: 'Français' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'es-ES', label: 'Español' },
  ];

  const SUGGESTIONS = [
    t('ai.suggestionOverdueProjects'),
    t('ai.suggestionCreateShoot'),
    t('ai.suggestionListClients'),
    t('ai.suggestionCreateProject'),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  // Raccourci micro — lu depuis shortcutsStore
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (matchesShortcutFn(e, getShortcutsFn().ai_mic)) {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, listening, speechLang]);

  // The input box grows with its content purely via CSS (a hidden mirror
  // div sizes a grid cell the textarea overlays — see the input JSX) so its
  // height can never fall behind rapid dictation updates the way a
  // JS-measured resize did. All that's left is keeping the box scrolled to
  // the bottom once the text passes its max height, so the line currently
  // being dictated stays visible.
  useEffect(() => {
    const el = inputBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [input]);

  const toggleListening = () => {
    if (!SpeechRecognitionAPI) {
      alert(t('ai.speechUnsupported'));
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = speechLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    // Preserve text already in the input before dictation starts
    const baseText = (textareaRef.current?.value ?? '').trimEnd();
    let latestFull = baseText;

    recognition.onstart = () => setListening(true);

    // Rebuild the full transcript from scratch on every event by iterating
    // ALL results from index 0 — do NOT try to incrementally `+=` an
    // accumulator from `e.resultIndex`. The old accumulator approach lost
    // finalized phrases so each new spoken phrase visually REPLACED the
    // previous one (box only ever showed the last few words) instead of
    // appending — `e.results` already holds the complete running transcript
    // for the session, so reading it whole is both simpler and correct.
    recognition.onresult = (e: any) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      const prefix = baseText ? baseText + ' ' : '';
      latestFull = prefix + finalText + interim;
      setInput(latestFull);
    };

    recognition.onend = () => {
      setListening(false);
      if (latestFull.trim() && latestFull.trim() !== baseText.trim() && autoSend) {
        setTimeout(() => send(latestFull.trim()), 400);
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const plan = usePlan();
  const toggle = useCallback(() => {
    setOpen(o => {
      if (o) return false; // always allow closing
      if (!canUseFeature(plan, 'ai')) {
        requestUpgrade({ feature: 'ai' });
        return false;
      }
      return true;
    });
  }, [plan]);
  const close  = useCallback(() => setOpen(false), []);
  useEffect(() => {
    registerAIToggle(toggle);
    return () => registerAIToggle(() => {});
  }, [toggle]);
  useEffect(() => {
    registerAIClose(close);
    return () => registerAIClose(() => {});
  }, [close]);

  return (
    <>
      {/* Panel */}
      {open && (
        <div data-ai-panel style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 89,
          width: 380,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{
            flexShrink: 0, padding: '13px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SFIcon name="sparkles" size={14} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('ai.title')}</p>
              <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                CLAUDE HAIKU
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clear}
                title={t('ai.clearConversation')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}
              >
                <SFIcon name="trash-2" size={13} />
              </button>
            )}
            <button
              onClick={() => setShowSettings(s => !s)}
              title={t('ai.settings')}
              style={{
                background: showSettings ? 'var(--surface-3)' : 'none',
                border: 'none', cursor: 'pointer',
                color: showSettings ? 'var(--text)' : 'var(--text-3)',
                padding: 4, borderRadius: 6, display: 'flex',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <SFIcon name="settings" size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title={t('ai.close')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
            >
              <SFIcon name="x" size={15} />
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
              padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* Usage quota */}
              {quota && (
                <div>
                  <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>{t('ai.usageThisMonth')}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('ai.usageCount', { used: quota.used, limit: quota.limit })}</p>
                </div>
              )}

              {/* Voice language */}
              <div>
                <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>{t('ai.voiceLanguage')}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {LANGS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setSpeechLang(l.id)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'var(--ff-text)',
                        background: speechLang === l.id ? 'var(--accent)' : 'var(--surface-3)',
                        color: speechLang === l.id ? '#0a0a00' : 'var(--text-2)',
                        border: speechLang === l.id ? 'none' : '1px solid var(--border)',
                        fontWeight: speechLang === l.id ? 600 : 400,
                        transition: 'background 0.12s',
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-send */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{t('ai.autoSend')}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t('ai.autoSendDesc')}</p>
                </div>
                <button
                  onClick={() => setAutoSend(a => !a)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                    background: autoSend ? 'var(--accent)' : 'var(--surface-3)',
                    border: autoSend ? 'none' : '1px solid var(--border-2)',
                    cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: autoSend ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: autoSend ? '#0a0a00' : 'var(--text-3)',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ padding: '32px 8px', textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="sparkles" size={22} color="var(--accent)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('ai.emptyTitle')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
                  {t('ai.emptyDesc')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        borderRadius: 9, padding: '8px 13px', cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
                        fontFamily: 'var(--ff-text)', transition: 'border-color 0.12s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => {
                if (msg.role === 'tool') {
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 7,
                      background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                      fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
                    }}>
                      <SFIcon name="zap" size={10} color="var(--accent)" />
                      <span style={{ color: 'var(--accent)' }}>{msg._toolLabel}</span>
                      <span>{t('ai.toolExecuted')}</span>
                    </div>
                  );
                }

                const isUser = msg.role === 'user';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '88%',
                      padding: '9px 13px',
                      borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                      background: isUser ? 'var(--accent)' : 'var(--surface-2)',
                      color: isUser ? '#0a0a00' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.6,
                      border: isUser ? 'none' : '1px solid var(--border)',
                    }}>
                      {isUser ? msg.content : renderMarkdown(msg.content)}
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '4px 14px 14px 14px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(n => (
                    <div key={n} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--text-3)',
                      animation: `ai-dot 1.2s ${n * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: 'var(--surface-2)', border: '1px solid var(--border-2)',
              borderRadius: 13, padding: '8px 8px 8px 13px',
            }}>
              {/* Auto-grow input: a hidden mirror div holds the same text and
                  sizes the grid cell; the textarea overlays the same cell and
                  stretches to fill it. The box height is therefore driven by
                  the actual text via layout — it grows in perfect sync with
                  dictation, with no JS measurement that could lag behind. The
                  outer div caps the height and scrolls once exceeded. */}
              <div ref={inputBoxRef} style={{
                flex: 1, display: 'grid', minHeight: 60, maxHeight: 200, overflowY: 'auto',
              }}>
                <div aria-hidden="true" style={{
                  gridArea: '1 / 1 / 2 / 2',
                  visibility: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontSize: 13, fontFamily: 'var(--ff-text)', lineHeight: 1.5,
                  padding: 0, margin: 0, border: 'none',
                }}>
                  {input + '\n'}
                </div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); setInput(''); }
                  }}
                  placeholder={t('ai.placeholder')}
                  style={{
                    gridArea: '1 / 1 / 2 / 2',
                    width: '100%', border: 'none', background: 'none', resize: 'none',
                    fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)',
                    outline: 'none', lineHeight: 1.5, padding: 0, margin: 0, overflow: 'hidden',
                  }}
                />
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={toggleListening}
                  title={listening ? t('ai.stopListening') : t('ai.dictate')}
                  style={{
                    width: 30, height: 30, borderRadius: 9,
                    background: listening ? 'var(--accent)' : 'var(--surface-3)',
                    border: listening ? '1px solid var(--accent)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, border-color 0.15s',
                    animation: listening ? 'mic-pulse 1.4s ease-in-out infinite' : 'none',
                  }}
                >
                  <SFIcon name="mic" size={13} color={listening ? 'var(--on-accent)' : 'var(--text-3)'} />
                </button>
                <kbd style={{
                  position: 'absolute', bottom: -5, right: -5,
                  fontSize: 8, lineHeight: 1.3, padding: '0 3px',
                  borderRadius: 3, fontFamily: 'var(--ff-mono)', fontWeight: 700,
                  background: listening ? 'var(--on-accent)' : 'var(--surface-2)',
                  color: listening ? 'var(--accent)' : 'var(--text-3)',
                  border: `1px solid ${listening ? 'var(--accent)' : 'var(--border)'}`,
                  pointerEvents: 'none',
                }}>⌃M</kbd>
              </div>
              <button
                onClick={() => { send(input); setInput(''); }}
                disabled={!input.trim() || loading}
                style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  background: input.trim() && !loading ? 'var(--accent)' : 'var(--surface-3)',
                  border: 'none',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.12s',
                }}
              >
                <SFIcon name="send" size={13} color={input.trim() && !loading ? '#000' : 'var(--text-3)'} />
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--ff-mono)', textAlign: 'center' }}>
              {t('ai.inputHint')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
