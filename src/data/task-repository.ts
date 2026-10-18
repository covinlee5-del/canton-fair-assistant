import { BaseRepository } from './repository';
import type { Task } from '../shared/types/task';

export class TaskRepository extends BaseRepository<Task> {
  protected readonly storeName = 'tasks' as const;
}
