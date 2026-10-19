// 本地宣传文案 CRUD 与默认文案管理。

import { createId } from '../shared/utils/ids';
import { nowIso } from '../shared/utils/time';
import { normalizeText } from '../shared/utils/text';
import { appError, fail, ok } from '../shared/utils/result';
import { ErrorCode } from '../shared/types/base';
import type { ID, Result } from '../shared/types/base';
import type { CopyInput, CopyLanguage, PromotionalCopy } from '../shared/types/copy';
import type { CopyRepository } from '../data/copy-repository';
import type { Repository } from '../data/repository';
import type { Task } from '../shared/types/task';
import { TaskCategory } from '../shared/types/task';

const LANGUAGES = new Set<CopyLanguage>(['zh', 'en', 'bilingual']);
const SCENARIOS = new Set<string>([...Object.values(TaskCategory), 'GENERAL']);

export function validateCopyInput(input: CopyInput): Result<CopyInput> {
  if (!input || typeof input !== 'object') {
    return fail(appError(ErrorCode.INVALID_INPUT, '输入为空'));
  }
  const name = normalizeText(input.name);
  const content = (input.content ?? '').trim();
  if (!name || !content) {
    return fail(appError(ErrorCode.INVALID_INPUT, '文案名称和内容不能为空'));
  }
  if (name.length > 100) {
    return fail(appError(ErrorCode.INVALID_INPUT, '文案名称过长（最多 100 字）'));
  }
  if (!LANGUAGES.has(input.language) || !SCENARIOS.has(input.scenario)) {
    return fail(appError(ErrorCode.INVALID_INPUT, '文案语言或场景无效'));
  }
  const tags = [...new Set((input.tags ?? []).map((tag) => normalizeText(tag)).filter(Boolean))];
  return ok({ ...input, name, content, tags });
}

export async function listCopies(repo: CopyRepository): Promise<Result<PromotionalCopy[]>> {
  const result = await repo.getAll();
  if (!result.ok) return result;
  return ok(result.value.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function createCopy(repo: CopyRepository, input: CopyInput): Promise<Result<PromotionalCopy>> {
  const valid = validateCopyInput(input);
  if (!valid.ok) return valid;
  const now = nowIso();
  // 第一条文案自动成为默认文案（docs/03 §5：isDefault 全局唯一）。
  const existing = await repo.getAll();
  if (!existing.ok) return existing;
  const isFirst = existing.value.length === 0;
  const copy: PromotionalCopy = {
    ...valid.value,
    id: createId(),
    isDefault: isFirst,
    createdAt: now,
    updatedAt: now,
  };
  return repo.create(copy);
}

export async function updateCopy(
  repo: CopyRepository,
  id: ID,
  input: CopyInput,
): Promise<Result<PromotionalCopy>> {
  const valid = validateCopyInput(input);
  if (!valid.ok) return valid;
  const found = await repo.getById(id);
  if (!found.ok) return found;
  if (!found.value) return fail(appError(ErrorCode.INVALID_INPUT, '文案不存在'));
  return repo.update({ ...found.value, ...valid.value, updatedAt: nowIso() });
}

export async function deleteCopy(
  repo: CopyRepository,
  id: ID,
  taskRepo?: Repository<Task>,
): Promise<Result<void>> {
  const found = await repo.getById(id);
  if (!found.ok) return found;
  if (!found.value) return fail(appError(ErrorCode.INVALID_INPUT, '文案不存在'));
  if (taskRepo) {
    const tasks = await taskRepo.getAll();
    if (!tasks.ok) return tasks;
    for (const task of tasks.value.filter((item) => item.copyIds.includes(id))) {
      const updated = await taskRepo.update({ ...task, copyIds: task.copyIds.filter((copyId) => copyId !== id), updatedAt: nowIso() });
      if (!updated.ok) return updated;
    }
  }
  if (found.value.isDefault) {
    const unset = await repo.setDefault(null);
    if (!unset.ok) return unset;
  }
  return repo.delete(id);
}

export async function setDefaultCopy(repo: CopyRepository, id: ID): Promise<Result<PromotionalCopy>> {
  const found = await repo.getById(id);
  if (!found.ok) return found;
  if (!found.value) return fail(appError(ErrorCode.INVALID_INPUT, '文案不存在'));
  const updated = await repo.setDefault(id);
  if (!updated.ok) return updated;
  const selected = updated.value.find((copy) => copy.id === id);
  return selected ? ok(selected) : fail(appError(ErrorCode.INVALID_INPUT, '文案不存在'));
}
