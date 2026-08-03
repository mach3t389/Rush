# Granularité de sauvegarde d'un modèle de projet — design

## Contexte

L'écran « Créer un modèle depuis ce projet » (`CreateTemplateFromProjectModal.tsx`) capture actuellement les tâches d'un projet de façon fixe : `title`, `priority`, `description`, `status`, `statusLabel`, `dueDate`, `assignees` sont toujours copiés ; `subtasks` et les commentaires/observateurs ne le sont jamais. L'utilisateur veut du contrôle fin sur ce qui est conservé, plutôt qu'un comportement figé.

## Décisions actées

1. **Champ Statut : jamais capturé.** Le statut (« Terminé », « En attente ») reflète la progression dans le projet d'origine — les tâches d'un nouveau projet créé depuis un modèle démarrent toujours « à faire », peu importe ce qu'on coche. Pas de case à cocher pour ce champ.
2. **5 nouvelles sous-options sous « Tâches »**, toutes cochées par défaut : Sous-tâches, Description, Priorité, Assignés, Échéance.
3. **Une sous-tâche suit les mêmes réglages que sa tâche parente** — pas de configuration séparée par niveau. Si « Priorité » est décochée, ni les tâches de premier niveau ni leurs sous-tâches ne gardent de priorité.
4. **Présentation UI** : liste indentée simple, sans tableau/grille — calquée sur la boîte « Copy Settings » de Lightroom (validé avec maquette). Décocher « Tâches » désactive visuellement (grisé, non cliquable) les 5 sous-cases sans les décocher individuellement — si on recoche « Tâches » ensuite, les sous-cases retrouvent leur état précédent.
5. **« Tout cocher »/« Tout décocher »** agit sur l'écran complet (Fichiers + Tâches + les 5 sous-options + Aperçu), pas seulement sur les sous-options de Tâches — comme dans Lightroom.
6. **Aucun changement de type de données** — `TemplateTask` (`app/src/data/templates.ts`) a déjà tous les champs nécessaires (`description?`, `priority`, `dueDate?`, `assignees?`, `subtasks?`). Seule la logique de capture dans `CreateTemplateFromProjectModal.tsx` change, de systématique à conditionnelle.

## Écran — structure

```
┌ Créer un modèle depuis ce projet ──────────────┐
│ [Nom du modèle...]                              │
│ [Description...]                                │
│                                                  │
│ ☑ Fichiers                                       │
│ ☑ Tâches                                         │
│     ☑ Sous-tâches                                │
│     ☑ Description                                │
│     ☑ Priorité                                   │
│     ☑ Assignés                                   │
│     ☑ Échéance                                   │
│ ☑ Aperçu                                         │
│                                                  │
│ Tout cocher · Tout décocher      [Annuler] [Enregistrer] │
└──────────────────────────────────────────────────┘
```

Décocher « Tâches » : les 5 sous-cases passent en `disabled`, visuellement grisées, leur état interne (coché/décoché) est conservé en mémoire mais n'a plus d'effet tant que « Tâches » reste décochée. Recocher « Tâches » réactive les sous-cases dans l'état où elles étaient.

## Logique de capture (`handleSave`)

Actuellement (`CreateTemplateFromProjectModal.tsx`), le mapping d'une tâche est fixe. Devient, pour chaque tâche capturée (top-level ou sous-tâche, même logique récursive) :

```ts
function mapTask(t: Task, opts: CaptureOptions): TemplateTask {
  return {
    title: t.title,
    priority: opts.priority ? t.priority : 'normal', // valeur par défaut si non conservée
    description: opts.description ? t.description : undefined,
    dueDate: opts.dueDate ? t.dueDate : undefined,
    assignees: opts.assignees ? t.assignees : undefined,
    subtasks: opts.subtasks ? (t.subtasks ?? []).map(st => mapTask(st, opts)) : [],
    // status/statusLabel : jamais inclus
  };
}
```

`CaptureOptions` = `{ subtasks: boolean; description: boolean; priority: boolean; assignees: boolean; dueDate: boolean }`, un état local par toggle dans le composant, tous initialisés à `true`.

## Vérification

- Créer un modèle avec toutes les cases cochées → confirmer que le résultat est identique au comportement actuel (aucune régression).
- Décocher « Description » seulement → modèle créé, sections de tâches présentes, aucune tâche n'a de description.
- Décocher « Sous-tâches » → aucune tâche du modèle n'a de sous-tâches, même si le projet source en avait.
- Décocher « Tâches » entièrement → les 5 sous-cases deviennent grisées ; recocher « Tâches » → elles retrouvent leur état précédent (pas remises à `true` par défaut si elles avaient été décochées avant).
- « Tout décocher » puis « Tout cocher » → toutes les cases (Fichiers/Tâches/5 sous-options/Aperçu) sont cochées.
