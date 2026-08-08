# Réorganisation de la page Intégrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réorganiser la page Paramètres > Intégrations (`app/src/screens/Parametres.tsx`, section `integrations`) en 5 catégories claires, ajouter 5 cartes "bientôt disponible" (Outlook, Rush Sync, MCP, + Dropbox/Zapier déplacés), et retirer les éléments purement factices (Slack, Notion, encart Clé API).

**Architecture:** Un seul écran (`Parametres.tsx`) contient toute la logique de rendu de la section `integrations` inline (pas de sous-composants séparés pour les catégories, cohérent avec le style large-fichier existant de l'app). Le changement est un remaniement JSX + nouvelles clés i18n, sans nouvelle logique métier ni nouveau store — toutes les intégrations actives (Google Calendar, Northbook, Premiere Pro, DaVinci Resolve) gardent leur code de rendu identique, seulement déplacé.

**Tech Stack:** React 19 + TypeScript, i18next (`react-i18next`), styles inline (`style={{}}`), tokens CSS (`var(--...)`).

## Global Constraints

- Aucun texte utilisateur codé en dur pour les descriptions — tout passe par `t('settings.<key>')`, clés ajoutées dans **les deux** `app/src/locales/fr.json` et `app/src/locales/en.json` (règle CLAUDE.md).
- Les noms propres (Outlook, Rush Sync, MCP, Slack, etc. — déjà le cas pour Dropbox/Zapier existants) restent en chaîne dure, comme le fait déjà le code existant pour Slack/Notion/Dropbox/Zapier.
- Aucune connexion fonctionnelle nouvelle : Outlook, Rush Sync, MCP restent des cartes visuelles "bientôt disponible" (`opacity: 0.5`, badge `t('settings.soon')`), sans handler `onClick`.
- Le code de rendu de Google Calendar (`<GoogleCalendarCard />`), Northbook (`<NorthbookIntegrationCard />`), Premiere Pro et DaVinci Resolve reste identique — seul leur emplacement dans le JSX change.
- Ordre des catégories (du haut vers le bas) : Calendrier → Fichiers & synchronisation → Montage vidéo (Plugins) → Comptabilité → Automatisation.

---

### Task 1: Réorganiser la section Intégrations par catégories

**Files:**
- Modify: `app/src/screens/Parametres.tsx:2389-2517` (bloc `{activeSection === 'integrations' && (...)}`)
- Modify: `app/src/locales/fr.json` (namespace `settings`, autour des clés `integrationsTitle`/`integrationSlackDesc`/etc., lignes ~2211-2256)
- Modify: `app/src/locales/en.json` (mêmes clés, namespace `settings`)

**Interfaces:**
- Consumes : `GoogleCalendarCard` (composant existant, déjà défini plus haut dans `Parametres.tsx`), `NorthbookIntegrationCard` (composant existant, déjà défini plus haut dans `Parametres.tsx`), `SFIcon` (import existant), `useTranslation` (déjà importé).
- Produces : rien de consommé par d'autres fichiers — ce bloc JSX est une feuille de l'arbre de rendu.

- [ ] **Step 1: Ajouter les nouvelles clés i18n dans `fr.json`**

Dans `app/src/locales/fr.json`, namespace `settings`, retirer les lignes suivantes (elles deviennent orphelines) :
```json
"integrationSlackDesc": "Recevez des notifications Rushflow directement dans vos canaux.",
"integrationNotionDesc": "Exportez vos projets et tâches vers Notion.",
```
et retirer aussi (encart Clé API supprimé) :
```json
"howItConnects": "Comment ça se connecte",
"howItConnectsDesc": "...",
"apiKey": "...",
"copy": "..."
```
(Lire les valeurs exactes de ces 4 clés dans le fichier avant suppression — elles ne sont utilisées nulle part ailleurs, confirmé par recherche `t('settings.apiKey')` etc. dans `app/src/`.)

Ajouter ces nouvelles clés (garder `integrationDropboxDesc` et `integrationZapierDesc` existantes telles quelles) :
```json
"integrationsCategoryCalendar": "Calendrier",
"integrationsCategoryCalendarDesc": "Synchronisez vos événements avec votre calendrier externe.",
"integrationsCategoryFiles": "Fichiers & synchronisation",
"integrationsCategoryFilesDesc": "Connectez vos fichiers Rushflow à votre espace de stockage.",
"integrationsCategoryAccounting": "Comptabilité",
"integrationsCategoryAccountingDesc": "Synchronisez vos factures et données financières.",
"integrationsCategoryAutomation": "Automatisation",
"integrationsCategoryAutomationDesc": "Connectez Rushflow à vos outils d'automatisation et à des assistants IA externes.",
"integrationOutlookDesc": "Synchronisez vos événements avec Outlook et Microsoft 365.",
"integrationRushSyncDesc": "Accédez aux fichiers de votre organisation directement depuis l'explorateur de fichiers de votre ordinateur.",
"integrationMcpDesc": "Connectez des assistants IA externes (Claude, etc.) pour créer et gérer vos tâches Rushflow directement."
```

- [ ] **Step 2: Ajouter les mêmes clés dans `en.json`**

Dans `app/src/locales/en.json`, namespace `settings`, retirer les 6 clés orphelines équivalentes (`integrationSlackDesc`, `integrationNotionDesc`, `howItConnects`, `howItConnectsDesc`, `apiKey`, `copy`), puis ajouter les traductions anglaises :
```json
"integrationsCategoryCalendar": "Calendar",
"integrationsCategoryCalendarDesc": "Sync your events with your external calendar.",
"integrationsCategoryFiles": "Files & sync",
"integrationsCategoryFilesDesc": "Connect your Rushflow files to your storage space.",
"integrationsCategoryAccounting": "Accounting",
"integrationsCategoryAccountingDesc": "Sync your invoices and financial data.",
"integrationsCategoryAutomation": "Automation",
"integrationsCategoryAutomationDesc": "Connect Rushflow to your automation tools and external AI assistants.",
"integrationOutlookDesc": "Sync your events with Outlook and Microsoft 365.",
"integrationRushSyncDesc": "Access your organization's files directly from your computer's file explorer.",
"integrationMcpDesc": "Connect external AI assistants (Claude, etc.) to create and manage your Rushflow tasks directly."
```

- [ ] **Step 3: Remplacer le bloc JSX de la section Intégrations**

Dans `app/src/screens/Parametres.tsx`, remplacer tout le bloc allant de la ligne `{activeSection === 'integrations' && (` (ligne 2389) jusqu'à sa fermeture `)}` (ligne 2517) par :

```tsx
        {activeSection === 'integrations' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.integrationsTitle')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.integrationsDesc')}</p>
            </div>

            {/* ── Calendrier ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 15 }}>{t('settings.integrationsCategoryCalendar')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('settings.integrationsCategoryCalendarDesc')}</p>
              </div>
              <GoogleCalendarCard />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                {[
                  { name: 'Outlook / Microsoft 365', desc: t('settings.integrationOutlookDesc'), color: '#0078D4' },
                ].map(app => (
                  <div key={app.name} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: app.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{app.desc}</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{t('settings.soon')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Fichiers & synchronisation ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 15 }}>{t('settings.integrationsCategoryFiles')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('settings.integrationsCategoryFilesDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { name: 'Dropbox', desc: t('settings.integrationDropboxDesc'), color: '#0061FF' },
                  { name: 'Rush Sync', desc: t('settings.integrationRushSyncDesc'), color: 'var(--surface-3)' },
                ].map(app => (
                  <div key={app.name} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: app.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{app.desc}</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{t('settings.soon')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Montage vidéo (Plugins) ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 15 }}>{t('settings.pluginsTitle')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('settings.pluginsDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Premiere Pro */}
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#00005b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--ff-text)', fontWeight: 900, fontSize: 15, color: '#9999ff', letterSpacing: '-1px' }}>Pr</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Adobe Premiere Pro</p>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.25)', color: 'var(--accent)', letterSpacing: '0.06em' }}>{t('settings.comingSoon')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.premiereDesc')}</p>
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.panelFeatures')}</p>
                    {[
                      { icon: 'message-square', text: t('settings.premiereFeatureComments') },
                      { icon: 'clock', text: t('settings.premiereFeatureTimecode') },
                      { icon: 'check-circle', text: t('settings.premiereFeatureResolve') },
                      { icon: 'layers', text: t('settings.premiereFeatureAccess') },
                    ].map(item => (
                      <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button disabled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--ff-text)', fontWeight: 500, opacity: 0.6 }}>
                      <SFIcon name="download" size={14} color="var(--text-3)" />
                      {t('settings.downloadPlugin')}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('settings.premiereCompat')}</p>
                  </div>
                </div>

                {/* DaVinci Resolve */}
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                      <span style={{ fontFamily: 'var(--ff-text)', fontWeight: 900, fontSize: 13, color: '#e8b4a0', letterSpacing: '-0.5px' }}>Da</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>DaVinci Resolve</p>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.25)', color: 'var(--accent)', letterSpacing: '0.06em' }}>{t('settings.comingSoon')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.resolveDesc')}</p>
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.features')}</p>
                    {[
                      { icon: 'message-square', text: t('settings.resolveFeaturePanel') },
                      { icon: 'clock', text: t('settings.resolveFeatureTimecode') },
                      { icon: 'refresh-cw', text: t('settings.resolveFeatureSync') },
                    ].map(item => (
                      <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button disabled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--ff-text)', fontWeight: 500, opacity: 0.6 }}>
                      <SFIcon name="download" size={14} color="var(--text-3)" />
                      {t('settings.downloadScript')}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('settings.resolveCompat')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Comptabilité ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 15 }}>{t('settings.integrationsCategoryAccounting')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('settings.integrationsCategoryAccountingDesc')}</p>
              </div>
              <NorthbookIntegrationCard />
            </div>

            {/* ── Automatisation ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 15 }}>{t('settings.integrationsCategoryAutomation')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('settings.integrationsCategoryAutomationDesc')}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { name: 'Zapier', desc: t('settings.integrationZapierDesc'), color: '#FF4A00' },
                  { name: 'MCP', desc: t('settings.integrationMcpDesc'), color: 'var(--surface-3)' },
                ].map(app => (
                  <div key={app.name} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: app.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{app.desc}</p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{t('settings.soon')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Vérifier qu'il ne reste aucune référence orpheline**

Run: `grep -rn "integrationSlackDesc\|integrationNotionDesc\|settings\.howItConnects\|settings\.apiKey\|settings\.copy\b" app/src/`
Expected: aucune correspondance (les clés ont bien été retirées du JSX et des deux fichiers de locale).

- [ ] **Step 5: Vérifier le typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 erreur.

- [ ] **Step 6: Vérification visuelle en direct**

Démarrer le serveur de dev (`npm run dev` depuis `app/`), naviguer vers Paramètres > Intégrations, et confirmer visuellement :
- Ordre des catégories : Calendrier, Fichiers & synchronisation, Montage vidéo (Plugins), Comptabilité, Automatisation
- Google Calendar et Northbook fonctionnent toujours normalement (aucune régression de connexion/déconnexion)
- Premiere Pro et DaVinci Resolve sont côte à côte (grille 2 colonnes), pas empilés
- Aucune trace de Slack, Notion, ni de l'encart Clé API
- Les nouvelles cartes (Outlook, Rush Sync, MCP) s'affichent avec le badge "BIENTÔT" et l'opacité réduite, cohérentes visuellement avec Dropbox/Zapier

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(parametres): réorganiser la page Intégrations par catégories"
```
