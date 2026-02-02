/**
 * 日期时间工具函数（前端专用）
 */

/**
 * 格式化时间为本地时间字符串（YYYY-MM-DD HH:mm:ss）
 * @param date - 需要格式化的日期字符串或 Date 对象
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 格式化时间为 HH:mm:ss 格式
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
