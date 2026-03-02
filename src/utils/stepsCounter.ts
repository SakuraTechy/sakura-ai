/**
 * 统计测试用例的实际操作步骤数（排除【预期】行）
 * 
 * steps 格式示例：
 * "1. 【操作】打开登录页面\n   【预期】页面正常加载\n2. 【操作】输入用户名\n   【预期】输入框正常接收输入"
 * 
 * 只统计包含【操作】或以数字序号开头的行，排除【预期】行
 */
export function countSteps(steps: any): number {
  if (!steps) return 0;
  if (Array.isArray(steps)) return steps.length;
  if (typeof steps !== 'string') return 0;

  const lines = steps.split('\n').filter((s: string) => s.trim());

  // 如果包含【操作】标记，只统计【操作】行
  const hasMarker = lines.some((l: string) => l.includes('【操作】'));
  if (hasMarker) {
    return lines.filter((l: string) => l.includes('【操作】')).length;
  }

  // 否则统计以数字序号开头的行（如 "1." "2." "3."）
  const numberedLines = lines.filter((l: string) => /^\s*\d+[\.\、\)]/.test(l));
  if (numberedLines.length > 0) {
    return numberedLines.length;
  }

  // 兜底：返回总行数
  return lines.length;
}
