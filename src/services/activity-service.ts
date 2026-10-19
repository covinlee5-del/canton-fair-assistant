import { createId } from '../shared/utils/ids';
import { nowIso } from '../shared/utils/time';
import { ok } from '../shared/utils/result';
import type { ID, Result } from '../shared/types/base';
import { ActivityAction } from '../shared/types/activity';
import type { OutreachActivity } from '../shared/types/activity';
import type { ActivityRepository } from '../data/activity-repository';

export interface ActivityInput {
  noteId: ID;
  taskId?: ID | null;
  action: ActivityAction;
  copyId?: ID;
  result?: string;
  userComment?: string;
}

export function recordUserActivity(
  repo: ActivityRepository,
  input: ActivityInput & { action: ActivityAction.OPEN_NOTE | ActivityAction.COPY_TEXT },
): Promise<Result<OutreachActivity>> {
  return recordActivity(repo, input);
}

export function recordActivity(repo: ActivityRepository, input: ActivityInput): Promise<Result<OutreachActivity>> {
  return repo.create({ ...input, id: createId(), taskId: input.taskId ?? null, actionAt: nowIso() });
}

export async function listActivities(
  repo: ActivityRepository,
  filter: { noteId?: ID | null; taskId?: ID | null } = {},
): Promise<Result<OutreachActivity[]>> {
  const all = await repo.getAll();
  if (!all.ok) return all;
  return ok(all.value
    .filter((item) => !filter.noteId || item.noteId === filter.noteId)
    .filter((item) => !filter.taskId || item.taskId === filter.taskId)
    .sort((a, b) => b.actionAt.localeCompare(a.actionAt)));
}
