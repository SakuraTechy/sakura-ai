/**
 * 文件上传配置
 * 统一管理后端文件上传的限制参数
 * 🔥 确保与前端配置保持一致
 */

// 文件大小限制
export const UPLOAD_CONFIG = {
  // 单个文件最大大小（字节）
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB - AI 模型最佳处理大小
  
  // 最大文件数量
  MAX_FILES: 50,
  
  // 支持的文件扩展名
  SUPPORTED_EXTENSIONS: {
    SINGLE_UPLOAD: ['.html', '.htm', '.pdf', '.docx', '.doc', '.md', '.markdown', '.txt', '.zip'],
    MULTI_UPLOAD: ['.html', '.htm', '.js', '.pdf', '.docx', '.doc', '.md', '.markdown', '.txt', '.zip']
  }
} as const;

// 导出便捷常量
export const MAX_FILE_SIZE = UPLOAD_CONFIG.MAX_FILE_SIZE;
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);
export const MAX_FILES = UPLOAD_CONFIG.MAX_FILES;
export const SUPPORTED_SINGLE_EXTENSIONS = UPLOAD_CONFIG.SUPPORTED_EXTENSIONS.SINGLE_UPLOAD;
export const SUPPORTED_MULTI_EXTENSIONS = UPLOAD_CONFIG.SUPPORTED_EXTENSIONS.MULTI_UPLOAD;

