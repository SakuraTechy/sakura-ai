import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  Workflow,
  FileSearch,
  TrendingUp,
  Newspaper,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import { TabBar } from './TabBar';
import { useTabShortcuts } from '../hooks/useTabShortcuts';
import { useTabs } from '../contexts/TabContext';
import { OpenClawIcon } from './icons/OpenClawIcon';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ElementType | React.ComponentType<any>;
}

const navigationItems: NavigationItem[] = [
  { name: '仪表板', href: '/', icon: Home },
  { name: '用户管理', href: '/user-management', icon: Users },
  { name: '项目管理', href: '/systems', icon: FolderKanban },
  { name: '市场洞察', href: '/market-insights', icon: TrendingUp },
  { name: '行业资讯', href: '/industry-news', icon: Newspaper },
  { name: '需求分析', href: '/requirement-analysis', icon: FileSearch },
  { name: '需求管理', href: '/requirement-docs', icon: FileText },
  { name: '知识库', href: '/knowledge', icon: BookOpen },
  { name: '功能用例', href: '/functional-test-cases', icon: ClipboardList },
  { name: 'UI自动化', href: '/test-cases', icon: FileCode },
  { name: '测试执行', href: '/test-runs', icon: Play },
  { name: '测试计划', href: '/test-plans', icon: Target },
  { name: '测试报告', href: '/reports', icon: BarChart3 },
  // { name: '测试工厂', href: '/test-factory', icon: Factory },
  // { name: 'AI 助手', href: '/llm-assistant', icon: Bot },
  { name: '小龙虾', href: '/openclaw', icon: OpenClawIcon },
  { name: '缓存统计', href: '/cache-stats', icon: Database },
  { name: '设置', href: '/settings', icon: Settings },
];

// 侧边栏宽度常量
const SIDEBAR_WIDTH_EXPANDED = 250;
const SIDEBAR_WIDTH_COLLAPSED = 80;

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 从 localStorage 读取侧边栏收缩状态，默认展开
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isSuperAdmin } = useAuth();
  const { addTab } = useTabs();
  const [gatewayToken, setGatewayToken] = useState<string>('');

  // 获取 OpenClaw Gateway 令牌
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const authToken = localStorage.getItem('authToken') || '';
        const res = await fetch('/api/openclaw/token', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setGatewayToken(data.token || '');
        }
      } catch {
        // 忽略，使用空 token
      }
    };
    fetchToken();
  }, []);

  // 处理小龙虾导航点击：管理员跳管理页，普通用户用 addTab 新建 tab 打开 Web UI
  const handleOpenClawClick = useCallback(() => {
    if (isSuperAdmin) {
      navigate('/openclaw');
      return;
    }
    const username = user?.username || 'admin';
    const token = gatewayToken || '';
    const innerPath = `/api/openclaw-proxy/chat?session=agent:main:${username}#token=${token}`;
    const externalPath = `/external?url=${encodeURIComponent(innerPath)}`;
    addTab({
      path: externalPath,
      title: '小龙虾',
      icon: <OpenClawIcon className="h-4 w-4" />,
    });
  }, [isSuperAdmin, user, gatewayToken, navigate, addTab]);

  // 保存侧边栏状态到 localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // 切换侧边栏收缩状态
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // 启用Tab快捷键
  useTabShortcuts();

  // 全屏功能（同时启用浏览器全屏和应用内全屏）
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      // 进入全屏
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('进入全屏失败:', err);
        setIsFullscreen(true);
      }
    } else {
      // 退出全屏
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch (err) {
        console.error('退出全屏失败:', err);
      }
      setIsFullscreen(false);
    }
  };

  // 监听浏览器全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  // 应用全屏样式
  useEffect(() => {
    const root = document.documentElement;
    
    if (isFullscreen) {
      root.classList.add('app-fullscreen');
      
      if (containerRef.current) {
        containerRef.current.style.width = '100vw';
        containerRef.current.style.height = '100vh';
        containerRef.current.style.overflow = 'auto';
        containerRef.current.style.backgroundColor = 'var(--color-bg-secondary)';
        containerRef.current.style.position = 'relative';
      }
      
      root.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      root.classList.remove('app-fullscreen');
      
      if (containerRef.current) {
        containerRef.current.style.width = '';
        containerRef.current.style.height = '';
        containerRef.current.style.overflow = '';
        containerRef.current.style.backgroundColor = '';
        containerRef.current.style.position = '';
      }
      
      root.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    
    return () => {
      root.classList.remove('app-fullscreen');
    };
  }, [isFullscreen]);

  // 🔥 根据用户权限过滤导航菜单
  const filteredNavigationItems = navigationItems.filter(item => {
    // 用户管理页面仅超级管理员可见
    if (item.href === '/user-management') {
      return isSuperAdmin;
    }
    return true;
  });

  const currentPage = filteredNavigationItems.find(item => item.href === location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div className="px-2 py-1">
          <div className="font-medium">{user?.username}</div>
          {user?.accountName && <div className="text-sm text-gray-700">{user.accountName}</div>}
          {user?.project && <div className="text-sm text-gray-600">{user.project}</div>} {/* 🔥 修复：使用 project 字段 */}
          {user?.isSuperAdmin && (
            <div className="mt-1 text-xs text-purple-600 font-medium">超级管理员</div>
          )}
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogOut className="h-4 w-4" />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-[var(--color-bg-secondary)]">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div
              className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className="fixed inset-y-0 left-0 flex w-[230px] flex-col bg-[var(--color-bg-primary)] shadow-lg border-r border-[var(--color-border)]"
            >
              <div className="flex h-20 items-center justify-between px-6 border-b border-[var(--color-border)]">
                <Logo size="md" showText={true} />
                <motion.button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-xl text-gray-600 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
              <nav className="flex-1 px-6 py-8 space-y-3">
                {filteredNavigationItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  const itemClass = clsx(
                    'group flex items-center px-4 py-3 rounded-2xl text-base font-medium transition-all duration-300 relative overflow-hidden cursor-pointer',
                    isActive
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                  );
                  const inner = (
                    <>
                      {isActive && (
                        <motion.div
                          className="absolute inset-0 bg-purple-600 rounded-2xl"
                          layoutId="activeBackground"
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <motion.div
                        className="relative flex items-center"
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Icon className={clsx(
                          'mr-4 h-5 w-5 transition-transform group-hover:scale-110',
                          isActive ? 'text-white' : 'text-gray-500 dark:text-gray-600'
                        )} />
                        <span className="relative">{item.name}</span>
                      </motion.div>
                    </>
                  );
                  return (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      {item.href === '/openclaw' ? (
                        <div className={itemClass} onClick={() => { handleOpenClawClick(); setSidebarOpen(false); }}>
                          {inner}
                        </div>
                      ) : (
                        <NavLink to={item.href} onClick={() => setSidebarOpen(false)} className={itemClass}>
                          {inner}
                        </NavLink>
                      )}
                    </motion.div>
                  );
                })}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.div 
        className="hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col"
        animate={{ 
          x: isFullscreen ? '-100%' : 0,
          opacity: isFullscreen ? 0 : 1,
          width: sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ pointerEvents: isFullscreen ? 'none' : 'auto' }}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] relative">
          {/* Logo 区域 */}
          <div className={clsx(
            "flex h-20 items-center border-b border-gray-200/50 dark:border-gray-700/50 transition-all duration-300",
            sidebarCollapsed ? "justify-center px-0" : "px-0"
          )}>
            <Logo size="lg" showText={!sidebarCollapsed} />
          </div>

          {/* 导航菜单 */}
          <nav className={clsx(
            "flex-1 py-4 space-y-3 overflow-y-auto",
            sidebarCollapsed ? "px-3" : "px-4"
          )}>
            {filteredNavigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              const itemClass = clsx(
                'group flex items-center rounded-2xl text-base font-medium transition-all duration-300 relative overflow-hidden cursor-pointer',
                sidebarCollapsed ? 'justify-center px-3 py-3' : 'px-4 py-3',
                isActive
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
              );
              const inner = (
                <>
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 bg-purple-600 rounded-2xl"
                      layoutId="desktopActiveBackground"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <motion.div
                    className={clsx('relative flex items-center', sidebarCollapsed ? 'justify-center' : '')}
                    whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Icon className={clsx(
                      'h-5 w-5 transition-transform group-hover:scale-110',
                      !sidebarCollapsed && 'mr-4',
                      isActive ? 'text-white' : 'text-gray-500 dark:text-gray-600'
                    )} />
                    {!sidebarCollapsed && <span className="relative">{item.name}</span>}
                  </motion.div>
                </>
              );

              const navItem = (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {item.href === '/openclaw' ? (
                    <div className={itemClass} onClick={handleOpenClawClick}>
                      {inner}
                    </div>
                  ) : (
                    <NavLink to={item.href} className={itemClass}>
                      {inner}
                    </NavLink>
                  )}
                </motion.div>
              );

              // 收缩时使用 Tooltip 显示文字
              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.name} title={item.name} placement="right">
                    {navItem}
                  </Tooltip>
                );
              }

              return navItem;
            })}
          </nav>

          {/* 收缩/展开按钮 */}
          <motion.div 
            className={clsx(
              "border-t border-gray-200/50 dark:border-gray-700/50 p-4",
              sidebarCollapsed ? "flex justify-center" : "flex justify-end"
            )}
          >
            <Tooltip title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'} placement="right">
              <motion.button
                onClick={toggleSidebar}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </motion.button>
            </Tooltip>
          </motion.div>
        </div>
      </motion.div>

      {/* Main content */}
      <motion.div 
        className="transition-all duration-300"
        animate={{ 
          paddingLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 && !isFullscreen 
            ? (sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED)
            : 0
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Top navigation */}
        <motion.div 
          className="sticky top-0 z-40 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)]"
          animate={{ 
            y: isFullscreen ? -100 : 0,
            opacity: isFullscreen ? 0 : 1
          }}
          transition={{ duration: 0.3 }}
          style={{ 
            display: isFullscreen ? 'none' : 'block'
          }}
        >
          <div className="flex h-20 items-center justify-between px-6 sm:px-8 lg:px-10">
            <div className="flex items-center">
              <motion.button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Menu className="h-5 w-5" />
              </motion.button>
              <div className="ml-4 lg:ml-0">
                <motion.h1 
                  className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 bg-clip-text text-transparent"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {currentPage?.name || 'AI 智能生成器'}
                </motion.h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <motion.div 
                className="flex items-center space-x-2 px-3 py-2 rounded-full bg-green-50 dark:bg-green-900/30"
                whileHover={{ scale: 1.05 }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <motion.div 
                  className="h-2 w-2 bg-green-500 rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                ></motion.div>
                <span className="text-sm font-medium text-green-700 dark:text-green-400">系统正常</span>
              </motion.div>
              
              {/* 全屏按钮 */}
              <motion.button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={isFullscreen ? '退出全屏' : '进入全屏'}
                aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 }}
              >
                {isFullscreen ? (
                  <Minimize className="h-5 w-5" />
                ) : (
                  <Maximize className="h-5 w-5" />
                )}
              </motion.button>
              
              <ThemeToggle size="md" />
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <motion.div
                  className="h-10 w-10 bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 rounded-full shadow-md cursor-pointer flex items-center justify-center text-white font-medium"
                  whileHover={{ scale: 1.1, boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)' }}
                  whileTap={{ scale: 0.9 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <User className="h-5 w-5" />
                </motion.div>
              </Dropdown>
            </div>
          </div>
        </motion.div>

        {/* Tab Bar */}
        {!isFullscreen && <TabBar />}

        {/* Page content */}
        <motion.main
          className="flex-1 pl-6 pr-6 pt-6 pb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          {children}
        </motion.main>

        {/* 全屏模式下的退出按钮 - 右下角位置 */}
        {isFullscreen && (
          <motion.button
            onClick={toggleFullscreen}
            className="fixed bottom-8 right-8 z-[10200] p-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl text-white hover:from-blue-600 hover:to-purple-700 transition-all"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="退出全屏 (按ESC键)"
            aria-label="退出全屏"
          >
            <Minimize className="h-6 w-6" />
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}