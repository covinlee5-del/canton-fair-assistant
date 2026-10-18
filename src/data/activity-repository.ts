import { BaseRepository } from './repository';
import type { OutreachActivity } from '../shared/types/activity';

export class ActivityRepository extends BaseRepository<OutreachActivity> {
  protected readonly storeName = 'activities' as const;
}
