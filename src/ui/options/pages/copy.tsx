import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { TASK_CATEGORY_LABELS, TASK_CATEGORY_ORDER } from '../../../shared/constants/categories';
import { toAppError } from '../../../shared/utils/result';
import type { AppError } from '../../../shared/types/base';
import type { CopyInput, CopyLanguage, PromotionalCopy } from '../../../shared/types/copy';

const EMPTY: CopyInput = {
  name: '',
  content: '',
  language: 'bilingual',
  scenario: 'GENERAL',
  tags: [],
};

const LANGUAGE_LABELS: Record<CopyLanguage, string> = {
  zh: '中文',
  en: '英文',
  bilingual: '中英双语',
};

export default function CopyPage() {
  const [copies, setCopies] = useState<PromotionalCopy[]>([]);
  const [editing, setEditing] = useState<PromotionalCopy | null>(null);
  const [input, setInput] = useState<CopyInput>(EMPTY);
  const [error, setError] = useState<AppError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const result = await api.copiesList();
    if (result.ok) setCopies(result.value);
    else setError(result.error);
  }

  useEffect(() => {
    void reload();
  }, []);

  function startEdit(copy: PromotionalCopy | null): void {
    setEditing(copy);
    setInput(
      copy
        ? {
            name: copy.name,
            content: copy.content,
            language: copy.language,
            scenario: copy.scenario,
            tags: copy.tags,
          }
        : EMPTY,
    );
    setError(null);
  }

  async function save(): Promise<void> {
    setError(null);
    try {
      const result = editing
        ? await api.copyUpdate(editing.id, input)
        : await api.copyCreate(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      startEdit(null);
      await reload();
    } catch (cause) {
      setError(toAppError(cause));
    }
  }

  async function remove(copy: PromotionalCopy): Promise<void> {
    if (!window.confirm(`确认删除文案“${copy.name}”？`)) return;
    const result = await api.copyDelete(copy.id);
    if (!result.ok) setError(result.error);
    else await reload();
  }

  async function markDefault(copy: PromotionalCopy): Promise<void> {
    const result = await api.copySetDefault(copy.id);
    if (!result.ok) setError(result.error);
    else await reload();
  }

  /** 只写系统剪贴板，不向任何页面写入内容（红线） */
  async function copyContent(copy: PromotionalCopy): Promise<void> {
    try {
      await navigator.clipboard.writeText(copy.content);
      setCopied(copy.id);
      window.setTimeout(() => setCopied(null), 1200);
    } catch (cause) {
      setError(toAppError(cause));
    }
  }

  return (
    <div>
      <ErrorBanner error={error} />

      <section className="card">
        <div className="row-between">
          <h2>{editing ? '编辑文案' : '新建文案'}</h2>
          <Button onClick={() => startEdit(null)}>清空</Button>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="copy-name">名称</label>
            <input
              id="copy-name"
              className="input"
              value={input.name}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
              maxLength={100}
            />
          </div>
          <div className="form-field">
            <label htmlFor="copy-language">语言</label>
            <select
              id="copy-language"
              className="select"
              value={input.language}
              onChange={(e) => setInput({ ...input, language: e.target.value as CopyLanguage })}
            >
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="copy-scenario">场景</label>
            <select
              id="copy-scenario"
              className="select"
              value={input.scenario}
              onChange={(e) =>
                setInput({ ...input, scenario: e.target.value as CopyInput['scenario'] })
              }
            >
              <option value="GENERAL">通用</option>
              {TASK_CATEGORY_ORDER.map((item) => (
                <option key={item} value={item}>
                  {TASK_CATEGORY_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="copy-content">文案内容</label>
          <textarea
            id="copy-content"
            className="textarea"
            rows={5}
            value={input.content}
            onChange={(e) => setInput({ ...input, content: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="copy-tags">标签（逗号分隔）</label>
          <input
            id="copy-tags"
            className="input"
            value={input.tags.join(', ')}
            onChange={(e) =>
              setInput({
                ...input,
                tags: e.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <Button variant="primary" onClick={() => void save()}>
          {editing ? '保存修改' : '保存文案'}
        </Button>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>文案库</h2>
          <span className="hint">{copies.length} 条</span>
        </div>
        {copies.length === 0 ? <p className="muted">还没有文案。</p> : null}
        {copies.map((copy) => (
          <div className="note-card" key={copy.id}>
            <div className="row-between">
              <strong>
                {copy.name}
                {copy.isDefault ? <span className="tag tag-success" style={{ marginLeft: 6 }}>默认</span> : null}
              </strong>
              <span className="hint">
                {LANGUAGE_LABELS[copy.language]} ·{' '}
                {copy.scenario === 'GENERAL' ? '通用' : TASK_CATEGORY_LABELS[copy.scenario]}
              </span>
            </div>
            <p className="note-card-snippet" style={{ whiteSpace: 'pre-wrap' }}>
              {copy.content}
            </p>
            <div className="row">
              <Button onClick={() => startEdit(copy)}>编辑</Button>
              <Button onClick={() => void copyContent(copy)}>
                {copied === copy.id ? '已复制' : '复制文案'}
              </Button>
              {copy.isDefault ? null : (
                <Button onClick={() => void markDefault(copy)}>设为默认</Button>
              )}
              <Button variant="danger" onClick={() => void remove(copy)}>
                删除
              </Button>
            </div>
          </div>
        ))}
      </section>

      <p className="hint">文案只保存在本地，复制只写入剪贴板，不会自动发送到任何页面。</p>
    </div>
  );
}
