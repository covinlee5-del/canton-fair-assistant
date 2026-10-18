// 影子构建：在本沙箱内真实执行与交付配置等价的两次构建，用于验证产物结构。
//
// 与交付的 vite.config.ts / vite.content.config.ts 的唯一差别是「转换器」：
//   交付版：Vite 内置 esbuild（沙箱禁止其子进程，无法运行）
//   本脚本：typescript 的 transpileModule（纯 JS、进程内），并且 esbuild:false
// 其余（入口、entryFileNames、lib iife、emptyOutDir、publicDir）与交付配置一致。
//
// 另外：导入 vite 之前把 child_process.exec/execFile 换成回调报错实现，
// 让 Vite 的 optimizeSafeRealPathSync 安全跳过 exec('net use')。

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

// Vite 的 vite:define 插件即使在 esbuild:false 下也强制调用 esbuild.transform
// 来做 define 常量替换（例如 react 包里的 process.env.NODE_ENV）。
// esbuild 的 CJS 导出是只读 getter，无法直接赋值，因此替换 require 缓存里的
// exports 对象（Proxy 拦截 transform），让 Vite 的 import 拿到纯 JS 实现。
const esbuildEntry = require.resolve('esbuild');
const realEsbuild = require(esbuildEntry);

const transformShim = async (code, options = {}) => {
  const define = options.define ?? {};
  let out = code;
  for (const [key, value] of Object.entries(define)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'g');
    out = out.replace(re, value);
  }
  return {
    code: out,
    map: JSON.stringify({
      version: 3,
      sources: [options.sourcefile ?? ''],
      sourcesContent: [code],
      names: [],
      mappings: '',
    }),
  };
};

require.cache[esbuildEntry].exports = new Proxy(realEsbuild, {
  get(target, prop, receiver) {
    if (prop === 'transform') return transformShim;
    return Reflect.get(target, prop, receiver);
  },
});

const ts = require('typescript');
const { build } = await import('vite');

const root = process.cwd();
const outDir = path.resolve(root, '.local-verify/shadow-dist');

/** 用 tsc 做 TS/TSX 转换（替代 esbuild）；JSX 走 automatic runtime，与 tsconfig 的 react-jsx 一致 */
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

const shared = {
  configFile: false,
  root,
  esbuild: false,
  logLevel: 'info',
  plugins: [tsTransform()],
  // 影子构建专用：把 react 系依赖指向 production CJS 构建，使依赖图里
  // 完全不出现 process.env / import.meta.env，从而不触发 vite:define 的
  // esbuild.transform（沙箱内无法 spawn）。交付配置不含这些别名。
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

// ---- 1. 主构建（与 vite.config.ts 对应）----
await build({
  ...shared,
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        options: 'options.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

// ---- 2. 内容脚本构建（与 vite.content.config.ts 对应）----
await build({
  ...shared,
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    minify: false,
    cssMinify: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'CantonFairContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

console.log('[shadow] build finished:', outDir);
