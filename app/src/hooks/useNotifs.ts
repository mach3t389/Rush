import { useState, useEffect } from 'react';
import {
  subscribeNotifs,
  getUnreadForTask,
  getUnreadForResource,
  getUnreadTaskCountForProject,
  getUnreadResourceCountForProject,
  getUnreadForProject,
} from '../data/notificationStore';

export function useTaskNotifCount(taskId: string): number {
  const [count, setCount] = useState(() => getUnreadForTask(taskId).length);
  useEffect(() => {
    setCount(getUnreadForTask(taskId).length);
    return subscribeNotifs(() => setCount(getUnreadForTask(taskId).length));
  }, [taskId]);
  return count;
}

export function useResourceNotifCount(resourceId: string): number {
  const [count, setCount] = useState(() => getUnreadForResource(resourceId).length);
  useEffect(() => {
    setCount(getUnreadForResource(resourceId).length);
    return subscribeNotifs(() => setCount(getUnreadForResource(resourceId).length));
  }, [resourceId]);
  return count;
}

export function useProjectTaskNotifCount(projectId: string): number {
  const [count, setCount] = useState(() => getUnreadTaskCountForProject(projectId));
  useEffect(() => {
    setCount(getUnreadTaskCountForProject(projectId));
    return subscribeNotifs(() => setCount(getUnreadTaskCountForProject(projectId)));
  }, [projectId]);
  return count;
}

export function useProjectResourceNotifCount(projectId: string): number {
  const [count, setCount] = useState(() => getUnreadResourceCountForProject(projectId));
  useEffect(() => {
    setCount(getUnreadResourceCountForProject(projectId));
    return subscribeNotifs(() => setCount(getUnreadResourceCountForProject(projectId)));
  }, [projectId]);
  return count;
}

export function useProjectTotalNotifCount(projectId: string): number {
  const [count, setCount] = useState(() => getUnreadForProject(projectId).length);
  useEffect(() => {
    setCount(getUnreadForProject(projectId).length);
    return subscribeNotifs(() => setCount(getUnreadForProject(projectId).length));
  }, [projectId]);
  return count;
}
