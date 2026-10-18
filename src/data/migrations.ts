// 数据库结构迁移（docs/03 §11 数据格式升级策略）
// 迁移在 idb 的 upgrade 事务中执行：任一步骤抛出异常则整次升级回滚，
// 原数据保留（idb 语义），后续读取会返回 STORAGE_ERROR。

import type { IDBPDatabase } from 'idb';
import type { AppDB } from './db';

export const CURRENT_SCHEMA_VERSION = 1;

export function runMigrations(db: IDBPDatabase<AppDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('by-status', 'status');
    tasks.createIndex('by-updatedAt', 'updatedAt');

    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('by-status', 'status');
    notes.createIndex('by-taskIds', 'taskIds', { multiEntry: true });
    notes.createIndex('by-updatedAt', 'updatedAt');

    const copies = db.createObjectStore('copies', { keyPath: 'id' });
    copies.createIndex('by-updatedAt', 'updatedAt');

    const activities = db.createObjectStore('activities', { keyPath: 'id' });
    activities.createIndex('by-noteId', 'noteId');
    activities.createIndex('by-taskId', 'taskId');
    activities.createIndex('by-actionAt', 'actionAt');

    db.createObjectStore('meta');
  }
  // 未来版本：
  // if (oldVersion < 2) { ... }
}
