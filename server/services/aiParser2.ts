/**
 * aiParser2.ts 现在仅作为“兼容导出入口”存在。
 *
 * 方案A：需求分析模块实际使用 `server/services/ankkiPrompt.ts`。
 * 为避免提示词重复维护，本文件统一从 `ankkiPrompt.ts` 再导出。
 *
 * 注意：不要在本文件中再定义提示词常量；只维护 `ankkiPrompt.ts` 即可。
 */

export * from './ankkiPrompt.js';
