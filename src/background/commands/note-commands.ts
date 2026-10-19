// 笔记命令处理器（阶段 3 T3.6）
// 契约：服务层返回 Result，本层用 unwrap 拆包（失败即抛 AppError），
// 由消息路由器统一包装成一层信封。

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { NoteStatusRequest, NotesListRequest, NotesBulkStatusRequest, NotesScoreTaskRequest } from '../../messaging/messages';
import { NoteRepository } from '../../data/note-repository';
import { ActivityRepository } from '../../data/activity-repository';
import { TaskRepository } from '../../data/task-repository';
import { bulkSetNoteStatus, listNotes, setNoteStatus } from '../../services/note-service';
import { scoreNotesForTask } from '../../services/relevance-service';
import { unwrap } from '../../shared/utils/result';
import { appError } from '../../shared/utils/result';
import { ErrorCode } from '../../shared/types/base';
import type { NoteStatus } from '../../shared/types/note';

export function registerNoteCommands(): void {
  const noteRepo = new NoteRepository();
  const activityRepo = new ActivityRepository();
  const taskRepo = new TaskRepository();

  register(Message.NOTES_LIST, async (payload) => {
    const p = (payload ?? {}) as NotesListRequest;
    if (p.taskId) {
      const task = await taskRepo.getById(p.taskId);
      if (!task.ok) return unwrap(task);
      if (task.value) {
        const taskNotes = await noteRepo.listByTaskId(p.taskId);
        if (!taskNotes.ok) return unwrap(taskNotes);
        const stale = taskNotes.value.filter((note) => {
          const evaluated = note.relevanceByTask[p.taskId!]?.evaluatedAt;
          return !evaluated || evaluated < task.value!.updatedAt;
        });
        if (stale.length > 0) unwrap(await scoreNotesForTask(noteRepo, taskNotes.value, task.value));
      }
    }
    return unwrap(
      await listNotes(noteRepo, {
        taskId: p.taskId ?? null,
        status: p.status ?? null,
        keyword: p.keyword ?? null,
        sortBy: p.sortBy,
        sortOrder: p.sortOrder,
        minScore: p.minScore,
      }),
    );
  });

  register(Message.NOTES_SET_STATUS, async (payload) => {
    const p = payload as NoteStatusRequest;
    return unwrap(
      await setNoteStatus(
        noteRepo,
        activityRepo,
        p.id,
        p.status as NoteStatus,
        p.taskId ?? null,
      ),
    );
  });

  register(Message.NOTES_BULK_SET_STATUS, async (payload) => {
    const p = payload as NotesBulkStatusRequest;
    return unwrap(await bulkSetNoteStatus(noteRepo, activityRepo, p.ids, p.status, p.taskId ?? null));
  });

  register(Message.NOTES_SCORE_TASK, async (payload) => {
    const p = payload as NotesScoreTaskRequest;
    const task = await taskRepo.getById(p.taskId);
    if (!task.ok) return unwrap(task);
    if (!task.value) throw appError(ErrorCode.INVALID_INPUT, '任务不存在');
    const notes = await noteRepo.listByTaskId(p.taskId);
    if (!notes.ok) return unwrap(notes);
    return unwrap(await scoreNotesForTask(noteRepo, notes.value, task.value));
  });
}
