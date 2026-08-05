# New-Project Wizard Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `NewProjectModal` (`app/src/components/ProjectsListView.tsx`) from 3 steps (`start`/`info`/`team`) into 4 steps (`identity`/`client`/`template`/`team`), compact the template grid to match the Client/Membres chip style, and add discreet plan-gating locks for custom templates and the Finance toggle.

**Architecture:** Single-file refactor. No new components, no new stores, no change to `createProject`/`create()` submission logic. Existing JSX blocks are relocated between steps; only the template-grid markup and the feature-toggle markup are visually rewritten.

**Tech Stack:** React 19 + TypeScript, inline `style={}`, i18next.

## Global Constraints

- No new fields sent to `createProject` — see `docs/superpowers/specs/2026-08-04-new-project-wizard-restructure-design.md`.
- Chip grids use exactly: `gridTemplateColumns: 'repeat(3, 1fr)'`, `gap: 8`, chip `padding: '8px 10px'`, `borderRadius: 9`, `border: '1.5px solid ...'`, circular pastille `22×22`.
- No card in a selection grid may contain multi-line text (description, tags, counts) — that content moves to a detail strip below the grid, shown only when something is selected.
- Locks are discreet: a small `lock` icon (size 11) replacing the checkmark position, no forced modal — `requestUpgrade({ feature })` fires only on click.
- All user-facing strings go through `t('projects.xxx')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json`.
- After every task: `npx tsc --noEmit -p tsconfig.app.json` from `app/` must be clean.

---

### Task 1: Step type, navigation, and header restructure

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:37` (Step type)
- Modify: `app/src/components/ProjectsListView.tsx:194-210` (canNext/next/back)
- Modify: `app/src/components/ProjectsListView.tsx:355-376` (STEP_ORDER/isStepValid/maxReachableIndex)
- Modify: `app/src/components/ProjectsListView.tsx:384-397` (header subtitle + StepDot row)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (new step labels/subtitles)

**Interfaces:**
- Consumes: existing `name`, `isPersonalProject`, `clientId`, `newClientName`, `clients` state (unchanged, declared earlier in the component).
- Produces: `type Step = 'identity' | 'client' | 'template' | 'team'`, consumed by Task 2 and Task 3's `{step === '...' && (...)}` blocks and by the footer's `step === 'team'` check (unchanged, already keys off the last step).

- [ ] **Step 1: Change the `Step` type and `STEP_ORDER`**

At line 37, replace:
```ts
type Step = 'start' | 'info' | 'team';
```
with:
```ts
type Step = 'identity' | 'client' | 'template' | 'team';
```

At line 355, replace:
```ts
  const STEP_ORDER: Step[] = ['start', 'info', 'team'];
```
with:
```ts
  const STEP_ORDER: Step[] = ['identity', 'client', 'template', 'team'];
```

- [ ] **Step 2: Split `canNext`/`isStepValid` per step**

At line 194-196, replace:
```ts
  const canNext = step === 'start' ? true
    : step === 'info' ? name.trim().length > 0 && (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0)
    : true; // 'team' : aucune sélection obligatoire — un projet peut n'avoir aucun membre assigné
```
with:
```ts
  const canNext = step === 'identity' ? name.trim().length > 0
    : step === 'client' ? (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0)
    : true; // 'template'/'team' : aucune sélection obligatoire
```

At line 361-364, replace:
```ts
  const isStepValid = (s: Step): boolean => {
    if (s === 'info') return name.trim().length > 0 && (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0);
    return true; // 'start'/'team' : jamais bloquantes
  };
```
with:
```ts
  const isStepValid = (s: Step): boolean => {
    if (s === 'identity') return name.trim().length > 0;
    if (s === 'client') return isPersonalProject || clients.length > 0 || newClientName.trim().length > 0;
    return true; // 'template'/'team' : jamais bloquantes
  };
```

- [ ] **Step 3: Update `next()`/`back()` for the 4-step chain**

At line 198-210, replace:
```ts
  const next = () => {
    if (step === 'start') {
      setStep('info');
    } else if (step === 'info') {
      setStep('team');
    } else {
      create();
    }
  };
  const back = () => {
    if (step === 'info') setStep('start');
    else if (step === 'team') setStep('info');
  };
```
with:
```ts
  const next = () => {
    if (step === 'identity') setStep('client');
    else if (step === 'client') setStep('template');
    else if (step === 'template') setStep('team');
    else create();
  };
  const back = () => {
    if (step === 'client') setStep('identity');
    else if (step === 'template') setStep('client');
    else if (step === 'team') setStep('template');
  };
```

- [ ] **Step 4: Update the footer's cancel/back button condition**

At line 884 and 887, `step === 'start'` becomes `step === 'identity'` (both occurrences — the `onClick` ternary and the label ternary):
```tsx
          <button
            onClick={step === 'identity' ? onClose : back}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 18px', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
          >
            {step === 'identity' ? t('projects.cancel') : t('projects.back')}
          </button>
```

- [ ] **Step 5: Add new i18n keys**

In `app/src/locales/fr.json`, in the `projects` namespace, add (keep existing keys `stepTeam`/`stepTeamSubtitle`/`createProject`/`continue`/`cancel`/`back` untouched):
```json
"stepIdentity": "Identité",
"stepIdentitySubtitle": "Nommez et caractérisez votre projet",
"stepClient": "Client",
"stepClientSubtitle": "À quel client ce projet est-il rattaché ?",
"stepTemplate": "Modèle",
"stepTemplateSubtitle": "Choisissez un point de départ et les fonctionnalités activées"
```
Remove the now-unused `stepStart`/`stepStartSubtitle`/`stepInfo`/`stepInfoSubtitle` keys (grep the file first to confirm no other `.tsx` still references them before deleting).

In `app/src/locales/en.json`, add the English equivalents under the same keys:
```json
"stepIdentity": "Identity",
"stepIdentitySubtitle": "Name and characterize your project",
"stepClient": "Client",
"stepClientSubtitle": "Which client is this project for?",
"stepTemplate": "Template",
"stepTemplateSubtitle": "Pick a starting point and enabled features"
```
Remove the corresponding old keys there too.

- [ ] **Step 6: Rewrite the header subtitle + StepDot row**

At line 387-389, replace:
```tsx
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 'start' ? t('projects.stepStartSubtitle') : step === 'info' ? t('projects.stepInfoSubtitle') : t('projects.stepTeamSubtitle')}
            </p>
```
with:
```tsx
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 'identity' ? t('projects.stepIdentitySubtitle')
                : step === 'client' ? t('projects.stepClientSubtitle')
                : step === 'template' ? t('projects.stepTemplateSubtitle')
                : t('projects.stepTeamSubtitle')}
            </p>
```

At line 391-397, replace the `StepDot` row:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StepDot label={t('projects.stepStart')} num={1} active={step === 'start'} done={stepDone('start')} reachable={isStepReachable('start')} onClick={() => setStep('start')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepInfo')} num={2} active={step === 'info'} done={stepDone('info')} reachable={isStepReachable('info')} onClick={() => setStep('info')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepTeam')} num={3} active={step === 'team'} done={stepDone('team')} reachable={isStepReachable('team')} onClick={() => setStep('team')} />
          </div>
```
with:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StepDot label={t('projects.stepIdentity')} num={1} active={step === 'identity'} done={stepDone('identity')} reachable={isStepReachable('identity')} onClick={() => setStep('identity')} />
            <div style={{ width: 14, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepClient')} num={2} active={step === 'client'} done={stepDone('client')} reachable={isStepReachable('client')} onClick={() => setStep('client')} />
            <div style={{ width: 14, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepTemplate')} num={3} active={step === 'template'} done={stepDone('template')} reachable={isStepReachable('template')} onClick={() => setStep('template')} />
            <div style={{ width: 14, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepTeam')} num={4} active={step === 'team'} done={stepDone('team')} reachable={isStepReachable('team')} onClick={() => setStep('team')} />
          </div>
```
(`gap`/divider width trimmed from 16→12/14 so 4 dots fit the same 820px modal width without crowding — still comfortably within it.)

- [ ] **Step 7: Verify — do NOT move any step body JSX yet**

Run `npx tsc --noEmit -p tsconfig.app.json` from `app/`. Expect **errors** at this point referencing `step === 'start'` / `step === 'info'` inside the still-unmoved body blocks (lines ~407, ~472, ~705) — this is expected, Task 2 fixes it. Confirm the errors are ONLY in those three body-block conditions (no other unexpected errors). Do not fix them in this task.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "refactor(wizard): restructure step type into identity/client/template/team"
```

---

### Task 2: Split step bodies — Identity, Client, and reassemble Template (structure only, no visual rewrite yet)

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:406-702` (old `start`/`info` bodies → new `identity`/`client`/`template` bodies)

**Interfaces:**
- Consumes: `Step` type from Task 1, all existing field state (`name`, `color`, `deliveryDate`, `budget`, `description`, client-picker state, `templates`, `templateId`, `calendarEnabled`/`filesEnabled`/`financeEnabled`).
- Produces: three `{step === 'identity' | 'client' | 'template' && (...)}` blocks in this order, positioned before the existing `{step === 'team' && (...)}` block. Task 3 rewrites only the *inside* of the `template` block's markup — this task only relocates content and fixes the `step === '...'` guards so the file type-checks.

- [ ] **Step 1: Extract Identity fields into their own step block**

The old `info` block (line 472-702) currently starts with the name field, then the client picker, then the color/date/budget row, then description, then features. Split it:

Replace the opening guard at line 472 `{step === 'info' && (` with two separate blocks. The **first** new block (`identity`) contains ONLY: the name field (lines 474-483), the color/date/budget grid (lines 585-652), and the description field (lines 654-663) — in that order, name first, then color/date/budget, then description:

```tsx
          {/* Step 1: Identity */}
          {step === 'identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.projectNameLabel')} {t('common.required')}</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('projects.projectNamePlaceholder')}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, auto) 1fr 1fr', gap: 14, alignItems: 'start' }}>
                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.projectColor')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {PROJECT_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: c,
                          border: color === c ? '2px solid white' : '2px solid transparent',
                          outline: color === c ? `2px solid ${c}` : 'none',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.deliveryDate')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={e => { setDateOpen(o => !o); setDateRect((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)',
                        background: 'var(--surface-2)', cursor: 'pointer',
                        fontFamily: 'var(--ff-mono)', fontSize: 12,
                        color: deliveryDate ? 'var(--text)' : 'var(--text-3)',
                        width: '100%', boxSizing: 'border-box', justifyContent: 'flex-start',
                      }}
                    >
                      <SFIcon name="calendar" size={13} color="var(--text-3)" />
                      {deliveryDate ? formatDisplay(deliveryDate) : t('projects.chooseDate')}
                    </button>
                    {deliveryDate && (
                      <button
                        onClick={() => setDeliveryDate('')}
                        title={t('projects.removeDate')}
                        style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'var(--surface-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0 }}
                      >
                        <SFIcon name="x" size={12} />
                      </button>
                    )}
                  </div>
                  {dateOpen && (
                    <DatePickerDropdown
                      value={deliveryDate}
                      onChange={v => { setDeliveryDate(v); setDateOpen(false); }}
                      onClose={() => setDateOpen(false)}
                      anchorRect={dateRect}
                      zIndex={410}
                    />
                  )}
                </div>

                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.budgetLabel')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                  <input
                    value={budget}
                    onChange={e => setBudget(e.target.value)}
                    placeholder={t('projects.budget')}
                    inputMode="numeric"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.description')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('projects.projectName')}
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </div>
          )}
```

- [ ] **Step 2: Move the client picker into its own step block**

The **second** new block (`client`) contains the client-picker markup that was at lines 485-583 (the `<div>` starting with the `CLIENT` label through the closing `</div>` of the clients grid — everything between the old name field and the old color/date/budget grid), unchanged internally:

```tsx
          {/* Step 2: Client */}
          {step === 'client' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.client')}</label>
                {isPersonalProject && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{t('projects.personalProjectHint')}</p>
                )}
                {clients.length === 0 ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                      <button
                        type="button"
                        onClick={() => { setIsPersonalProject(true); setClientId(''); setNewClientName(''); setFinanceEnabled(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                          border: `1.5px solid ${isPersonalProject ? 'var(--accent)' : 'var(--border)'}`,
                          background: isPersonalProject ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                        }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--text-3)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: isPersonalProject ? 'var(--text)' : 'var(--text-2)' }}>{t('projects.noClientOption')}</span>
                        {isPersonalProject && <SFIcon name="check" size={13} color="var(--accent)" />}
                      </button>
                    </div>
                    {!isPersonalProject && (
                      <div>
                        <input
                          value={newClientName}
                          onChange={e => setNewClientName(e.target.value)}
                          placeholder={t('clients.placeholder')}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{t('projects.firstClientHint')}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {clients.length > 8 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 8 }}>
                        <SFIcon name="search" size={13} color="var(--text-3)" />
                        <input
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          placeholder={t('projects.searchClientPlaceholder')}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
                        />
                      </div>
                    )}
                    <div style={{ maxHeight: clients.length > 8 ? 220 : undefined, overflowY: clients.length > 8 ? 'auto' : 'visible', paddingRight: 4 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => { setIsPersonalProject(true); setClientId(''); setNewClientName(''); setFinanceEnabled(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                            border: `1.5px solid ${isPersonalProject ? 'var(--accent)' : 'var(--border)'}`,
                            background: isPersonalProject ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                          }}
                        >
                          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--text-3)', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: isPersonalProject ? 'var(--text)' : 'var(--text-2)' }}>{t('projects.noClientOption')}</span>
                          {isPersonalProject && <SFIcon name="check" size={13} color="var(--accent)" />}
                        </button>
                        {(() => {
                          const sortedClients = [...clients].sort((a, b) => Number(isPinnedClient(b.id)) - Number(isPinnedClient(a.id)));
                          const filteredClients = clientSearch.trim()
                            ? sortedClients.filter(c => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
                            : sortedClients;
                          return filteredClients.map(c => (
                            <button
                              key={c.id}
                              onClick={() => { setIsPersonalProject(false); setClientId(c.id); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                                border: `1.5px solid ${!isPersonalProject && clientId === c.id ? 'var(--accent)' : 'var(--border)'}`,
                                background: !isPersonalProject && clientId === c.id ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                              }}
                            >
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{c.initials}</span>
                              </div>
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: !isPersonalProject && clientId === c.id ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                              {!isPersonalProject && clientId === c.id && <SFIcon name="check" size={13} color="var(--accent)" />}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Reassemble the Template step body (structure only — Task 3 rewrites the internal markup)**

The **third** new block (`template`) contains the old `start` block's template grid (lines 407-469, minus its own `{step === 'start' && (` wrapper) followed immediately by the old features block (lines 665-699). Guard becomes `step === 'template'`:

```tsx
          {/* Step 3: Template */}
          {step === 'template' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Template grid — placeholder marker for Task 3, keep old markup here for now: */}
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('projects.startFromTemplate')}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 10 }}>
                  <SFIcon name="search" size={13} color="var(--text-3)" />
                  <input
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                    placeholder={t('projects.searchTemplatesPlaceholder')}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
                  />
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {templates.map(tpl => {
                    const isSelected = templateId === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setTemplateId(tpl.id)}
                        style={{
                          padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                          border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                          transition: 'border-color 0.15s', position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: tpl.color + '33', border: `1.5px solid ${tpl.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <SFIcon name={tpl.icon} size={17} color={tpl.color} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <p style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</p>
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tpl.description}</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                              {tpl.tags.slice(0, 3).map(tag => (
                                <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                              ))}
                            </div>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                              {t('projects.sectionsTasksCount', { sections: resolveTasksSections(tpl).length, tasks: resolveTasksSections(tpl).reduce((n, s) => n + s.tasks.length, 0) })}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: 10, right: 10 }}>
                            <SFIcon name="circle-check" size={16} color="var(--accent)" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {templates.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>{t('projects.noTemplatesFound')}</p>
                )}
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { key: 'calendar', label: t('projects.moduleCalendar'), checked: calendarEnabled, onToggle: () => setCalendarEnabled(v => !v), disabled: false },
                    { key: 'files',    label: t('projects.moduleFiles'),    checked: filesEnabled,    onToggle: () => setFilesEnabled(v => !v),    disabled: false },
                    { key: 'finance',  label: t('projects.moduleFinance'),  checked: financeEnabled,  onToggle: () => setFinanceEnabled(v => !v),  disabled: isPersonalProject || (!clientId && !newClientName.trim()) },
                  ].map(m => (
                    <button
                      key={m.key}
                      type="button"
                      disabled={m.disabled}
                      onClick={m.onToggle}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8,
                        border: 'none', background: 'none',
                        color: m.disabled ? 'var(--text-3)' : 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)',
                        cursor: m.disabled ? 'not-allowed' : 'pointer', opacity: m.disabled ? 0.5 : 1, textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${m.checked && !m.disabled ? 'var(--accent)' : 'var(--border-2)'}`,
                        background: m.checked && !m.disabled ? 'var(--accent)' : 'transparent',
                      }}>
                        {m.checked && !m.disabled && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                      </span>
                      {m.label}
                      {m.key === 'finance' && m.disabled && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{t('projects.moduleFinanceRequiresClient')}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
```

Delete the old `{step === 'start' && (...)}` block (former lines 407-469) and the old `{step === 'info' && (...)}` block (former lines 472-702) entirely — their contents now live in the three new blocks above. Leave the existing `{step === 'team' && (...)}` block completely untouched, immediately after.

- [ ] **Step 4: Typecheck**

Run `npx tsc --noEmit -p tsconfig.app.json` from `app/`. Must be clean — no leftover `'start'`/`'info'` references anywhere in the file (`grep -n "'start'\|'info'" app/src/components/ProjectsListView.tsx` should return nothing for the `Step` values; the identifier `newClientName`/`clientId` etc. are unaffected).

- [ ] **Step 5: Manual browser check**

Open the wizard, walk all 4 steps forward and back, confirm: Identity requires a name to advance, Client requires a selection to advance, Template/Team are always advanceable, StepDot clicking jumps correctly, footer Cancel/Back behaves correctly on step 1.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "refactor(wizard): split step bodies into identity/client/template blocks"
```

---

### Task 3: Compact template grid + horizontal feature toggles + plan-gating locks

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:1-23` (imports)
- Modify: `app/src/components/ProjectsListView.tsx` (the `template` step body written in Task 2)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `canUseFeature(plan: PlanKey, feature: GatedFeature)` from `../data/planFeatures` (returns `boolean`), `requestUpgrade({ feature: GatedFeature })` from `../data/upgradePromptStore` (fire-and-forget, opens the upgrade modal), `usePlan()` from `../data/planStore` (already imported at line 21).
- Produces: no new exports — purely internal markup change.

- [ ] **Step 1: Add the `canUseFeature`/`requestUpgrade` imports**

At line 22, alongside the existing `canCreateNewProject` import, add:
```ts
import { canCreateNewProject, requestUpgrade } from '../data/upgradePromptStore';
import { canUseFeature } from '../data/planFeatures';
```
(replace the existing single-line `canCreateNewProject` import at line 22 with the two lines above — `plan` itself is already available in the component via `usePlan()` at line 21's callsite, confirm the component body already has `const plan = usePlan();`; if it doesn't, add `const plan = usePlan();` near the top of `NewProjectModal`, right after the `const { t } = useTranslation();` line.)

- [ ] **Step 2: Determine template custom-lock check**

Check `app/src/data/templates.ts` for how a template is flagged as custom vs. built-in (search for `isCustom`, `source`, or similar field on the type returned by `loadAllTemplates()`). Use whatever field exists — if the field is e.g. `tpl.isCustom: boolean`, the lock condition is `tpl.isCustom && !canUseFeature(plan, 'customTemplates')`. Write this condition once, consistent with the actual field name found (do not guess a field name without verifying it first).

- [ ] **Step 3: Rewrite the template grid as compact chips**

Replace the template grid's inner `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>...</div>` (written in Task 2's Step 3, the `.map(tpl => ...)` block) with:
```tsx
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {templates.map(tpl => {
                    const isSelected = templateId === tpl.id;
                    const isLocked = tpl.isCustom && !canUseFeature(plan, 'customTemplates');
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => isLocked ? requestUpgrade({ feature: 'customTemplates' }) : setTemplateId(isSelected ? null : tpl.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                          border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                        }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: tpl.color + '33', border: `1.5px solid ${tpl.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SFIcon name={tpl.icon} size={11} color={tpl.color} />
                        </div>
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: isSelected ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</span>
                        {isLocked
                          ? <SFIcon name="lock" size={11} color="var(--text-3)" />
                          : isSelected && <SFIcon name="check" size={13} color="var(--accent)" />}
                      </button>
                    );
                  })}
                </div>
```
Note: clicking an already-selected template now deselects it (`setTemplateId(isSelected ? null : tpl.id)`) so "no template" stays reachable without a separate "Aucun" chip — templates are optional per the existing `canNext` logic (unchanged). This is a small behavior addition consistent with the spec's "template stays optional."

- [ ] **Step 4: Add the selected-template detail strip**

Immediately after the grid's closing `</div>` and the `{templates.length === 0 && (...)}` block (still inside the `<div style={{ maxHeight: 360, ... }}>` wrapper), add:
```tsx
                {selectedTemplate && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>{selectedTemplate.description}</p>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {selectedTemplate.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                      ))}
                    </div>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                      {t('projects.sectionsTasksCount', { sections: resolveTasksSections(selectedTemplate).length, tasks: resolveTasksSections(selectedTemplate).reduce((n, s) => n + s.tasks.length, 0) })}
                    </p>
                  </div>
                )}
```
(`selectedTemplate` is already computed at line 156 — `sortedTemplates.find(t => t.id === templateId) ?? null`.)

- [ ] **Step 5: Rewrite the feature toggles as a horizontal chip row**

Replace the features block's inner `<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>...</div>` (from Task 2's Step 3) with:
```tsx
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { key: 'calendar', label: t('projects.moduleCalendar'), checked: calendarEnabled, onToggle: () => setCalendarEnabled(v => !v), locked: false, disabled: false },
                    { key: 'files',    label: t('projects.moduleFiles'),    checked: filesEnabled,    onToggle: () => setFilesEnabled(v => !v),    locked: false, disabled: false },
                    { key: 'finance',  label: t('projects.moduleFinance'),  checked: financeEnabled,  onToggle: () => setFinanceEnabled(v => !v),  locked: !canUseFeature(plan, 'finances'), disabled: isPersonalProject || (!clientId && !newClientName.trim()) },
                  ].map(m => {
                    const showLock = m.key === 'finance' && m.locked;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        disabled={m.disabled && !showLock}
                        onClick={() => {
                          if (showLock) { requestUpgrade({ feature: 'finances' }); return; }
                          if (m.disabled) return;
                          m.onToggle();
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 9,
                          cursor: (m.disabled && !showLock) ? 'not-allowed' : 'pointer',
                          border: `1.5px solid ${m.checked && !m.disabled ? 'var(--accent)' : 'var(--border)'}`,
                          background: m.checked && !m.disabled ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                          opacity: (m.disabled && !showLock) ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `1.5px solid ${m.checked && !m.disabled ? 'var(--accent)' : 'var(--border-2)'}`,
                          background: m.checked && !m.disabled ? 'var(--accent)' : 'transparent',
                        }}>
                          {showLock
                            ? <SFIcon name="lock" size={11} color="var(--text-3)" />
                            : m.checked && !m.disabled && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500, color: m.disabled ? 'var(--text-3)' : 'var(--text-2)' }}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
                {isPersonalProject || (!clientId && !newClientName.trim()) ? (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{t('projects.moduleFinanceRequiresClient')}</p>
                ) : !canUseFeature(plan, 'finances') && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{t('projects.moduleFinanceRequiresPlan')}</p>
                )}
```
This keeps the client-requirement message and adds a distinct plan-requirement message, shown only when the client requirement is already satisfied (so only one hint shows at a time).

- [ ] **Step 6: Add new i18n keys**

In `app/src/locales/fr.json`, `projects` namespace, add:
```json
"moduleFinanceRequiresPlan": "Nécessite un abonnement Studio ou Agence"
```
In `app/src/locales/en.json`:
```json
"moduleFinanceRequiresPlan": "Requires a Studio or Agence subscription"
```

- [ ] **Step 7: Typecheck**

Run `npx tsc --noEmit -p tsconfig.app.json` from `app/`. Must be clean.

- [ ] **Step 8: Manual browser check**

Open the wizard as a Gratuit-plan account (or via `viewAsStore` if available for testing plan tiers): confirm the Finance chip shows a lock icon and clicking it opens the upgrade modal instead of toggling; confirm a custom template (if any exist and plan lacks `customTemplates`) shows a lock and doesn't select on click. On a Studio/Agence-plan account, confirm Finance toggles normally once a client is selected, and custom templates are selectable. Confirm the template detail strip appears/disappears correctly and the 3-column grid matches the Client step's visual density (compare via `getComputedStyle(...).gridTemplateColumns`).

- [ ] **Step 9: Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "refactor(wizard): compact template grid to chip style, add plan-gating locks"
```

---

## Final check (after all tasks)

- [ ] Full walkthrough: create a project end-to-end through all 4 steps (with and without a client, with and without a template), confirm `createProject` receives the same shape of data as before (no behavior regression — check via `read_network_requests` or by inspecting the created project in the list).
- [ ] `npx tsc --noEmit -p tsconfig.app.json` clean.
- [ ] `npm run lint` clean (or no new warnings introduced).
