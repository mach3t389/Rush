import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton } from './ui';
import { SYSTEM_KIND_ID, getDefaultVisionSection, type CustomOverviewSection, type OverviewFieldDef, type OverviewSectionKind } from '../data/projectContentStore';

const SECTION_ICONS = ['sticky-note', 'users', 'link', 'target', 'briefcase', 'map-pin', 'phone', 'calendar', 'star', 'flag'];

function makeFieldId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const KIND_LABEL_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFields',
  note: 'overview.sectionKindNote',
  vision: 'overview.sectionKindVision',
  deliverables: 'overview.sectionKindDeliverables',
  checklist: 'overview.sectionKindChecklist',
  gallery: 'overview.sectionKindGallery',
  links: 'overview.sectionKindLinks',
  invoices: 'overview.sectionKindInvoices',
  files: 'overview.sectionKindFiles',
  notes: 'overview.sectionKindNotes',
};
const KIND_DESC_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFieldsDesc',
  note: 'overview.sectionKindNoteDesc',
  vision: 'overview.sectionKindVisionDesc',
  deliverables: 'overview.sectionKindDeliverablesDesc',
  checklist: 'overview.sectionKindChecklistDesc',
  gallery: 'overview.sectionKindGalleryDesc',
  links: 'overview.sectionKindLinksDesc',
  invoices: 'overview.sectionKindInvoicesDesc',
  files: 'overview.sectionKindFilesDesc',
  notes: 'overview.sectionKindNotesDesc',
};

export function OverviewSectionForm({ initial, onSave, onCancel, existingSystemIds = [] }: {
  initial?: CustomOverviewSection;
  onSave: (section: CustomOverviewSection) => void;
  onCancel: () => void;
  /** Ids canoniques des modules système déjà présents dans le projet (ex:
   * customSections.map(s => s.id)) — n'affiche pas ces choix dans le
   * sélecteur de kind, un module système ne peut exister qu'une fois. */
  existingSystemIds?: string[];
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? SECTION_ICONS[0]);
  const [kind, setKind] = useState<OverviewSectionKind>(initial?.kind ?? 'fields');
  const [fields, setFields] = useState<OverviewFieldDef[]>(initial?.fields ?? []);

  const addField = () => setFields(prev => [...prev, { id: makeFieldId(), label: '', multiline: false }]);
  const updateField = (id: string, patch: Partial<OverviewFieldDef>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id));

  const canSave = title.trim().length > 0 && (kind !== 'fields' || fields.some(f => f.label.trim().length > 0));

  const handleSave = () => {
    if (!canSave) return;
    if (!initial && kind === 'vision') {
      // Vision garde toujours sa structure de champs fixe (concept, tonalité,
      // public cible, objectifs, références) — elle n'est pas redéfinissable
      // via l'éditeur de champs générique. Seuls le titre et l'icône sont
      // personnalisables à la (re)création.
      onSave({ ...getDefaultVisionSection(), title: title.trim(), icon });
      return;
    }
    onSave({
      // Un module système (vision/deliverables/invoices/files/notes) garde
      // toujours son id canonique même recréé après suppression, pour que
      // handleDeleteSection/la migration à la lecture (comparaison par id)
      // continuent de le reconnaître.
      id: initial?.id ?? (SYSTEM_KIND_ID[kind] ?? `sec-${Date.now()}`),
      kind,
      title: title.trim(),
      icon,
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('overview.sectionTitlePlaceholder')} style={inputStyle} autoFocus />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SECTION_ICONS.map(ic => (
          <button key={ic} onClick={() => setIcon(ic)}
            style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${icon === ic ? 'var(--accent)' : 'var(--border)'}`, background: icon === ic ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)' }}>
            <SFIcon name={ic} size={14} color={icon === ic ? 'var(--accent)' : 'var(--text-3)'} />
          </button>
        ))}
      </div>

      {!initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as OverviewSectionKind[])
            .concat((['vision', 'deliverables', 'invoices', 'files'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
            .map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border)'}`, background: kind === k ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t(KIND_LABEL_KEY[k])}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(KIND_DESC_KEY[k])}</p>
            </button>
          ))}
        </div>
      )}

      {kind === 'fields' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={f.label} onChange={e => updateField(f.id, { label: e.target.value })} placeholder={t('overview.fieldLabelPlaceholder')} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => updateField(f.id, { multiline: !f.multiline })} title={t('overview.fieldMultiline')}
                style={{ padding: '6px 8px', borderRadius: 7, border: `1px solid ${f.multiline ? 'var(--accent)' : 'var(--border)'}`, background: f.multiline ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', cursor: 'pointer', color: f.multiline ? 'var(--accent)' : 'var(--text-3)' }}>
                <SFIcon name="align-left" size={13} />
              </button>
              <button onClick={() => removeField(f.id)} title={t('overview.removeField')}
                style={{ padding: '6px 8px', borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <SFIcon name="x" size={13} />
              </button>
            </div>
          ))}
          <button onClick={addField} style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
            <SFIcon name="plus" size={12} /> {t('overview.addField')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
          {t('overview.sectionEditorCancel')}
        </button>
        <SFButton variant="primary" size="sm" icon="check" disabled={!canSave} onClick={handleSave}>
          {t('overview.sectionEditorSave')}
        </SFButton>
      </div>
    </div>
  );
}
