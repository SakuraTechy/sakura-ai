/**
 * FileDownloadStrategy 属性测试
 * 
 * 验证 Property 3: 文件下载验证的完整性
 * 对于任何文件下载断言，如果artifacts目录中存在符合条件的文件（大小>0且创建时间在阈值内），
 * 验证应该成功；如果不存在符合条件的文件，验证应该失败并提供详细的错误信息。
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { FileDownloadStrategy } from '../FileDownloadStrategy';
import type { Assertion, VerificationContext } from '../../types';
import { AssertionType } from '../../types';

describe('FileDownloadStrategy', () => {
  let strategy: FileDownloadStrategy;
  let testArtifactsDir: string;

  beforeEach(() => {
    strategy = new FileDownloadStrategy();
    testArtifactsDir = path.join(__dirname, 'test-artifacts-' + Date.now());
    
    // 创建测试目录
    if (!fs.existsSync(testArtifactsDir)) {
      fs.mkdirSync(testArtifactsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testArtifactsDir)) {
      const files = fs.readdirSync(testArtifactsDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testArtifactsDir, file));
      });
      fs.rmdirSync(testArtifactsDir);
    }
  });

  describe('canHandle', () => {
    it('应该识别明确指定类型的文件下载断言', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '测试断言',
        type: AssertionType.FILE_DOWNLOAD
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该通过关键词识别文件下载断言', () => {
      const keywords = [
        '文件下载',
        '下载成功',
        '下载文件',
        '文件已下载',
        '下载完成',
        'download',
        'downloaded'
      ];

      keywords.forEach(keyword => {
        const assertion: Assertion = {
          id: 'test',
          description: `验证${keyword}`
        };
        expect(strategy.canHandle(assertion)).toBe(true);
      });
    });

    it('应该不识别非文件下载断言', () => {
      const assertion: Assertion = {
        id: 'test',
        description: '验证页面标题'
      };

      expect(strategy.canHandle(assertion)).toBe(false);
    });
  });

  describe('verify', () => {
    const createContext = (): VerificationContext => ({
      page: {} as any,
      runId: 'test-run',
      artifactsDir: testArtifactsDir
    });

    it('当artifacts目录不存在时应该返回失败', async () => {
      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const context: VerificationContext = {
        page: {} as any,
        runId: 'test-run',
        artifactsDir: '/non-existent-dir'
      };

      const result = await strategy.verify(assertion, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('目录不存在');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it('当目录为空时应该返回失败', async () => {
      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到下载的文件');
      expect(result.suggestions).toBeDefined();
    });

    it('当只有排除文件时应该返回失败', async () => {
      // 创建一些排除的文件
      fs.writeFileSync(path.join(testArtifactsDir, 'screenshot-123.png'), 'test');
      fs.writeFileSync(path.join(testArtifactsDir, 'trace-456.zip'), 'test');
      fs.writeFileSync(path.join(testArtifactsDir, 'video-789.webm'), 'test');

      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到下载的文件');
      expect(result.actualValue).toContain('都是测试相关文件');
    });

    it('当文件大小为0时应该返回失败', async () => {
      // 创建一个空文件
      fs.writeFileSync(path.join(testArtifactsDir, 'download.pdf'), '');

      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('不符合验证条件');
      expect(result.suggestions).toContain('文件大小为0（下载可能未完成）');
    });

    it('当文件太旧时应该返回失败', async () => {
      // 创建一个文件
      const filePath = path.join(testArtifactsDir, 'old-download.pdf');
      fs.writeFileSync(filePath, 'test content');

      // 修改文件的修改时间为1分钟前
      const oldTime = Date.now() - 60000;
      fs.utimesSync(filePath, new Date(oldTime), new Date(oldTime));

      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD,
        timeout: 30000 // 30秒
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('不符合验证条件');
      expect(result.suggestions).toContain('文件可能太旧（超过配置的最大年龄）');
    });

    it('当存在有效文件时应该返回成功', async () => {
      // 创建一个有效的下载文件
      fs.writeFileSync(path.join(testArtifactsDir, 'download.pdf'), 'test content');

      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(true);
      expect(result.assertionType).toBe(AssertionType.FILE_DOWNLOAD);
      expect(result.actualValue).toBeDefined();
      expect(result.actualValue.fileName).toBe('download.pdf');
      expect(result.actualValue.fileSize).toBeGreaterThan(0);
      expect(result.actualValue.fileAge).toBeLessThan(30000);
    });

    it('应该选择最新的有效文件', async () => {
      // 创建多个文件
      fs.writeFileSync(path.join(testArtifactsDir, 'file1.pdf'), 'content1');
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));
      
      fs.writeFileSync(path.join(testArtifactsDir, 'file2.pdf'), 'content2');

      const assertion: Assertion = {
        id: 'test',
        description: '验证文件下载成功',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(true);
      expect(result.metadata?.totalValidFiles).toBe(2);
      expect(result.metadata?.allValidFiles).toHaveLength(2);
    });
  });

  // Feature: assertion-service, Property 3: 文件下载验证的完整性
  describe('Property 3: 文件下载验证的完整性', () => {
    it('对于任何文件，如果大小>0且年龄在阈值内，验证应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            fileName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
            fileContent: fc.string({ minLength: 1, maxLength: 1000 }),
            timeout: fc.integer({ min: 1000, max: 60000 })
          }),
          async ({ fileName, fileContent, timeout }) => {
            // 确保文件名有效
            const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_') + '.txt';
            
            // 创建文件
            const filePath = path.join(testArtifactsDir, safeFileName);
            fs.writeFileSync(filePath, fileContent);

            const assertion: Assertion = {
              id: 'test',
              description: '验证文件下载成功',
              type: AssertionType.FILE_DOWNLOAD,
              timeout
            };

            const context: VerificationContext = {
              page: {} as any,
              runId: 'test-run',
              artifactsDir: testArtifactsDir
            };

            const result = await strategy.verify(assertion, context);

            // 文件大小>0且年龄在阈值内，应该成功
            expect(result.success).toBe(true);
            expect(result.assertionType).toBe(AssertionType.FILE_DOWNLOAD);
            expect(result.actualValue).toBeDefined();
            expect(result.actualValue.fileSize).toBeGreaterThan(0);
            expect(result.actualValue.fileAge).toBeLessThan(timeout);

            // 清理文件
            fs.unlinkSync(filePath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何文件，如果大小为0，验证应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
          async (fileName) => {
            // 确保文件名有效
            const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_') + '.txt';
            
            // 创建空文件
            const filePath = path.join(testArtifactsDir, safeFileName);
            fs.writeFileSync(filePath, '');

            const assertion: Assertion = {
              id: 'test',
              description: '验证文件下载成功',
              type: AssertionType.FILE_DOWNLOAD
            };

            const context: VerificationContext = {
              page: {} as any,
              runId: 'test-run',
              artifactsDir: testArtifactsDir
            };

            const result = await strategy.verify(assertion, context);

            // 文件大小为0，应该失败
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions!.length).toBeGreaterThan(0);

            // 清理文件
            fs.unlinkSync(filePath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何文件，如果年龄超过阈值，验证应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            fileName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
            fileContent: fc.string({ minLength: 1, maxLength: 1000 }),
            timeout: fc.integer({ min: 100, max: 1000 }), // 使用较短的超时
            fileAge: fc.integer({ min: 2000, max: 10000 }) // 文件年龄大于超时
          }),
          async ({ fileName, fileContent, timeout, fileAge }) => {
            // 确保文件名有效
            const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_') + '.txt';
            
            // 创建文件
            const filePath = path.join(testArtifactsDir, safeFileName);
            fs.writeFileSync(filePath, fileContent);

            // 修改文件时间为过去
            const oldTime = Date.now() - fileAge;
            fs.utimesSync(filePath, new Date(oldTime), new Date(oldTime));

            const assertion: Assertion = {
              id: 'test',
              description: '验证文件下载成功',
              type: AssertionType.FILE_DOWNLOAD,
              timeout
            };

            const context: VerificationContext = {
              page: {} as any,
              runId: 'test-run',
              artifactsDir: testArtifactsDir
            };

            const result = await strategy.verify(assertion, context);

            // 文件年龄超过阈值，应该失败
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.suggestions).toBeDefined();

            // 清理文件
            fs.unlinkSync(filePath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('验证失败时应该提供详细的错误信息和建议', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'empty-dir',      // 空目录
            'only-excluded',  // 只有排除的文件
            'zero-size',      // 文件大小为0
            'too-old'         // 文件太旧
          ),
          async (scenario) => {
            // 根据场景准备测试环境
            if (scenario === 'only-excluded') {
              fs.writeFileSync(path.join(testArtifactsDir, 'screenshot-123.png'), 'test');
            } else if (scenario === 'zero-size') {
              fs.writeFileSync(path.join(testArtifactsDir, 'download.pdf'), '');
            } else if (scenario === 'too-old') {
              const filePath = path.join(testArtifactsDir, 'old.pdf');
              fs.writeFileSync(filePath, 'content');
              const oldTime = Date.now() - 60000;
              fs.utimesSync(filePath, new Date(oldTime), new Date(oldTime));
            }

            const assertion: Assertion = {
              id: 'test',
              description: '验证文件下载成功',
              type: AssertionType.FILE_DOWNLOAD,
              timeout: 30000
            };

            const context: VerificationContext = {
              page: {} as any,
              runId: 'test-run',
              artifactsDir: testArtifactsDir
            };

            const result = await strategy.verify(assertion, context);

            // 应该失败
            expect(result.success).toBe(false);
            
            // 应该有错误信息
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
            
            // 应该有建议
            expect(result.suggestions).toBeDefined();
            expect(Array.isArray(result.suggestions)).toBe(true);
            expect(result.suggestions!.length).toBeGreaterThan(0);
            
            // 每个建议都应该是非空字符串
            result.suggestions!.forEach(suggestion => {
              expect(typeof suggestion).toBe('string');
              expect(suggestion.length).toBeGreaterThan(0);
            });

            // 清理文件
            const files = fs.readdirSync(testArtifactsDir);
            files.forEach(file => {
              fs.unlinkSync(path.join(testArtifactsDir, file));
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该正确排除截图、trace、video等文件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            screenshotName: fc.constantFrom('screenshot-123.png', 'SCREENSHOT-456.PNG'),
            traceName: fc.constantFrom('trace-789.zip', 'TRACE-012.ZIP'),
            videoName: fc.constantFrom('video-345.webm', 'VIDEO-678.WEBM'),
            validFileName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/')),
            validFileContent: fc.string({ minLength: 1, maxLength: 100 })
          }),
          async ({ screenshotName, traceName, videoName, validFileName, validFileContent }) => {
            // 创建排除的文件
            fs.writeFileSync(path.join(testArtifactsDir, screenshotName), 'screenshot');
            fs.writeFileSync(path.join(testArtifactsDir, traceName), 'trace');
            fs.writeFileSync(path.join(testArtifactsDir, videoName), 'video');

            // 创建有效的下载文件
            const safeFileName = validFileName.replace(/[^a-zA-Z0-9.-]/g, '_') + '.txt';
            fs.writeFileSync(path.join(testArtifactsDir, safeFileName), validFileContent);

            const assertion: Assertion = {
              id: 'test',
              description: '验证文件下载成功',
              type: AssertionType.FILE_DOWNLOAD
            };

            const context: VerificationContext = {
              page: {} as any,
              runId: 'test-run',
              artifactsDir: testArtifactsDir
            };

            const result = await strategy.verify(assertion, context);

            // 应该成功，并且只识别有效的下载文件
            expect(result.success).toBe(true);
            expect(result.actualValue.fileName).toBe(safeFileName);
            
            // 清理文件
            const files = fs.readdirSync(testArtifactsDir);
            files.forEach(file => {
              fs.unlinkSync(path.join(testArtifactsDir, file));
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
