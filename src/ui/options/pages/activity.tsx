import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { formatDateTime } from '../../../shared/utils/time';
import { toAppError } from '../../../shared/utils/result';
import type { AppError } from '../../../shared/types/base';
import type { OutreachActivity } from '../../../shared/types/activity';
import { ActivityAction } from '../../../shared/types/activity';
import type { Note } from '../../../shared/types/note';
import type { Task } from '../../../shared/types/task';

const ACTION_LABELS: Record<ActivityAction, string> = {
  [ActivityAction.OPEN_NOTE]: '打开笔记',
  [ActivityAction.COPY_TEXT]: '复制内容',
  [ActivityAction.MARK_REVIEWED]: '标为已审核',
  [ActivityAction.MARK_FOR_CONTACT]: '标为待联系',
  [ActivityAction.MARK_PROMOTED]: '标记已推广',
  [ActivityAction.MARK_REPLIED]: '标记已回复',
  [ActivityAction.MARK_CONTACTED]: '标记已联系',
  [ActivityAction.MARK_IRRELEVANT]: '标为不相关',
  [ActivityAction.ADD_NOTE]: '新增备注',
  [ActivityAction.EDIT_NOTE]: '编辑内容',
  [ActivityAction.TASK_CREATED]: '创建任务',
  [ActivityAction.TASK_UPDATED]: '更新任务',
  [ActivityAction.TASK_DELETED]: '删除任务',
};

/** 阶段 4 T4.5：本地活动记录只读列表（证明打开/复制/手动标记都会留痕） */
export default function ActivityPage() {
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  async function reload(): Promise<void> {
    setLoading(true);
    try {
      const [acts, noteList, taskList] = await Promise.all([
        api.activityList(),
        api.notesList({}),
        api.taskList(true),
      ]);
      if (acts.ok) setActivities(acts.value); else setError(acts.error);
      if (noteList.ok) setNotes(noteList.value); else setError(noteList.error);
      if (taskList.ok) setTasks(taskList.value); else setError(taskList.error);
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const noteTitle = (noteId: string | null): string => {
    if (!noteId) return '—';
    return notes.find((note) => note.id === noteId)?.title || '（笔记已删除或未关联）';
  };

  /** 任务列显示任务名；任务已被删除时给出提示，绝不显示原始 ID */
  const taskName = (taskId: string | null): string => {
    if (!taskId) return '—';
    return tasks.find((task) => task.id === taskId)?.name || '（任务已删除）';
  };

  const filtered = onlyMine
    ? activities.filter(
        (item) =>
          item.action === ActivityAction.OPEN_NOTE || item.action === ActivityAction.COPY_TEXT,
      )
    : activities;

  return (
    <div>
      <div className="row-between">
        <h2>活动记录</h2>
        <span className="hint">{filtered.length} 条</span>
      </div>
      <p className="hint">
        打开笔记和复制内容只会记录活动，不会改变笔记状态；「已推广」「已回复」「已联系」只在你手动点击后记录。
        记录仅保存在本地。
      </p>

      <ErrorBanner error={error} onRetry={() => void reload()} />

      <div className="card">
        <div className="row">
          <label className="checkbox-row">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            只看打开/复制
          </label>
          <Button onClick={() => void reload()}>刷新</Button>
        </div>
      </div>

      {loading ? <p className="muted">加载中…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="empty-state">
          还没有活动记录。打开一条笔记或复制一次文案后，这里会出现对应记录。
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>动作</th>
                <th>笔记</th>
                <th>任务</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.actionAt)}</td>
                  <td>{ACTION_LABELS[item.action] ?? item.action}</td>
                  <td title={noteTitle(item.noteId)}>{noteTitle(item.noteId)}</td>
                  <td title={taskName(item.taskId)}>{taskName(item.taskId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
