import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { CopyIdRequest, CopyUpdateRequest } from '../../messaging/messages';
import { CopyRepository } from '../../data/copy-repository';
import { createCopy, deleteCopy, listCopies, setDefaultCopy, updateCopy } from '../../services/copy-service';
import { unwrap } from '../../shared/utils/result';
import type { CopyInput } from '../../shared/types/copy';
import { LocalSettingsRepository } from '../../data/settings-repository';
import { TaskRepository } from '../../data/task-repository';

export function registerCopyCommands(): void {
  const repo = new CopyRepository();
  const settings = new LocalSettingsRepository();
  const tasks = new TaskRepository();
  register(Message.COPIES_LIST, async () => unwrap(await listCopies(repo)));
  register(Message.COPIES_CREATE, async (payload) => unwrap(await createCopy(repo, (payload as { input: CopyInput }).input)));
  register(Message.COPIES_UPDATE, async (payload) => {
    const request = payload as CopyUpdateRequest;
    return unwrap(await updateCopy(repo, request.id, request.input));
  });
  register(Message.COPIES_DELETE, async (payload) => {
    const id = (payload as CopyIdRequest).id;
    const result = await deleteCopy(repo, id, tasks);
    const current = await settings.get();
    if (result.ok && current.ok && current.value.defaultCopyId === id) unwrap(await settings.update({ defaultCopyId: null }));
    return unwrap(result);
  });
  register(Message.COPIES_SET_DEFAULT, async (payload) => {
    const result = await setDefaultCopy(repo, (payload as CopyIdRequest).id);
    if (result.ok) unwrap(await settings.update({ defaultCopyId: result.value.id }));
    return unwrap(result);
  });
}
