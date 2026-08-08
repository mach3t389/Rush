import { getEvents } from './eventStore';
import { getFiles, getFolders } from './fileStore';
import { getInvoicesByProject } from './financeStore';

export type ProjectModuleKey = 'calendar' | 'files' | 'finance';

export function getProjectModuleItemCount(projectId: string, moduleKey: ProjectModuleKey): number {
  if (moduleKey === 'calendar') {
    return getEvents().filter(ev => ev.projectId === projectId).length;
  }
  if (moduleKey === 'files') {
    return getFiles().filter(f => f.projectId === projectId).length
      + getFolders().filter(fo => fo.projectId === projectId).length;
  }
  return getInvoicesByProject(projectId).length;
}
