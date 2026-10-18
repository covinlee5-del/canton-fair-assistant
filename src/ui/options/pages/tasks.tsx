import { useState } from 'react';
import { api } from '../../api';
import { useAsyncState } from '../../shared/hooks/useAsyncState';
import { Button } from '../../shared/components/Button';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';
import { StatusTag } from '../../shared/components/StatusTag';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { TaskForm } from './task-form';
import { TASK_CATEGORY_LABELS } from '../../../shared/constants/categories';
import { TASK_STATUS_LABELS } from '../../../shared/constants/statuses';
import { formatDateTime } from '../../../shared/utils/time';
import { toAppError } from '../../../shared/utils/result';
import type { AppError } from '../../../shared/types/base';
import type { Task } from '../../../shared/types/task';

type FormMode = { type: 'create' } | { type: 'edit'; task: Task } | null;

export default function Tasks() {
  const list = useAsyncState(() => api.taskList(false), []);
  const [form, setForm] = useState<FormMode>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);

  const tasks = list.data ?? [];

  async function runAction(fn: () => Promise<{ ok: boolean; error?: AppError }>): Promise<void> {
    setActionError(null);
    try {
      const res = await fn();
      if (res.ok) {
        list.reload();
      } else if (res.error) {
        setActionError(res.error);
      }
    } catch (cause) {
      setActionError(toAppError(cause));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleting) return;
    const target = deleting;
    await runAction(async () => {
      const res = await api.taskDelete(target.id);
      if (res.ok) setDeleting(null);
      return res;
    });
  }

  return (
    <div>
      <div className="row-between">
        <h2>任务管理</h2>
        <Button variant="primary" onClick={() => setForm({ type: 'create' })}>
          新建任务
        </Button>
      </div>
      <p className="hint">
        任务只保存在本地。创建任务不会自动抓取搜索结果——请在小红书页面正常搜索后，用侧边栏读取当前页面。
      </p>

      <ErrorBanner error={list.error} onRetry={list.reload} />
      <ErrorBanner error={actionError} />

      {form ? (
        <TaskForm
          existing={form.type === 'edit' ? form.task : null}
          onSaved={() => {
            setForm(null);
            list.reload();
          }}
          onCancel={() => setForm(null)}
        />
      ) : null}

      {list.status === 'loading' ? <p className="muted">加载中…</p> : null}

      {list.status === 'success' && tasks.length === 0 && !form ? (
        <div className="empty-state">
          还没有任务。点击右上角“新建任务”开始。
        </div>
      ) : null}

      {tasks.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>关键词</th>
                <th>类别</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.name}</td>
                  <td>{task.keywords.length} 个</td>
                  <td>{TASK_CATEGORY_LABELS[task.category]}</td>
                  <td>
                    <StatusTag
                      label={TASK_STATUS_LABELS[task.status]}
                      tone={
                        task.status === 'ACTIVE'
                          ? 'success'
                          : task.status === 'PAUSED'
                            ? 'warn'
                            : 'neutral'
                      }
                    />
                  </td>
                  <td>{formatDateTime(task.updatedAt)}</td>
                  <td>
                    <Button onClick={() => setForm({ type: 'edit', task })}>编辑</Button>
                    <Button onClick={() => void runAction(() => api.taskDuplicate(task.id))}>
                      复制
                    </Button>
                    <Button
                      onClick={() =>
                        void runAction(() =>
                          api.taskSetStatus(
                            task.id,
                            task.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                          ),
                        )
                      }
                    >
                      {task.status === 'ACTIVE' ? '暂停' : '启用'}
                    </Button>
                    <Button variant="danger" onClick={() => setDeleting(task)}>
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="删除任务"
        message={`确定删除任务“${deleting?.name ?? ''}”吗？关联的笔记不会被删除，只会解除关联。`}
        confirmLabel="删除"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
