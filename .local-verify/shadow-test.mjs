// 影子测试：在本沙箱内真实执行交付的 vitest 测试套件（tests/**/*.test.ts）。
//
// 与交付 vitest.config.ts 的差别仅在于「转换器」与「运行池」：
//   - esbuild: false + tsc 转换插件（沙箱禁止 esbuild 的子进程）
//   - pool: threads（worker_threads，不经过 child_process）
//   - 依赖别名到 production CJS 构建，避免 vite:define 触发 esbuild
// 其余（include 范围、环境、restoreMocks）与交付配置一致。

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cp = require('node:child_process');

const blockedExec = (command, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const error = new Error(`spawn blocked by sandbox: ${String(command)}`);
  error.code = 'EPERM';
  if (typeof cb === 'function') process.nextTick(() => cb(error, '', ''));
  return { on() {}, kill() {}, stdout: null, stderr: null };
};
cp.exec = blockedExec;
cp.execFile = blockedExec;

const ts = require('typescript');
const root = process.cwd();

function tsTransform() {
  return {
    name: 'local-ts-transform',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0] ?? id;
      if (!/\.(ts|tsx)$/.test(cleanId)) return null;
      const result = ts.transpileModule(code, {
        fileName: cleanId,
        reportDiagnostics: false,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          isolatedModules: true,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      };
    },
  };
}

const viteOverrides = {
  esbuild: false,
  logLevel: 'info',
  plugins: [tsTransform()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: path.resolve(root, 'node_modules/react/cjs/react.production.min.js') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(root, 'node_modules/react/cjs/react-jsx-runtime.production.min.js') },
      { find: /^react-dom$/, replacement: path.resolve(root, 'node_modules/react-dom/cjs/react-dom.production.min.js') },
      { find: /^react-dom\/client$/, replacement: path.resolve(root, 'node_modules/react-dom/cjs/react-dom.production.min.js') },
      { find: /^scheduler$/, replacement: path.resolve(root, 'node_modules/scheduler/cjs/scheduler.production.min.js') },
    ],
  },
};

const { startVitest } = await import('vitest/node');

const vitest = await startVitest(
  'test',
  [],
  {
    // vitest 用 options.config 决定配置文件发现（cli-api: `options.config === false ? false : …`）
    config: false,
    root,
    run: true,
    watch: false,
    pool: 'threads',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    reporters: ['basic'],
  },
  viteOverrides,
);

if (!vitest) {
  console.error('[shadow-test] startVitest 返回空');
  process.exit(2);
}

const failed = vitest.state.getCountOfFailedTests();
const files = vitest.state.getFiles?.() ?? [];
console.log(`[shadow-test] 测试文件 ${files.length} 个，失败用例 ${failed} 个`);
await vitest.close();
process.exit(failed === 0 && files.length > 0 ? 0 : 1);
