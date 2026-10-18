import { BaseRepository } from './repository';
import type { Note } from '../shared/types/note';

export class NoteRepository extends BaseRepository<Note> {
  protected readonly storeName = 'notes' as const;
}
