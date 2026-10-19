// 测试环境的 Node API 最小声明。
//
// 本项目刻意不引入 @types/node（依赖保持最小，构建目标是浏览器扩展）。
// 但测试需要读取 tests/fixtures/*.html，这里只声明用到的那一个 API，
// 避免为一行代码引入整套 Node 类型定义。

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
