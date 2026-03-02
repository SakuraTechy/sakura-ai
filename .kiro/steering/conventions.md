# 开发规范

## 提交信息规范
- feat: 新功能
- fix: Bug 修复
- docs: 文档变更
- style: 代码格式调整
- refactor: 重构
- test: 测试相关
- chore: 其他杂项

## 分支策略
- main: 生产环境
- dev: 开发环境
- feature/*: 新功能开发
- hotfix/*: 紧急修复

## 代码审查标准
- 测试通过
- 覆盖率 80% 以上
- 无 ESLint 错误
- 文档已更新

# AI回复说明
- 所有内容必须使用中文回答

# AI规范
- 1.在不要求生成并创建相关功能说明文档时，不用自己生成创建文档，节省token为原则
- 2.修改文件直接修改，不要使用PowerShell命令去修改文件内容，以节省token为原则
- 3.修改的内容需要在commit\git-commit-log.md文件按日期倒叙，最新的展示最前面，自动增量添加当修改内容的Git提交说明
- 4.总结 commit\git-commit-log.md 精简到 commit\git-commit-summary.md 文件中按日期倒叙，最新的展示最前面，用于最后提交使用

