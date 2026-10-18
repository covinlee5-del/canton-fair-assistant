// 诊断二：拦截 Module._load 是否能让 ESM `import { transform } from 'esbuild'` 拿到替身
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');

const shim = () => 'SHIM';
const shimModule = { transform: shim, version: '0.0.0-shim' };

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'esbuild') return shimModule;
  return originalLoad.call(this, request, parent, isMain);
};

const esm = await import('esbuild');
console.log('Module._load 拦截 => esm.transform is shim:', esm.transform === shim);
console.log('esm.version:', esm.version);
