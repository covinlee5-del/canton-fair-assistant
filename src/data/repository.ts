// Repository 基础接口与实现（docs/02 §2 数据访问层）
// 所有方法返回 Result；底层异常统一映射为 STORAGE_ERROR，绝不静默。

import { getDb, type AppStoreName } from './db';
import { fail, ok, storageError } from '../shared/utils/result';
import type { ID, Result } from '../shared/types/base';

export interface Repository<T extends { id: ID }> {
  getAll(): Promise<Result<T[]>>;
  getById(id: ID): Promise<Result<T | null>>;
  create(item: T): Promise<Result<T>>;
  update(item: T): Promise<Result<T>>;
  delete(id: ID): Promise<Result<void>>;
}

export abstract class BaseRepository<T extends { id: ID }> implements Repository<T> {
  protected abstract readonly storeName: AppStoreName;

  async getAll(): Promise<Result<T[]>> {
    try {
      const db = await getDb();
      const items = await db.getAll(this.storeName);
      return ok(items as unknown as T[]);
    } catch (cause) {
      return fail(storageError('读取数据失败', cause));
    }
  }

  async getById(id: ID): Promise<Result<T | null>> {
    try {
      const db = await getDb();
      const item = await db.get(this.storeName, id);
      return ok((item as unknown as T | undefined) ?? null);
    } catch (cause) {
      return fail(storageError('读取数据失败', cause));
    }
  }

  async create(item: T): Promise<Result<T>> {
    try {
      const db = await getDb();
      await db.add(this.storeName, item as never);
      return ok(item);
    } catch (cause) {
      return fail(storageError('保存数据失败', cause));
    }
  }

  async update(item: T): Promise<Result<T>> {
    try {
      const db = await getDb();
      await db.put(this.storeName, item as never);
      return ok(item);
    } catch (cause) {
      return fail(storageError('保存数据失败', cause));
    }
  }

  async delete(id: ID): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.delete(this.storeName, id);
      return ok(undefined);
    } catch (cause) {
      return fail(storageError('删除数据失败', cause));
    }
  }
}
