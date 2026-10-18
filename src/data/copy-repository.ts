import { BaseRepository } from './repository';
import type { PromotionalCopy } from '../shared/types/copy';

export class CopyRepository extends BaseRepository<PromotionalCopy> {
  protected readonly storeName = 'copies' as const;
}
