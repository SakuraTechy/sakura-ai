import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  FileCode,
  Play,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  Users,
  ClipboardList,
  FolderKanban,
  BookOpen,
  FileText,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  Factory,
  Bot,
  Target,
  Database,
  FileSearch,
  TrendingUp,
  Newspaper,
  PlusCircle,
  Edit3,
} from 'lucide-react';
import { OpenClawIcon } from '../components/icons/OpenClawIcon';

export interface Tab {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
  closable: boolean;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string;
  addTab: (tab: Omit<Tab, 'id' | 'closable'>) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeRightTabs: (tabId: string) => void;
  closeAllTabs: () => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

const STORAGE_KEY = 'app-tabs';
const MAX_TABS = 20;

// 路由配置映射
const routeConfig: Record<string, { title: string; icon: React.ReactNode }> = {
  '/': { title: '仪表板', icon: <Home className="h-4 w-4" /> },
  '/functional-test-cases': { title: '功能用例', icon: <ClipboardList className="h-4 w-4" /> },
  '/test-cases': { title: 'UI自动化', icon: <FileCode className="h-4 w-4" /> },
  '/test-plans': { title: '测试计划', icon: <Target className="h-4 w-4" /> },
  '/test-runs': { title: '测试执行', icon: <Play className="h-4 w-4" /> },
  '/reports': { title: '测试报告', icon: <BarChart3 className="h-4 w-4" /> },
  '/test-factory': { title: '测试工厂', icon: <Factory className="h-4 w-4" /> },
  // '/llm-assistant': { title: 'AI 助手', icon: <Bot className="h-4 w-4" /> },
  '/openclaw': { title: 'OpenClaw 控制面板', icon: <OpenClawIcon className="h-4 w-4" /> },
  '/systems': { title: '项目管理', icon: <FolderKanban className="h-4 w-4" /> },
  '/market-insights': { title: '市场洞察', icon: <TrendingUp className="h-4 w-4" /> },
  '/industry-news': { title: '行业资讯', icon: <Newspaper className="h-4 w-4" /> },
  '/requirement-analysis': { title: '需求分析', icon: <FileSearch className="h-4 w-4" /> },
  '/requirement-docs': { title: '需求管理', icon: <FileText className="h-4 w-4" /> },
  '/knowledge': { title: '知识库', icon: <BookOpen className="h-4 w-4" /> },
  '/user-management': { title: '用户管理', icon: <Users className="h-4 w-4" /> },
  '/settings': { title: '设置', icon: <Settings className="h-4 w-4" /> },
  '/cache-stats': { title: '缓存统计', icon: <Database className="h-4 w-4" /> },
};

// 动态路由匹配函数 - 支持路径参数
const getRouteConfig = (pathname: string): { title: string; icon: React.ReactNode } | null => {
  // 直接匹配
  if (routeConfig[pathname]) {
    return routeConfig[pathname];
  }

  // 匹配二级路由
  if (pathname === '/test-cases/new') {
    return { title: '新建测试用例', icon: <PlusCircle className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/test-cases\/\d+\/edit$/)) {
    return { title: '编辑测试用例', icon: <Edit3 className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/test-cases\/\d+\/detail$/)) {
    return { title: '查看测试用例', icon: <FileText className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/test-cases\/\d+\/execute$/)) {
    return { title: '执行测试用例', icon: <Play className="h-4 w-4" /> };
  }

  // 🔥 测试执行详情页不创建新tab，复用 /test-runs 的tab
  if (pathname.match(/^\/test-runs\/.+\/detail$/)) {
    return null;
  }

  // 🔥 外部页面路由 - 通过 addTab 手动创建，不自动创建
  if (pathname.startsWith('/external')) {
    return null;
  }

  // 功能测试用例相关路由
  if (pathname === '/functional-test-cases/generator') {
    return { title: 'AI 智能生成器', icon: <ClipboardList className="h-4 w-4" /> };
  }

  if (pathname === '/functional-test-cases/create') {
    return { title: '创建功能用例', icon: <PlusCircle className="h-4 w-4" /> };
  }

  // 🔥 功能用例详情页
  if (pathname.match(/^\/functional-test-cases\/\d+\/detail$/)) {
    return { title: '查看功能用例', icon: <FileText className="h-4 w-4" /> };
  }

  // 🔥 功能用例编辑页
  if (pathname.match(/^\/functional-test-cases\/\d+\/edit$/)) {
    return { title: '编辑功能用例', icon: <Edit3 className="h-4 w-4" /> };
  }

  // 🔥 功能用例执行页
  if (pathname.match(/^\/functional-test-cases\/\d+\/execute$/)) {
    return { title: '执行功能用例', icon: <Play className="h-4 w-4" /> };
  }

  // 🔥 功能用例执行页（备用）
  if (pathname.match(/^\/functional-test-cases\/\d+\/execute-alt$/)) {
    return { title: '执行功能用例', icon: <Play className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/functional-test-cases\/test-points\/.+\/edit$/)) {
    return { title: '编辑测试点', icon: <Edit3 className="h-4 w-4" /> };
  }

  // 🔥 所有测试计划相关路由（包括详情页及其子路由）都不创建新tab，都使用 /test-plans 的tab
  // 这些路由会在上面的useEffect中特殊处理，激活列表页的tab
  if (pathname === '/test-plans/create') {
    return null;
  }

  if (pathname.match(/^\/test-plans\/\d+$/)) {
    return null;
  }

  if (pathname.match(/^\/test-plans\/\d+\/edit$/)) {
    return null;
  }

  if (pathname.match(/^\/test-plans\/\d+\/add-cases$/)) {
    return null;
  }

  if (pathname.match(/^\/test-plans\/\d+\/execute$/)) {
    return null;
  }

  return null;
};

// 生成唯一ID
const generateTabId = (path: string): string => {
  return `tab-${path.replace(/\//g, '-')}-${Date.now()}`;
};

// 首页Tab（不可关闭）
const homeTab: Tab = {
  id: 'tab-home',
  path: '/',
  title: '仪表板',
  icon: <Home className="h-4 w-4" />,
  closable: false,
};

interface TabProviderProps {
  children: ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState<Tab[]>([homeTab]);
  const [activeTabId, setActiveTabId] = useState<string>(homeTab.id);
  const [isInitialized, setIsInitialized] = useState(false); // 添加初始化标志

  // 从localStorage加载Tab
  useEffect(() => {
    const savedTabs = localStorage.getItem(STORAGE_KEY);
    if (savedTabs) {
      try {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 恢复Tab，重新添加icon
          const restoredTabs = parsed.map((tab: Omit<Tab, 'icon'>) => {
            const config = getRouteConfig(tab.path);
            return {
              ...tab,
              icon: config?.icon || homeTab.icon,
            };
          });

          // 确保首页Tab始终存在
          const hasHome = restoredTabs.some((tab: Tab) => tab.path === '/');
          const finalTabs = hasHome ? restoredTabs : [homeTab, ...restoredTabs];
          setTabs(finalTabs);

          // 恢复当前激活的Tab
          const currentTab = finalTabs.find((tab: Tab) => tab.path === location.pathname);
          if (currentTab) {
            setActiveTabId(currentTab.id);
          }
        }
      } catch (error) {
        console.error('加载Tab状态失败:', error);
      }
    }
    // 标记初始化完成
    setIsInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 保存Tab到localStorage（移除React元素）
  useEffect(() => {
    if (tabs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const tabsToSave = tabs.map(({ icon, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsToSave));
    }
  }, [tabs]);

  // 监听路由变化，自动创建或激活Tab
  useEffect(() => {
    // 等待初始化完成后再处理路由变化
    if (!isInitialized) {
      return;
    }

    const currentPath = location.pathname + location.search; // 包含查询参数
    const existingTab = tabs.find(tab => tab.path === currentPath);

    if (existingTab) {
      // Tab已存在，直接激活
      if (activeTabId !== existingTab.id) {
        setActiveTabId(existingTab.id);
      }
      return;
    }

    // 🔥 特殊处理：所有测试计划相关路由（包括详情页）都使用 /test-plans 的tab，不创建新tab
    // 检查是否是测试计划相关路由（只检查路径部分，不包含查询参数）
    const pathOnly = location.pathname;
    const isTestPlanRoute = 
      pathOnly === '/test-plans/create' ||
      pathOnly.match(/^\/test-plans\/\d+/) !== null;

    if (isTestPlanRoute) {
      const parentPath = '/test-plans';
      const parentTab = tabs.find(tab => tab.path === parentPath);
      
      if (parentTab) {
        // 如果列表页tab存在，激活它，不创建新tab
        setActiveTabId(parentTab.id);
        // 注意：这里不改变路由，只是激活tab，路由仍然保持为当前路由
        return;
      } else {
        // 如果列表页tab不存在，创建列表页tab
        const parentConfig = getRouteConfig(parentPath);
        if (parentConfig && tabs.length < MAX_TABS) {
          const newParentTab: Tab = {
            path: parentPath,
            title: parentConfig.title,
            icon: parentConfig.icon,
            id: generateTabId(parentPath),
            closable: true,
          };
          setTabs(prev => [...prev, newParentTab]);
          setActiveTabId(newParentTab.id);
          // 注意：这里不改变路由，只是创建并激活列表页tab，路由仍然保持为当前路由
          return;
        }
      }
    }

    // 🔥 特殊处理：测试执行详情页使用 /test-runs 的tab，不创建新tab
    const isTestRunDetailRoute = pathOnly.match(/^\/test-runs\/.+\/detail$/) !== null;

    if (isTestRunDetailRoute) {
      const parentPath = '/test-runs';
      const parentTab = tabs.find(tab => tab.path === parentPath);
      
      if (parentTab) {
        // 如果列表页tab存在，激活它，不创建新tab
        setActiveTabId(parentTab.id);
        return;
      } else {
        // 如果列表页tab不存在，创建列表页tab
        const parentConfig = getRouteConfig(parentPath);
        if (parentConfig && tabs.length < MAX_TABS) {
          const newParentTab: Tab = {
            path: parentPath,
            title: parentConfig.title,
            icon: parentConfig.icon,
            id: generateTabId(parentPath),
            closable: true,
          };
          setTabs(prev => [...prev, newParentTab]);
          setActiveTabId(newParentTab.id);
          return;
        }
      }
    }

    // 创建新Tab
    const config = getRouteConfig(pathOnly); // 只传递路径部分给 getRouteConfig
    if (!config) {
      return;
    }

    // 检查Tab数量限制
    if (tabs.length >= MAX_TABS) {
      console.warn(`已达到最大Tab数量限制 (${MAX_TABS})`);
      return;
    }

    // 创建新Tab
    const newTab: Tab = {
      path: currentPath, // 使用完整路径（包含查询参数）
      title: config.title,
      icon: config.icon,
      id: generateTabId(currentPath),
      closable: currentPath !== '/',
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isInitialized]);

  // 添加Tab
  const addTab = useCallback((tab: Omit<Tab, 'id' | 'closable'>) => {
    setTabs(prevTabs => {
      // 检查是否已存在
      const existing = prevTabs.find(t => t.path === tab.path);
      if (existing) {
        setActiveTabId(existing.id);
        navigate(tab.path); // 导航到已存在的 Tab
        return prevTabs;
      }

      // 检查Tab数量限制
      if (prevTabs.length >= MAX_TABS) {
        console.warn(`已达到最大Tab数量限制 (${MAX_TABS})`);
        return prevTabs;
      }

      // 创建新Tab
      const newTab: Tab = {
        ...tab,
        id: generateTabId(tab.path),
        closable: tab.path !== '/', // 首页不可关闭
      };

      setActiveTabId(newTab.id);
      navigate(tab.path); // 导航到新创建的 Tab
      return [...prevTabs, newTab];
    });
  }, [navigate]);

  // 移除Tab
  const removeTab = useCallback((tabId: string, targetPath?: string) => {
    setTabs(prevTabs => {
      const tab = prevTabs.find(t => t.id === tabId);

      // 不能关闭首页Tab
      if (!tab || !tab.closable) {
        return prevTabs;
      }

      const newTabs = prevTabs.filter(t => t.id !== tabId);

      // 如果关闭的是当前激活的Tab，需要切换到其他Tab
      if (activeTabId === tabId) {
        // 如果指定了目标路径，尝试找到对应的Tab并激活
        if (targetPath) {
          const targetTab = newTabs.find(t => t.path === targetPath);
          if (targetTab) {
            setActiveTabId(targetTab.id);
            navigate(targetTab.path);
            return newTabs;
          }
        }
        
        // 否则使用默认逻辑：切换到相邻Tab
        const currentIndex = prevTabs.findIndex(t => t.id === tabId);
        const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || homeTab;
        setActiveTabId(nextTab.id);
        navigate(nextTab.path);
      }

      return newTabs;
    });
  }, [activeTabId, navigate]);

  // 设置激活Tab
  const setActiveTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      navigate(tab.path);
    }
  }, [tabs, navigate]);

  // 关闭其他Tab
  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tab = prevTabs.find(t => t.id === tabId);
      if (!tab) return prevTabs;

      // 保留首页和指定Tab
      const newTabs = prevTabs.filter(t => t.id === tabId || !t.closable);

      setActiveTabId(tabId);
      navigate(tab.path);

      return newTabs;
    });
  }, [navigate]);

  // 关闭右侧所有Tab
  const closeRightTabs = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tabIndex = prevTabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prevTabs;

      // 保留当前Tab及其左侧的Tab
      const newTabs = prevTabs.slice(0, tabIndex + 1);

      return newTabs;
    });
  }, []);

  // 关闭所有Tab（除了首页）
  const closeAllTabs = useCallback(() => {
    setTabs([homeTab]);
    setActiveTabId(homeTab.id);
    navigate('/');
  }, [navigate]);

  const value: TabContextType = {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabs = (): TabContextType => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};
