import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTask,
  deleteTask,
  duplicateTask,
  listTasks,
  setTaskStatus,
  updateTask,
  validateTaskInput,
} from '../../src/services/task-service';
import { ok } from '../../src/shared/utils/result';
import { ErrorCode } from '../../src/shared/types/base';
import { TaskCategory } from '../../src/shared/types/task';
import type { ID, Result } from '../../src/shared/types/base';
import type { Task, TaskInput } from '../../src/shared/types/task';
import type { Repository } from '../../src/data/repository';

class MemoryTaskRepo implements Repository<Task> {
  private items = new Map<ID, Task>();

  async getAll(): Promise<Result<Task[]>> {
    return ok(Array.from(this.items.values()));
  }
  async getById(id: ID): Promise<Result<Task | null>> {
    return ok(this.items.get(id) ?? null);
  }
  async create(item: Task): Promise<Result<Task>> {
    this.items.set(item.id, item);
    return ok(item);
  }
  async update(item: Task): Promise<Result<Task>> {
    this.items.set(item.id, item);
    return ok(item);
  }
  async delete(id: ID): Promise<Result<void>> {
    this.items.delete(id);
    return ok(undefined);
  }
  size(): number {
    return this.items.size;
  }
}

function input(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    name: '广交会翻译机会',
    keywords: ['广交会', 'Canton Fair'],
    language: 'mixed',
    category: TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: null,
    copyIds: [],
    notes: '',
    ...overrides,
  };
}

describe('validateTaskInput', () => {
  it('拒绝空名称', () => {
    const res = validateTaskInput(input({ name: '   ' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ErrorCode.INVALID_INPUT);
  });

  it('拒绝无有效关键词', () => {
    const res = validateTaskInput(input({ keywords: ['', '  '] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('关键词');
  });

  it('关键词去重（大小写不敏感）并清理空白', () => {
    const res = validateTaskInput(input({ keywords: [' Canton Fair ', 'canton fair', '广交会'] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.keywords).toEqual(['Canton Fair', '广交会']);
  });

  it('拒绝非法类别', () => {
    const res = validateTaskInput(
      input({ category: 'NOT_A_CATEGORY' as unknown as TaskCategory }),
    );
    expect(res.ok).toBe(false);
  });
});

describe('任务服务', () => {
  let repo: MemoryTaskRepo;

  beforeEach(() => {
    repo = new MemoryTaskRepo();
  });

  it('创建任务默认状态为 ACTIVE 且补齐默认相关性规则', async () => {
    const res = await createTask(repo, input());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('ACTIVE');
    expect(res.value.relevanceConfig.highThreshold).toBeGreaterThan(0);
    expect(res.value.createdAt).toBe(res.value.updatedAt);
  });

  it('创建后可通过列表读取', async () => {
    await createTask(repo, input());
    const list = await listTasks(repo, false);
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.value).toHaveLength(1);
  });

  it('更新任务保留 id 并刷新 updatedAt', async () => {
    const created = await createTask(repo, input());
    if (!created.ok) throw new Error('创建失败');
    const updated = await updateTask(repo, created.value.id, input({ name: '新名称' }));
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.id).toBe(created.value.id);
    expect(updated.value.name).toBe('新名称');
    expect(updated.value.updatedAt >= created.value.updatedAt).toBe(true);
  });

  it('更新不存在的任务返回错误', async () => {
    const res = await updateTask(repo, 'missing-id', input());
    expect(res.ok).toBe(false);
  });

  it('复制任务生成新 id 与副本名称', async () => {
    const created = await createTask(repo, input());
    if (!created.ok) throw new Error('创建失败');
    const copy = await duplicateTask(repo, created.value.id);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.value.id).not.toBe(created.value.id);
    expect(copy.value.name).toContain('副本');
    expect(repo.size()).toBe(2);
  });

  it('暂停后不出现在默认列表，但可包含归档查询', async () => {
    const created = await createTask(repo, input());
    if (!created.ok) throw new Error('创建失败');
    await setTaskStatus(repo, created.value.id, 'ARCHIVED');
    const visible = await listTasks(repo, false);
    const all = await listTasks(repo, true);
    if (visible.ok) expect(visible.value).toHaveLength(0);
    if (all.ok) expect(all.value).toHaveLength(1);
  });

  it('拒绝非法状态值', async () => {
    const created = await createTask(repo, input());
    if (!created.ok) throw new Error('创建失败');
    const res = await setTaskStatus(repo, created.value.id, 'BROKEN' as Task['status']);
    expect(res.ok).toBe(false);
  });

  it('删除任务后无法再读取', async () => {
    const created = await createTask(repo, input());
    if (!created.ok) throw new Error('创建失败');
    const del = await deleteTask(repo, created.value.id);
    expect(del.ok).toBe(true);
    const read = await repo.getById(created.value.id);
    if (read.ok) expect(read.value).toBeNull();
  });
});
