#!/usr/bin/env python3
"""
修复 formatSummary 方法，添加对 100% 缓存命中的支持
"""

import re

# 读取文件
with open('server/services/midsceneLogParser.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 在简洁模式部分添加 hasAICalls 检查
# 查找 "简洁模式：原有的紧凑格式" 后面的内容
pattern = r'(// 简洁模式：原有的紧凑格式\s+const callCount = summary\.tokenStats\.length;)'

replacement = r'''\1
      
      // 🔥 只有在有 AI 调用时才显示 token 和成本信息
      if (hasAICalls) {'''

content = re.sub(pattern, replacement, content)

# 在缓存统计之前添加结束括号
pattern = r'(      }\s+      \n      // 缓存统计（带可视化进度条）)'
replacement = r'      }\n\1'
content = re.sub(pattern, replacement, content)

# 修改缓存收益部分
old_cache_benefit = r'''        // 缓存收益估算
        if \(summary\.cacheStats\.cacheHits > 0 && callCount > 0\) \{
          const savedCost = \(summary\.totalCost / callCount\) \* summary\.cacheStats\.cacheHits;
          const savedTime = \(summary\.totalDuration / callCount / 1000\) \* summary\.cacheStats\.cacheHits;
          lines\.push\(`💡 缓存收益: 节省约 \$\{savedCost\.toFixed\(4\)\} 成本, \$\{savedTime\.toFixed\(1\)\}s 时间`\);
        }'''

new_cache_benefit = r'''        // 🔥 100% 缓存命中时的特殊提示
        if (hitRate === 100 && !hasAICalls) {
          lines.push(`💡 本次执行 100% 命中缓存，无 AI 调用产生，节省成本和时间`);
        } else if (summary.cacheStats.cacheHits > 0 && hasAICalls && callCount > 0) {
          // 缓存收益估算
          const savedCost = (summary.totalCost / callCount) * summary.cacheStats.cacheHits;
          const savedTime = (summary.totalDuration / callCount / 1000) * summary.cacheStats.cacheHits;
          lines.push(`💡 缓存收益: 节省约 ${savedCost.toFixed(4)} 成本, ${savedTime.toFixed(1)}s 时间`);
        }'''

content = re.sub(old_cache_benefit, new_cache_benefit, content, flags=re.DOTALL)

# 写回文件
with open('server/services/midsceneLogParser.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ formatSummary 方法已修复")
