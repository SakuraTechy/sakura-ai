/**
 * 文件上传配置
 * 统一管理前端文件上传的限制参数
 * 🔥 确保与后端配置保持一致
 */

// 文件大小限制
export const UPLOAD_CONFIG = {
  // 单个文件最大大小（字节）
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB - AI 模型最佳处理大小
  
  // 最大文件数量
  MAX_FILES: 50,
  
  // 支持的文件类型
  SUPPORTED_TYPES: {
    HTML: ['.html', '.htm'],
    JAVASCRIPT: ['.js'],
    PDF: ['.pdf'],
    WORD: ['.doc', '.docx'],
    MARKDOWN: ['.md', '.markdown'],
    TEXT: ['.txt'],
    ZIP: ['.zip']
  }
} as const;

// 辅助函数：获取所有支持的扩展名
export const getAllSupportedExtensions = (): string[] => {
  return Object.values(UPLOAD_CONFIG.SUPPORTED_TYPES).flat();
};

// 辅助函数：检查文件扩展名是否支持
export const isSupportedFileType = (filename: string): boolean => {
  const ext = filename.toLowerCase().split('.').pop();
  if (!ext) return false;
  const allExtensions = getAllSupportedExtensions();
  return allExtensions.some(supported => supported === `.${ext}`);
};

// 辅助函数：格式化文件大小显示
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

// 导出便捷常量
export const MAX_FILE_SIZE_MB = UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
export const MAX_FILES = UPLOAD_CONFIG.MAX_FILES;
export const MAX_FILE_SIZE = UPLOAD_CONFIG.MAX_FILE_SIZE;

