#!/bin/bash

# OpenClaw 初始化脚本
# 功能：
# 1. 如果 SSL 证书不存在，则自动生成自签名证书
# 2. 如果配置文件不存在，则自动生成默认配置
OPENCLAW_HOME="${HOME:-/root}/.openclaw"
CONFIG_FILE="$OPENCLAW_HOME/openclaw.json"
CERT_DIR="$OPENCLAW_HOME/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# ============================================================
# 关键修复：必须在 OpenClaw 启动前完成，否则代码已加载 patch 无效
# ============================================================

# Patch Bonjour 服务（Docker 容器内 mDNS 无法正常工作）
# 根因：Bonjour (mDNS) 在 Docker 容器内会导致 "CIAO PROBING CANCELLED" unhandled promise rejection，触发容器崩溃
# 方案：在 gateway-cli 文件中添加全局 unhandledRejection 处理器，捕获并忽略 CIAO 错误
echo "检查 gateway-cli 文件..."
GATEWAY_CLI_FILES=$(find /app/dist -name 'gateway-cli-*.js' -type f 2>/dev/null || true)
if [ -z "$GATEWAY_CLI_FILES" ]; then
  echo "警告: 未找到 gateway-cli 文件，跳过 Bonjour patch"
else
  for GATEWAY_FILE in $GATEWAY_CLI_FILES; do
    if [ ! -f "$GATEWAY_FILE" ]; then
      echo "警告: 文件不存在 $GATEWAY_FILE，跳过"
      continue
    fi
    if grep -q "__bonjourRejectionHandled" "$GATEWAY_FILE" 2>/dev/null; then
      echo "已 patch: $(basename $GATEWAY_FILE)，跳过"
      continue
    fi
    echo "正在 patch Bonjour unhandled rejection: $(basename $GATEWAY_FILE)"
    node -e "
      const fs = require('fs');
      try {
        let content = fs.readFileSync('$GATEWAY_FILE', 'utf8');
        const patchCode = '// __bonjourRejectionHandled\\n' +
          'process.on(\"unhandledRejection\", (reason, promise) => {\\n' +
          '  if (reason && reason.message && reason.message.includes(\"CIAO PROBING CANCELLED\")) {\\n' +
          '    console.log(\"[bonjour] CIAO PROBING CANCELLED caught and ignored (Docker environment)\");\\n' +
          '    return;\\n' +
          '  }\\n' +
          '});\\n';
        content = patchCode + content;
        fs.writeFileSync('$GATEWAY_FILE', content);
        console.log('成功 patch: $GATEWAY_FILE');
      } catch(e) {
        console.error('Patch 失败: $GATEWAY_FILE', e.message);
        process.exit(1);
      }
    " || { echo "错误: gateway-cli patch 失败"; exit 1; }
  done
fi

# Patch @homebridge/ciao Prober.js，将 cancel() 的 reject 改为 resolve（静默取消）
# 根因：Prober.cancel() 调用 promiseReject(CANCEL_REASON)，该 Promise 没有 .catch() 处理
# 导致 unhandledRejection: CIAO PROBING CANCELLED，OpenClaw 的 unhandledRejection 处理器对此调用 process.exit(1)
echo "检查 Prober.js 文件..."
PROBER_FILE="/app/node_modules/.pnpm/@homebridge+ciao@1.3.5/node_modules/@homebridge/ciao/lib/responder/Prober.js"
if [ ! -f "$PROBER_FILE" ]; then
  echo "警告: Prober.js 文件不存在，跳过 patch"
elif grep -q "__ciaoCancelPatched" "$PROBER_FILE" 2>/dev/null; then
  echo "Prober.js 已 patch，跳过"
else
  echo "正在 patch Bonjour Prober.cancel()（静默取消，不抛出 rejection）..."
  node -e "
    const fs = require('fs');
    try {
      let content = fs.readFileSync('$PROBER_FILE', 'utf8');
      // 更精确的匹配模式，支持不同的空格/缩进
      const cancelMethodRegex = /cancel\(\)\s*\{\s*this\.clear\(\);\s*this\.promiseReject\(Prober\.CANCEL_REASON\);\s*\}/;
      if (!cancelMethodRegex.test(content)) {
        console.error('警告: cancel() 方法格式不匹配，可能已被修改或版本不同');
        process.exit(0); // 不阻止启动
      }
      content = content.replace(
        cancelMethodRegex,
        '// __ciaoCancelPatched\\n    cancel() {\\n        this.clear();\\n        if (this.promiseResolve) this.promiseResolve(null); // patched: silent cancel\\n    }'
      );
      fs.writeFileSync('$PROBER_FILE', content);
      console.log('成功 patch Prober.cancel(): $PROBER_FILE');
    } catch(e) {
      console.error('Patch 失败: $PROBER_FILE', e.message);
      process.exit(1);
    }
  " || { echo "错误: Prober.js patch 失败"; exit 1; }
fi

# 创建必要的目录
mkdir -p "$OPENCLAW_HOME"
mkdir -p "$CERT_DIR"

# 检查并生成 SSL 证书
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "SSL 证书不存在，正在生成自签名证书..."
  
  # 检查是否有 openssl 命令
  if ! command -v openssl &> /dev/null; then
    echo "错误: 容器中未安装 openssl，无法生成证书"
    echo "请手动提供证书文件或使用包含 openssl 的镜像"
    exit 1
  fi
  
  # 创建证书配置文件
  cat > /tmp/cert.conf << 'EOF'
[req]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
CN = openclaw-gateway

[req_ext]
subjectAltName = @alt_names

[alt_names]
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
DNS.1 = localhost
DNS.2 = openclaw-gateway
EOF

  # 生成自签名证书
  openssl req -new -x509 -newkey rsa:4096 -nodes \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 365 \
    -config /tmp/cert.conf \
    -extensions req_ext

  if [ $? -eq 0 ]; then
    echo "SSL 证书已生成: $CERT_FILE"
    echo "SSL 私钥已生成: $KEY_FILE"
    
    # 设置正确的权限
    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
  else
    echo "错误: SSL 证书生成失败"
    exit 1
  fi
else
  echo "使用现有 SSL 证书: $CERT_FILE"
fi

# 动态获取 OpenClaw 当前版本号（每次启动都检测，确保镜像更新后版本同步）
OPENCLAW_VERSION=""
if command -v node &> /dev/null && [ -f "dist/index.js" ]; then
  # --version 输出可能带前缀（如 "OpenClaw 2026.3.13"），只提取版本号部分
  RAW_VERSION=$(node dist/index.js --version 2>/dev/null | head -1)
  OPENCLAW_VERSION=$(echo "$RAW_VERSION" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
fi
if [ -z "$OPENCLAW_VERSION" ] && [ -f "package.json" ]; then
  OPENCLAW_VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
fi
if [ -z "$OPENCLAW_VERSION" ]; then
  OPENCLAW_VERSION="unknown"
  echo "警告: 无法自动获取 OpenClaw 版本号"
else
  echo "检测到 OpenClaw 版本: $OPENCLAW_VERSION"
fi

CURRENT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# 检查配置文件是否已存在
if [ ! -f "$CONFIG_FILE" ]; then
  echo "配置文件不存在，正在生成默认配置..."
  
  # 生成默认配置文件（版本号和时间戳动态填充）
  cat > "$CONFIG_FILE" << EOF
{
  "meta": {
    "lastTouchedVersion": "${OPENCLAW_VERSION}",
    "lastTouchedAt": "${CURRENT_TIMESTAMP}"
  },
  "wizard": {
    "lastRunAt": "${CURRENT_TIMESTAMP}",
    "lastRunVersion": "${OPENCLAW_VERSION}",
    "lastRunCommand": "configure",
    "lastRunMode": "local"
  },
  "agents": {
    "defaults": {
      "workspace": "${OPENCLAW_HOME}/workspace"
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["*"],
      "dangerouslyAllowHostHeaderOriginFallback": true,
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "plugins": {
    "allow": ["wecom-openclaw-plugin"],
    "load": {
      "paths": ["${OPENCLAW_HOME}/extensions"]
    }
  }
}
EOF

  echo "默认配置文件已生成: $CONFIG_FILE"
else
  echo "使用现有配置文件: $CONFIG_FILE"
  # 每次启动都更新 meta 中的版本信息，确保拉取新镜像后版本号同步
  if command -v node &> /dev/null && [ "$OPENCLAW_VERSION" != "unknown" ]; then
    node -e "
      const fs = require('fs');
      try {
        const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        let changed = false;
        const oldVer = (cfg.meta && cfg.meta.lastTouchedVersion) || '';
        const oldWizardVer = (cfg.wizard && cfg.wizard.lastRunVersion) || '';
        if (oldVer !== '$OPENCLAW_VERSION' || oldWizardVer !== '$OPENCLAW_VERSION') {
          cfg.meta = cfg.meta || {};
          cfg.meta.lastTouchedVersion = '$OPENCLAW_VERSION';
          cfg.meta.lastTouchedAt = '$CURRENT_TIMESTAMP';
          cfg.wizard = cfg.wizard || {};
          cfg.wizard.lastRunVersion = '$OPENCLAW_VERSION';
          cfg.wizard.lastRunAt = '$CURRENT_TIMESTAMP';
          changed = true;
          console.log('版本信息已更新: ' + oldVer + ' -> $OPENCLAW_VERSION');
        } else {
          console.log('版本信息无变化: $OPENCLAW_VERSION');
        }
        // 确保 plugins.allow 包含 wecom-openclaw-plugin
        cfg.plugins = cfg.plugins || {};
        const allow = cfg.plugins.allow || [];
        if (!allow.includes('wecom-openclaw-plugin')) {
          cfg.plugins.allow = [...allow, 'wecom-openclaw-plugin'];
          changed = true;
          console.log('已添加 plugins.allow: wecom-openclaw-plugin');
        }
        // 确保 plugins.load.paths 包含 extensions 目录
        // 作用：让 openclaw provenance 校验通过，消除 "loaded without install/load-path provenance" 刷屏警告
        cfg.plugins.load = cfg.plugins.load || {};
        const loadPaths = cfg.plugins.load.paths || [];
        const extDir = '$OPENCLAW_HOME/extensions';
        if (!loadPaths.includes(extDir)) {
          cfg.plugins.load.paths = [...loadPaths, extDir];
          changed = true;
          console.log('已添加 plugins.load.paths: ' + extDir);
        }
        // 清理无效的 Bonjour 配置键（OpenClaw 通过环境变量 OPENCLAW_GATEWAY_DISABLE_BONJOUR 控制）
        if (cfg.gateway) {
          if (cfg.gateway.bonjour !== undefined) {
            delete cfg.gateway.bonjour;
            changed = true;
            console.log('已删除无效配置键 gateway.bonjour（使用环境变量控制）');
          }
          if (cfg.gateway.services !== undefined) {
            delete cfg.gateway.services;
            changed = true;
            console.log('已删除无效配置键 gateway.services（使用环境变量控制）');
          }
        }
        if (changed) fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
      } catch(e) { console.error('更新版本信息失败:', e.message); }
    " 2>/dev/null
  fi
fi

# ============================================================
# 兼容性修复（按需触发）
# 
# 1. 插件自动安装：
#    - Windows Docker Desktop：extensions 为 named volume 时触发（bind mount rename 失败）
#    - Linux：使用 bind mount 持久化，不触发
# 
# 2. provenance 警告 patch：
#    - 通用问题：openclaw 源码无去重机制，任何平台都可能刷屏
#    - Linux 官方部署如果配置正确理论上不触发，但 patch 作为保险措施
# 
# 3. runtime 桥接文件：
#    - 通用问题：官方镜像可能缺失或版本更新后 hash 变化
#    - 仅在文件缺失或过期时触发，官方镜像完整则跳过
# ============================================================

WECOM_PLUGIN_DIR="$OPENCLAW_HOME/extensions/wecom-openclaw-plugin"

# 自动安装 wecom 插件
# 触发条件：插件目录不存在（named volume 场景下容器重建后为空）
# Linux bind mount 场景下插件持久化在宿主机，此处不会触发
echo "检查 wecom 插件..."
if [ -d "$WECOM_PLUGIN_DIR" ]; then
  echo "wecom 插件已存在，跳过安装"
else
  echo "wecom 插件不存在，正在自动安装..."
  # npm pack + cp 方式安装，避免跨挂载点 rename 失败（Windows virtiofs 问题）
  TMPDIR=$(mktemp -d)
  if [ ! -d "$TMPDIR" ]; then
    echo "错误: 无法创建临时目录"
    exit 1
  fi
  
  cd "$TMPDIR" || { echo "错误: 无法进入临时目录"; exit 1; }
  echo "正在下载 wecom 插件..."
  npm pack @wecom/wecom-openclaw-plugin 2>&1 | tail -3
  
  TARBALL=$(ls *.tgz 2>/dev/null | head -1)
  if [ -z "$TARBALL" ]; then
    echo "错误: wecom 插件下载失败，跳过安装"
    rm -rf "$TMPDIR"
  else
    echo "正在解压插件: $TARBALL"
    tar -xzf "$TARBALL" || { echo "错误: 解压失败"; rm -rf "$TMPDIR"; exit 1; }
    
    mkdir -p "$WECOM_PLUGIN_DIR" || { echo "错误: 无法创建插件目录"; rm -rf "$TMPDIR"; exit 1; }
    cp -r package/. "$WECOM_PLUGIN_DIR/" || { echo "错误: 复制文件失败"; rm -rf "$TMPDIR"; exit 1; }
    
    echo "正在安装插件依赖..."
    cd "$WECOM_PLUGIN_DIR" || { echo "错误: 无法进入插件目录"; exit 1; }
    npm install --production --silent 2>&1 | tail -5
    
    if [ $? -eq 0 ]; then
      echo "wecom 插件安装完成: $WECOM_PLUGIN_DIR"
    else
      echo "警告: 插件依赖安装可能有问题，但继续执行"
    fi
    
    rm -rf "$TMPDIR"
  fi
fi

# 插件通过 npm pack + cp 安装（非官方流程），需要手动补齐模块解析
# 官方 openclaw plugins install 会正确处理，此处仅在手动安装后执行

# 将 wecom 插件的 node_modules 软链接到 /app/node_modules
# 原因：openclaw 工作目录 /app 的模块解析不会向上找插件目录的 node_modules
echo "检查插件依赖软链接..."
if [ -d "$WECOM_PLUGIN_DIR/node_modules" ]; then
  LINKED_COUNT=0
  # 处理普通包（非 scoped）
  for pkg_dir in "$WECOM_PLUGIN_DIR/node_modules"/*/; do
    [ -d "$pkg_dir" ] || continue
    pkg_name=$(basename "$pkg_dir")
    # 跳过 scoped 包（以 @ 开头）
    [[ "$pkg_name" == @* ]] && continue
    # 如果目标不存在，创建软链接
    if [ ! -e "/app/node_modules/$pkg_name" ]; then
      ln -sf "$pkg_dir" "/app/node_modules/$pkg_name" && ((LINKED_COUNT++))
    fi
  done
  
  # 处理 scoped 包（@scope/package）
  for scope_dir in "$WECOM_PLUGIN_DIR/node_modules"/@*/; do
    [ -d "$scope_dir" ] || continue
    scope_name=$(basename "$scope_dir")
    mkdir -p "/app/node_modules/$scope_name"
    for scoped_pkg in "$scope_dir"*/; do
      [ -d "$scoped_pkg" ] || continue
      pkg_name=$(basename "$scoped_pkg")
      if [ ! -e "/app/node_modules/$scope_name/$pkg_name" ]; then
        ln -sf "$scoped_pkg" "/app/node_modules/$scope_name/$pkg_name" && ((LINKED_COUNT++))
      fi
    done
  done
  
  if [ $LINKED_COUNT -gt 0 ]; then
    echo "已链接 $LINKED_COUNT 个插件依赖到 /app/node_modules"
  else
    echo "所有插件依赖已存在，无需链接"
  fi
else
  echo "警告: 插件 node_modules 目录不存在，跳过依赖链接"
fi

# openclaw 自引用软链接（插件 ESM import 'openclaw/plugin-sdk' 需要）
if [ -e "/app/node_modules/openclaw" ]; then
  echo "openclaw 自引用软链接已存在，跳过"
else
  echo "正在创建 openclaw 自引用软链接..."
  ln -sf /app /app/node_modules/openclaw || { echo "错误: 创建软链接失败"; exit 1; }
  echo "已创建 openclaw 自引用软链接: /app/node_modules/openclaw -> /app"
fi

# 消除 "loaded without install/load-path provenance" 刷屏警告
# 根因：warnAboutUntrackedLoadedPlugins 函数没有去重机制，每次消息处理都重复打印
# 方案：patch 所有相关 dist 文件（包括子目录），在 logger.warn 调用前加 globalThis Set 去重
# 已 patch 的文件包含 __openclawProvenanceWarnedPlugins 标记，跳过重复处理
echo "检查 provenance 警告文件..."
PROVENANCE_WARN_MARKER="__openclawProvenanceWarnedPlugins"
# 递归搜索所有包含该函数的文件（包括 plugin-sdk/ 等子目录）
PROVENANCE_WARN_FILES=$(find /app/dist -name '*.js' -type f -exec grep -l 'function warnAboutUntrackedLoadedPlugins(' {} \; 2>/dev/null || true)
if [ -z "$PROVENANCE_WARN_FILES" ]; then
  echo "未找到 warnAboutUntrackedLoadedPlugins 函数，跳过 provenance patch"
else
  for WARN_FILE in $PROVENANCE_WARN_FILES; do
    if [ ! -f "$WARN_FILE" ]; then
      echo "警告: 文件不存在 $WARN_FILE，跳过"
      continue
    fi
    if grep -q "$PROVENANCE_WARN_MARKER" "$WARN_FILE" 2>/dev/null; then
      echo "已 patch: $(basename $WARN_FILE)，跳过"
      continue
    fi
    echo "正在 patch provenance 警告: $(basename $WARN_FILE)"
    # 使用更健壮的正则替换，兼容不同缩进格式（空格或tab）
    node -e "
      const fs = require('fs');
      try {
        let content = fs.readFileSync('$WARN_FILE', 'utf8');
        // 匹配 logger.warn 那行（支持空格或tab缩进，支持不同的引号）
        const regex = /^([\t ]+)params\.logger\.warn\(\\\`\[plugins\] \\\$\{plugin\.id\}: \\\$\{message\} \(\\\$\{plugin\.source\}\)\\\`\);$/gm;
        const matches = content.match(regex);
        if (!matches || matches.length === 0) {
          console.log('skip (no logger.warn match): $WARN_FILE');
          process.exit(0);
        }
        // 在 logger.warn 前插入去重逻辑（保持原缩进）
        content = content.replace(regex, (matched, indent) => {
          return indent + 'if (!globalThis.$PROVENANCE_WARN_MARKER) globalThis.$PROVENANCE_WARN_MARKER = new Set();\\n' +
                 indent + 'if (globalThis.$PROVENANCE_WARN_MARKER.has(plugin.id)) continue;\\n' +
                 indent + 'globalThis.$PROVENANCE_WARN_MARKER.add(plugin.id);\\n' +
                 matched;
        });
        fs.writeFileSync('$WARN_FILE', content);
        console.log('成功 patch provenance: $WARN_FILE');
      } catch(e) {
        console.error('Patch 失败: $WARN_FILE', e.message);
        process.exit(1);
      }
    " || { echo "错误: provenance patch 失败"; exit 1; }
  done
fi

# 修复 "Plugin runtime module missing createPluginRuntime export" 错误
# 根因分析：
#   - setup-wizard-helpers-*.js 内部定义了 createPluginRuntime 函数（第154821行）
#   - 但该函数未被包含在末尾的 export { ... } 语句中（打包时被遗漏）
#   - resolveCreatePluginRuntime() 通过 jiti 加载 /app/dist/plugins/runtime/index.js
#   - 该文件 re-export createPluginRuntime，但因为 helpers 文件未导出它而失败
# 修复方案：
#   步骤1：patch setup-wizard-helpers 文件，在末尾 export 语句中追加 createPluginRuntime
#   步骤2：创建/更新 runtime 桥接文件，用 ESM re-export 指向 helpers 文件
echo "检查 setup-wizard-helpers 文件..."
SETUP_HELPERS_FILE=$(ls /app/dist/plugin-sdk/setup-wizard-helpers-*.js 2>/dev/null | head -1)
if [ -z "$SETUP_HELPERS_FILE" ]; then
  echo "警告: 未找到 setup-wizard-helpers 文件，跳过 runtime 修复"
elif [ ! -f "$SETUP_HELPERS_FILE" ]; then
  echo "警告: setup-wizard-helpers 文件不存在，跳过 runtime 修复"
else
  # 步骤1：patch setup-wizard-helpers，追加 createPluginRuntime 到 export 语句
  # 标记：__createPluginRuntimeExported
  if grep -q "__createPluginRuntimeExported" "$SETUP_HELPERS_FILE" 2>/dev/null; then
    echo "setup-wizard-helpers 已 patch createPluginRuntime 导出，跳过"
  else
    echo "正在 patch setup-wizard-helpers: 追加 createPluginRuntime 到 export 语句..."
    node -e "
      const fs = require('fs');
      try {
        let content = fs.readFileSync('$SETUP_HELPERS_FILE', 'utf8');
        // 在文件末尾的 export { ... }; 语句末尾追加 createPluginRuntime 导出
        // 找到最后一个 export { ... }; 块，在其末尾的 }; 前插入
        const exportBlockEnd = content.lastIndexOf('};');
        if (exportBlockEnd === -1) {
          console.error('未找到 export 块末尾，跳过 patch');
          process.exit(0);
        }
        // 在 }; 前插入 createPluginRuntime 导出（追加到导出列表末尾）
        const before = content.slice(0, exportBlockEnd);
        const after = content.slice(exportBlockEnd);
        // 检查 before 末尾是否已有逗号，如果没有则加逗号
        const trimmed = before.trimEnd();
        const needsComma = !trimmed.endsWith(',');
        const patch = (needsComma ? ', ' : ' ') + 'createPluginRuntime // __createPluginRuntimeExported\\n';
        content = before + patch + after;
        fs.writeFileSync('$SETUP_HELPERS_FILE', content);
        console.log('成功 patch setup-wizard-helpers: 追加 createPluginRuntime 到 export 语句');
      } catch(e) {
        console.error('Patch 失败: $SETUP_HELPERS_FILE', e.message);
        process.exit(1);
      }
    " || { echo "错误: setup-wizard-helpers patch 失败"; exit 1; }
  fi

  # 步骤2：创建/更新 runtime 桥接文件（ESM re-export）
  # 检查条件：文件不存在，或指向的 helpers 文件 hash 已变化
  OPENCLAW_RUNTIME_FILE="/app/dist/plugins/runtime/index.js"
  NEEDS_REBUILD=true
  if [ -f "$OPENCLAW_RUNTIME_FILE" ]; then
    if grep -q "__runtimeBridge" "$OPENCLAW_RUNTIME_FILE" 2>/dev/null && grep -qF "$(basename $SETUP_HELPERS_FILE)" "$OPENCLAW_RUNTIME_FILE" 2>/dev/null; then
      NEEDS_REBUILD=false
      echo "runtime 桥接文件已是最新，跳过重建"
    fi
  fi
  if [ "$NEEDS_REBUILD" = "true" ]; then
    echo "正在创建 runtime 桥接文件..."
    mkdir -p "/app/dist/plugins/runtime"
    node -e "
      const fs = require('fs');
      const path = require('path');
      try {
        // 使用 ESM re-export，jiti 支持 ESM 格式
        // 使用相对路径，从 /app/dist/plugins/runtime/ 到 /app/dist/plugin-sdk/setup-wizard-helpers-*.js
        const runtimeDir = '/app/dist/plugins/runtime';
        const helpersFile = '$SETUP_HELPERS_FILE';
        const relativePath = path.relative(runtimeDir, helpersFile);
        const content = '// __runtimeBridge: Auto-generated by init-openclaw.sh\\n' +
                       '// Target: ' + path.basename(helpersFile) + '\\n' +
                       'export { createPluginRuntime } from \\x27' + relativePath + '\\x27;\\n';
        fs.writeFileSync('$OPENCLAW_RUNTIME_FILE', content);
        console.log('成功创建 runtime 桥接文件: $OPENCLAW_RUNTIME_FILE');
        console.log('指向: ' + relativePath);
      } catch(e) {
        console.error('创建 runtime 桥接文件失败:', e.message);
        process.exit(1);
      }
    " || { echo "错误: runtime 桥接文件创建失败"; exit 1; }
  fi
fi

# 启动 OpenClaw Gateway
exec "$@"