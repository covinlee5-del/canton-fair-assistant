// 探测：绕开 Vite 的两个子进程依赖
//   1) 配置文件加载（configFile:false）—— Vite 5 一律用 esbuild 打包配置文件
//   2) Windows 真路径优化 optimizeSafeRealPathSync -> exec('net use')
// 沙箱禁止带管道 stdio 的 spawn，故在导入 vite 之前把 exec/execFile 换成
// “回调报错”的实现：Vite 的 `if (error) return;` 会安全跳过该优化。
import { createRequire } from 'node:module';

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

const { build } = await import('vite');

await build({
  configFile: false,
  esbuild: false,
  logLevel: 'info',
  build: {
    outDir: '.local-verify/probe-out',
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    lib: {
      entry: '.local-verify/probe/entry.js',
      formats: ['iife'],
      name: 'Probe',
      fileName: () => 'probe.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

console.log('[probe] build finished');
