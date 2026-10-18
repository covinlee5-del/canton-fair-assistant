// 诊断：替换 require.cache 里的 exports 是否能影响 ESM `import { transform } from 'esbuild'`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const entry = require.resolve('esbuild');
require(entry);

const shim = () => 'SHIM';
require.cache[entry].exports = { transform: shim, version: '0.0.0-shim' };

const esm = await import('esbuild');
console.log('cache key:', entry);
console.log('esm.transform is shim:', esm.transform === shim, '| type:', typeof esm.transform);
console.log('esm.version:', esm.version);
