import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  FileText,
  Video,
  FileCode,
  Image as ImageIcon,
  Filter,
  Loader2
} from 'lucide-react';
import { Button } from './ui/button';

interface EvidenceViewerProps {
  runId: string;
}

interface ArtifactRecord {
  runId: string;
  type: 'trace' | 'video' | 'screenshot' | 'log';
  filename: string;
  size: number;
  createdAt: string;
}

export const EvidenceViewerNew: React.FC<EvidenceViewerProps> = ({ runId }) => {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<'all' | string>('all');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const [stepViewMode, setStepViewMode] = useState<'grid' | 'list'>('grid'); // 🔥 步骤截图视图模式
  const [assertionViewMode, setAssertionViewMode] = useState<'grid' | 'list'>('grid'); // 🔥 断言截图视图模式
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [stepScreenshotMode, setStepScreenshotMode] = useState<'optimized' | 'full'>('optimized'); // 🔥 步骤截图展示模式
  const [assertionScreenshotMode, setAssertionScreenshotMode] = useState<'optimized' | 'full'>('optimized'); // 🔥 断言截图展示模式

  const extractStep = (filename: string) => {
    // 🔥 修复：支持 Midscene 格式 runId-step-数字-状态-时间戳.png
    // 例如：d595dfe4-cf8a-4e7a-b01e-c36af3b804d0-step-1-before-1737456789.png
    const patterns = [
      /-step-(\d+)-/,      // 格式：xxx-step-1-before-xxx.png (Midscene格式)
      /step-(\d+)-/,        // 格式：step-1-success-xxx.png
      /step-(\d+)\./,       // 格式：xxx-step-1.png
      /step-(\d+)$/,        // 格式：xxx-step-1
    ];
    
    for (const pattern of patterns) {
      const m = filename.match(pattern);
      if (m) {
        return parseInt(m[1], 10);
      }
    }
    return null;
  };

  const extractAssertion = (filename: string) => {
    // 🔥 支持两种格式：
    // 新格式：{runId}-assertion-1-success-xxx.png
    // 旧格式：assertion-1-success-xxx.png
    const patterns = [
      /-assertion-(\d+)-/,  // 新格式：runId-assertion-1-xxx
      /^assertion-(\d+)-/   // 旧格式：assertion-1-xxx
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  };

  const isFinalScreenshot = (filename: string) => {
    // 🔥 修复：支持 Midscene 和 Playwright 的最终截图格式
    // Playwright: final-completed-时间戳.png
    // Midscene: 可能没有最终截图，或者使用 -step-final- 格式
    return filename.includes('final-completed') || filename.includes('-step-final-');
  };

  const isAssertionScreenshot = (filename: string) => {
    // 🔥 支持两种格式：
    // 新格式：{runId}-assertion-1-xxx.png
    // 旧格式：assertion-1-xxx.png
    const result = filename.includes('-assertion-') || filename.startsWith('assertion-');
    if (result) {
      console.log('✔️ 识别为断言截图:', filename);
    }
    return result;
  };

  const screenshotsAll = useMemo(() => {
    const screenshots = artifacts.filter(a => a.type === 'screenshot');
    console.log('📸 所有截图文件:', screenshots.map(s => s.filename));
    return screenshots;
  }, [artifacts]);
  
  // 🔥 分离步骤截图、断言截图和最终截图
  const stepScreenshots = useMemo(() => {
    const filtered = screenshotsAll.filter(s => {
      const isFinal = isFinalScreenshot(s.filename);
      const isAssertion = isAssertionScreenshot(s.filename);
      const shouldInclude = !isFinal && !isAssertion;
      
      console.log(`🔍 检查文件: ${s.filename}, isFinal: ${isFinal}, isAssertion: ${isAssertion}, shouldInclude: ${shouldInclude}`);
      
      return shouldInclude;
    });
    console.log('🎬 步骤截图（原始）:', filtered.map(s => ({ filename: s.filename, step: extractStep(s.filename) })));
    
    // 🔥 完整模式：返回所有截图
    if (stepScreenshotMode === 'full') {
      console.log('🎬 步骤截图（完整模式）:', filtered.length, '张');
      return filtered;
    }
    
    // 🔥 精简模式：每个步骤只保留一张截图（优先级：error > after > before > manual）
    const stepMap = new Map<number, ArtifactRecord[]>();
    
    // 按步骤号分组
    filtered.forEach(screenshot => {
      const stepNum = extractStep(screenshot.filename);
      if (stepNum !== null) {
        if (!stepMap.has(stepNum)) {
          stepMap.set(stepNum, []);
        }
        stepMap.get(stepNum)!.push(screenshot);
      }
    });
    
    // 每个步骤选择最佳截图
    const optimized: ArtifactRecord[] = [];
    stepMap.forEach((screenshots) => {
      // 优先级：error > after > before > manual
      const errorShot = screenshots.find(s => s.filename.includes('-error-'));
      const afterShot = screenshots.find(s => s.filename.includes('-after-'));
      const beforeShot = screenshots.find(s => s.filename.includes('-before-'));
      const manualShot = screenshots.find(s => s.filename.includes('-manual-'));
      
      const selected = errorShot || afterShot || beforeShot || manualShot || screenshots[0];
      optimized.push(selected);
    });
    
    console.log('🎬 步骤截图（精简模式）:', optimized.length, '张，已过滤', filtered.length - optimized.length, '张');
    return optimized;
  }, [screenshotsAll, stepScreenshotMode]);

  const assertionScreenshots = useMemo(() => {
    const filtered = screenshotsAll.filter(s => isAssertionScreenshot(s.filename));
    console.log('✔️ 断言截图（原始）:', filtered.map(s => ({ filename: s.filename, assertion: extractAssertion(s.filename) })));
    
    // 🔥 完整模式：返回所有截图
    if (assertionScreenshotMode === 'full') {
      console.log('✔️ 断言截图（完整模式）:', filtered.length, '张');
      return filtered;
    }
    
    // 🔥 精简模式：每个断言只保留一张截图（优先级：error > after > before > manual）
    const assertionMap = new Map<number, ArtifactRecord[]>();
    
    // 按断言号分组
    filtered.forEach(screenshot => {
      const assertionNum = extractAssertion(screenshot.filename);
      if (assertionNum !== null) {
        if (!assertionMap.has(assertionNum)) {
          assertionMap.set(assertionNum, []);
        }
        assertionMap.get(assertionNum)!.push(screenshot);
      }
    });
    
    // 每个断言选择最佳截图
    const optimized: ArtifactRecord[] = [];
    assertionMap.forEach((screenshots) => {
      // 优先级：error > after > before > manual
      const errorShot = screenshots.find(s => s.filename.includes('-error-'));
      const afterShot = screenshots.find(s => s.filename.includes('-after-'));
      const beforeShot = screenshots.find(s => s.filename.includes('-before-'));
      const manualShot = screenshots.find(s => s.filename.includes('-manual-'));
      
      const selected = errorShot || afterShot || beforeShot || manualShot || screenshots[0];
      optimized.push(selected);
    });
    
    console.log('✔️ 断言截图（精简模式）:', optimized.length, '张，已过滤', filtered.length - optimized.length, '张');
    return optimized;
  }, [screenshotsAll, assertionScreenshotMode]);

  const finalScreenshots = useMemo(() => {
    const filtered = screenshotsAll.filter(s => isFinalScreenshot(s.filename));
    console.log('🏁 最终截图:', filtered.map(s => s.filename));
    return filtered;
  }, [screenshotsAll]);

  const steps = useMemo(() => {
    const set = new Set<number>();
    stepScreenshots.forEach(s => {
      const st = extractStep(s.filename);
      if (st != null) {
        set.add(st);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [stepScreenshots]);

  const assertions = useMemo(() => {
    const set = new Set<number>();
    assertionScreenshots.forEach(s => {
      const assertionNum = extractAssertion(s.filename);
      if (assertionNum != null) {
        set.add(assertionNum);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [assertionScreenshots]);

  const stepScreenshotsFiltered = useMemo(() => {
    let filtered = stepScreenshots;
    if (stepFilter !== 'all') {
      const stepNum = parseInt(stepFilter, 10);
      filtered = stepScreenshots.filter(s => extractStep(s.filename) === stepNum);
    }
    // 🔥 按步骤号正序排列（1->2->3），同一步骤内按 before -> after -> error 排序
    return filtered.sort((a, b) => {
      const stepA = extractStep(a.filename);
      const stepB = extractStep(b.filename);
      if (stepA === null && stepB === null) return 0;
      if (stepA === null) return 1; // 没有步骤号的排在后面
      if (stepB === null) return -1;
      
      // 先按步骤号排序
      if (stepA !== stepB) {
        return stepA - stepB; // 正序排列
      }
      
      // 🔥 同一步骤内，按状态排序：before -> after -> error -> manual
      const getStatusOrder = (filename: string) => {
        if (filename.includes('-before-')) return 1;
        if (filename.includes('-after-')) return 2;
        if (filename.includes('-error-')) return 3;
        if (filename.includes('-manual-')) return 4;
        return 5; // 其他
      };
      
      return getStatusOrder(a.filename) - getStatusOrder(b.filename);
    });
  }, [stepScreenshots, stepFilter]);

  // 🔥 断言截图筛选（使用相同的 stepFilter，但只筛选断言）
  const [assertionFilter, setAssertionFilter] = useState<'all' | string>('all');
  
  const assertionScreenshotsFiltered = useMemo(() => {
    let filtered = assertionScreenshots;
    if (assertionFilter !== 'all') {
      const assertionNum = parseInt(assertionFilter, 10);
      filtered = assertionScreenshots.filter(s => extractAssertion(s.filename) === assertionNum);
    }
    // 🔥 按断言号正序排列（1->2->3），同一断言内按 before -> success -> error 排序
    return filtered.sort((a, b) => {
      const assertionA = extractAssertion(a.filename);
      const assertionB = extractAssertion(b.filename);
      if (assertionA === null && assertionB === null) return 0;
      if (assertionA === null) return 1;
      if (assertionB === null) return -1;
      
      // 先按断言号排序
      if (assertionA !== assertionB) {
        return assertionA - assertionB;
      }
      
      // 🔥 同一断言内，按状态排序：before -> success -> error
      const getStatusOrder = (filename: string) => {
        if (filename.includes('-before-')) return 1;
        if (filename.includes('-success-')) return 2;
        if (filename.includes('-error-')) return 3;
        return 4; // 其他
      };
      
      return getStatusOrder(a.filename) - getStatusOrder(b.filename);
    });
  }, [assertionScreenshots, assertionFilter]);

  const nonScreenshots = useMemo(() => artifacts.filter(a => a.type !== 'screenshot'), [artifacts]);

  const getSignedUrl = useCallback(async (filename: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await res.json();
      if (data.success) return data.data.signedUrl;
    } catch (e) {
      console.error('获取签名URL失败:', e);
    }
    return null;
  }, [runId]);

  // 预加载图片
  const loadImage = useCallback(async (filename: string) => {
    if (imageUrls.has(filename) || loadingImages.has(filename)) return;
    
    setLoadingImages(prev => new Set(prev).add(filename));
    const url = await getSignedUrl(filename);
    if (url) {
      setImageUrls(prev => new Map(prev).set(filename, url));
    }
    setLoadingImages(prev => {
      const next = new Set(prev);
      next.delete(filename);
      return next;
    });
  }, [imageUrls, loadingImages, getSignedUrl]);

  // 🔥 预加载前几张截图（包括步骤截图、断言截图和最终截图）
  useEffect(() => {
    const allScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
    allScreenshots.slice(0, 6).forEach(screenshot => {
      loadImage(screenshot.filename);
    });
  }, [stepScreenshotsFiltered, assertionScreenshotsFiltered, finalScreenshots, loadImage]);

  const openPreview = async (index: number) => {
    // 🔥 合并步骤截图、断言截图和最终截图用于预览
    const allScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
    const file = allScreenshots[index];
    if (!file) return;
    
    let url: string | null | undefined = imageUrls.get(file.filename);
    if (!url) {
      const fetchedUrl = await getSignedUrl(file.filename);
      if (fetchedUrl) {
        url = fetchedUrl;
        setImageUrls(prev => new Map(prev).set(file.filename, fetchedUrl));
      }
    }
    
    if (url) {
      setPreviewIndex(index);
      setPreviewUrl(url);
      setZoom(1);
    } else {
      console.error('无法获取图片URL');
    }
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setPreviewUrl(null);
    setZoom(1);
  };

  const showPrev = async () => {
    const allScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
    if (previewIndex == null || allScreenshots.length === 0) return;
    const nextIdx = (previewIndex - 1 + allScreenshots.length) % allScreenshots.length;
    const file = allScreenshots[nextIdx];
    
    let url: string | null | undefined = imageUrls.get(file.filename);
    if (!url) {
      const fetchedUrl = await getSignedUrl(file.filename);
      if (fetchedUrl) {
        url = fetchedUrl;
        setImageUrls(prev => new Map(prev).set(file.filename, fetchedUrl));
      }
    }
    
    if (url) {
      setPreviewIndex(nextIdx);
      setPreviewUrl(url);
      setZoom(1);
    }
  };

  const showNext = async () => {
    const allScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
    if (previewIndex == null || allScreenshots.length === 0) return;
    const nextIdx = (previewIndex + 1) % allScreenshots.length;
    const file = allScreenshots[nextIdx];
    
    let url: string | null | undefined = imageUrls.get(file.filename);
    if (!url) {
      const fetchedUrl = await getSignedUrl(file.filename);
      if (fetchedUrl) {
        url = fetchedUrl;
        setImageUrls(prev => new Map(prev).set(file.filename, fetchedUrl));
      }
    }
    
    if (url) {
      setPreviewIndex(nextIdx);
      setPreviewUrl(url);
      setZoom(1);
    }
  };

  // 键盘导航
  useEffect(() => {
    if (previewIndex === null) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(prev => Math.min(prev + 0.25, 3));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(prev => Math.max(prev - 0.25, 0.5));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIndex]);

  useEffect(() => {
    fetchArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const fetchArtifacts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/evidence/${runId}/files`);
      const data = await response.json();
      setArtifacts(data.data || []);
    } catch (error) {
      console.error('获取证据文件失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      setDownloading(filename);
      
      // 🔥 修复：获取签名URL，然后使用下载端点
      const response = await fetch(`/api/evidence/${runId}/sign/${encodeURIComponent(filename)}?downloadName=${encodeURIComponent(filename)}`);
      const data = await response.json();
      
      if (data.success && data.data.signedUrl) {
        const downloadUrl = data.data.signedUrl;
        
        // 确保URL是完整的（包含协议和域名）
        const absoluteUrl = downloadUrl.startsWith('http') 
          ? downloadUrl 
          : `${window.location.origin}${downloadUrl}`;
        
        // 🔥 方法1：使用 fetch 下载文件内容，创建 Blob URL（更可靠）
        try {
          const fileResponse = await fetch(absoluteUrl);
          if (!fileResponse.ok) {
            throw new Error(`下载失败: ${fileResponse.statusText}`);
          }
          
          const blob = await fileResponse.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          
          // 创建下载链接
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          
          // 触发下载
          link.click();
          
          // 清理
          setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
          }, 100);
        } catch (fetchError) {
          // 🔥 方法2：如果 fetch 失败，回退到直接使用链接
          console.warn('使用 fetch 下载失败，回退到直接链接方式:', fetchError);
          const link = document.createElement('a');
          link.href = absoluteUrl;
          link.download = filename;
          link.target = '_blank';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
        }
      } else {
        throw new Error('无法获取下载链接');
      }
    } catch (error) {
      console.error('下载失败:', error);
      alert(`下载失败: ${error instanceof Error ? error.message : '未知错误'}，请稍后重试`);
    } finally {
      setDownloading(null);
    }
  };

  const handleViewTrace = async (filename: string) => {
    try {
      // 检查文件类型，只有 .zip 文件才是 trace 文件
      if (!filename.endsWith('.zip') && !filename.includes('trace')) {
        alert('此文件不是 Playwright Trace 文件。Trace 文件应该是 .zip 格式。');
        return;
      }

      // 获取签名URL
      const response = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await response.json();
      
      if (!data.success) {
        console.error('获取签名URL失败:', data.error);
        alert('无法获取Trace文件URL，请稍后重试');
        return;
      }
      
      const signedUrl = data.data.signedUrl;
      console.log('签名URL:', signedUrl);
      
      // 检查是否是本地URL（localhost、127.0.0.1、0.0.0.0）
      const isLocalUrl = signedUrl.includes('localhost') || 
                        signedUrl.includes('127.0.0.1') || 
                        signedUrl.includes('0.0.0.0');
      console.log('是否本地URL:', isLocalUrl);
      
      if (isLocalUrl) {
        // 对于本地URL，Playwright trace viewer 可能无法直接访问
        // 提示用户下载文件后手动打开
        const shouldDownload = confirm(
          '检测到本地URL，Playwright Trace Viewer 可能无法直接访问。\n\n' +
          '请选择：\n' +
          '• 确定：下载文件后手动在 trace.playwright.dev 上传\n' +
          '• 取消：尝试直接打开（可能失败）'
        );
        
        if (shouldDownload) {
          // 下载文件
          const link = document.createElement('a');
          link.href = signedUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          alert('文件已开始下载。下载完成后，请访问 https://trace.playwright.dev 并上传该文件。');
        } else {
          // 尝试直接打开（可能失败）
          const traceViewerUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(signedUrl)}`;
          window.open(traceViewerUrl, '_blank');
        }
      } else {
        // 对于非本地URL，直接使用
        const traceViewerUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(signedUrl)}`;
        window.open(traceViewerUrl, '_blank');
      }
    } catch (error) {
      console.error('打开Trace查看器失败:', error);
      alert('打开Trace查看器失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleViewVideo = async (filename: string) => {
    try {
      // 获取签名URL
      const response = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await response.json();
      
      if (!data.success) {
        console.error('获取签名URL失败:', data.error);
        alert('无法获取视频文件URL，请稍后重试');
        return;
      }
      
      const signedUrl = data.data.signedUrl;
      
      // 设置视频预览
      setVideoPreviewUrl(signedUrl);
      setVideoFilename(filename);
    } catch (error) {
      console.error('打开视频查看器失败:', error);
      alert('打开视频查看器失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleViewLog = async (filename: string) => {
    try {
      // 获取签名URL
      const response = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await response.json();
      
      if (!data.success) {
        console.error('获取签名URL失败:', data.error);
        alert('无法获取日志文件URL，请稍后重试');
        return;
      }
      
      const signedUrl = data.data.signedUrl;
      
      // 获取日志内容
      const logResponse = await fetch(signedUrl);
      const logContent = await logResponse.text();
      
      // 在新窗口中显示日志内容
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${filename} - 日志查看</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                background: #1e1e1e;
                color: #d4d4d4;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.6;
              }
              .header {
                background: #2d2d30;
                padding: 15px 20px;
                margin: -20px -20px 20px -20px;
                border-bottom: 2px solid #007acc;
                position: sticky;
                top: 0;
                z-index: 100;
              }
              .header h1 {
                margin: 0;
                font-size: 18px;
                color: #ffffff;
              }
              .content {
                background: #252526;
                padding: 20px;
                border-radius: 4px;
                white-space: pre-wrap;
                word-wrap: break-word;
                overflow-x: auto;
              }
              .error {
                color: #f48771;
              }
              .warning {
                color: #dcdcaa;
              }
              .info {
                color: #4ec9b0;
              }
              .success {
                color: #4ec9b0;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📄 ${filename}</h1>
            </div>
            <div class="content">${logContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </body>
          </html>
        `);
        newWindow.document.close();
      } else {
        alert('无法打开新窗口，请检查浏览器弹窗设置');
      }
    } catch (error) {
      console.error('打开日志查看器失败:', error);
      alert('打开日志查看器失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const closeVideoPreview = () => {
    setVideoPreviewUrl(null);
    setVideoFilename(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'trace': return <FileCode className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'screenshot': return <ImageIcon className="w-5 h-5" />;
      case 'log': return <FileText className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'trace': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'video': return 'bg-green-50 text-green-700 border-green-200';
      case 'screenshot': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'log': return 'bg-purple-50 text-purple-700 border-purple-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="evidence-viewer p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <div className="text-gray-500">加载证据文件中...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="evidence-viewer p-0 min-h-full">
      {/* 头部控制栏 */}
      {/* <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-bold text-gray-900">测试证据</h3>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 shadow-sm">
            <Filter className="w-4 h-4 text-gray-500" />
            <label className="text-sm text-gray-600">步骤筛选</label>
            <select
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value)}
              className="ml-2 px-2 py-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 cursor-pointer"
              title="选择要筛选的步骤"
            >
              <option value="all">全部</option>
              {steps.map((s) => (
                <option key={s} value={String(s)}>{`第 ${s} 步`}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={fetchArtifacts} 
            disabled={loading}
            variant="outline"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            刷新
          </Button>
        </div>
      </div> */}
      
      {artifacts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">暂无证据文件</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 步骤截图区域 */}
          {stepScreenshotsFiltered.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 h-6">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-blue-500" />
                  <h4 className="text-lg font-semibold text-gray-900">
                    步骤截图 ({stepScreenshotsFiltered.length})
                  </h4>
                  {stepScreenshotMode === 'optimized' && stepScreenshots.length < screenshotsAll.filter(s => !isFinalScreenshot(s.filename) && !isAssertionScreenshot(s.filename)).length && (
                    <span className="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded-md">
                      已精简 {screenshotsAll.filter(s => !isFinalScreenshot(s.filename) && !isAssertionScreenshot(s.filename)).length - stepScreenshots.length} 张
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* 步骤筛选器 */}
                  <select
                    value={stepFilter}
                    onChange={(e) => setStepFilter(e.target.value)}
                    className="h-8 px-3 text-sm bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer text-gray-700 transition-all"
                    title="选择要筛选的步骤"
                  >
                    <option value="all">全部步骤</option>
                    {steps.map((s) => (
                      <option key={s} value={String(s)}>{`第 ${s} 步`}</option>
                    ))}
                  </select>
                  
                  {/* 精简/完整模式切换 */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button
                      onClick={() => setStepScreenshotMode('optimized')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        stepScreenshotMode === 'optimized'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="精简模式：每步骤1张（推荐）"
                    >
                      精简
                    </button>
                    <button
                      onClick={() => setStepScreenshotMode('full')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        stepScreenshotMode === 'full'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="完整模式：显示所有截图"
                    >
                      完整
                    </button>
                  </div>
                  
                  {/* 视图切换 */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button
                      onClick={() => setStepViewMode('grid')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        stepViewMode === 'grid'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="网格视图"
                    >
                      网格
                    </button>
                    <button
                      onClick={() => setStepViewMode('list')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        stepViewMode === 'list'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="列表视图"
                    >
                      列表
                    </button>
                  </div>
                </div>
              </div>
              
              {stepViewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {stepScreenshotsFiltered.map((item, idx) => {
                    const imageUrl = imageUrls.get(item.filename);
                    const isLoading = loadingImages.has(item.filename);
                    const step = extractStep(item.filename);
                    
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="group relative bg-gray-50 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
                        onClick={() => openPreview(idx)}
                      >
                        {/* 图片容器 */}
                        <div className="relative aspect-video bg-gray-100 overflow-hidden">
                          {isLoading ? (
                            <div className="flex items-center justify-center w-full h-full">
                              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                            </div>
                          ) : imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.filename}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-gray-400">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                          
                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          </div>
                          
                          {/* 步骤标签 - 右上角 */}
                          {step !== null && (
                            <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs font-medium px-2 py-1 rounded-md shadow-sm z-10">
                              步骤 {step}
                            </div>
                          )}
                        </div>
                        
                        {/* 文件名和操作 */}
                        <div className="p-3 bg-white">
                          <div className="text-xs text-gray-600 truncate mb-0" title={item.filename}>
                            {item.filename}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                              {formatFileSize(item.size)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(item.filename);
                              }}
                              disabled={downloading === item.filename}
                              className="h-6 px-2 text-xs"
                            >
                              {downloading === item.filename ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {stepScreenshotsFiltered.map((item, idx) => {
                    const imageUrl = imageUrls.get(item.filename);
                    const step = extractStep(item.filename);
                    
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all duration-200 cursor-pointer group"
                        onClick={() => openPreview(idx)}
                      >
                        <div className="relative w-24 h-16 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-gray-400">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {item.filename}
                            </span>
                            {step !== null && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                步骤 {step}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(item.size)} · {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item.filename);
                          }}
                          disabled={downloading === item.filename}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {downloading === item.filename ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 断言截图区域 */}
          {assertionScreenshotsFiltered.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-orange-500" />
                  <h4 className="text-lg font-semibold text-gray-900">
                    断言截图 ({assertionScreenshotsFiltered.length})
                  </h4>
                  {assertionScreenshotMode === 'optimized' && assertionScreenshots.length < screenshotsAll.filter(s => isAssertionScreenshot(s.filename)).length && (
                    <span className="text-xs text-gray-500 bg-orange-50 px-2 py-1 rounded-md">
                      已精简 {screenshotsAll.filter(s => isAssertionScreenshot(s.filename)).length - assertionScreenshots.length} 张
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* 断言筛选器 */}
                  <select
                    value={assertionFilter}
                    onChange={(e) => setAssertionFilter(e.target.value)}
                    className="h-8 px-3 text-sm bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent cursor-pointer text-gray-700 transition-all"
                    title="选择要筛选的断言"
                  >
                    <option value="all">全部断言</option>
                    {assertions.map((a) => (
                      <option key={a} value={String(a)}>{`断言 ${a}`}</option>
                    ))}
                  </select>
                  
                  {/* 精简/完整模式切换 */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button
                      onClick={() => setAssertionScreenshotMode('optimized')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        assertionScreenshotMode === 'optimized'
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="精简模式：每断言1张（推荐）"
                    >
                      精简
                    </button>
                    <button
                      onClick={() => setAssertionScreenshotMode('full')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        assertionScreenshotMode === 'full'
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="完整模式：显示所有截图"
                    >
                      完整
                    </button>
                  </div>
                  
                  {/* 视图切换 */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button
                      onClick={() => setAssertionViewMode('grid')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        assertionViewMode === 'grid'
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="网格视图"
                    >
                      网格
                    </button>
                    <button
                      onClick={() => setAssertionViewMode('list')}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                        assertionViewMode === 'list'
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      title="列表视图"
                    >
                      列表
                    </button>
                  </div>
                </div>
              </div>
              
              {assertionViewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {assertionScreenshotsFiltered.map((item, idx) => {
                    const imageUrl = imageUrls.get(item.filename);
                    const isLoading = loadingImages.has(item.filename);
                    const assertion = extractAssertion(item.filename);
                    
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="group relative bg-gray-50 rounded-lg overflow-hidden border border-gray-200 hover:border-orange-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
                        onClick={() => {
                          // 🔥 计算在合并列表中的索引（步骤截图在前，断言截图在后）
                          const mergedScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
                          const actualIndex = mergedScreenshots.findIndex(s => s.filename === item.filename);
                          if (actualIndex >= 0) {
                            openPreview(actualIndex);
                          }
                        }}
                      >
                        {/* 图片容器 */}
                        <div className="relative aspect-video bg-gray-100 overflow-hidden">
                          {isLoading ? (
                            <div className="flex items-center justify-center w-full h-full">
                              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                            </div>
                          ) : imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.filename}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-gray-400">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                          
                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          </div>
                          
                          {/* 断言标签 - 左上角 */}
                          {assertion !== null && (
                            <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-medium px-2 py-1 rounded-md shadow-sm z-10">
                              断言 {assertion}
                            </div>
                          )}
                        </div>
                        
                        {/* 文件名和操作 */}
                        <div className="p-3 bg-white">
                          <div className="text-xs text-gray-600 truncate mb-0" title={item.filename}>
                            {item.filename}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                              {formatFileSize(item.size)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(item.filename);
                              }}
                              disabled={downloading === item.filename}
                              className="h-6 px-2 text-xs"
                            >
                              {downloading === item.filename ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {assertionScreenshotsFiltered.map((item, idx) => {
                    const imageUrl = imageUrls.get(item.filename);
                    const assertion = extractAssertion(item.filename);
                    
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all duration-200 cursor-pointer group"
                        onClick={() => {
                          const mergedScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
                          const actualIndex = mergedScreenshots.findIndex(s => s.filename === item.filename);
                          if (actualIndex >= 0) {
                            openPreview(actualIndex);
                          }
                        }}
                      >
                        <div className="relative w-24 h-16 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-gray-400">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {item.filename}
                            </span>
                            {assertion !== null && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                断言 {assertion}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(item.size)} · {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item.filename);
                          }}
                          disabled={downloading === item.filename}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {downloading === item.filename ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 最终截图区域 */}
          {finalScreenshots.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-green-500" />
                  <h4 className="text-lg font-semibold text-gray-900">
                    最终截图 ({finalScreenshots.length})
                  </h4>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {finalScreenshots.map((item, idx) => {
                  const imageUrl = imageUrls.get(item.filename);
                  const isLoading = loadingImages.has(item.filename);
                  
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className="group relative bg-gray-50 rounded-lg overflow-hidden border-2 border-green-200 hover:border-green-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
                      onClick={async () => {
                        // 计算在合并列表中的索引（步骤截图在前，最终截图在后）
                        const mergedScreenshots = [...stepScreenshotsFiltered, ...finalScreenshots];
                        const actualIndex = mergedScreenshots.findIndex(s => s.filename === item.filename);
                        if (actualIndex >= 0) {
                          await openPreview(actualIndex);
                        }
                      }}
                    >
                      {/* 图片容器 */}
                      <div className="relative aspect-video bg-gray-100 overflow-hidden">
                        {isLoading ? (
                          <div className="flex items-center justify-center w-full h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                          </div>
                        ) : imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item.filename}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full text-gray-400">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                        
                        {/* 悬停遮罩 */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                          </div>
                        </div>
                        
                        {/* 最终截图标签 */}
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-md shadow-sm">
                          最终截图
                        </div>
                      </div>
                      
                      {/* 文件名和操作 */}
                      <div className="p-3 bg-white">
                        <div className="text-xs text-gray-600 truncate mb-0" title={item.filename}>
                          {item.filename}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {formatFileSize(item.size)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item.filename);
                            }}
                            disabled={downloading === item.filename}
                            className="h-6 px-2 text-xs"
                          >
                            {downloading === item.filename ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 其他文件区域 */}
          {nonScreenshots.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-purple-500" />
                <h4 className="text-lg font-semibold text-gray-900">
                  其他文件 ({nonScreenshots.length})
                </h4>
              </div>
              
              <div className="space-y-3">
                {nonScreenshots.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`p-3 rounded-lg ${getTypeColor(item.type)} flex-shrink-0`}>
                        {getTypeIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {item.filename}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(item.type)} flex-shrink-0`}>
                            {item.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          类型: {item.type.toUpperCase()} · 大小: {formatFileSize(item.size)} · 创建时间: {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.type === 'trace' && (
                        <Button
                          onClick={() => handleViewTrace(item.filename)}
                          size="sm"
                          variant="outline"
                        >
                          在线查看
                        </Button>
                      )}
                      {item.type === 'video' && (
                        <Button
                          onClick={() => handleViewVideo(item.filename)}
                          size="sm"
                          variant="outline"
                        >
                          在线查看
                        </Button>
                      )}
                      {item.type === 'log' && (
                        <Button
                          onClick={() => handleViewLog(item.filename)}
                          size="sm"
                          variant="outline"
                        >
                          在线查看
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDownload(item.filename)}
                        disabled={downloading === item.filename}
                        size="sm"
                        icon={downloading === item.filename ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      >
                        {downloading === item.filename ? '下载中...' : '下载'}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图片预览模态框 */}
      <AnimatePresence>
        {previewUrl && previewIndex != null && (() => {
          // 🔥 合并所有截图用于预览
          const allScreenshots = [...stepScreenshotsFiltered, ...assertionScreenshotsFiltered, ...finalScreenshots];
          const currentFile = allScreenshots[previewIndex];
          
          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closePreview}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[95vw] max-h-[95vh] w-full h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 顶部工具栏 */}
              <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
                <div className="flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
                  <span className="text-white text-sm font-medium">
                    {previewIndex + 1} / {allScreenshots.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.5))}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    title="缩小"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoom(prev => Math.min(prev + 0.25, 3))}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    title="放大"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm font-medium"
                    title="重置缩放"
                  >
                    重置
                  </button>
                  <button
                    onClick={closePreview}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 图片容器 */}
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <motion.img
                  ref={previewImageRef}
                  src={previewUrl}
                  alt={`Screenshot ${previewIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                  style={{ transform: `scale(${zoom})` }}
                  transition={{ duration: 0.2 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </div>

              {/* 底部信息栏 */}
              <div className="absolute bottom-4 left-4 right-4 z-10">
                <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
                  <p className="text-white text-sm truncate">
                    {currentFile?.filename || ''}
                  </p>
                </div>
              </div>

              {/* 导航按钮 */}
              {allScreenshots.length > 1 && (
                <>
                  <button
                    onClick={showPrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 z-10"
                    title="上一张"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={showNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 z-10"
                    title="下一张"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* 视频预览模态框 */}
      <AnimatePresence>
        {videoPreviewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeVideoPreview}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[90vh] w-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 顶部工具栏 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
                  <Video className="w-5 h-5 text-green-400" />
                  <span className="text-white text-sm font-medium">
                    {videoFilename}
                  </span>
                </div>
                <button
                  onClick={closeVideoPreview}
                  className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-black/50 backdrop-blur-md border-2 border-white/20 text-white hover:bg-black/70 hover:border-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 视频播放器 */}
              <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden">
                <video
                  src={videoPreviewUrl}
                  controls
                  autoPlay
                  className="max-w-full max-h-full"
                  style={{ maxHeight: '80vh' }}
                >
                  您的浏览器不支持视频播放。
                </video>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
