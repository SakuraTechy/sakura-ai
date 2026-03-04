import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TestCases } from './pages/TestCases';
import { TestCaseDetail } from './pages/TestCaseDetail';
import { TestRuns } from './pages/TestRuns';
import { TestRunDetail } from './pages/TestRunDetail';
import { TestReports } from './pages/TestReports';
import Settings from './pages/Settings';
import CacheStats from './pages/CacheStats';
import { LLMAssistant } from './pages/LLMAssistant';
import { TestFactory } from './pages/TestFactory.tsx';
import { Login } from './pages/Login';
import { UserManagement } from './pages/UserManagement';
import { FunctionalTestCases } from './pages/FunctionalTestCases/index';
import { FunctionalTestCaseGenerator } from './pages/FunctionalTestCaseGenerator';
import { FunctionalTestCaseCreate } from './pages/FunctionalTestCaseCreate';
import { FunctionalTestCaseCreateSimple } from './pages/FunctionalTestCaseCreateSimple';
import { FunctionalTestCaseEdit } from './pages/FunctionalTestCaseEdit';
import { FunctionalTestCaseDetail } from './pages/FunctionalTestCaseDetail';
import { FunctionalTestCaseExecute } from './pages/FunctionalTestCaseExecute';
import { FunctionalTestCaseExecuteAlt } from './pages/FunctionalTestCaseExecuteAlt';
import { FunctionalTestPointEdit } from './pages/FunctionalTestPointEdit';
import SystemManagement from './pages/SystemManagement';
import KnowledgeManagement from './pages/KnowledgeManagement';
import RequirementDocs from './pages/RequirementDocs';
import { TestPlans } from './pages/TestPlans';
import { TestPlanForm } from './pages/TestPlanForm';
import { TestPlanDetail } from './pages/TestPlanDetail';
import { TestPlanAddCases } from './pages/TestPlanAddCases';
import { TestPlanExecute } from './pages/TestPlanExecute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/toast';
import { NotFoundPage, ServerErrorPage, ForbiddenPage } from './pages/ErrorPage';
import { useSetupToast } from './utils/toast';
import { ThemeProvider, useThemeContext } from './hooks/useTheme.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TabProvider } from './contexts/TabContext';
import { testService } from './services/testService';
import './styles/globals.css';

const antdThemeConfig = {
  token: {
    colorPrimary: '#3b82f6',
    colorBgBase: '#f9fafb',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f9fafb',
    colorText: '#111827',
    colorTextSecondary: '#6b7280',
    colorTextTertiary: '#6b7280',
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#f3f4f6',
    colorSuccess: '#10b981',
    colorError: '#ef4444',
    colorWarning: '#f59e0b',
    colorInfo: '#06b6d4',

    padding: 16,
    paddingXS: 4,
    paddingSM: 8,
    paddingLG: 24,
    paddingXL: 32,

    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 12,
    borderRadiusXS: 2,

    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif",
    fontSize: 16,
    fontSizeSM: 14,
    fontSizeLG: 18,
    fontSizeXL: 20,
    fontWeightStrong: 600,

    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
    boxShadowSecondary:
      '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
    boxShadowTertiary:
      '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
  },
  components: {
    Layout: {
      bodyBg: '#f9fafb',
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
    Card: {
      boxShadowTertiary:
        '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
      borderRadiusLG: 12,
      paddingLG: 24,
      headerBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#eff6ff',
      itemSelectedColor: '#2563eb',
      itemHoverBg: '#f9fafb',
      itemActiveBg: '#eff6ff',
      borderRadius: 8,
    },
    Button: {
      borderRadius: 8,
      controlHeight: 40,
      paddingContentHorizontal: 24,
      fontWeight: 500,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 40,
      paddingBlock: 10,
      paddingInline: 12,
    },
    Select: {
      borderRadius: 8,
      controlHeight: 40,
    },
    DatePicker: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Table: {
      borderRadiusLG: 12,
      headerBg: '#f9fafb',
      headerSplitColor: '#e5e7eb',
    },
  },
};

const darkThemeConfig = {
  token: {
    colorBgBase: '#0f172a',
    colorBgContainer: '#1e293b',
    colorBgLayout: '#0f172a',
    colorText: '#f1f5f9',
    colorTextSecondary: '#cbd5e1',
    colorTextTertiary: '#94a3b8',
    colorBorder: '#334155',
    colorBorderSecondary: '#475569',
    colorPrimary: '#3b82f6',
    colorSuccess: '#10b981',
    colorError: '#ef4444',
    colorWarning: '#f59e0b',
    colorInfo: '#06b6d4',
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif",
    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 12,
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.25)',
    boxShadowSecondary:
      '0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.2)',
    boxShadowTertiary:
      '0 10px 15px -3px rgba(0,0,0,0.35), 0 4px 6px -2px rgba(0,0,0,0.25)',
  },
  components: {
    Layout: {
      bodyBg: '#0f172a',
      headerBg: '#1e293b',
      siderBg: '#1e293b',
    },
    Card: {
      colorBgContainer: '#1e293b',
      colorBorderSecondary: '#334155',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(59, 130, 246, 0.1)',
      itemHoverBg: 'rgba(148, 163, 184, 0.1)',
      colorText: '#f1f5f9',
    },
    Button: {
      colorText: '#f1f5f9',
      colorBgContainer: '#334155',
      colorBorder: '#475569',
    },
    Input: {
      colorBgContainer: '#334155',
      colorBorder: '#475569',
      colorText: '#f1f5f9',
    },
  },
};

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Spin size="large" />
        <div className="mt-4 text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Admin Only Route component - 只有超级管理员才能访问
const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isSuperAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Spin size="large" />
        <div className="mt-4 text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function AppContent() {
  // 设置Toast实例
  useSetupToast();
  // 获取主题状态
  const { isDark } = useThemeContext();

  // 🚀 全局资源清理 - 修复getComputedStyle错误
  React.useEffect(() => {
    // 页面卸载时清理所有资源
    const handleBeforeUnload = () => {
      console.log('🧹 页面即将卸载，清理所有资源...');
      testService.destroy();
    };

    const handleUnload = () => {
      console.log('🧹 页面卸载，强制清理资源...');
      testService.destroy();
    };

    // 监听页面卸载事件
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    // 组件卸载时清理
    return () => {
      console.log('🧹 App组件卸载，清理所有资源...');
      testService.destroy();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, []);

  return (
    <ConfigProvider theme={isDark ? darkThemeConfig : antdThemeConfig}>
      <Router>
        <Routes>
          {/* 登录页面 - 不需要认证 */}
          <Route path="/login" element={<Login />} />

          {/* 受保护的路由 - 需要认证 */}
          <Route path="/*" element={
            <ProtectedRoute>
              <TabProvider>
                <Layout>
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />

                      {/* 测试用例路由 */}
                      <Route path="/test-cases" element={<TestCases />} />
                      <Route path="/test-cases/new" element={<TestCaseDetail />} />
                      <Route path="/test-cases/:id/edit" element={<TestCaseDetail />} />
                      <Route path="/test-cases/:id/detail" element={<TestCaseDetail />} />
                      <Route path="/test-cases/:id/execute" element={<FunctionalTestCaseExecuteAlt />} />

                      {/* 功能测试用例路由 */}
                      <Route path="/functional-test-cases" element={<FunctionalTestCases />} />
                      <Route path="/functional-test-cases/generator" element={<FunctionalTestCaseGenerator />} />
                      <Route path="/functional-test-cases/create" element={<FunctionalTestCaseCreateSimple />} />
                      <Route path="/functional-test-cases/create-simple" element={<FunctionalTestCaseCreate />} />
                      <Route path="/functional-test-cases/:id/edit" element={<FunctionalTestCaseEdit />} />
                      <Route path="/functional-test-cases/:id/detail" element={<FunctionalTestCaseDetail />} />
                      <Route path="/functional-test-cases/:id/execute" element={<FunctionalTestCaseExecute />} />
                      <Route path="/functional-test-cases/:id/execute-alt" element={<FunctionalTestCaseExecuteAlt />} />
                      <Route path="/functional-test-cases/test-points/:testPointId/edit" element={<FunctionalTestPointEdit />} />

                      {/* 测试执行路由 */}
                      <Route path="/test-runs" element={
                        <ErrorBoundary>
                          <TestRuns />
                        </ErrorBoundary>
                      } />
                      <Route path="/test-runs/:id/detail" element={<TestRunDetail />} />

                      {/* 测试计划路由 */}
                      <Route path="/test-plans" element={<TestPlans />} />
                      <Route path="/test-plans/create" element={<TestPlanForm />} />
                      <Route path="/test-plans/:id" element={<TestPlanDetail />} />
                      <Route path="/test-plans/:id/edit" element={<TestPlanForm />} />
                      <Route path="/test-plans/:id/add-cases" element={<TestPlanAddCases />} />
                      <Route path="/test-plans/:id/execute" element={<TestPlanExecute />} />

                      <Route path="/reports" element={<TestReports />} />
                      <Route path="/llm-assistant" element={<LLMAssistant />} />
                      <Route path="/test-factory" element={<TestFactory />} />

                      {/* 系统字典管理 */}
                      <Route path="/systems" element={<SystemManagement />} />

                      {/* 知识库管理 */}
                      <Route path="/knowledge" element={<KnowledgeManagement />} />

                      {/* 需求文档管理 */}
                      <Route path="/requirement-docs" element={<RequirementDocs />} />

                      {/* 用户管理 - 仅超级管理员可访问 */}
                      <Route path="/user-management" element={
                        <AdminRoute>
                          <UserManagement />
                        </AdminRoute>
                      } />

                      <Route path="/settings" element={<Settings />} />
                      <Route path="/cache-stats" element={<CacheStats />} />

                      {/* 错误页面 */}
                      <Route path="/error/403" element={<ForbiddenPage />} />
                      <Route path="/error/500" element={<ServerErrorPage />} />

                      {/* 404 页面 - 必须放在最后 */}
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </ErrorBoundary>
                </Layout>
              </TabProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;