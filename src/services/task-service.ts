// 任务服务：校验、创建、更新、复制、删除、列表（docs/06 T2.4）

import { createId } from '../shared/utils/ids';
import { nowIso } from '../shared/utils/time';
import { normalizeText, dedupeCaseInsensitive } from '../shared/utils/text';
import { appError, fail, ok } from '../shared/utils/result';
import { ErrorCode } from '../shared/types/base';
import type { ID, Result } from '../shared/types/base';
import { DEFAULT_SETTINGS } from '../shared/types/settings';
import { TaskCategory } from '../shared/types/task';
import type { Task, TaskInput, TaskStatus } from '../shared/types/task';
import type { Repository } from '../data/repository';

const TASK_CATEGORIES = new Set<string>(Object.values(TaskCategory));

/** 输入校验：返回规范化后的输入 */
export function validateTaskInput(input: TaskInput): Result<TaskInput> {
  if (!input || typeof input !== 'object') {
    return fail(appError(ErrorCode.INVALID_INPUT, '输入为空'));
  }
  const name = normalizeText(input.name);
  if (name.length === 0) {
    return fail({ code: ErrorCode.INVALID_INPUT, message: '任务名称不能为空。' });
  }
  if (name.length > 100) {
    return fail({ code: ErrorCode.INVALID_INPUT, message: '任务名称过长（最多 100 字）。' });
  }
  const keywords = dedupeCaseInsensitive(
    (input.keywords ?? []).map(normalizeText).filter((k) => k.length > 0),
  );
  if (keywords.length === 0) {
    return fail({ code: ErrorCode.INVALID_INPUT, message: '请至少填写一个关键词。' });
  }
  if (!TASK_CATEGORIES.has(input.category)) {
    return fail({ code: ErrorCode.INVALID_INPUT, message: '任务类别不合法。' });
  }
  if (input.relevanceConfig) {
    const config = input.relevanceConfig;
    const numeric = [config.titleWeight, config.snippetWeight, config.categoryBonus, config.timeInRangeBonus, config.timeOutOfRangePenalty, config.negativeKeywordPenalty, config.highThreshold, config.mediumThreshold];
    if (numeric.some((value) => !Number.isFinite(value)) || config.highThreshold < 0 || config.highThreshold > 100 || config.mediumThreshold < 0 || config.mediumThreshold > config.highThreshold) {
      return fail(appError(ErrorCode.INVALID_INPUT, '相关性权重和阈值无效。'));
    }
  }
  const language = input.language === 'en' || input.language === 'mixed' ? input.language : 'zh';
  return ok({
    name,
    keywords,
    language,
    category: input.category,
    dateRange: {
      from: input.dateRange?.from ?? null,
      to: input.dateRange?.to ?? null,
    },
    relevanceConfig: input.relevanceConfig ?? null,
    copyIds: Array.isArray(input.copyIds) ? [...input.copyIds] : [],
    notes: normalizeText(input.notes ?? ''),
  });
}

function notFoundError(): ReturnType<typeof appError> {
  return appError(ErrorCode.INVALID_INPUT, '任务不存在或已被删除', undefined);
}

export async function createTask(
  repo: Repository<Task>,
  input: TaskInput,
): Promise<Result<Task>> {
  const validated = validateTaskInput(input);
  if (!validated.ok) return validated;
  const now = nowIso();
  const task: Task = {
    id: createId(),
    name: validated.value.name,
    keywords: validated.value.keywords,
    language: validated.value.language,
    category: validated.value.category,
    dateRange: validated.value.dateRange,
    relevanceConfig: validated.value.relevanceConfig ?? DEFAULT_SETTINGS.defaultRelevanceConfig,
    copyIds: validated.value.copyIds,
    status: 'ACTIVE',
    notes: validated.value.notes,
    createdAt: now,
    updatedAt: now,
  };
  return repo.create(task);
}

export async function updateTask(
  repo: Repository<Task>,
  id: ID,
  input: TaskInput,
): Promise<Result<Task>> {
  const validated = validateTaskInput(input);
  if (!validated.ok) return validated;
  const existing = await repo.getById(id);
  if (!existing.ok) return existing;
  if (!existing.value) return fail(notFoundError());
  const next: Task = {
    ...existing.value,
    name: validated.value.name,
    keywords: validated.value.keywords,
    language: validated.value.language,
    category: validated.value.category,
    dateRange: validated.value.dateRange,
    relevanceConfig:
      validated.value.relevanceConfig ?? existing.value.relevanceConfig,
    copyIds: validated.value.copyIds,
    notes: validated.value.notes,
    updatedAt: nowIso(),
  };
  return repo.update(next);
}

export async function duplicateTask(
  repo: Repository<Task>,
  id: ID,
): Promise<Result<Task>> {
  const existing = await repo.getById(id);
  if (!existing.ok) return existing;
  if (!existing.value) return fail(notFoundError());
  const now = nowIso();
  const copy: Task = {
    ...existing.value,
    id: createId(),
    name: `${existing.value.name}（副本）`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  return repo.create(copy);
}

export async function deleteTask(
  repo: Repository<Task>,
  id: ID,
): Promise<Result<void>> {
  const existing = await repo.getById(id);
  if (!existing.ok) return existing;
  if (!existing.value) return fail(notFoundError());
  return repo.delete(id);
}

export async function setTaskStatus(
  repo: Repository<Task>,
  id: ID,
  status: TaskStatus,
): Promise<Result<Task>> {
  const validStatuses = new Set<string>(['ACTIVE', 'PAUSED', 'ARCHIVED']);
  if (!validStatuses.has(status)) {
    return fail({ code: ErrorCode.INVALID_INPUT, message: '任务状态不合法。' });
  }
  const existing = await repo.getById(id);
  if (!existing.ok) return existing;
  if (!existing.value) return fail(notFoundError());
  const next: Task = { ...existing.value, status, updatedAt: nowIso() };
  return repo.update(next);
}

export async function listTasks(
  repo: Repository<Task>,
  includeArchived = false,
): Promise<Result<Task[]>> {
  const all = await repo.getAll();
  if (!all.ok) return all;
  const tasks = includeArchived
    ? all.value
    : all.value.filter((t) => t.status !== 'ARCHIVED');
  return ok(tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
