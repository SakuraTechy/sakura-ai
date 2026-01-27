/**
 * FileDownloadStrategy - 文件下载验证策略
 * 
 * 功能：
 * 1. 识别文件下载断言（通过关键词匹配）
 * 2. 检查artifacts目录中是否存在下载的文件
 * 3. 验证文件大小大于0
 * 4. 验证文件创建时间在配置的时间范围内
 * 5. 排除截图、trace、video等非下载文件
 * 6. 提供详细的错误信息和调试建议
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Assertion,
  VerificationContext,
  AssertionResult,
  VerificationStrategy
} from '../types';
import { AssertionType, AssertionErrorType, AssertionError } from '../types';

export class FileDownloadStrategy implements VerificationStrategy {
  readonly name = 'FileDownloadStrategy';
  readonly priority = 10; // 高优先级

  // 文件下载关键词
  private readonly downloadKeywords = [
    '文件下载',
    '下载成功',
    '下载文件',
    '文件已下载',
    '下载完成',
    'download',
    'downloaded'
  ];

  // 排除的文件模式
  private readonly excludePatterns = [
    /^screenshot-.*\.png$/i,
    /^trace-.*\.zip$/i,
    /^video-.*\.webm$/i,
    /^.*\.trace$/i,
    /^.*\.har$/i
  ];

  /**
   * 判断是否可以处理该断言
   */
  canHandle(assertion: Assertion): boolean {
    // 如果明确指定了类型
    if (assertion.type === AssertionType.FILE_DOWNLOAD) {
      return true;
    }

    // 通过描述中的关键词判断
    const description = assertion.description.toLowerCase();
    return this.downloadKeywords.some(keyword => 
      description.includes(keyword.toLowerCase())
    );
  }

  /**
   * 执行验证
   */
  async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const startTime = Date.now();

    try {
      // 1. 检查 artifacts 目录是否存在
      if (!fs.existsSync(context.artifactsDir)) {
        return {
          success: false,
          assertionType: AssertionType.FILE_DOWNLOAD,
          error: `Artifacts 目录不存在: ${context.artifactsDir}`,
          suggestions: [
            '请确认测试执行时正确设置了 artifacts 目录',
            '检查文件系统权限',
            '确认下载操作已经执行'
          ],
          duration: Date.now() - startTime
        };
      }

      // 2. 获取目录中的所有文件
      const files = fs.readdirSync(context.artifactsDir);
      
      // 3. 过滤掉排除的文件
      const downloadFiles = files.filter(file => {
        return !this.excludePatterns.some(pattern => pattern.test(file));
      });

      if (downloadFiles.length === 0) {
        return {
          success: false,
          assertionType: AssertionType.FILE_DOWNLOAD,
          error: '未找到下载的文件',
          actualValue: `目录中共有 ${files.length} 个文件，但都是测试相关文件（截图、trace、video）`,
          suggestions: [
            '确认下载操作已经执行',
            '检查下载是否被浏览器拦截',
            '增加下载等待时间',
            `检查目录: ${context.artifactsDir}`
          ],
          metadata: {
            allFiles: files,
            artifactsDir: context.artifactsDir
          },
          duration: Date.now() - startTime
        };
      }

      // 4. 获取配置的最大文件年龄（默认30秒）
      const maxAge = assertion.timeout || 30000;
      const now = Date.now();

      // 5. 查找符合条件的文件
      const validFiles: Array<{
        name: string;
        size: number;
        age: number;
        path: string;
      }> = [];

      for (const file of downloadFiles) {
        const filePath = path.join(context.artifactsDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        // 检查文件大小和年龄
        if (stats.size > 0 && fileAge <= maxAge) {
          validFiles.push({
            name: file,
            size: stats.size,
            age: fileAge,
            path: filePath
          });
        }
      }

      // 6. 验证结果
      if (validFiles.length === 0) {
        // 找到文件但不符合条件
        const oldFiles = downloadFiles.map(file => {
          const filePath = path.join(context.artifactsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            age: now - stats.mtimeMs
          };
        });

        return {
          success: false,
          assertionType: AssertionType.FILE_DOWNLOAD,
          error: '找到下载文件但不符合验证条件',
          actualValue: oldFiles,
          expectedValue: {
            size: '> 0 字节',
            age: `< ${maxAge}ms`
          },
          suggestions: [
            '文件可能太旧（超过配置的最大年龄）',
            '文件大小为0（下载可能未完成）',
            '尝试增加 timeout 配置',
            '检查下载是否真的成功'
          ],
          metadata: {
            maxAge,
            filesFound: oldFiles.length
          },
          duration: Date.now() - startTime
        };
      }

      // 7. 验证成功
      const downloadedFile = validFiles[0]; // 使用最新的文件
      
      return {
        success: true,
        assertionType: AssertionType.FILE_DOWNLOAD,
        matchType: '文件下载验证',
        actualValue: {
          fileName: downloadedFile.name,
          fileSize: downloadedFile.size,
          fileAge: downloadedFile.age,
          filePath: downloadedFile.path
        },
        expectedValue: {
          size: '> 0',
          age: `< ${maxAge}ms`
        },
        metadata: {
          totalValidFiles: validFiles.length,
          allValidFiles: validFiles.map(f => ({
            name: f.name,
            size: f.size,
            age: f.age
          }))
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        assertionType: AssertionType.FILE_DOWNLOAD,
        error: `文件下载验证失败: ${errorMessage}`,
        suggestions: [
          '检查文件系统权限',
          '确认 artifacts 目录路径正确',
          '查看详细错误信息'
        ],
        metadata: {
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          artifactsDir: context.artifactsDir
        },
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
