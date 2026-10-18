import { u as useAsyncState, j as jsxs, a as jsx, E as ErrorBanner, T as TASK_CATEGORY_LABELS, B as Button, b as api, c as useState, d as TASK_CATEGORY_ORDER, e as createRoot, S as StrictMode } from './styles-DZUm2YtA.js';
import { f as formatDateTime, T as TaskCategory, t as toAppError, e as extensionVersion } from './side-panel-CdxqsBxr.js';

const NAV_ITEMS = [
    { key: 'dashboard', label: '首页' },
    { key: 'tasks', label: '任务' },
    { key: 'notes', label: '笔记' },
    { key: 'copy', label: '文案' },
    { key: 'stats', label: '统计' },
    { key: 'settings', label: '设置' },
];

function Dashboard({ onNavigate }) {
    const dash = useAsyncState(() => api.dashboard(), []);
    const data = dash.data;
    const currentTask = data?.currentTask ?? null;
    const diagnostics = data?.lastDiagnostics ?? null;
    return (jsxs("div", { children: [jsx("h2", { children: "\u9996\u9875\u6982\u51B5" }), jsx(ErrorBanner, { error: dash.error, onRetry: dash.reload }), jsxs("div", { className: "card", children: [jsx("h3", { children: "\u5F53\u524D\u4EFB\u52A1" }), currentTask ? (jsxs("p", { children: [currentTask.name, jsxs("span", { className: "hint", children: ["\uFF08", TASK_CATEGORY_LABELS[currentTask.category], " \u00B7 ", currentTask.keywords.length, " \u4E2A\u5173\u952E\u8BCD\uFF09"] })] })) : (jsx("p", { className: "muted", children: "\u5C1A\u672A\u9009\u62E9\u5F53\u524D\u4EFB\u52A1\u3002" })), jsx("div", { className: "row", children: jsx(Button, { onClick: () => onNavigate('tasks'), children: "\u53BB\u4EFB\u52A1\u7BA1\u7406" }) })] }), jsxs("div", { className: "card", children: [jsx("h3", { children: "\u4EFB\u52A1\u4E0E\u6570\u636E" }), jsxs("dl", { className: "diag-summary", children: [jsxs("div", { children: [jsx("dt", { children: "\u4EFB\u52A1\u603B\u6570" }), jsx("dd", { children: dash.status === 'success' ? (data?.tasks.length ?? 0) : '—' })] }), jsxs("div", { children: [jsx("dt", { children: "\u7B14\u8BB0\u603B\u6570" }), jsx("dd", { children: "0\uFF08\u9636\u6BB5 3 \u8D77\u63D0\u4F9B\uFF09" })] })] })] }), jsxs("div", { className: "card", children: [jsx("h3", { children: "\u6700\u8FD1\u4E00\u6B21\u9875\u9762\u8BFB\u53D6" }), diagnostics ? (jsxs("dl", { className: "diag-summary", children: [jsxs("div", { children: [jsx("dt", { children: "\u8BFB\u53D6\u65F6\u95F4" }), jsx("dd", { children: formatDateTime(diagnostics.finishedAt) })] }), jsxs("div", { children: [jsx("dt", { children: "\u5019\u9009\u7B14\u8BB0" }), jsx("dd", { children: diagnostics.totalCandidates })] }), jsxs("div", { children: [jsx("dt", { children: "\u9875\u9762" }), jsx("dd", { children: diagnostics.pageUrl })] }), jsxs("div", { children: [jsx("dt", { children: "\u9519\u8BEF" }), jsx("dd", { children: diagnostics.errors.length === 0
                                            ? '无'
                                            : diagnostics.errors.map((e) => e.code).join(', ') })] })] })) : (jsx("p", { className: "muted", children: "\u5C1A\u65E0\u8BFB\u53D6\u8BB0\u5F55\u3002\u6253\u5F00\u6269\u5C55\u4FA7\u8FB9\u680F\uFF0C\u70B9\u51FB\u201C\u8BFB\u53D6\u5F53\u524D\u9875\u9762\u8BCA\u65AD\u201D\u3002" }))] })] }));
}

function ConfirmDialog({ open, title, message, confirmLabel = '确认', cancelLabel = '取消', onConfirm, onCancel, }) {
    if (!open)
        return null;
    return (jsx("div", { className: "dialog-overlay", children: jsxs("div", { className: "dialog", role: "dialog", "aria-modal": "true", children: [jsx("h3", { children: title }), jsx("p", { children: message }), jsxs("div", { className: "dialog-actions", children: [jsx(Button, { onClick: onCancel, children: cancelLabel }), jsx(Button, { variant: "danger", onClick: onConfirm, children: confirmLabel })] })] }) }));
}

function StatusTag({ label, tone = 'neutral' }) {
    return jsx("span", { className: `tag tag-${tone}`, children: label });
}

// 初始关键词库（PRD 7.3）
// 仅作为初始模板，不代表这些关键词一定能在小红书搜索到内容。用户可随时增删改。
const KEYWORD_PRESETS = {
    [TaskCategory.CANTON_FAIR]: [
        '广交会',
        'Canton Fair',
        'China Import and Export Fair',
        'Guangzhou trade fair',
    ],
    [TaskCategory.FOREIGN_BUYER]: [
        '外商采购',
        'foreign buyer',
        'sourcing in China',
        'business meeting',
        'business matching',
    ],
    [TaskCategory.INTERPRETER]: [
        '英语翻译',
        '展会翻译',
        '商务陪同',
        'interpreter',
        'exhibition interpreter',
    ],
    [TaskCategory.EXHIBITION_COMPANION]: [
        '展会陪同',
        '广交会陪同',
        'trade show companion',
        'fair escort',
    ],
    [TaskCategory.BUSINESS_RECEPTION]: [
        '商务接待',
        '商务沟通',
        'business reception',
        'networking',
    ],
};
/** 按类目取预设关键词；OTHER 返回空数组 */
function presetKeywordsFor(category) {
    if (category === TaskCategory.OTHER)
        return [];
    return [...(KEYWORD_PRESETS[category] ?? [])];
}

const LANGUAGE_OPTIONS = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英文' },
    { value: 'mixed', label: '中英混合' },
];
function TaskForm({ existing, onSaved, onCancel }) {
    const [name, setName] = useState(existing?.name ?? '');
    const [keywordsText, setKeywordsText] = useState((existing?.keywords ?? []).join('\n'));
    const [language, setLanguage] = useState(existing?.language ?? 'mixed');
    const [category, setCategory] = useState(existing?.category ?? TaskCategory.CANTON_FAIR);
    const [from, setFrom] = useState(existing?.dateRange.from?.slice(0, 10) ?? '');
    const [to, setTo] = useState(existing?.dateRange.to?.slice(0, 10) ?? '');
    const [notes, setNotes] = useState(existing?.notes ?? '');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    function applyPreset() {
        const preset = presetKeywordsFor(category);
        if (preset.length === 0)
            return;
        const current = keywordsText
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const lower = new Set(current.map((s) => s.toLocaleLowerCase()));
        const additions = preset.filter((k) => !lower.has(k.toLocaleLowerCase()));
        setKeywordsText([...current, ...additions].join('\n'));
    }
    async function handleSubmit() {
        setError(null);
        setSaving(true);
        try {
            const input = {
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
            }
            else {
                setError(res.error);
            }
        }
        catch (cause) {
            setError(toAppError(cause));
        }
        finally {
            setSaving(false);
        }
    }
    return (jsxs("div", { className: "card", children: [jsxs("div", { className: "row-between", children: [jsx("h3", { children: existing ? '编辑任务' : '新建任务' }), jsx("span", { className: "hint", children: "\u4FDD\u5B58\u5230\u672C\u5730\uFF0C\u4E0D\u4F1A\u4E0A\u4F20" })] }), jsx(ErrorBanner, { error: error }), jsxs("div", { className: "form-field", children: [jsx("label", { htmlFor: "task-name", children: "\u4EFB\u52A1\u540D\u79F0" }), jsx("input", { id: "task-name", className: "input", value: name, maxLength: 100, placeholder: "\u4F8B\u5982\uFF1A\u5E7F\u4EA4\u4F1A\u7FFB\u8BD1\u673A\u4F1A", onChange: (e) => setName(e.target.value) })] }), jsxs("div", { className: "form-field", children: [jsx("label", { htmlFor: "task-keywords", children: "\u5173\u952E\u8BCD\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09" }), jsx("textarea", { id: "task-keywords", className: "textarea", rows: 4, value: keywordsText, placeholder: '广交会\nCanton Fair\ninterpreter', onChange: (e) => setKeywordsText(e.target.value) }), jsxs("div", { className: "row", style: { marginTop: 4 }, children: [jsx(Button, { onClick: applyPreset, children: "\u586B\u5165\u8BE5\u7C7B\u522B\u9884\u8BBE\u5173\u952E\u8BCD" }), jsx("span", { className: "hint", children: "\u9884\u8BBE\u4EC5\u4F5C\u6A21\u677F\uFF0C\u53EF\u968F\u610F\u4FEE\u6539" })] })] }), jsxs("div", { className: "row", style: { gap: 12 }, children: [jsxs("div", { className: "form-field", style: { flex: 1 }, children: [jsx("label", { htmlFor: "task-category", children: "\u76EE\u6807\u7C7B\u522B" }), jsx("select", { id: "task-category", className: "select", value: category, onChange: (e) => setCategory(e.target.value), children: TASK_CATEGORY_ORDER.map((c) => (jsx("option", { value: c, children: TASK_CATEGORY_LABELS[c] }, c))) })] }), jsxs("div", { className: "form-field", style: { flex: 1 }, children: [jsx("label", { htmlFor: "task-language", children: "\u5173\u952E\u8BCD\u8BED\u8A00" }), jsx("select", { id: "task-language", className: "select", value: language, onChange: (e) => setLanguage(e.target.value), children: LANGUAGE_OPTIONS.map((opt) => (jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] })] }), jsxs("div", { className: "row", style: { gap: 12 }, children: [jsxs("div", { className: "form-field", children: [jsx("label", { htmlFor: "task-from", children: "\u76EE\u6807\u65F6\u95F4\u8303\u56F4\uFF08\u8D77\uFF09" }), jsx("input", { id: "task-from", type: "date", className: "input input-date", value: from, onChange: (e) => setFrom(e.target.value) })] }), jsxs("div", { className: "form-field", children: [jsx("label", { htmlFor: "task-to", children: "\u76EE\u6807\u65F6\u95F4\u8303\u56F4\uFF08\u6B62\uFF09" }), jsx("input", { id: "task-to", type: "date", className: "input input-date", value: to, onChange: (e) => setTo(e.target.value) })] })] }), jsxs("div", { className: "form-field", children: [jsx("label", { htmlFor: "task-notes", children: "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09" }), jsx("textarea", { id: "task-notes", className: "textarea", rows: 2, value: notes, onChange: (e) => setNotes(e.target.value) })] }), jsx("p", { className: "hint", children: "\u9AD8\u7EA7\u7B5B\u9009\u89C4\u5219\uFF08\u6743\u91CD\u3001\u9608\u503C\u3001\u8D1F\u5411\u5173\u952E\u8BCD\uFF09\u5C06\u5728\u9636\u6BB5 4 \u5F00\u653E\u7F16\u8F91\uFF0C\u5F53\u524D\u4F7F\u7528\u9ED8\u8BA4\u89C4\u5219\u3002" }), jsxs("div", { className: "row", children: [jsx(Button, { variant: "primary", onClick: () => void handleSubmit(), disabled: saving, children: saving ? '保存中…' : '保存' }), jsx(Button, { onClick: onCancel, children: "\u53D6\u6D88" })] })] }));
}

// 笔记模型（docs/03 §4）
var NoteStatus;
(function (NoteStatus) {
    NoteStatus["NEW"] = "NEW";
    NoteStatus["REVIEWED"] = "REVIEWED";
    NoteStatus["MARKED_FOR_CONTACT"] = "MARKED_FOR_CONTACT";
    NoteStatus["PROMOTED"] = "PROMOTED";
    NoteStatus["REPLIED"] = "REPLIED";
    NoteStatus["CONTACTED"] = "CONTACTED";
    NoteStatus["IRRELEVANT"] = "IRRELEVANT";
})(NoteStatus || (NoteStatus = {}));

// 状态与等级展示标签
({
    [NoteStatus.NEW]: '新发现',
    [NoteStatus.REVIEWED]: '已审核',
    [NoteStatus.MARKED_FOR_CONTACT]: '待联系',
    [NoteStatus.PROMOTED]: '已完成推广',
    [NoteStatus.REPLIED]: '已收到回复',
    [NoteStatus.CONTACTED]: '已建立联系',
    [NoteStatus.IRRELEVANT]: '不相关',
});
const TASK_STATUS_LABELS = {
    ACTIVE: '进行中',
    PAUSED: '已暂停',
    ARCHIVED: '已归档',
};

function Tasks() {
    const list = useAsyncState(() => api.taskList(false), []);
    const [form, setForm] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [actionError, setActionError] = useState(null);
    const tasks = list.data ?? [];
    async function runAction(fn) {
        setActionError(null);
        try {
            const res = await fn();
            if (res.ok) {
                list.reload();
            }
            else if (res.error) {
                setActionError(res.error);
            }
        }
        catch (cause) {
            setActionError(toAppError(cause));
        }
    }
    async function handleDelete() {
        if (!deleting)
            return;
        const target = deleting;
        await runAction(async () => {
            const res = await api.taskDelete(target.id);
            if (res.ok)
                setDeleting(null);
            return res;
        });
    }
    return (jsxs("div", { children: [jsxs("div", { className: "row-between", children: [jsx("h2", { children: "\u4EFB\u52A1\u7BA1\u7406" }), jsx(Button, { variant: "primary", onClick: () => setForm({ type: 'create' }), children: "\u65B0\u5EFA\u4EFB\u52A1" })] }), jsx("p", { className: "hint", children: "\u4EFB\u52A1\u53EA\u4FDD\u5B58\u5728\u672C\u5730\u3002\u521B\u5EFA\u4EFB\u52A1\u4E0D\u4F1A\u81EA\u52A8\u6293\u53D6\u641C\u7D22\u7ED3\u679C\u2014\u2014\u8BF7\u5728\u5C0F\u7EA2\u4E66\u9875\u9762\u6B63\u5E38\u641C\u7D22\u540E\uFF0C\u7528\u4FA7\u8FB9\u680F\u8BFB\u53D6\u5F53\u524D\u9875\u9762\u3002" }), jsx(ErrorBanner, { error: list.error, onRetry: list.reload }), jsx(ErrorBanner, { error: actionError }), form ? (jsx(TaskForm, { existing: form.type === 'edit' ? form.task : null, onSaved: () => {
                    setForm(null);
                    list.reload();
                }, onCancel: () => setForm(null) })) : null, list.status === 'loading' ? jsx("p", { className: "muted", children: "\u52A0\u8F7D\u4E2D\u2026" }) : null, list.status === 'success' && tasks.length === 0 && !form ? (jsx("div", { className: "empty-state", children: "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002\u70B9\u51FB\u53F3\u4E0A\u89D2\u201C\u65B0\u5EFA\u4EFB\u52A1\u201D\u5F00\u59CB\u3002" })) : null, tasks.length > 0 ? (jsx("div", { className: "card", style: { padding: 0, overflow: 'auto' }, children: jsxs("table", { children: [jsx("thead", { children: jsxs("tr", { children: [jsx("th", { children: "\u540D\u79F0" }), jsx("th", { children: "\u5173\u952E\u8BCD" }), jsx("th", { children: "\u7C7B\u522B" }), jsx("th", { children: "\u72B6\u6001" }), jsx("th", { children: "\u66F4\u65B0\u65F6\u95F4" }), jsx("th", { children: "\u64CD\u4F5C" })] }) }), jsx("tbody", { children: tasks.map((task) => (jsxs("tr", { children: [jsx("td", { children: task.name }), jsxs("td", { children: [task.keywords.length, " \u4E2A"] }), jsx("td", { children: TASK_CATEGORY_LABELS[task.category] }), jsx("td", { children: jsx(StatusTag, { label: TASK_STATUS_LABELS[task.status], tone: task.status === 'ACTIVE'
                                                ? 'success'
                                                : task.status === 'PAUSED'
                                                    ? 'warn'
                                                    : 'neutral' }) }), jsx("td", { children: formatDateTime(task.updatedAt) }), jsxs("td", { children: [jsx(Button, { onClick: () => setForm({ type: 'edit', task }), children: "\u7F16\u8F91" }), jsx(Button, { onClick: () => void runAction(() => api.taskDuplicate(task.id)), children: "\u590D\u5236" }), jsx(Button, { onClick: () => void runAction(() => api.taskSetStatus(task.id, task.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')), children: task.status === 'ACTIVE' ? '暂停' : '启用' }), jsx(Button, { variant: "danger", onClick: () => setDeleting(task), children: "\u5220\u9664" })] })] }, task.id))) })] }) })) : null, jsx(ConfirmDialog, { open: deleting !== null, title: "\u5220\u9664\u4EFB\u52A1", message: `确定删除任务“${deleting?.name ?? ''}”吗？关联的笔记不会被删除，只会解除关联。`, confirmLabel: "\u5220\u9664", onConfirm: () => void handleDelete(), onCancel: () => setDeleting(null) })] }));
}

function NotesPlaceholder() {
    return (jsxs("div", { children: [jsx("h2", { children: "\u7B14\u8BB0\u5217\u8868" }), jsx("div", { className: "empty-state", children: "\u7B14\u8BB0\u5217\u8868\u5C06\u5728\u9636\u6BB5 3\u20134 \u4EA4\u4ED8\uFF1A\u8BFB\u53D6\u5230\u7684\u7B14\u8BB0\u4F1A\u5728\u8FD9\u91CC\u5C55\u793A\u6807\u9898\u3001\u53EF\u89C1\u6458\u8981\u3001\u547D\u4E2D\u5173\u952E\u8BCD\u3001 \u76F8\u5173\u6027\u7B49\u7EA7\u3001\u5904\u7406\u72B6\u6001\uFF0C\u5E76\u652F\u6301\u641C\u7D22\u3001\u7B5B\u9009\u3001\u6392\u5E8F\u4E0E\u6279\u91CF\u6807\u8BB0\u4E0D\u76F8\u5173\u3002" })] }));
}

function CopyPlaceholder() {
    return (jsxs("div", { children: [jsx("h2", { children: "\u6587\u6848\u5E93" }), jsx("div", { className: "empty-state", children: "\u6587\u6848\u5E93\u5C06\u5728\u9636\u6BB5 4 \u4EA4\u4ED8\uFF1A\u7BA1\u7406\u4E2D\u6587\u3001\u82F1\u6587\u3001\u53CC\u8BED\u5BA3\u4F20\u6587\u6848\uFF0C\u8BBE\u7F6E\u9ED8\u8BA4\u6587\u6848\u5E76\u590D\u5236\u5230\u526A\u8D34\u677F\u3002 \u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u628A\u6587\u6848\u63D0\u4EA4\u5230\u4EFB\u4F55\u9875\u9762\u3002" })] }));
}

function StatsPlaceholder() {
    return (jsxs("div", { children: [jsx("h2", { children: "\u7EDF\u8BA1\u9762\u677F" }), jsx("div", { className: "empty-state", children: "\u7EDF\u8BA1\u9762\u677F\u5C06\u5728\u9636\u6BB5 5 \u4EA4\u4ED8\uFF1A\u8BFB\u53D6\u603B\u91CF\u3001\u9AD8\u76F8\u5173\u6570\u91CF\u3001\u5DF2\u5904\u7406\u3001\u63A8\u5E7F\u5B8C\u6210\u3001\u5DF2\u6536\u5230\u56DE\u590D\u3001 \u5DF2\u5EFA\u7ACB\u8054\u7CFB\u7B49\u6307\u6807\uFF0C\u4EE5\u53CA\u4E0D\u540C\u4EFB\u52A1\u7684\u6548\u679C\u5BF9\u6BD4\u3002\u63D2\u4EF6\u4E0D\u4F1A\u63A8\u65AD\u672A\u8BB0\u5F55\u7684\u66DD\u5149\u6216\u8F6C\u5316\u6570\u636E\u3002" })] }));
}

function SettingsPlaceholder() {
    return (jsxs("div", { children: [jsx("h2", { children: "\u8BBE\u7F6E\u4E0E\u5907\u4EFD" }), jsx("div", { className: "empty-state", children: "\u8BBE\u7F6E\u9875\u5C06\u5728\u9636\u6BB5 5 \u4EA4\u4ED8\uFF1A\u9ED8\u8BA4\u7B5B\u9009\u89C4\u5219\u3001\u9ED8\u8BA4\u4EFB\u52A1\u4E0E\u9ED8\u8BA4\u6587\u6848\u3001JSON \u6570\u636E\u5BFC\u51FA/\u5BFC\u5165\u3001 \u6E05\u9664\u672C\u5730\u6570\u636E\u3001\u7248\u672C\u4FE1\u606F\u4E0E\u9875\u9762\u8BFB\u53D6\u8BCA\u65AD\u4FE1\u606F\u3002" })] }));
}

function App() {
    const [nav, setNav] = useState('dashboard');
    return (jsxs("div", { className: "app app-options", children: [jsxs("header", { className: "app-header", children: [jsx("h1", { children: "\u5E7F\u4EA4\u4F1A\u63A8\u5E7F\u52A9\u624B" }), jsxs("span", { className: "version", children: ["v", extensionVersion(), " \u00B7 \u7BA1\u7406\u9875"] })] }), jsx("nav", { className: "nav", "aria-label": "\u9875\u9762\u5BFC\u822A", children: NAV_ITEMS.map((item) => (jsx("button", { type: "button", className: `nav-item${nav === item.key ? ' active' : ''}`, onClick: () => setNav(item.key), children: item.label }, item.key))) }), jsxs("main", { className: "page", children: [nav === 'dashboard' ? jsx(Dashboard, { onNavigate: setNav }) : null, nav === 'tasks' ? jsx(Tasks, {}) : null, nav === 'notes' ? jsx(NotesPlaceholder, {}) : null, nav === 'copy' ? jsx(CopyPlaceholder, {}) : null, nav === 'stats' ? jsx(StatsPlaceholder, {}) : null, nav === 'settings' ? jsx(SettingsPlaceholder, {}) : null] })] }));
}

const container = document.getElementById('root');
if (!container)
    throw new Error('未找到 #root 挂载点');
createRoot(container).render(jsx(StrictMode, { children: jsx(App, {}) }));
