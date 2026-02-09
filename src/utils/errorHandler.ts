import { NavigateFunction } from 'react-router-dom';
import { showToast as toast } from './toast';

/**
 * API 错误响应接口
 */
export interface ApiError {
  success: false;
  error: string;
  details?: string;
  statusCode?: number;
}

/**
 * 错误处理选项
 */
export interface ErrorHandlerOptions {
  /** 是否显示 Toast 提示 */
  showToast?: boolean;
  /** 是否跳转到错误页面 */
  redirectToErrorPage?: boolean;
  /** 自定义错误消息 */
  customMessage?: string;
  /** 错误回调函数 */
  onError?: (error: Error | ApiError) => void;
}

/**
 * 通用错误处理函数
 * @param error 错误对象
 * @param navigate React Router 的 navigate 函数
 * @param options 错误处理选项
 */
export function handleError(
  error: any,
  navigate?: NavigateFunction,
  options: ErrorHandlerOptions = {}
): void {
  const {
    showToast = true,
    redirectToErrorPage = false,
    customMessage,
    onError
  } = options;

  console.error('❌ 错误处理:', error);

  // 提取错误信息
  let errorMessage = customMessage || '发生了一个错误';
  let errorDetails = '';
  let statusCode = 500;

  if (error?.response) {
    // Axios 错误响应
    statusCode = error.response.status;
    errorMessage = error.response.data?.error || error.response.statusText || errorMessage;
    errorDetails = error.response.data?.details || JSON.stringify(error.response.data);
  } else if (error?.error) {
    // API 错误响应
    errorMessage = error.error;
    errorDetails = error.details || '';
    statusCode = error.statusCode || 500;
  } else if (error?.message) {
    // 标准 Error 对象
    errorMessage = error.message;
    errorDetails = error.stack || '';
  } else if (typeof error === 'string') {
    // 字符串错误
    errorMessage = error;
  }

  // 显示 Toast 提示
  if (showToast) {
    toast.error(errorMessage);
  }

  // 跳转到错误页面
  if (redirectToErrorPage && navigate) {
    const errorPagePath = getErrorPagePath(statusCode);
    navigate(errorPagePath, {
      state: {
        error: errorMessage,
        details: errorDetails,
        statusCode
      }
    });
  }

  // 调用自定义错误回调
  if (onError) {
    onError(error);
  }
}

/**
 * 根据状态码获取错误页面路径
 */
function getErrorPagePath(statusCode: number): string {
  switch (statusCode) {
    case 403:
      return '/error/403';
    case 404:
      return '/error/404';
    case 500:
      return '/error/500';
    default:
      return '/error/500';
  }
}

/**
 * API 请求错误处理装饰器
 * 用于包装 API 调用,自动处理错误
 */
export async function withErrorHandling<T>(
  apiCall: () => Promise<T>,
  navigate?: NavigateFunction,
  options: ErrorHandlerOptions = {}
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    handleError(error, navigate, options);
    return null;
  }
}

/**
 * 创建带错误处理的 API 调用 Hook
 * 使用示例:
 * const callApi = useApiErrorHandler(navigate);
 * const result = await callApi(() => apiService.fetchData());
 */
export function useApiErrorHandler(navigate: NavigateFunction) {
  return <T>(
    apiCall: () => Promise<T>,
    options?: ErrorHandlerOptions
  ): Promise<T | null> => {
    return withErrorHandling(apiCall, navigate, options);
  };
}

/**
 * HTTP 状态码对应的错误信息
 */
export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: '请求参数错误',
  401: '未授权,请重新登录',
  403: '没有权限访问此资源',
  404: '请求的资源不存在',
  408: '请求超时',
  409: '资源冲突',
  422: '请求参数验证失败',
  429: '请求过于频繁,请稍后重试',
  500: '服务器内部错误',
  502: '网关错误',
  503: '服务暂时不可用',
  504: '网关超时'
};

/**
 * 获取 HTTP 状态码对应的友好错误信息
 */
export function getHttpStatusMessage(statusCode: number): string {
  return HTTP_STATUS_MESSAGES[statusCode] || `未知错误 (${statusCode})`;
}

/**
 * 判断是否为网络错误
 */
export function isNetworkError(error: any): boolean {
  return (
    error?.message === 'Network Error' ||
    error?.message === 'Failed to fetch' ||
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ERR_NETWORK'
  );
}

/**
 * 判断是否为超时错误
 */
export function isTimeoutError(error: any): boolean {
  return (
    error?.code === 'ECONNABORTED' ||
    error?.message?.includes('timeout')
  );
}

/**
 * 格式化错误信息用于显示
 */
export function formatErrorForDisplay(error: any): {
  title: string;
  message: string;
  details?: string;
} {
  if (isNetworkError(error)) {
    return {
      title: '网络连接失败',
      message: '无法连接到服务器,请检查网络连接',
      details: error?.message
    };
  }

  if (isTimeoutError(error)) {
    return {
      title: '请求超时',
      message: '服务器响应时间过长,请稍后重试',
      details: error?.message
    };
  }

  const statusCode = error?.response?.status || error?.statusCode;
  if (statusCode) {
    return {
      title: getHttpStatusMessage(statusCode),
      message: error?.response?.data?.error || error?.error || '请联系系统管理员',
      details: error?.response?.data?.details || error?.details
    };
  }

  return {
    title: '发生错误',
    message: error?.message || '未知错误',
    details: error?.stack || JSON.stringify(error)
  };
}

/**
 * 错误日志记录
 * 在生产环境中可以替换为第三方错误追踪服务(如 Sentry)
 */
export function logError(error: any, context?: Record<string, any>): void {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: formatErrorForDisplay(error),
    context,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // 开发环境:打印到控制台
  if (process.env.NODE_ENV === 'development') {
    console.error('🔥 错误日志:', errorInfo);
  }

  // 生产环境:发送到错误追踪服务
  // if (process.env.NODE_ENV === 'production') {
  //   sendErrorToTrackingService(errorInfo);
  // }
}
