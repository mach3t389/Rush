// app/src/data/normalizeTask.ts
// Les tâches sont stockées en JSON (colonne `data` de la table `tasks`, ou
// localStorage en démo). Celles écrites avant l'assignation multiple portent
// `assignee: User | null` ; celles écrites depuis portent `assignees: User[]`.
// Plutôt qu'une migration SQL, on convertit à la lecture — les deux formats
// cohabitent sans conflit, et l'ancien disparaît à la première réécriture.
import type { Task, User } from '../types';

export function normalizeTask(raw: unknown): Task {
  const t = raw as Task & { assignee?: User | null };
  const { assignee, ...rest } = t;
  const base = (t.assignees
    ? t
    : { ...rest, assignees: assignee ? [assignee] : [] }) as Task;
  return base.subtasks
    ? { ...base, subtasks: base.subtasks.map(normalizeTask) }
    : base;
}

export function normalizeSectionTasks<T extends { tasks: Task[] }>(section: T): T {
  return { ...section, tasks: section.tasks.map(normalizeTask) };
}
