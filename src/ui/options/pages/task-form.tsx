import { useState } from 'react';
import { api } from '../../api';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { TASK_CATEGORY_LABELS, TASK_CATEGORY_ORDER } from '../../../shared/constants/categories';
import { presetKeywordsFor } from '../../../shared/constants/keyword-presets';
import { toAppError } from '../../../shared/utils/result';
import type { AppError } from '../../../shared/types/base';
import { TaskCategory } from '../../../shared/types/task';
import type { Task, TaskInput, TaskLanguage } from '../../../shared/types/task';

const LANGUAGE_OPTIONS: Array<{ value: TaskLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'mixed', label: '中英混合' },
];

interface TaskFormProps {
  existing: Task | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function TaskForm({ existing, onSaved, onCancel }: TaskFormProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [keywordsText, setKeywordsText] = useState((existing?.keywords ?? []).join('\n'));
  const [language, setLanguage] = useState<TaskLanguage>(existing?.language ?? 'mixed');
  const [category, setCategory] = useState<TaskCategory>(
    existing?.category ?? TaskCategory.CANTON_FAIR,
  );
  const [from, setFrom] = useState(existing?.dateRange.from?.slice(0, 10) ?? '');
  const [to, setTo] = useState(existing?.dateRange.to?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);

  function applyPreset(): void {
    const preset = presetKeywordsFor(category);
    if (preset.length === 0) return;
    const current = keywordsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const lower = new Set(current.map((s) => s.toLocaleLowerCase()));
    const additions = preset.filter((k) => !lower.has(k.toLocaleLowerCase()));
    setKeywordsText([...current, ...additions].join('\n'));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const input: TaskInput = {
        name,
        keywords: keywordsText
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        language,
        category,
        dateRange: { from: from === '' ? null : from, to: to === '' ? null : to },
        relevanceConfig: existing?.relevanceConfig ?? null,
        copyIds: existing?.copyIds ?? [],
        notes,
      };
      const res = existing
        ? await api.taskUpdate(existing.id, input)
        : await api.taskCreate(input);
      if (res.ok) {
        onSaved();
      } else {
        setError(res.error);
      }
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="row-between">
        <h3>{existing ? '编辑任务' : '新建任务'}</h3>
        <span className="hint">保存到本地，不会上传</span>
      </div>
      <ErrorBanner error={error} />

      <div className="form-field">
        <label htmlFor="task-name">任务名称</label>
        <input
          id="task-name"
          className="input"
          value={name}
          maxLength={100}
          placeholder="例如：广交会翻译机会"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="task-keywords">关键词（每行一个）</label>
        <textarea
          id="task-keywords"
          className="textarea"
          rows={4}
          value={keywordsText}
          placeholder={'广交会\nCanton Fair\ninterpreter'}
          onChange={(e) => setKeywordsText(e.target.value)}
        />
        <div className="row" style={{ marginTop: 4 }}>
          <Button onClick={applyPreset}>填入该类别预设关键词</Button>
          <span className="hint">预设仅作模板，可随意修改</span>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="form-field" style={{ flex: 1 }}>
          <label htmlFor="task-category">目标类别</label>
          <select
            id="task-category"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
          >
            {TASK_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label htmlFor="task-language">关键词语言</label>
          <select
            id="task-language"
            className="select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as TaskLanguage)}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="form-field">
          <label htmlFor="task-from">目标时间范围（起）</label>
          <input
            id="task-from"
            type="date"
            className="input input-date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="task-to">目标时间范围（止）</label>
          <input
            id="task-to"
            type="date"
            className="input input-date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="task-notes">备注（可选）</label>
        <textarea
          id="task-notes"
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <p className="hint">
        高级筛选规则（权重、阈值、负向关键词）将在阶段 4 开放编辑，当前使用默认规则。
      </p>

      <div className="row">
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}
