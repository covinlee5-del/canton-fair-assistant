import { t as toAppError, b as ok, c as fail, s as storageError, T as TaskCategory, n as nowIso, E as ErrorCode, a as appError, u as unwrap$1, M as Message, i as isSidePanelSupported } from './assets/side-panel-CdxqsBxr.js';

// 消息路由器：注册 → 分发 → 统一包装 Result 信封（docs/02 §7）
// 注意：MV3 SW 可能随时被终止，处理器必须是幂等/持久化的，不依赖内存状态。
const handlers = new Map();
function register(name, handler) {
    handlers.set(name, handler);
}
function initMessageRouter() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const raw = message;
        const name = raw?.name;
        if (typeof name !== 'string')
            return false;
        const handler = handlers.get(name);
        if (!handler)
            return false;
        Promise.resolve()
            .then(() => handler(raw?.payload))
            .then((value) => {
            sendResponse({ ok: true, value });
        }, (cause) => {
            sendResponse({ ok: false, error: toAppError(cause) });
        });
        // 返回 true 表示异步 sendResponse（MV3 要求）
        return true;
    });
}

const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);

let idbProxyableTypes;
let cursorAdvanceMethods;
// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes() {
    return (idbProxyableTypes ||
        (idbProxyableTypes = [
            IDBIndex,
            IDBObjectStore,
            IDBCursor,
            IDBDatabase,
            IDBTransaction,
        ]));
}
// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods() {
    return (cursorAdvanceMethods ||
        (cursorAdvanceMethods = ['advance', 'continue', 'continuePrimaryKey'].map((method) => IDBCursor.prototype[method])));
}
const transactionDoneMap = new WeakMap();
const transformCache = new WeakMap();
const reverseTransformCache = new WeakMap();
function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
        const unlisten = () => {
            request.removeEventListener('success', success);
            request.removeEventListener('error', error);
        };
        const success = () => {
            resolve(wrap(request.result));
            unlisten();
        };
        const error = () => {
            reject(request.error);
            unlisten();
        };
        request.addEventListener('success', success);
        request.addEventListener('error', error);
    });
    // This mapping exists in reverseTransformCache but doesn't exist in transformCache. This
    // is because we create many promises from a single IDBRequest.
    reverseTransformCache.set(promise, request);
    return promise;
}
function cacheDonePromiseForTransaction(tx) {
    // Early bail if we've already created a done promise for this transaction.
    if (transactionDoneMap.has(tx))
        return;
    const done = new Promise((resolve, reject) => {
        const unlisten = () => {
            tx.removeEventListener('complete', complete);
            tx.removeEventListener('error', error);
            tx.removeEventListener('abort', error);
        };
        const complete = () => {
            resolve();
            unlisten();
        };
        const error = () => {
            reject(tx.error || new DOMException('AbortError', 'AbortError'));
            unlisten();
        };
        tx.addEventListener('complete', complete);
        tx.addEventListener('error', error);
        tx.addEventListener('abort', error);
    });
    // Cache it for later retrieval.
    transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
    get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
            // Special handling for transaction.done.
            if (prop === 'done')
                return transactionDoneMap.get(target);
            // Make tx.store return the only store in the transaction, or undefined if there are many.
            if (prop === 'store') {
                return receiver.objectStoreNames[1]
                    ? undefined
                    : receiver.objectStore(receiver.objectStoreNames[0]);
            }
        }
        // Else transform whatever we get back.
        return wrap(target[prop]);
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    },
    has(target, prop) {
        if (target instanceof IDBTransaction &&
            (prop === 'done' || prop === 'store')) {
            return true;
        }
        return prop in target;
    },
};
function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
    // Due to expected object equality (which is enforced by the caching in `wrap`), we
    // only create one new func per func.
    // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
    // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
    // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
    // with real promises, so each advance methods returns a new promise for the cursor object, or
    // undefined if the end of the cursor has been reached.
    if (getCursorAdvanceMethods().includes(func)) {
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            func.apply(unwrap(this), args);
            return wrap(this.request);
        };
    }
    return function (...args) {
        // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
        // the original object.
        return wrap(func.apply(unwrap(this), args));
    };
}
function transformCachableValue(value) {
    if (typeof value === 'function')
        return wrapFunction(value);
    // This doesn't return, it just creates a 'done' promise for the transaction,
    // which is later returned for transaction.done (see idbObjectHandler).
    if (value instanceof IDBTransaction)
        cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
        return new Proxy(value, idbProxyTraps);
    // Return the same value back if we're not going to transform it.
    return value;
}
function wrap(value) {
    // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
    // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
    if (value instanceof IDBRequest)
        return promisifyRequest(value);
    // If we've already transformed this value before, reuse the transformed value.
    // This is faster, but it also provides object equality.
    if (transformCache.has(value))
        return transformCache.get(value);
    const newValue = transformCachableValue(value);
    // Not all types are transformed.
    // These may be primitive types, so they can't be WeakMap keys.
    if (!Object.is(newValue, value)) {
        transformCache.set(value, newValue);
        reverseTransformCache.set(newValue, value);
    }
    return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);

/**
 * Open a database.
 *
 * @param name Name of the database.
 * @param version Schema version.
 * @param callbacks Additional callbacks.
 */
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
        request.addEventListener('upgradeneeded', (event) => {
            upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
        });
    }
    if (blocked) {
        request.addEventListener('blocked', (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion, event.newVersion, event));
    }
    openPromise
        .then((db) => {
        if (terminated)
            db.addEventListener('close', () => terminated());
        if (blocking) {
            db.addEventListener('versionchange', (event) => blocking(event.oldVersion, event.newVersion, event));
        }
    })
        .catch(() => { });
    return openPromise;
}

const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
const writeMethods = ['put', 'add', 'delete', 'clear'];
const cachedMethods = {};
function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase &&
        !(prop in target) &&
        typeof prop === 'string')) {
        return;
    }
    if (cachedMethods[prop])
        return cachedMethods[prop];
    const targetFuncName = prop.replace(/FromIndex$/, '');
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
        !(isWrite || readMethods.includes(targetFuncName))) {
        return;
    }
    const method = async function (storeName, ...args) {
        // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
        const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
        let target = tx.store;
        if (useIndex)
            target = target.index(args.shift());
        // Must reject if op rejects.
        // If it's a write operation, must reject if tx.done rejects.
        // Must reject with op rejection first.
        // Must resolve with op value.
        // Must handle both promises (no unhandled rejections)
        return (await Promise.all([
            target[targetFuncName](...args),
            isWrite && tx.done,
        ]))[0];
    };
    return (cachedMethods[prop] = method);
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
}));

const advanceMethodProps = ['advance', 'continue', 'continuePrimaryKey'];
const methodMap = {};
const advanceResults = new WeakMap();
const ittrProxiedCursorToOriginalProxy = new WeakMap();
const cursorIteratorTraps = {
    get(target, prop) {
        if (!advanceMethodProps.includes(prop))
            return target[prop];
        let cachedFunc = methodMap[prop];
        if (!cachedFunc) {
            cachedFunc = methodMap[prop] = function (...args) {
                advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
            };
        }
        return cachedFunc;
    },
};
async function* iterate(...args) {
    // tslint:disable-next-line:no-this-assignment
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
        cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
        return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    // Map this double-proxy back to the original, so other cursor methods work.
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
        yield proxiedCursor;
        // If one of the advancing methods was not called, call continue().
        cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
        advanceResults.delete(proxiedCursor);
    }
}
function isIteratorProp(target, prop) {
    return ((prop === Symbol.asyncIterator &&
        instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
        (prop === 'iterate' && instanceOfAny(target, [IDBIndex, IDBObjectStore])));
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
        if (isIteratorProp(target, prop))
            return iterate;
        return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
        return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    },
}));

// 数据库结构迁移（docs/03 §11 数据格式升级策略）
// 迁移在 idb 的 upgrade 事务中执行：任一步骤抛出异常则整次升级回滚，
// 原数据保留（idb 语义），后续读取会返回 STORAGE_ERROR。
const CURRENT_SCHEMA_VERSION = 1;
function runMigrations(db, oldVersion) {
    if (oldVersion < 1) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('by-status', 'status');
        tasks.createIndex('by-updatedAt', 'updatedAt');
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('by-status', 'status');
        notes.createIndex('by-taskIds', 'taskIds', { multiEntry: true });
        notes.createIndex('by-updatedAt', 'updatedAt');
        const copies = db.createObjectStore('copies', { keyPath: 'id' });
        copies.createIndex('by-updatedAt', 'updatedAt');
        const activities = db.createObjectStore('activities', { keyPath: 'id' });
        activities.createIndex('by-noteId', 'noteId');
        activities.createIndex('by-taskId', 'taskId');
        activities.createIndex('by-actionAt', 'actionAt');
        db.createObjectStore('meta');
    }
    // 未来版本：
    // if (oldVersion < 2) { ... }
}

// IndexedDB 打开与连接管理（idb 封装）
// 扩展的 SW / 侧边栏 / 管理页共享同一 origin，因此共享同一个数据库。
const DB_NAME = 'canton-fair-assistant';
const DB_VERSION = CURRENT_SCHEMA_VERSION;
let dbPromise = null;
function getDb() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                runMigrations(db, oldVersion);
            },
        }).catch((cause) => {
            // 打开失败时重置 promise，允许重试
            dbPromise = null;
            throw cause;
        });
    }
    return dbPromise;
}

// Repository 基础接口与实现（docs/02 §2 数据访问层）
// 所有方法返回 Result；底层异常统一映射为 STORAGE_ERROR，绝不静默。
class BaseRepository {
    async getAll() {
        try {
            const db = await getDb();
            const items = await db.getAll(this.storeName);
            return ok(items);
        }
        catch (cause) {
            return fail(storageError('读取数据失败', cause));
        }
    }
    async getById(id) {
        try {
            const db = await getDb();
            const item = await db.get(this.storeName, id);
            return ok(item ?? null);
        }
        catch (cause) {
            return fail(storageError('读取数据失败', cause));
        }
    }
    async create(item) {
        try {
            const db = await getDb();
            await db.add(this.storeName, item);
            return ok(item);
        }
        catch (cause) {
            return fail(storageError('保存数据失败', cause));
        }
    }
    async update(item) {
        try {
            const db = await getDb();
            await db.put(this.storeName, item);
            return ok(item);
        }
        catch (cause) {
            return fail(storageError('保存数据失败', cause));
        }
    }
    async delete(id) {
        try {
            const db = await getDb();
            await db.delete(this.storeName, id);
            return ok(undefined);
        }
        catch (cause) {
            return fail(storageError('删除数据失败', cause));
        }
    }
}

class TaskRepository extends BaseRepository {
    storeName = 'tasks';
}

// ID 生成
function createId() {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
    }
    // 降级：无 crypto.randomUUID 的环境（如旧浏览器）
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// 文本规范化工具
/** trim + 折叠连续空白为单个空格；null/undefined → '' */
function normalizeText(input) {
    if (input == null)
        return '';
    return input.replace(/\s+/g, ' ').trim();
}
/** 大小写不敏感去重（保留首次出现顺序与原文） */
function dedupeCaseInsensitive(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = item.toLocaleLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

// 设置模型（docs/03 §7）
// 不保存平台密码、Cookie 或会话凭证（任何形式）。
const DEFAULT_SETTINGS = {
    defaultTaskId: null,
    defaultCopyId: null,
    defaultRelevanceConfig: {
        titleWeight: 3,
        snippetWeight: 1,
        categoryBonus: 10,
        timeInRangeBonus: 5,
        timeOutOfRangePenalty: -10,
        negativeKeywordPenalty: -15,
        negativeKeywords: [],
        highThreshold: 50,
        mediumThreshold: 27,
    },
    uiPrefs: {
        theme: 'system',
        collapsedLowRelevance: true,
        pageSize: 20,
    },
    backup: {
        lastExportAt: null,
        exportReminder: true,
    },
    privacy: {
        keepDiagnostics: true,
    },
};

// 任务服务：校验、创建、更新、复制、删除、列表（docs/06 T2.4）
const TASK_CATEGORIES = new Set(Object.values(TaskCategory));
/** 输入校验：返回规范化后的输入 */
function validateTaskInput(input) {
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
    const keywords = dedupeCaseInsensitive((input.keywords ?? []).map(normalizeText).filter((k) => k.length > 0));
    if (keywords.length === 0) {
        return fail({ code: ErrorCode.INVALID_INPUT, message: '请至少填写一个关键词。' });
    }
    if (!TASK_CATEGORIES.has(input.category)) {
        return fail({ code: ErrorCode.INVALID_INPUT, message: '任务类别不合法。' });
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
function notFoundError() {
    return appError(ErrorCode.INVALID_INPUT, '任务不存在或已被删除', undefined);
}
async function createTask(repo, input) {
    const validated = validateTaskInput(input);
    if (!validated.ok)
        return validated;
    const now = nowIso();
    const task = {
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
async function updateTask(repo, id, input) {
    const validated = validateTaskInput(input);
    if (!validated.ok)
        return validated;
    const existing = await repo.getById(id);
    if (!existing.ok)
        return existing;
    if (!existing.value)
        return fail(notFoundError());
    const next = {
        ...existing.value,
        name: validated.value.name,
        keywords: validated.value.keywords,
        language: validated.value.language,
        category: validated.value.category,
        dateRange: validated.value.dateRange,
        relevanceConfig: validated.value.relevanceConfig ?? existing.value.relevanceConfig,
        copyIds: validated.value.copyIds,
        notes: validated.value.notes,
        updatedAt: nowIso(),
    };
    return repo.update(next);
}
async function duplicateTask(repo, id) {
    const existing = await repo.getById(id);
    if (!existing.ok)
        return existing;
    if (!existing.value)
        return fail(notFoundError());
    const now = nowIso();
    const copy = {
        ...existing.value,
        id: createId(),
        name: `${existing.value.name}（副本）`,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
    };
    return repo.create(copy);
}
async function deleteTask(repo, id) {
    const existing = await repo.getById(id);
    if (!existing.ok)
        return existing;
    if (!existing.value)
        return fail(notFoundError());
    return repo.delete(id);
}
async function setTaskStatus(repo, id, status) {
    const validStatuses = new Set(['ACTIVE', 'PAUSED', 'ARCHIVED']);
    if (!validStatuses.has(status)) {
        return fail({ code: ErrorCode.INVALID_INPUT, message: '任务状态不合法。' });
    }
    const existing = await repo.getById(id);
    if (!existing.ok)
        return existing;
    if (!existing.value)
        return fail(notFoundError());
    const next = { ...existing.value, status, updatedAt: nowIso() };
    return repo.update(next);
}
async function listTasks(repo, includeArchived = false) {
    const all = await repo.getAll();
    if (!all.ok)
        return all;
    const tasks = includeArchived
        ? all.value
        : all.value.filter((t) => t.status !== 'ARCHIVED');
    return ok(tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

// 任务命令处理器（docs/06 T2.4）
// 契约：服务层返回 Result，本层用 unwrap 拆包（失败即抛 AppError），
// 由消息路由器统一包装成一层信封。
function registerTaskCommands() {
    const repo = new TaskRepository();
    register(Message.TASK_LIST, async (payload) => unwrap$1(await listTasks(repo, payload?.includeArchived ?? false)));
    register(Message.TASK_CREATE, async (payload) => unwrap$1(await createTask(repo, payload.input)));
    register(Message.TASK_UPDATE, async (payload) => {
        const p = payload;
        return unwrap$1(await updateTask(repo, p.id, p.input));
    });
    register(Message.TASK_DELETE, async (payload) => unwrap$1(await deleteTask(repo, payload.id)));
    register(Message.TASK_DUPLICATE, async (payload) => unwrap$1(await duplicateTask(repo, payload.id)));
    register(Message.TASK_SET_STATUS, async (payload) => {
        const p = payload;
        return unwrap$1(await setTaskStatus(repo, p.id, p.status));
    });
}

// chrome.storage.local 薄封装（仅存轻量设置与诊断快照）
async function storageGet(key) {
    const record = await chrome.storage.local.get(key);
    const value = record[key];
    return value ?? null;
}
async function storageSet(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

// chrome.storage.local 键名集中管理
const STORAGE_KEYS = {
    settings: 'settings',
    lastDiagnostics: 'lastDiagnostics',
    installInfo: 'installInfo',
};

// 设置仓库：底层使用 chrome.storage.local（轻量键值）
// 读写失败返回 STORAGE_ERROR，绝不静默。
class LocalSettingsRepository {
    async get() {
        try {
            const stored = await storageGet(STORAGE_KEYS.settings);
            return ok(mergeSettings(stored));
        }
        catch (cause) {
            return fail(storageError('读取设置失败', cause));
        }
    }
    async update(patch) {
        const current = await this.get();
        if (!current.ok)
            return current;
        try {
            const next = mergeSettings(current.value, patch);
            await storageSet(STORAGE_KEYS.settings, next);
            return ok(next);
        }
        catch (cause) {
            return fail(storageError('保存设置失败', cause));
        }
    }
}
/** 与默认值深合并（浅字段 + 三个嵌套对象） */
function mergeSettings(base, patch = {}) {
    return {
        ...DEFAULT_SETTINGS,
        ...(base ?? {}),
        ...patch,
        uiPrefs: {
            ...DEFAULT_SETTINGS.uiPrefs,
            ...(base?.uiPrefs ?? {}),
            ...(patch.uiPrefs ?? {}),
        },
        backup: {
            ...DEFAULT_SETTINGS.backup,
            ...(base?.backup ?? {}),
            ...(patch.backup ?? {}),
        },
        privacy: {
            ...DEFAULT_SETTINGS.privacy,
            ...(base?.privacy ?? {}),
            ...(patch.privacy ?? {}),
        },
        defaultRelevanceConfig: {
            ...DEFAULT_SETTINGS.defaultRelevanceConfig,
            ...(base?.defaultRelevanceConfig ?? {}),
            ...(patch.defaultRelevanceConfig ?? {}),
        },
    };
}

// 设置命令处理器
function registerSettingsCommands() {
    const repo = new LocalSettingsRepository();
    register(Message.SETTINGS_GET, async () => unwrap$1(await repo.get()));
    register(Message.SETTINGS_SET_DEFAULT_TASK, async (payload) => unwrap$1(await repo.update({ defaultTaskId: payload.taskId })));
}

// 首页概况命令（侧边栏首页使用）
function registerDashboardCommand() {
    register(Message.GET_DASHBOARD, async () => {
        const taskRepo = new TaskRepository();
        const settingsRepo = new LocalSettingsRepository();
        const tasks = unwrap$1(await taskRepo.getAll());
        const settings = unwrap$1(await settingsRepo.get());
        const lastDiagnostics = await storageGet(STORAGE_KEYS.lastDiagnostics).catch(() => null);
        const currentTask = tasks.find((t) => t.id === settings.defaultTaskId) ?? null;
        return { currentTask, tasks, lastDiagnostics };
    });
}

// tabs API 薄封装
async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
}

// 内容脚本与 background 之间约定的全局键名
// 内容脚本把诊断结果写入 isolated world 的该键，background 侧再读取。
const DIAGNOSTICS_GLOBAL_KEY = '__CANTON_FAIR_LAST_DIAGNOSTICS__';

// scripting API 薄封装：按需注入内容脚本（配合 activeTab）
//
// 两段式注入的原因：内容脚本被构建为 IIFE 单文件，其脚本完成值为空，
// 无法直接从 executeScript 的返回值取到结果。因此：
//   1) 注入 content.js —— 执行诊断并把结果写到 isolated world 的全局对象；
//   2) 注入一个自包含函数 —— 在同一 isolated world 里把结果读回来。
// 两次注入都发生在用户点击“读取”之后，仍属于 activeTab 临时授权范围。
/** 注入函数必须自包含（不能引用外部变量），参数只能是可序列化值 */
function readDiagnosticsFromGlobal(key) {
    return globalThis[key] ?? null;
}
async function executeContentScript(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
    });
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: readDiagnosticsFromGlobal,
        args: [DIAGNOSTICS_GLOBAL_KEY],
    });
    const value = results[0]?.result;
    if (value == null) {
        throw new Error('内容脚本未产生诊断结果（页面可能不允许注入）');
    }
    return value;
}

// URL 解析与笔记链接规范化（docs/03 §10 去重规则第 1–2 条）
// 纯函数，可在 Node/浏览器/内容脚本中运行。
const XHS_HOST_RE = /(^|\.)xiaohongshu\.com$/i;
function parsePageUrl(url) {
    if (!url)
        return null;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        return {
            host,
            pathname: u.pathname,
            isXiaohongshu: XHS_HOST_RE.test(host),
        };
    }
    catch {
        return null;
    }
}

// 读取当前页面命令：注入只读诊断探针（docs/06 T2.5）
// 权限策略：activeTab + scripting；失败时返回面向用户的错误码与引导文案。
async function readCurrentPage() {
    const tab = await getActiveTab();
    if (!tab || tab.id == null) {
        throw appError(ErrorCode.PERMISSION_DENIED, '无法获取当前标签页');
    }
    if (!tab.url) {
        // activeTab 未授权时 url 不可读
        throw appError(ErrorCode.PERMISSION_DENIED, '无法读取当前页面地址（可能未授权）');
    }
    const parsed = parsePageUrl(tab.url);
    if (!parsed || !parsed.isXiaohongshu) {
        throw appError(ErrorCode.UNSUPPORTED_PAGE, `host=${parsed?.host ?? 'unknown'}`);
    }
    let diagnostics;
    try {
        diagnostics = await executeContentScript(tab.id);
    }
    catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw appError(ErrorCode.PERMISSION_DENIED, `注入失败: ${detail}`, cause);
    }
    try {
        await storageSet(STORAGE_KEYS.lastDiagnostics, diagnostics);
    }
    catch (cause) {
        throw storageError('保存诊断结果失败', cause);
    }
    return diagnostics;
}
function registerReadPageCommand() {
    // 处理器返回纯值；失败以抛错形式交给路由器包装为信封
    register(Message.READ_PAGE, () => readCurrentPage());
}

// 生命周期钩子：仅记录安装信息（不含任何敏感数据）
function registerLifecycleHooks() {
    chrome.runtime.onInstalled.addListener((details) => {
        void storageSet(STORAGE_KEYS.installInfo, {
            reason: details.reason,
            version: chrome.runtime.getManifest().version,
            at: new Date().toISOString(),
        }).catch(() => {
            // 记录失败不影响主流程；存储异常会由业务命令显式上报
        });
    });
}

// Service Worker 入口（MV3）
// 职责：消息路由注册、命令注册、侧边栏行为。
// 注意：SW 可能随时被终止——所有重要状态都已持久化，恢复以本地记录为准。
function main() {
    initMessageRouter();
    registerTaskCommands();
    registerSettingsCommands();
    registerDashboardCommand();
    registerReadPageCommand();
    registerLifecycleHooks();
    // 点击扩展图标直接打开侧边栏（Chrome 114+）
    if (isSidePanelSupported()) {
        chrome.sidePanel
            .setPanelBehavior({ openPanelOnActionClick: true })
            .catch(() => {
            // 降级：用户仍可通过工具栏图标菜单手动打开侧边栏
        });
    }
}
main();
