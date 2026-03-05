import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Play, Eye, Edit, Copy } from 'lucide-react';
import { functionalTestCaseService } from '../../services/functionalTestCaseService';
import * as systemService from '../../services/systemService';
import { showToast } from '../../utils/toast';
import type { SystemOption } from '../../types/test';

// LocalStorage keys for state persistence
const FILTERS_STORAGE_KEY = 'ui-auto-test-cases-filters';
const PAGINATION_STORAGE_KEY = 'ui-auto-test-cases-pagination';

interface UIAutoTestCase {
  id: number;
  case_id: string;
  name: string;
  system_name: string;
  module_name: string;
  scenario_name: string;
  test_point_name: string;
  case_type: string;
  version_code: string;
  priority: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function UIAutoTestCases() {
  const navigate = useNavigate();
  
  // 列表数据
  const [testCases, setTestCases] = useState<UIAutoTestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // 🔥 从 localStorage 恢复筛选条件
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('恢复筛选条件失败:', error);
    }
    // 默认值
    return {
      search: '',
      system: '',
      module: '',
      scenario: '',
      caseType: '',
      priority: '',
      status: ''
    };
  });
  
  // 🔥 从 localStorage 恢复分页状态
  const [pagination, setPagination] = useState(() => {
    try {
      const saved = localStorage.getItem(PAGINATION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          current: parsed.current || 1,
          pageSize: parsed.pageSize || 20
        };
      }
    } catch (error) {
      console.error('恢复分页状态失败:', error);
    }
    // 默认值
    return {
      current: 1,
      pageSize: 20
    };
  });
  
  // 系统字典
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
  
  // 加载系统字典
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
      }
    };
    loadSystems();
  }, []);
  
  // 加载测试用例列表
  const loadTestCases = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: 调用UI自动化测试用例API
      // 暂时使用功能用例API作为示例
      const response: any = await functionalTestCaseService.getFlatList({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...filters
      });
      
      setTestCases(response.data || []);
      setTotal(response.pagination?.total || 0);
    } catch (error) {
      console.error('加载测试用例失败:', error);
      showToast.error('加载测试用例失败');
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);
  
  useEffect(() => {
    loadTestCases();
  }, [loadTestCases]);
  
  // 🔥 保存筛选条件到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error('保存筛选条件失败:', error);
    }
  }, [filters]);

  // 🔥 保存分页状态到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PAGINATION_STORAGE_KEY, JSON.stringify({
        current: pagination.current,
        pageSize: pagination.pageSize
      }));
    } catch (error) {
      console.error('保存分页状态失败:', error);
    }
  }, [pagination.current, pagination.pageSize]);
  
  // 筛选变更
  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev: any) => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };
  
  // 分页变更
  const handlePageChange = (page: number, pageSize?: number) => {
    setPagination({
      current: page,
      pageSize: pageSize || pagination.pageSize
    });
  };
  
  // 新建用例
  const handleCreate = () => {
    navigate('/test-cases/new');
  };
  
  // 查看详情
  const handleView = (testCase: UIAutoTestCase) => {
    navigate(`/test-cases/${testCase.id}/detail`);
  };
  
  // 编辑用例
  const handleEdit = (testCase: UIAutoTestCase) => {
    navigate(`/test-cases/${testCase.id}/edit`);
  };
  
  // 复制用例
  const handleCopy = async (_testCase: UIAutoTestCase) => {
    try {
      // TODO: 实现复制逻辑
      showToast.success('复制成功');
      loadTestCases();
    } catch (error) {
      console.error('复制失败:', error);
      showToast.error('复制失败');
    }
  };
  
  // 执行用例
  const handleExecute = (testCase: UIAutoTestCase) => {
    navigate(`/test-cases/${testCase.id}/execute`);
  };
  
  // 删除用例
  const handleDelete = async (testCase: UIAutoTestCase) => {
    if (!window.confirm(`确定要删除用例"${testCase.name}"吗？`)) {
      return;
    }
    
    try {
      // TODO: 实现删除逻辑
      showToast.success('删除成功');
      loadTestCases();
    } catch (error) {
      console.error('删除失败:', error);
      showToast.error('删除失败');
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">UI自动化测试用例</h1>
          <p className="text-sm text-gray-500 mt-1">管理和执行UI自动化测试用例</p>
        </div>
        
        {/* 操作栏 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索用例名称、用例ID..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <select
                value={filters.system}
                onChange={(e) => handleFilterChange('system', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">所有系统</option>
                {systemOptions.map(sys => (
                  <option key={sys.id} value={sys.name}>{sys.name}</option>
                ))}
              </select>
              
              <select
                value={filters.priority}
                onChange={(e) => handleFilterChange('priority', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">所有优先级</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
              
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">所有状态</option>
                <option value="draft">草稿</option>
                <option value="active">启用</option>
                <option value="archived">归档</option>
              </select>
            </div>
            
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建用例
            </button>
          </div>
        </div>


        {/* 测试用例列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : testCases.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">暂无测试用例</p>
              <button
                onClick={handleCreate}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" />
                创建第一个用例
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        用例ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        用例名称
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        系统
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        模块
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        优先级
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        创建时间
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {testCases.map((testCase) => (
                      <tr key={testCase.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {testCase.case_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {testCase.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {testCase.system_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {testCase.module_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            testCase.priority === 'high' ? 'bg-red-100 text-red-800' :
                            testCase.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {testCase.priority === 'high' ? '高' : testCase.priority === 'medium' ? '中' : '低'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            testCase.status === 'active' ? 'bg-green-100 text-green-800' :
                            testCase.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {testCase.status === 'active' ? '启用' : testCase.status === 'draft' ? '草稿' : '归档'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(testCase.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleView(testCase)}
                              className="text-blue-600 hover:text-blue-900"
                              title="查看"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(testCase)}
                              className="text-green-600 hover:text-green-900"
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleExecute(testCase)}
                              className="text-purple-600 hover:text-purple-900"
                              title="执行"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCopy(testCase)}
                              className="text-gray-600 hover:text-gray-900"
                              title="复制"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(testCase)}
                              className="text-red-600 hover:text-red-900"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 分页 */}
              {total > pagination.pageSize && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    共 {total} 条记录，第 {pagination.current} / {Math.ceil(total / pagination.pageSize)} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.current - 1)}
                      disabled={pagination.current === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.current + 1)}
                      disabled={pagination.current >= Math.ceil(total / pagination.pageSize)}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
