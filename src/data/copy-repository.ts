import { BaseRepository } from './repository';
import { getDb } from './db';
import { ok, storageError } from '../shared/utils/result';
import type { Result } from '../shared/types/base';
import type { PromotionalCopy } from '../shared/types/copy';

export class CopyRepository extends BaseRepository<PromotionalCopy> {
  protected readonly storeName = 'copies' as const;

  async setDefault(id: string | null): Promise<Result<PromotionalCopy[]>> {
    try {
      const db = await getDb();
      const tx = db.transaction('copies', 'readwrite');
      const all = await tx.store.getAll();
      const updated = all.map((copy) => ({ ...copy, isDefault: copy.id === id }));
      for (const copy of updated) await tx.store.put(copy);
      await tx.done;
      return ok(updated);
    } catch (cause) {
      return { ok: false, error: storageError('设置默认文案失败', cause) };
    }
  }
}
