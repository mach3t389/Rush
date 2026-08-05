// Small badge shown on task rows/cards when the task has comments — grey
// with the total count when everything's been read, accent-colored with
// just the unread count when it hasn't. Renders nothing for a task with no
// comments at all (no empty "0" badge).
import { useEffect, useState } from 'react';
import type { TaskComment } from '../../types';
import { getLastViewed, subscribeTaskCommentReads, countUnreadComments, countTotalComments } from '../../data/taskCommentReadsStore';
import { SFIcon } from './SFIcon';

export function CommentBadge({ taskId, comments }: { taskId: string; comments: TaskComment[] | undefined }) {
  const [lastViewed, setLastViewed] = useState(() => getLastViewed(taskId));
  useEffect(() => subscribeTaskCommentReads(() => setLastViewed(getLastViewed(taskId))), [taskId]);

  const total = countTotalComments(comments);
  if (total === 0) return null;
  const unread = countUnreadComments(comments, lastViewed);
  const isUnread = unread > 0;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <SFIcon name="message-square" size={11} color={isUnread ? 'var(--accent)' : 'var(--text-3)'} />
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isUnread ? 'var(--accent)' : 'var(--text-3)' }}>
        {isUnread ? unread : total}
      </span>
    </span>
  );
}
