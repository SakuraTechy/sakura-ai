import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  FileText, Search, Eye, Edit3, Trash2, Archive, 
  RotateCcw, Calendar, User, FolderKanban, Tag, ChevronRight,
  FileCode, TestTube2, Filter, X, Bot
} from 'lucide-react';
import { Modal, Input, Pagination, Empty, Spin, Tooltip, Tag as AntTag, Checkbox, Select } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { requirementDocService, RequirementDoc, RequirementDocListParams } from '../services/requirementDocService';
import * as systemService from '../services/systemService';
import { showToast } from '../utils/toast';
import { marked } from 'marked';

// 筛选选项类型
interface FilterOptions {
  versions: { id: number; version_name: string; version_code: string }[];
  modules: string[];
  creators: { id: number; username: string }[];
}

const { TextArea } = Input;

/**
 * 需求文档管理页面
 */
export function RequirementDocs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<RequirementDoc[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  });
  
  // 筛选
  const [filters, setFilters] = useState<RequirementDocListParams>({
    search: '',
    projectId: undefined,
    projectVersionId: undefined,
    module: '',
    status: '',
    creatorId: undefined,
    startDate: '',
    endDate: ''
  });
  
  // 高级筛选展开状态
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // 项目选项
  const [projects, setProjects] = useState<any[]>([]);
  
  // 筛选选项
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    versions: [],
    modules: [],
    creators: []
  });
  
  // 详情弹窗
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<RequirementDoc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    summary: '',
    system: '',
    module: '',
    projectId: undefined as number | undefined,
    projectVersionId: undefined as number | undefined
  });
  
  // 批量选择状态
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  
  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await requirementDocService.getList({
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters
      });
      setDocuments(result.data);
      setPagination(prev => ({
        ...prev,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }));
    } catch (error: any) {
      showToast.error('加载需求文档失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // 加载项目列表
  const loadProjects = async () => {
    try {
      const result = await systemService.getActiveSystems();
      setProjects(result);
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  };
  
  // 加载筛选选项（根据已有数据动态获取模块和创建人）
  const loadFilterOptions = async () => {
    try {
      // 从已有文档中提取模块和创建人选项
      const result = await requirementDocService.getList({ page: 1, pageSize: 1000 });
      const docs = result.data;
      
      // 提取唯一的模块
      const moduleSet = new Set<string>();
      docs.forEach(doc => {
        if (doc.module) moduleSet.add(doc.module);
      });
      
      // 提取唯一的创建人
      const creatorMap = new Map<number, { id: number; username: string }>();
      docs.forEach(doc => {
        if (doc.users && doc.users.id) {
          creatorMap.set(doc.users.id, { id: doc.users.id, username: doc.users.username });
        }
      });
      
      setFilterOptions(prev => ({
        ...prev,
        modules: Array.from(moduleSet),
        creators: Array.from(creatorMap.values())
      }));
    } catch (error) {
      console.error('加载筛选选项失败:', error);
    }
  };
  
  // 加载项目版本列表
  const loadProjectVersions = async (projectId: number) => {
    try {
      const project = projects.find(p => p.id === projectId);
      // 使用 as any 访问可能存在的 project_versions 属性
      const projectVersions = (project as any)?.project_versions;
      if (project && projectVersions) {
        setFilterOptions(prev => ({
          ...prev,
          versions: projectVersions || []
        }));
      } else {
        // 如果项目数据中没有版本，尝试获取完整项目信息
        const projectDetail = await systemService.getSystemById(projectId);
        const detailVersions = (projectDetail as any)?.project_versions;
        if (projectDetail && detailVersions) {
          setFilterOptions(prev => ({
            ...prev,
            versions: detailVersions
          }));
        }
      }
    } catch (error) {
      console.error('加载版本列表失败:', error);
      setFilterOptions(prev => ({ ...prev, versions: [] }));
    }
  };
  
  // 初始化加载
  useEffect(() => {
    loadProjects();
    loadFilterOptions();
    
    // 检查 URL 参数中是否有文档ID，如果有则自动打开详情
    const docId = searchParams.get('docId');
    if (docId) {
      const docIdNum = parseInt(docId);
      if (!isNaN(docIdNum)) {
        handleViewDetail({ id: docIdNum } as RequirementDoc);
        // 清除 URL 参数
        setSearchParams({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // 项目变化时加载版本列表
  useEffect(() => {
    if (filters.projectId) {
      loadProjectVersions(filters.projectId);
    } else {
      setFilterOptions(prev => ({ ...prev, versions: [] }));
      setFilters(prev => ({ ...prev, projectVersionId: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.projectId, projects]);
  
  // 筛选变化时重新加载
  useEffect(() => {
    loadData();
    setSelectedIds([]); // 切换页面/筛选时清空选择
  }, [pagination.page, pagination.pageSize, filters]);
  
  // 查看详情
  const handleViewDetail = async (doc: RequirementDoc) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    setIsEditing(false);
    try {
      const detail = await requirementDocService.getById(doc.id);
      setCurrentDoc(detail);

      const projectId = detail.project_id ?? undefined;
      const project = projectId ? (projects.find(p => p.id === projectId) as any) : undefined;
      const versions: Array<any> = project?.project_versions ?? [];
      const mainVersion = versions.find(v => v.is_main) ?? versions[0];
      const resolvedProjectVersionId = (detail.project_version_id ?? undefined) ?? mainVersion?.id;

      setEditForm({
        title: detail.title,
        content: detail.content,
        summary: detail.summary || '',
        system: detail.system || '',
        module: detail.module || '',
        projectId,
        projectVersionId: resolvedProjectVersionId
      });
    } catch (error: any) {
      showToast.error('加载详情失败: ' + error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const editProjectVersions = editForm.projectId
    ? ((projects.find(p => p.id === editForm.projectId) as any)?.project_versions ?? [])
    : [];

  const handleEditProjectChange = (value: number | undefined) => {
    const projectId = value;
    const project = projectId ? projects.find(p => p.id === projectId) as any : undefined;
    const versions: Array<any> = project?.project_versions ?? [];
    const mainVersion = versions.find(v => v.is_main) ?? versions[0];

    setEditForm(prev => ({
      ...prev,
      projectId,
      projectVersionId: mainVersion?.id
    }));
  };

  const handleEditVersionChange = (value: number | undefined) => {
    setEditForm(prev => ({
      ...prev,
      projectVersionId: value
    }));
  };
  
  // 保存编辑
  const handleSaveEdit = async () => {
    if (!currentDoc) return;
    
    if (!editForm.title.trim()) {
      showToast.error('请输入文档标题');
      return;
    }
    
    if (!editForm.content.trim()) {
      showToast.error('请输入文档内容');
      return;
    }

    if (!editForm.projectId || !editForm.projectVersionId) {
      showToast.error('请选择对应的项目与版本后再保存');
      return;
    }
    
    setDetailLoading(true);
    try {
      await requirementDocService.update(currentDoc.id, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
        summary: editForm.summary.trim() || undefined,
        system: editForm.system.trim() || undefined,
        module: editForm.module.trim() || undefined,
        projectId: editForm.projectId,
        projectVersionId: editForm.projectVersionId
      });

      // 更新后重新拉取详情，确保项目/版本关联字段也被刷新（避免只返回部分字段导致页面显示缺失）
      const refreshed = await requirementDocService.getById(currentDoc.id);
      setCurrentDoc(refreshed);
      const refreshedProjectId = refreshed.project_id ?? undefined;
      const refreshedProject = refreshedProjectId ? (projects.find(p => p.id === refreshedProjectId) as any) : undefined;
      const refreshedVersions: Array<any> = refreshedProject?.project_versions ?? [];
      const refreshedMainVersion = refreshedVersions.find(v => v.is_main) ?? refreshedVersions[0];
      const refreshedResolvedProjectVersionId =
        (refreshed.project_version_id ?? undefined) ?? refreshedMainVersion?.id;

      setEditForm({
        title: refreshed.title,
        content: refreshed.content,
        summary: refreshed.summary || '',
        system: refreshed.system || '',
        module: refreshed.module || '',
        projectId: refreshedProjectId,
        projectVersionId: refreshedResolvedProjectVersionId
      });
      setIsEditing(false);
      showToast.success('保存成功');
      loadData(); // 刷新列表
    } catch (error: any) {
      showToast.error('保存失败: ' + error.message);
    } finally {
      setDetailLoading(false);
    }
  };
  
  // 归档
  const handleArchive = async (doc: RequirementDoc) => {
    Modal.confirm({
      title: '归档需求文档',
      content: `确定要归档 "${doc.title}" 吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await requirementDocService.archive(doc.id);
          showToast.success('归档成功');
          loadData();
        } catch (error: any) {
          showToast.error('归档失败: ' + error.message);
        }
      }
    });
  };
  
  // 恢复
  const handleRestore = async (doc: RequirementDoc) => {
    try {
      await requirementDocService.restore(doc.id);
      showToast.success('恢复成功');
      loadData();
    } catch (error: any) {
      showToast.error('恢复失败: ' + error.message);
    }
  };
  
  // 删除
  const handleDelete = async (doc: RequirementDoc) => {
    Modal.confirm({
      title: '删除需求文档',
      content: `确定要删除 "${doc.title}" 吗？此操作不可恢复。`,
      okText: '确定删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await requirementDocService.delete(doc.id);
          showToast.success('删除成功');
          loadData();
        } catch (error: any) {
          showToast.error('删除失败: ' + error.message);
        }
      }
    });
  };
  
  // 切换单个选择
  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };
  
  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedIds.length === documents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(documents.map(doc => doc.id));
    }
  };
  
  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      showToast.error('请先选择要删除的文档');
      return;
    }
    
    Modal.confirm({
      title: '批量删除需求文档',
      content: `确定要删除选中的 ${selectedIds.length} 个文档吗？此操作不可恢复。`,
      okText: '确定删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setBatchDeleting(true);
        try {
          const result = await requirementDocService.batchDelete(selectedIds);
          showToast.success(result.message);
          setSelectedIds([]);
          loadData();
        } catch (error: any) {
          showToast.error('批量删除失败: ' + error.message);
        } finally {
          setBatchDeleting(false);
        }
      }
    });
  };
  
  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // 获取状态配置
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { color: 'green', text: '活跃' };
      case 'ARCHIVED':
        return { color: 'orange', text: '已归档' };
      case 'DELETED':
        return { color: 'red', text: '已删除' };
      default:
        return { color: 'default', text: status };
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gradient-50 to-gradient-50">
      {/* 页面标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">需求文档管理</h1>
            <p className="text-sm text-gray-500">管理AI生成的需求文档，查看关联的测试用例</p>
          </div>
        </div>
        
        {/* 顶部操作按钮 */}
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="inline-flex items-center px-4 py-2.5 bg-red-500 
                text-white rounded-lg hover:bg-red-600 transition-all shadow-md disabled:opacity-50 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {batchDeleting ? '删除中...' : `删除 (${selectedIds.length})`}
            </button>
          )}
          <button
            onClick={() => navigate('/functional-test-cases/generator?mode=requirement')}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md"
          >
            <Bot className="w-4 h-4 mr-2" />
            AI 生成需求
          </button>
        </div>
      </div>
      
      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          {/* 搜索 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文档标题、内容..."
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && setPagination(prev => ({ ...prev, page: 1 }))}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg 
                focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                transition-all duration-200"
            />
          </div>
          
          {/* 项目筛选 */}
          <select
            title="选择项目"
            value={filters.projectId || ''}
            onChange={e => setFilters(prev => ({ ...prev, projectId: e.target.value ? Number(e.target.value) : undefined }))}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
              focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-w-[140px]"
          >
            <option value="">所有项目</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          {/* 版本筛选 */}
          <select
            title="选择版本"
            value={filters.projectVersionId || ''}
            onChange={e => setFilters(prev => ({ ...prev, projectVersionId: e.target.value ? Number(e.target.value) : undefined }))}
            disabled={!filters.projectId}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
              focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-w-[130px]
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{!filters.projectId ? '请先选择项目' : '所有版本'}</option>
            {filterOptions.versions.map(v => (
              <option key={v.id} value={v.id}>{v.version_name}</option>
            ))}
          </select>
          
          {/* 模块筛选 */}
          <select
            title="选择模块"
            value={filters.module || ''}
            onChange={e => setFilters(prev => ({ ...prev, module: e.target.value }))}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
              focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-w-[120px]"
          >
            <option value="">所有模块</option>
            {filterOptions.modules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          
          {/* 状态筛选 */}
          <select
            title="选择状态"
            value={filters.status}
            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm
              focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-w-[110px]"
          >
            <option value="">所有状态</option>
            <option value="ACTIVE">活跃</option>
            <option value="ARCHIVED">已归档</option>
          </select>
          
          {/* 筛选按钮 */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              showAdvanced
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            筛选
          </button>
          
          {/* 重置按钮 */}
          <button
            onClick={() => {
              setFilters({ 
                search: '', 
                projectId: undefined, 
                projectVersionId: undefined,
                module: '',
                status: '',
                creatorId: undefined,
                startDate: '',
                endDate: ''
              });
              setPagination(prev => ({ ...prev, page: 1 }));
              setSelectedIds([]);
              setShowAdvanced(false);
            }}
            className="inline-flex items-center px-4 py-2.5 text-gray-600 hover:text-gray-900
              border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4 mr-2" />
            重置
          </button>
        </div>
        
        {/* 高级筛选 */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 创建人 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">创建人</label>
                  <select
                    title="选择创建人"
                    value={filters.creatorId || ''}
                    onChange={e => setFilters(prev => ({ ...prev, creatorId: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                      focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">所有创建人</option>
                    {filterOptions.creators.map(c => (
                      <option key={c.id} value={c.id}>{c.username}</option>
                    ))}
                  </select>
                </div>
                
                {/* 开始日期 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">开始日期</label>
                  <input
                    type="date"
                    title="选择开始日期"
                    value={filters.startDate || ''}
                    onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                      focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                
                {/* 结束日期 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">结束日期</label>
                  <input
                    type="date"
                    title="选择结束日期"
                    value={filters.endDate || ''}
                    onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm
                      focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* 文档列表 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spin size="large" />
          </div>
        ) : documents.length === 0 ? (
          <Empty
            className="py-20"
            description="暂无需求文档"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {/* 全选栏 */}
            {documents.length > 0 && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.length === documents.length && documents.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < documents.length}
                  onChange={handleToggleSelectAll}
                />
                <span className="text-sm text-gray-600">
                  {selectedIds.length > 0 
                    ? `已选择 ${selectedIds.length} 项` 
                    : '全选'}
                </span>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    取消选择
                  </button>
                )}
              </div>
            )}
            {documents.map(doc => {
              const statusConfig = getStatusConfig(doc.status);
              const isSelected = selectedIds.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  className={`p-5 hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => handleViewDetail(doc)}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* 复选框 */}
                    <div 
                      className="flex-shrink-0 pt-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleToggleSelect(doc.id)}
                      />
                    </div>
                    
                    {/* 左侧信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                          #{doc.id}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {doc.title}
                        </h3>
                        <AntTag color={statusConfig.color}>{statusConfig.text}</AntTag>
                      </div>
                      
                      {doc.summary && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                          {doc.summary}
                        </p>
                      )}
                      
                       <div className="flex items-center gap-4 text-xs text-gray-500">
                         {doc.project && (
                           <span className="flex items-center gap-1">
                             <FolderKanban className="w-3.5 h-3.5" />
                             {doc.project.name}
                             {doc.project_version && ` / ${doc.project_version.version_name}`}
                             {doc.module && ` / ${doc.module}`}
                           </span>
                         )}
                        {doc.source_filename && (
                          <span className="flex items-center gap-1">
                            <FileCode className="w-3.5 h-3.5" />
                            {doc.source_filename}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {doc.users?.username || '未知'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(doc.created_at)}
                        </span>
                      </div>
                    </div>
                    
                    {/* 右侧统计和操作 */}
                    <div className="flex items-center gap-4">
                      {/* 统计 */}
                      <div className="flex items-center gap-3 text-sm">
                        <Tooltip title="测试场景数">
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg">
                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                            <span className="font-medium text-blue-700">{doc.scenario_count}</span>
                          </div>
                        </Tooltip>
                        <Tooltip title="关联测试用例数">
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
                            <TestTube2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="font-medium text-green-700">{doc.test_case_count}</span>
                          </div>
                        </Tooltip>
                      </div>
                      
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Tooltip title="查看详情">
                          <button
                            onClick={() => handleViewDetail(doc)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        
                        {doc.status === 'ACTIVE' && (
                          <Tooltip title="编辑">
                            <button
                              onClick={() => {
                                handleViewDetail(doc).then(() => {
                                  setTimeout(() => setIsEditing(true), 100);
                                });
                              }}
                              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              aria-label="编辑"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                        
                        {doc.status === 'ACTIVE' ? (
                          <Tooltip title="归档">
                            <button
                              onClick={() => handleArchive(doc)}
                              className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              aria-label="归档"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        ) : doc.status === 'ARCHIVED' && (
                          <Tooltip title="恢复">
                            <button
                              onClick={() => handleRestore(doc)}
                              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              aria-label="恢复"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                        
                        <Tooltip title="删除">
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* 分页 */}
        {pagination.total > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              共 {pagination.total} 个文档
            </div>
            <Pagination
              current={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              showSizeChanger
              showQuickJumper
              onChange={(page, pageSize) => setPagination(prev => ({ ...prev, page, pageSize }))}
            />
          </div>
        )}
      </div>
      
      {/* 详情弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>需求文档详情</span>
            {currentDoc && (
              <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                #{currentDoc.id}
              </span>
            )}
          </div>
        }
        open={detailModalOpen}
        onCancel={() => {
          if (isEditing && JSON.stringify(editForm) !== JSON.stringify({
            title: currentDoc?.title || '',
            content: currentDoc?.content || '',
            summary: currentDoc?.summary || '',
            system: currentDoc?.system || '',
            module: currentDoc?.module || '',
            projectId: currentDoc?.project_id,
            projectVersionId: currentDoc?.project_version_id
          })) {
            Modal.confirm({
              title: '确认关闭',
              content: '当前有未保存的修改，确定要关闭吗？',
              okText: '确定',
              cancelText: '取消',
              onOk: () => {
                setDetailModalOpen(false);
                setCurrentDoc(null);
                setIsEditing(false);
              }
            });
          } else {
            setDetailModalOpen(false);
            setCurrentDoc(null);
            setIsEditing(false);
          }
        }}
        footer={null}
        width={1200}
        centered
        styles={{
          content: {
            maxHeight: '96vh',
            display: 'flex',
            flexDirection: 'column'
          },
          body: {
            flex: 1,
            overflow: 'auto',
            padding: '10px'
          }
        }}
        className="requirement-doc-modal"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spin size="large" />
          </div>
        ) : currentDoc && (
          <div className="flex flex-col gap-0">
            {/* 文档基本信息 */}
            <div className="bg-gray-50 rounded-lg p-2 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{currentDoc.title}</h2>
              {currentDoc.summary && (
                <p className="text-sm text-gray-600 mb-3">{currentDoc.summary}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {currentDoc.project && (
                  <span className="flex items-center gap-1">
                    <FolderKanban className="w-4 h-4" />
                    {currentDoc.project.name}
                    {currentDoc.project_version && ` / ${currentDoc.project_version.version_name}`}
                    {/* {currentDoc.system && ` / ${currentDoc.system}`} */}
                    {currentDoc.module && ` / ${currentDoc.module}`}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {currentDoc.users?.username}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(currentDoc.created_at)}
                </span>
              </div>
            </div>
            
            {/* 需求文档内容区域 */}
            <div className="flex-shrink-0">
              {/* 工具栏 - 预览/编辑切换 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    需求文档内容
                  </span>
                  <span className="text-xs text-gray-400">
                    {editForm.content?.length || 0} 字 · {editForm.content?.split('\n').length || 0} 行
                  </span>
                </div>
                
                {/* 模式切换按钮 */}
                {currentDoc.status === 'ACTIVE' ? (
                  <div className="flex items-center gap-3">
                    {/* 预览/编辑切换 */}
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setIsEditing(false)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          !isEditing
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        预览
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          isEditing
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                        编辑
                      </button>
                    </div>
                    
                    {/* 保存按钮 - 仅编辑模式显示 */}
                    {isEditing && (
                      <button
                        onClick={handleSaveEdit}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg 
                          hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md disabled:opacity-50 text-sm font-medium"
                        disabled={detailLoading}
                      >
                        {detailLoading ? '保存中...' : '保存修改'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                    已{currentDoc.status === 'ARCHIVED' ? '归档' : '删除'}，不可编辑
                  </div>
                )}
              </div>
              
              {/* 内容显示区域 */}
              <div>
                {isEditing ? (
                  /* 编辑模式 */
                  <div className="flex flex-col gap-4">
                    {/* 标题和基本信息编辑 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          文档标题 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={editForm.title}
                          onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="请输入文档标题"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          文档摘要
                        </label>
                        <Input
                          value={editForm.summary}
                          onChange={e => setEditForm(prev => ({ ...prev, summary: e.target.value }))}
                          placeholder="请输入文档摘要（可选）"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          关联项目 <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={editForm.projectId}
                          onChange={(value) => handleEditProjectChange(value ? Number(value) : undefined)}
                          placeholder="选择关联项目"
                          size="large"
                          style={{ width: '100%' }}
                          options={(projects ?? []).map(p => ({ label: p.name, value: p.id }))}
                          allowClear
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          关联版本 <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={editForm.projectVersionId}
                          onChange={(value) => handleEditVersionChange(value ? Number(value) : undefined)}
                          placeholder={editForm.projectId ? '选择对应版本' : '先选择项目'}
                          size="large"
                          style={{ width: '100%' }}
                          disabled={!editForm.projectId || editProjectVersions.length === 0}
                          allowClear
                          options={editProjectVersions.map(v => ({
                            label: `${v.version_name ?? ''}${v.version_code ? ` (${v.version_code})` : ''}`,
                            value: v.id
                          }))}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          系统名称
                        </label>
                        <Input
                          value={editForm.system}
                          onChange={e => setEditForm(prev => ({ ...prev, system: e.target.value }))}
                          placeholder="请输入系统名称（可选）"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          模块名称
                        </label>
                        <Input
                          value={editForm.module}
                          onChange={e => setEditForm(prev => ({ ...prev, module: e.target.value }))}
                          placeholder="请输入模块名称（可选）"
                        />
                      </div>
                    </div>
                    
                    {/* 文档内容编辑 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        文档内容 <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-400 font-normal ml-2">
                          支持 Markdown 格式
                        </span>
                      </label>
                      <TextArea
                        className="font-mono"
                        value={editForm.content}
                        onChange={e => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="请输入文档内容（支持 Markdown 格式）"
                        rows={15}
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                  </div>
                ) : (
                  /* 预览模式 */
                  <div 
                    className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm overflow-y-auto"
                    style={{ maxHeight: '60vh' }}
                  >
                    <div
                      className="prose prose-slate max-w-none prose-sm
                        prose-headings:text-gray-900
                        prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-2
                        prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-blue-700
                        prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
                        prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-3
                        prose-ul:my-3 prose-ol:my-3
                        prose-li:text-gray-700 prose-li:my-1
                        prose-strong:text-gray-900
                        prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-table:my-4
                        prose-thead:bg-blue-50
                        prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-th:text-left prose-th:font-semibold
                        prose-td:border prose-td:border-gray-300 prose-td:p-2
                      "
                      dangerouslySetInnerHTML={{ __html: marked.parse(currentDoc.content || '') as string }}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* 关联测试用例 - 仅查看模式显示 */}
            {!isEditing && currentDoc.test_cases && currentDoc.test_cases.length > 0 && (
              <div className="flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2 pt-3">
                  <TestTube2 className="w-4 h-4" />
                  关联测试用例 ({currentDoc.test_cases.length})
                </h3>
                <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[250px] overflow-y-auto">
                  {currentDoc.test_cases.map(tc => (
                    <div
                      key={tc.id}
                      className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                      onClick={() => {
                        // setDetailModalOpen(false);
                        // navigate(`/functional-test-cases/${tc.id}/detail`);
                        window.open(`/functional-test-cases/${tc.id}/detail`, '_blank');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-indigo-600 font-semibold">
                          TC_{String(tc.id).padStart(5, '0')}
                        </span>
                        <span className="text-sm text-gray-900">{tc.name}</span>
                        {tc.section_name && (
                          <AntTag color="blue" className="text-xs">{tc.section_name}</AntTag>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <AntTag color={tc.source === 'AI_GENERATED' ? 'purple' : 'default'}>
                          {tc.source === 'AI_GENERATED' ? 'AI' : '手动'}
                        </AntTag>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default RequirementDocs;

