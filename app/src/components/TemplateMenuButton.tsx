import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon } from './ui';
import { InlineDropdown, ddItem } from '../screens/Travail';

export function TemplateMenuButton({
  icon = 'layout-template',
  loadOptions,
  onLoad,
  onSave,
  loadLabel,
  saveLabel,
}: {
  icon?: string;
  loadOptions: { id: string; name: string; icon: string }[];
  onLoad: (id: string) => void;
  onSave: () => void;
  loadLabel: string;
  saveLabel: string;
}) {
  const { t } = useTranslation();
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [loadSubmenuOpen, setLoadSubmenuOpen] = useState(false);

  const closeAll = () => {
    setAnchorRect(null);
    setLoadSubmenuOpen(false);
  };

  return (
    <>
      <div ref={btnWrapRef} style={{ display: 'inline-flex' }}>
        <SFButton
          variant="ghost"
          icon={icon}
          onClick={() => setAnchorRect(anchorRect ? null : (btnWrapRef.current?.getBoundingClientRect() ?? null))}
          style={{ color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 9 }}
        >
          {t('templateMenuButton')}
        </SFButton>
      </div>
      {anchorRect && !loadSubmenuOpen && (
        <InlineDropdown onClose={closeAll} anchorRect={anchorRect} minWidth={220}>
          {loadOptions.length > 0 ? (
            ddItem(() => setLoadSubmenuOpen(true), (
              <>
                <SFIcon name="folder-down" size={14} color="var(--text-3)" />
                <span style={{ flex: 1 }}>{loadLabel}</span>
                <SFIcon name="chevron-right" size={14} color="var(--text-3)" />
              </>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 10px', opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--ff-text)', color: 'var(--text)' }}>
                <SFIcon name="folder-down" size={14} color="var(--text-3)" />
                <span>{loadLabel}</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', paddingLeft: 22 }}>
                {t('templateMenuNoOptions')}
              </span>
            </div>
          )}
          {ddItem(() => { onSave(); closeAll(); }, (
            <>
              <SFIcon name="layout-template" size={14} color="var(--text-3)" />
              <span>{saveLabel}</span>
            </>
          ))}
        </InlineDropdown>
      )}
      {anchorRect && loadSubmenuOpen && (
        <InlineDropdown onClose={closeAll} anchorRect={anchorRect} minWidth={220}>
          {loadOptions.map(opt => ddItem(() => { onLoad(opt.id); closeAll(); }, (
            <>
              <SFIcon name={opt.icon} size={14} color="var(--text-3)" />
              <span>{opt.name}</span>
            </>
          )))}
        </InlineDropdown>
      )}
    </>
  );
}
