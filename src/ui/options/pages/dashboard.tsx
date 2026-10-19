import { api } from '../../api';
import { useAsyncState } from '../../shared/hooks/useAsyncState';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { Button } from '../../shared/components/Button';
import { TASK_CATEGORY_LABELS } from '../../../shared/constants/categories';
import { formatDateTime } from '../../../shared/utils/time';
import type { NavKey } from '../nav';

interface DashboardProps {
  onNavigate: (key: NavKey) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const dash = useAsyncState(() => api.dashboard(), []);
  const data = dash.data;
  const currentTask = data?.currentTask ?? null;
  const diagnostics = data?.lastDiagnostics ?? null;

  return (
    <div>
      <h2>首页概况</h2>
      <ErrorBanner error={dash.error} onRetry={dash.reload} />

      <div className="card">
        <h3>当前任务</h3>
        {currentTask ? (
          <p>
            {currentTask.name}
            <span className="hint">
              （{TASK_CATEGORY_LABELS[currentTask.category]} · {currentTask.keywords.length} 个关键词）
            </span>
          </p>
        ) : (
          <p className="muted">尚未选择当前任务。</p>
        )}
        <div className="row">
          <Button onClick={() => onNavigate('tasks')}>去任务管理</Button>
        </div>
      </div>

      <div className="card">
        <h3>任务与数据</h3>
        <dl className="diag-summary">
          <div>
            <dt>任务总数</dt>
            <dd>{dash.status === 'success' ? (data?.tasks.length ?? 0) : '—'}</dd>
          </div>
          <div>
            <dt>笔记总数</dt>
            <dd>{dash.status === 'success' ? (data?.noteCount ?? 0) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3>最近一次页面读取</h3>
        {diagnostics ? (
          <dl className="diag-summary">
            <div>
              <dt>读取时间</dt>
              <dd>{formatDateTime(diagnostics.finishedAt)}</dd>
            </div>
            <div>
              <dt>候选笔记</dt>
              <dd>{diagnostics.totalCandidates}</dd>
            </div>
            <div>
              <dt>页面</dt>
              <dd>{diagnostics.pageUrl}</dd>
            </div>
            <div>
              <dt>错误</dt>
              <dd>
                {diagnostics.errors.length === 0
                  ? '无'
                  : diagnostics.errors.map((e) => e.code).join(', ')}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            尚无读取记录。打开扩展侧边栏，点击“读取当前页面诊断”。
          </p>
        )}
      </div>
    </div>
  );
}
