// 诊断脚本：在 Node 里加载 dist/background.js，模拟 chrome 环境，捕获加载期异常。
// 仅本地排查用，不进入 src/，不作为交付物。运行：node .local-verify/sw-smoke.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const swFile = path.join(dist, 'background.js');

const calls = [];
const noopEvent = () => ({ addListener: () => calls.push('addListener') });

const chromeStub = {
  runtime: {
    onMessage: noopEvent(),
    onInstalled: noopEvent(),
    onStartup: noopEvent(),
    getManifest: () => ({ version: '0.1.0' }),
    openOptionsPage: async () => {},
    lastError: undefined,
    id: 'smoke-test',
  },
  sidePanel: undefined, // 模拟 Chrome < 114？先给 undefined 看是否崩
  storage: {
    local: {
      get: (k, cb) => (cb ? cb({}) : Promise.resolve({})),
      set: (_v, cb) => (cb ? cb() : Promise.resolve()),
    },
    onChanged: noopEvent(),
  },
  tabs: {
    query: (_q, cb) => (cb ? cb([]) : Promise.resolve([])),
    create: async () => ({ id: 1 }),
    get: async () => ({ id: 1, url: 'https://www.xiaohongshu.com/explore/abc' }),
  },
  scripting: {
    executeScript: async () => [{ result: { diagnostics: {}, drafts: [] } }],
  },
};

globalThis.chrome = chromeStub;
// MV3 SW 里没有 DOM；显式让访问 DOM 直接报错，便于暴露问题
globalThis.self = globalThis;

process.on('unhandledRejection', (e) => {
  console.log('[UNHANDLED REJECTION]', e?.message ?? e);
});
process.on('uncaughtException', (e) => {
  console.log('[UNCAUGHT EXCEPTION]', e?.message ?? e);
});

try {
  await import(pathToFileURL(swFile).href);
  // 等待微任务/挂起的 Promise 结算
  await new Promise((r) => setTimeout(r, 300));
  console.log('LOAD OK');
  console.log('registered listeners:', calls.length);
  // 验证消息处理器确实注册了
  const listeners = [];
  chromeStub.runtime.onMessage = { addListener: (fn) => listeners.push(fn) };
  console.log('onMessage listeners after re-import probe:', listeners.length);
} catch (cause) {
  console.log('LOAD FAILED:', cause?.constructor?.name);
  console.log('message:', cause?.message);
  console.log('stack:', String(cause?.stack ?? '').split('\n').slice(0, 8).join('\n'));
  process.exitCode = 1;
}
