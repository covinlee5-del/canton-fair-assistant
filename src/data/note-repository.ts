// 笔记仓储（阶段 3 T3.5）：在通用仓储之上增加
//   - 按去重键查已有记录（upsert 语义，重复读取不产生重复行）
//   - 按任务查询（by-taskIds 多值索引）
//   - 按状态查询
// 所有方法返回 Result；底层异常统一映射为 STORAGE_ERROR，绝不静默。

import { BaseRepository } from './repository';
import { getDb } from './db';
import { ok, storageError } from '../shared/utils/result';
import type { ID, Result } from '../shared/types/base';
import type { Note, NoteStatus } from '../shared/types/note';

export class NoteRepository extends BaseRepository<Note> {
  protected readonly storeName = 'notes' as const;

  /** 按去重键查已有笔记（找不到返回 null） */
  async getByDedupeKey(dedupeKey: string): Promise<Result<Note | null>> {
    try {
      const db = await getDb();
      const found = await db.getFromIndex(this.storeName, 'by-dedupeKey', dedupeKey);
      return ok(found ?? null);
    } catch (cause) {
      return failStorage('读取笔记失败', cause);
    }
  }

  /** 按任务查询笔记（走 by-taskIds 多值索引） */
  async listByTaskId(taskId: ID): Promise<Result<Note[]>> {
    try {
      const db = await getDb();
      const items = await db.getAllFromIndex(this.storeName, 'by-taskIds', taskId);
      return ok(items);
    } catch (cause) {
      return failStorage('读取笔记失败', cause);
    }
  }

  /** 按状态查询笔记 */
  async listByStatus(status: NoteStatus): Promise<Result<Note[]>> {
    try {
      const db = await getDb();
      const items = await db.getAllFromIndex(this.storeName, 'by-status', status);
      return ok(items);
    } catch (cause) {
      return failStorage('读取笔记失败', cause);
    }
  }

  /** 原子 upsert：存在则 put，不存在则 add（语义等价于 put，但保留 add 的失败可见性） */
  async upsert(note: Note): Promise<Result<Note>> {
    try {
      const db = await getDb();
      await db.put(this.storeName, note);
      return ok(note);
    } catch (cause) {
      return failStorage('保存笔记失败', cause);
    }
  }
}

function failStorage(action: string, cause: unknown): Result<never> {
  return { ok: false, error: storageError(action, cause) };
}
