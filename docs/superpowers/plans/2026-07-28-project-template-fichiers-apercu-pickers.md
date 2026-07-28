# Sélecteurs Fichiers/Aperçu + ouverture directe dans le modèle Projet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ajouter à `TemplateProjectView` (éditeur du modèle Projet composite, Modèles → Projets → Modifier) deux onglets Aperçu/Fichiers avec sélecteur, sur le même pattern que l'onglet Tâches déjà existant, plus un bouton "Ouvrir" sur les 3 onglets pour éditer directement le modèle lié.

**Architecture:** Voir `docs/superpowers/specs/2026-07-28-project-template-fichiers-apercu-pickers-design.md`. `TemplateProjectView` gagne `defaultOverviewTemplateId`/`defaultFolderStructureId` en state local (miroir exact de `tasksTemplateId`), avec le même popup de sélection. Le bouton "Ouvrir" appelle `openTemplateDraft` (déjà construit, chantier précédent) — passé en prop depuis `Modeles()`.

## Global Constraints

- `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) doit rester à 0 erreur après chaque tâche.
- Ordre des onglets : `Vue d'ensemble / Aperçu / Tâches / Fichiers` (aligné sur l'ordre des vrais onglets d'un projet, déjà la convention établie ailleurs).
- Ne pas dupliquer le contenu du modèle lié — seule sa référence (id) est stockée sur le `ProjectTemplate`.
- Ne rien changer au comportement existant de l'onglet Tâches au-delà de l'ajout du bouton "Ouvrir" (Task 2).

---

### Task 1: Onglets Aperçu et Fichiers dans `TemplateProjectView`

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Produces: `ProjectTemplate.defaultOverviewTemplateId`/`defaultFolderStructureId` deviennent réellement écrits (le champ existe déjà dans `templates.ts`, aucun changement de type nécessaire).

- [ ] **Step 1:** Dans `TemplateProjectView` (fonction commençant ligne ~1098), ajouter le state miroir de `tasksTemplateId`/`showTasksPicker` :
  ```ts
  const [overviewTemplateId, setOverviewTemplateId] = useState<string | undefined>(initialTpl.defaultOverviewTemplateId);
  const [showOverviewPicker, setShowOverviewPicker] = useState(false);
  const [folderStructureId, setFolderStructureId] = useState<string | undefined>(initialTpl.defaultFolderStructureId);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  ```
  Et les listes/résolutions correspondantes, à côté de `allTasksTpls`/`linkedTasksTpl`/`resolvedSections` :
  ```ts
  const allOverviewTpls = loadAllResourceTemplates().filter(r => r.type === 'overview');
  const linkedOverviewTpl = overviewTemplateId ? allOverviewTpls.find(r => r.id === overviewTemplateId) : undefined;
  const resolvedOverviewSections = linkedOverviewTpl?.overviewSections ?? [];

  const allFileTpls = loadAllResourceTemplates().filter(r => r.type === 'file');
  const linkedFileTpl = folderStructureId ? allFileTpls.find(r => r.id === folderStructureId) : undefined;
  const resolvedFolders = linkedFileTpl?.folderStructure ?? [];
  ```

- [ ] **Step 2:** Dans `handleSave`, ajouter les deux champs au patch envoyé :
  ```ts
  const handleSave = () => {
    onSave({
      ...initialTpl,
      name: tplName,
      description: tplDescription,
      tasksTemplateId,
      defaultOverviewTemplateId: overviewTemplateId,
      defaultFolderStructureId: folderStructureId,
    });
    ...
  ```

- [ ] **Step 3:** Étendre le tableau d'onglets et son type (`activeTab`) :
  ```ts
  const [activeTab, setActiveTab] = useState<'overview' | 'apercu' | 'tasks' | 'file'>('tasks');
  ```
  ```ts
  {([
    { key: 'overview', label: "Vue d'ensemble" },
    { key: 'apercu',   label: 'Aperçu' },
    { key: 'tasks',    label: 'Tâches' },
    { key: 'file',     label: 'Fichiers' },
  ] as const).map(tab => ( /* inchangé */ ))}
  ```
  (Le nom de clé `apercu` — pas `overview` — pour éviter toute confusion avec l'onglet `overview` déjà existant qui est en fait "Vue d'ensemble" du modèle Projet lui-même, pas le sous-modèle d'Aperçu du projet.)

- [ ] **Step 4:** Ajouter le bloc `activeTab === 'apercu'`, juste après le bloc `activeTab === 'tasks'` existant (avant sa balise fermante `)}`configurée précédemment, ou juste après) :
  ```tsx
  {activeTab === 'apercu' && (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Structure d'Aperçu</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {linkedOverviewTpl
                ? <>Lié au modèle d'Aperçu « {linkedOverviewTpl.name} ».</>
                : "Aucun modèle d'Aperçu lié — le projet créé n'aura aucune section personnalisée par défaut."}
            </p>
          </div>
          <SFButton variant="secondary" size="sm" icon="repeat" onClick={() => setShowOverviewPicker(true)}>Changer de structure d'Aperçu</SFButton>
        </div>
        {resolvedOverviewSections.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            <SFIcon name="layout-grid" size={28} color="var(--border-2)" />
            <p style={{ marginTop: 12 }}>Aucune section — reliez un modèle d'Aperçu pour en afficher ici.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resolvedOverviewSections.map(sec => (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <SFIcon name={sec.icon ?? 'layout-grid'} size={14} color="var(--text-3)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{sec.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showOverviewPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowOverviewPicker(false); }}>
          <div style={{ width: 420, maxHeight: '70vh', background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Structure d'Aperçu</p>
              <button onClick={() => setShowOverviewPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                <SFIcon name="x" size={15} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => { setOverviewTemplateId(undefined); setDirty(true); setShowOverviewPicker(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${!overviewTemplateId ? 'var(--border-2)' : 'var(--border)'}`, background: !overviewTemplateId ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name="circle-slash" size={14} color="var(--text-3)" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Aucune</p>
              </button>
              {allOverviewTpls.map(rt => (
                <button key={rt.id} onClick={() => { setOverviewTemplateId(rt.id); setDirty(true); setShowOverviewPicker(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${overviewTemplateId === rt.id ? 'var(--border-2)' : 'var(--border)'}`, background: overviewTemplateId === rt.id ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: rt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name={rt.icon} size={14} color="rgba(255,255,255,0.9)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{rt.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{(rt.overviewSections ?? []).length} sections</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )}
  ```

- [ ] **Step 5:** Ajouter le bloc `activeTab === 'file'`, même structure, adapté à l'arborescence de dossiers (récursif) :
  ```tsx
  {activeTab === 'file' && (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Structure de fichiers</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {linkedFileTpl
                ? <>Liée au modèle de fichiers « {linkedFileTpl.name} ».</>
                : 'Aucun modèle de fichiers lié — le projet créé n\'aura aucun dossier par défaut.'}
            </p>
          </div>
          <SFButton variant="secondary" size="sm" icon="repeat" onClick={() => setShowFolderPicker(true)}>Changer de structure de fichiers</SFButton>
        </div>
        {resolvedFolders.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            <SFIcon name="folder" size={28} color="var(--border-2)" />
            <p style={{ marginTop: 12 }}>Aucun dossier — reliez un modèle de fichiers pour en afficher ici.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(function renderFolders(nodes: typeof resolvedFolders, depth: number): React.ReactNode {
              return nodes.map((node, i) => (
                <React.Fragment key={node.id ?? `${depth}-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', paddingLeft: 10 + depth * 20, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <SFIcon name="folder" size={13} color="var(--text-3)" />
                    <span style={{ fontSize: 13 }}>{node.name}</span>
                  </div>
                  {node.children && node.children.length > 0 && renderFolders(node.children, depth + 1)}
                </React.Fragment>
              ));
            })(resolvedFolders, 0)}
          </div>
        )}
      </div>

      {showFolderPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowFolderPicker(false); }}>
          <div style={{ width: 420, maxHeight: '70vh', background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Structure de fichiers</p>
              <button onClick={() => setShowFolderPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                <SFIcon name="x" size={15} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => { setFolderStructureId(undefined); setDirty(true); setShowFolderPicker(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${!folderStructureId ? 'var(--border-2)' : 'var(--border)'}`, background: !folderStructureId ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name="circle-slash" size={14} color="var(--text-3)" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Aucune</p>
              </button>
              {allFileTpls.map(rt => (
                <button key={rt.id} onClick={() => { setFolderStructureId(rt.id); setDirty(true); setShowFolderPicker(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${folderStructureId === rt.id ? 'var(--border-2)' : 'var(--border)'}`, background: folderStructureId === rt.id ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: rt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name={rt.icon} size={14} color="rgba(255,255,255,0.9)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{rt.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{(rt.folderStructure ?? []).length} dossier(s) racine</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )}
  ```
  **Note pour l'implémenteur :** `resolvedFolders`'s type est celui de `ResourceTemplate.folderStructure` (`FolderNode[]`, `{id, name, children?}` — vérifier le nom exact du type importé/utilisé ailleurs dans ce fichier pour l'arborescence de fichiers avant d'écrire `renderFolders`). Le rendu récursif en IIFE est un choix pragmatique pour rester dans le même fichier/bloc — si le style du fichier préfère un composant nommé séparé, l'adapter, mais ne pas complexifier au-delà de ce qui est montré.

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 7:** Vérifier en direct (session démo) : Modèles → Projets → ouvrir un modèle → onglets "Vue d'ensemble / Aperçu / Tâches / Fichiers" dans cet ordre. Sur Aperçu, "Changer de structure d'Aperçu" → choisir un modèle → sauvegarder → rouvrir le modèle Projet → la sélection a persisté. Même vérification pour Fichiers (arborescence affichée, sélection persistée).

- [ ] **Step 8:** Commit:
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(templates): add Fichiers/Aperçu structure pickers to the Project template editor"
  ```

---

### Task 2: Bouton "Ouvrir" sur les 3 onglets (Aperçu/Tâches/Fichiers)

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: `openTemplateDraft` (déjà défini dans `Modeles()`, chantier précédent) — passé en nouvelle prop `onOpenResourceTemplate: (tpl: ResourceTemplate) => void` à `TemplateProjectView`.

- [ ] **Step 1:** Élargir la signature de `TemplateProjectView` :
  ```ts
  function TemplateProjectView({ tpl: initialTpl, onClose, onSave, onOpenResourceTemplate }: {
    tpl: ProjectTemplate;
    onClose: () => void;
    onSave: (updated: ProjectTemplate) => void;
    onOpenResourceTemplate: (tpl: ResourceTemplate) => void;
  }) {
  ```

- [ ] **Step 2:** Au call site (`Modeles()`, autour de la ligne 2459-2468), passer la prop :
  ```tsx
  {previewTpl && (
    <TemplateProjectView
      tpl={previewTpl}
      onClose={() => setPreviewTpl(null)}
      onSave={updated => {
        saveTpl(updated);
        setPreviewTpl(updated);
      }}
      onOpenResourceTemplate={tpl => { setPreviewTpl(null); void openTemplateDraft(tpl); }}
    />
  )}
  ```
  (`setPreviewTpl(null)` avant `openTemplateDraft` pour fermer l'éditeur du modèle Projet — sinon les deux plein-écrans se superposeraient.)

- [ ] **Step 3:** Ajouter un bouton "Ouvrir" à côté du nom du modèle lié sur les 3 onglets — pour Tâches (bloc existant, à modifier) :
  ```tsx
  <div>
    <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Structure de tâches</p>
    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
      {linkedTasksTpl
        ? <>Liée au modèle de tâches « {linkedTasksTpl.name} ».
            <button onClick={() => onOpenResourceTemplate(linkedTasksTpl)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="external-link" size={11} />Ouvrir
            </button>
          </>
        : 'Aucun modèle de tâches lié — le projet créé n\'aura aucune section par défaut.'}
    </p>
  </div>
  ```
  Répéter le même ajout de bouton pour Aperçu (`linkedOverviewTpl`) et Fichiers (`linkedFileTpl`) construits en Task 1, dans leur `<p>` de description respectif, même style.

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 5:** Vérifier en direct (session démo) : sur chacun des 3 onglets (Aperçu/Tâches/Fichiers) avec un modèle lié, cliquer "Ouvrir" → l'éditeur du modèle Projet se ferme, l'app navigue vers le vrai écran (brouillon) du modèle lié, son contenu est déjà présent. Modifier quelque chose, "Enregistrer comme modèle" (bouton déjà existant depuis le chantier précédent), revenir dans Modèles → Projets → rouvrir le même modèle Projet → l'onglet correspondant reflète le changement (confirme la synchronisation par référence, sans rien recopier).

- [ ] **Step 6:** Commit:
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(templates): add 'Ouvrir' shortcut to edit a linked sub-template directly from the Project template editor"
  ```

---

## Self-Review

- **Couverture spec :** sélecteurs Fichiers/Aperçu (Task 1), ouverture directe synchronisée par référence (Task 2) — tout couvert.
- **Ordre des dépendances :** Task 2 dépend de Task 1 (a besoin de `linkedOverviewTpl`/`linkedFileTpl` pour ajouter leurs boutons "Ouvrir").
- **Aucune nouvelle table Supabase** — les deux champs existent déjà dans `ProjectTemplate` depuis le chantier composite, seule leur écriture manquait.
