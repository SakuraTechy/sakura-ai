import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { MAX_FILE_SIZE, MAX_FILES, SUPPORTED_SINGLE_EXTENSIONS, SUPPORTED_MULTI_EXTENSIONS } from '../config/upload';

// 创建上传目录
const uploadDir = path.join(process.cwd(), 'uploads', 'axure');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 创建上传目录:', uploadDir);
}

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳-随机字符串-原始扩展名
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const ext = path.extname(file.originalname);
    cb(null, `axure-${uniqueSuffix}${ext}`);
  }
});

// 文件过滤器（单文件上传 - 支持多种文档格式）
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (SUPPORTED_SINGLE_EXTENSIONS.includes(ext as any)) {
    cb(null, true);
  } else {
    cb(new Error('只支持 HTML / PDF / DOCX / DOC / Markdown / TXT / ZIP 文件'));
  }
};

// 文件过滤器（多文件上传 - HTML + JS，兼容需求文档格式）
const multiFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (SUPPORTED_MULTI_EXTENSIONS.includes(ext as any)) {
    cb(null, true);
  } else {
    cb(new Error('只支持 HTML / JS / PDF / DOCX / DOC / Markdown / TXT / ZIP'));
  }
};

// 导出单文件上传中间件
export const axureUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE, // 使用统一配置
  },
  fileFilter
});

// 导出多文件上传中间件
export const axureMultiUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE, // 使用统一配置
    files: MAX_FILES // 使用统一配置
  },
  fileFilter: multiFileFilter
});

console.log('✅ 文件上传中间件已加载');
