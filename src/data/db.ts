// IndexedDB 打开与连接管理（idb 封装）
// 扩展的 SW / 侧边栏 / 管理页共享同一 origin，因此共享同一个数据库。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ID, ISODate } from '../shared/types/base';
import type { Task, TaskStatus } from '../shared/types/task';
import type { Note, NoteStatus } from '../shared/types/note';
import type { PromotionalCopy } from '../shared/types/copy';
import type { OutreachActivity } from '../shared/types/activity';
import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations';

export const DB_NAME = 'canton-fair-assistant';
export const DB_VERSION = CURRENT_SCHEMA_VERSION;

export interface AppDB extends DBSchema {
  tasks: {
    key: ID;
    value: Task;
    indexes: { 'by-status': TaskStatus; 'by-updatedAt': ISODate };
  };
  notes: {
    key: ID;
    value: Note;
    indexes: {
      'by-status': NoteStatus;
      'by-taskIds': ID;
      'by-updatedAt': ISODate;
      // 阶段 3 T3.5：按去重键查已有记录，保证重复读取不产生重复行
      'by-dedupeKey': string;
    };
  };
  copies: {
    key: ID;
    value: PromotionalCopy;
    indexes: { 'by-updatedAt': ISODate };
  };
  activities: {
    key: ID;
    value: OutreachActivity;
    indexes: { 'by-noteId': ID; 'by-taskId': ID; 'by-actionAt': ISODate };
  };
  meta: { key: string; value: unknown };
}

export type AppStoreName = 'tasks' | 'notes' | 'copies' | 'activities';

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        runMigrations(db, oldVersion, tx);
      },
    }).catch((cause: unknown) => {
      // 打开失败时重置 promise，允许重试
      dbPromise = null;
      throw cause;
    });
  }
  return dbPromise;
}

/** 仅供测试使用：关闭连接并删除数据库，保证测试隔离 */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
