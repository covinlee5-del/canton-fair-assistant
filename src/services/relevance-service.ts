// 阶段 4 评分服务：负责把纯函数结果写回 Note。

import { appError, fail, ok } from '../shared/utils/result';
import { ErrorCode } from '../shared/types/base';
import type { ID, Result } from '../shared/types/base';
import type { Note } from '../shared/types/note';
import type { Task } from '../shared/types/task';
import { calculateRelevance } from '../shared/domain/relevance';
import type { NoteRepository } from '../data/note-repository';

export function scoreNote(note: Note, task: Task): Note {
  const result = calculateRelevance(note, task);
  return {
    ...note,
    relevance: result,
    relevanceByTask: { ...note.relevanceByTask, [task.id]: result },
    updatedAt: result.evaluatedAt,
  };
}

export async function scoreNotesForTask(
  repo: NoteRepository,
  notes: Note[],
  task: Task,
): Promise<Result<Note[]>> {
  const scored: Note[] = [];
  for (const note of notes) {
    const saved = await repo.upsert(scoreNote(note, task));
    if (!saved.ok) return fail(saved.error);
    scored.push(saved.value);
  }
  return ok(scored);
}

export async function scoreNoteById(
  repo: NoteRepository,
  id: ID,
  task: Task,
): Promise<Result<Note>> {
  const found = await repo.getById(id);
  if (!found.ok) return found;
  if (!found.value) return fail(appError(ErrorCode.INVALID_INPUT, '笔记不存在'));
  return repo.upsert(scoreNote(found.value, task));
}
