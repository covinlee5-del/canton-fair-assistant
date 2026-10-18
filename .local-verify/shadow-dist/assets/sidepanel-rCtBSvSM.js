import { c as useState, j as jsxs, a as jsx, B as Button, u as useAsyncState, b as api, T as TASK_CATEGORY_LABELS, E as ErrorBanner, e as createRoot, S as StrictMode } from './styles-DZUm2YtA.js';
import { f as formatDateTime, t as toAppError, o as openOptionsPage, a as appError, E as ErrorCode, e as extensionVersion } from './side-panel-CdxqsBxr.js';

const PAGE_TYPE_LABELS = {
    search_results: '搜索结果页',
    note_detail: '笔记详情页',
    profile: '个人主页',
    other: '其他页面',
};
function ReadResult({ diagnostics }) {
    const [copied, setCopied] = useState(false);
    if (!diagnostics) {
        return (jsxs("section", { className: "card", children: [jsx("h2", { children: "\u6700\u8FD1\u8BFB\u53D6\u7ED3\u679C" }), jsx("p", { className: "muted", children: "\u5C1A\u672A\u8BFB\u53D6\u3002\u6253\u5F00\u5C0F\u7EA2\u4E66\u641C\u7D22\u7ED3\u679C\u9875\uFF0C\u7136\u540E\u70B9\u51FB\u4E0A\u65B9\u201C\u8BFB\u53D6\u5F53\u524D\u9875\u9762\u8BCA\u65AD\u201D\u3002" })] }));
    }
    const json = JSON.stringify(diagnostics, null, 2);
    async function copyJson() {
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }
        catch {
            // 剪贴板不可用时静默失败，用户仍可手动展开复制
        }
    }
    return (jsxs("section", { className: "card", children: [jsx("h2", { children: "\u6700\u8FD1\u8BFB\u53D6\u7ED3\u679C" }), jsxs("dl", { className: "diag-summary", children: [jsxs("div", { children: [jsx("dt", { children: "\u9875\u9762\u7C7B\u578B" }), jsx("dd", { children: PAGE_TYPE_LABELS[diagnostics.pageType ?? 'other'] ?? '未知' })] }), jsxs("div", { children: [jsx("dt", { children: "\u9875\u9762\u5730\u5740" }), jsx("dd", { children: diagnostics.pageUrl })] }), jsxs("div", { children: [jsx("dt", { children: "\u5019\u9009\u7B14\u8BB0" }), jsxs("dd", { children: [diagnostics.totalCandidates, "\uFF08\u53BB\u91CD\u94FE\u63A5\u6570\uFF09"] })] }), jsxs("div", { children: [jsx("dt", { children: "\u7B14\u8BB0\u5361\u7247" }), jsxs("dd", { children: [diagnostics.signals.noteSections, " \u4E2A"] })] }), jsxs("div", { children: [jsx("dt", { children: "\u8BFB\u53D6\u65F6\u95F4" }), jsx("dd", { children: formatDateTime(diagnostics.finishedAt) })] }), jsxs("div", { children: [jsx("dt", { children: "\u63D0\u53D6\u5668\u7248\u672C" }), jsx("dd", { children: diagnostics.selectorVersion })] })] }), diagnostics.errors.length > 0 ? (jsx("ul", { className: "diag-errors", children: diagnostics.errors.map((err, index) => (jsxs("li", { children: [err.code, "\uFF1A", err.message] }, index))) })) : (jsx("p", { className: "muted", children: "\u672A\u53D1\u73B0\u9519\u8BEF\u3002\u672C\u9636\u6BB5\u4E3A\u53EA\u8BFB\u8BCA\u65AD\uFF0C\u6B63\u5F0F\u63D0\u53D6\u5C06\u5728\u9636\u6BB5 3 \u5B9E\u73B0\u3002" })), jsx("div", { className: "row", children: jsx(Button, { onClick: () => void copyJson(), children: copied ? '已复制' : '复制诊断 JSON' }) }), jsxs("details", { style: { marginTop: 8 }, children: [jsx("summary", { children: "\u539F\u59CB\u8BCA\u65AD JSON" }), jsx("pre", { className: "json", children: json })] })] }));
}

function Home() {
    const dash = useAsyncState(() => api.dashboard(), []);
    const [reading, setReading] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [actionError, setActionError] = useState(null);
    const tasks = dash.data?.tasks ?? [];
    const currentTask = dash.data?.currentTask ?? null;
    async function handleRead() {
        setActionError(null);
        setReading(true);
        try {
            const res = await api.readPage();
            if (res.ok) {
                dash.reload();
            }
            else {
                setActionError(res.error);
            }
        }
        catch (cause) {
            setActionError(toAppError(cause));
        }
        finally {
            setReading(false);
        }
    }
    async function handleTaskChange(taskId) {
        setSwitching(true);
        setActionError(null);
        try {
            const res = await api.setDefaultTask(taskId === '' ? null : taskId);
            if (res.ok) {
                dash.reload();
            }
            else {
                setActionError(res.error);
            }
        }
        catch (cause) {
            setActionError(toAppError(cause));
        }
        finally {
            setSwitching(false);
        }
    }
    async function handleOpenManager() {
        try {
            await openOptionsPage();
        }
        catch (cause) {
            setActionError(appError(ErrorCode.UNKNOWN_ERROR, '打开管理页失败', cause));
        }
    }
    return (jsxs("div", { className: "page", children: [jsxs("section", { className: "card", children: [jsxs("div", { className: "row-between", children: [jsx("h2", { children: "\u5F53\u524D\u4EFB\u52A1" }), jsxs("span", { className: "hint", children: [tasks.length, " \u4E2A\u4EFB\u52A1"] })] }), tasks.length === 0 ? (jsx("p", { className: "muted", children: "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002\u8BF7\u5148\u5728\u7BA1\u7406\u9875\u521B\u5EFA\u4EFB\u52A1\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u8BFB\u53D6\u9875\u9762\u3002" })) : (jsxs("select", { className: "select", value: currentTask?.id ?? '', disabled: switching, onChange: (e) => void handleTaskChange(e.target.value), children: [jsx("option", { value: "", children: "\uFF08\u672A\u9009\u62E9\u4EFB\u52A1\uFF09" }), tasks.map((t) => (jsx("option", { value: t.id, children: t.name }, t.id)))] })), currentTask ? (jsxs("dl", { className: "diag-summary", style: { marginTop: 8 }, children: [jsxs("div", { children: [jsx("dt", { children: "\u7C7B\u522B" }), jsx("dd", { children: TASK_CATEGORY_LABELS[currentTask.category] })] }), jsxs("div", { children: [jsx("dt", { children: "\u5173\u952E\u8BCD" }), jsxs("dd", { children: [currentTask.keywords.length, " \u4E2A"] })] })] })) : null, jsx("div", { className: "row", style: { marginTop: 8 }, children: jsx(Button, { onClick: () => void handleOpenManager(), children: "\u6253\u5F00\u7BA1\u7406\u9875" }) })] }), jsxs("section", { className: "card", children: [jsx("h2", { children: "\u8BFB\u53D6\u5F53\u524D\u9875\u9762" }), jsx("p", { className: "hint", children: "\u8BF7\u5148\u5728\u6D4F\u89C8\u5668\u4E2D\u6B63\u5E38\u6253\u5F00\u5C0F\u7EA2\u4E66\u641C\u7D22\u7ED3\u679C\u9875\u5E76\u7B49\u5F85\u5185\u5BB9\u52A0\u8F7D\uFF0C\u7136\u540E\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u3002 \u672C\u9636\u6BB5\u53EA\u505A\u53EA\u8BFB\u8BCA\u65AD\uFF0C\u4E0D\u4F1A\u4FDD\u5B58\u7B14\u8BB0\uFF0C\u4E5F\u4E0D\u4F1A\u5411\u9875\u9762\u5199\u5165\u4EFB\u4F55\u5185\u5BB9\u3002" }), jsxs("div", { className: "row", children: [jsx(Button, { variant: "primary", onClick: () => void handleRead(), disabled: reading || !currentTask, children: reading ? '读取中…' : '读取当前页面诊断' }), !currentTask ? jsx("span", { className: "hint", children: "\u9700\u5148\u9009\u62E9\u5F53\u524D\u4EFB\u52A1" }) : null] }), jsx(ErrorBanner, { error: dash.error }), jsx(ErrorBanner, { error: actionError, onRetry: () => void handleRead() })] }), jsx(ReadResult, { diagnostics: dash.data?.lastDiagnostics ?? null }), jsx("p", { className: "hint", children: "\u6570\u636E\u4EC5\u4FDD\u5B58\u5728\u672C\u5730\u6D4F\u89C8\u5668\u4E2D\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u5230\u4EFB\u4F55\u670D\u52A1\u5668\u3002" })] }));
}

function App() {
    return (jsxs("div", { className: "app app-sidepanel", children: [jsxs("header", { className: "app-header", children: [jsx("h1", { children: "\u5E7F\u4EA4\u4F1A\u63A8\u5E7F\u52A9\u624B" }), jsxs("span", { className: "version", children: ["v", extensionVersion()] })] }), jsx(Home, {})] }));
}

const container = document.getElementById('root');
if (!container)
    throw new Error('未找到 #root 挂载点');
createRoot(container).render(jsx(StrictMode, { children: jsx(App, {}) }));
