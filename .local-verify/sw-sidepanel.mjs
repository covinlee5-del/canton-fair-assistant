// 诊断：模拟 chrome.sidePanel 存在时的启动路径（main() 会调用 setPanelBehavior）
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const swFile = path.join(dist, 'background.js');

const sidePanelCalls = [];
const chromeStub = {
  runtime: {
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
    getManifest: () => ({ version: '0.1.0' }),
    openOptionsPage: async () => {},
    id: 'smoke',
  },
  sidePanel: {
    setPanelBehavior: ({ openPanelOnActionClick }) => {
      sidePanelCalls.push(openPanelOnActionClick);
      // 模拟真实环境：成功
      return Promise.resolve();
    },
  },
  storage: { local: { get: (k, cb) => cb?.(null) ?? Promise.resolve({}) }, onChanged: { addListener: () => {} } },
  tabs: { query: (_q, cb) => cb?.([]), create: async () => ({ id: 1 }) },
  scripting: { executeScript: async () => [] },
};

globalThis.chrome = chromeStub;
globalThis.self = globalThis;

process.on('unhandledRejection', (e) => console.log('[UNHANDLED]', e?.message ?? e));
process.on('uncaughtException', (e) => console.log('[UNCAUGHT]', e?.message ?? e));

try {
  await import(pathToFileURL(swFile).href);
  await new Promise((r) => setTimeout(r, 300));
  console.log('LOAD OK');
  console.log('setPanelBehavior called:', sidePanelCalls.length, 'times, openPanelOnActionClick =', sidePanelCalls[0]);
} catch (cause) {
  console.log('LOAD FAILED:', cause?.message);
  console.log(String(cause?.stack ?? '').split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
}
