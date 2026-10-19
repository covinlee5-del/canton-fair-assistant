// 数据库结构迁移（docs/03 §11 数据格式升级策略）
// 迁移在 idb 的 upgrade 事务中执行：任一步骤抛出异常则整次升级回滚，
// 原数据保留（idb 语义），后续读取会返回 STORAGE_ERROR。

import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { AppDB } from './db';

/**
 * 版本历史：
 *   1  阶段 1：tasks / notes / copies / activities / meta
 *   2  阶段 3：notes 增加 by-dedupeKey 索引（去重与 upsert 依赖它）
 */
export const CURRENT_SCHEMA_VERSION = 2;

type UpgradeTx = IDBPTransaction<AppDB, StoreNames<AppDB>[], 'versionchange'>;

export function runMigrations(
  db: IDBPDatabase<AppDB>,
  oldVersion: number,
  tx: UpgradeTx,
): void {
  if (oldVersion < 1) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('by-status', 'status');
    tasks.createIndex('by-updatedAt', 'updatedAt');

    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('by-status', 'status');
    notes.createIndex('by-taskIds', 'taskIds', { multiEntry: true });
    notes.createIndex('by-updatedAt', 'updatedAt');
    notes.createIndex('by-dedupeKey', 'dedupeKey');

    const copies = db.createObjectStore('copies', { keyPath: 'id' });
    copies.createIndex('by-updatedAt', 'updatedAt');

    const activities = db.createObjectStore('activities', { keyPath: 'id' });
    activities.createIndex('by-noteId', 'noteId');
    activities.createIndex('by-taskId', 'taskId');
    activities.createIndex('by-actionAt', 'actionAt');

    db.createObjectStore('meta');
    return;
  }

  if (oldVersion < 2) {
    // v1 → v2：notes 表已存在，只补 by-dedupeKey 索引
    // （upgrade 期间不能新建事务，必须复用传入的 versionchange 事务）
    const store = tx.objectStore('notes');
    if (!store.indexNames.contains('by-dedupeKey')) {
      store.createIndex('by-dedupeKey', 'dedupeKey');
    }
  }
}
