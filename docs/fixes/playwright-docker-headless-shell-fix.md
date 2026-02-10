# Playwright Docker Headless Shell 修复说明

## 问题描述

在 Docker 容器中运行 Sakura AI 时，测试执行失败并报错：

```
browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell
```

### 症状

- 构建阶段验证显示 `headless_shell` 文件存在且有执行权限
- 运行时却找不到该文件
- 首次安装启动后验证正常，但测试执行时仍然报错

### 根本原因

多阶段 Docker 构建中，从构建阶段复制到运行阶段时可能出现以下问题：

1. **文件权限丢失**：COPY 指令可能不保留可执行权限
2. **符号链接断裂**：如果使用了符号链接，可能在复制时断裂
3. **路径不一致**：构建阶段和运行阶段的环境变量可能不同
4. **文件所有权问题**：文件所有者可能不正确

## 解决方案

### 1. Dockerfile 修改

#### 运行阶段增强验证和权限设置

```dockerfile
# 从构建阶段复制 Playwright 浏览器（包含 ffmpeg）
# 使用 --chown 确保权限正确，--link 优化层缓存
COPY --from=builder --chown=root:root /root/.cache/ms-playwright /root/.cache/ms-playwright

# 设置 Playwright 环境变量
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# 验证 Playwright 浏览器是否正确复制并设置权限
RUN echo "=== 验证运行阶段 Playwright 浏览器 ===" && \
    ls -la /root/.cache/ms-playwright/ && \
    echo "=== 验证 chromium ===" && \
    ls -la /root/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null || echo "❌ chromium 未找到" && \
    echo "=== 验证 headless_shell ===" && \
    ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null || echo "❌ headless_shell 未找到" && \
    echo "=== 验证 ffmpeg ===" && \
    (ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux 2>/dev/null || \
     ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg 2>/dev/null || \
     echo "❌ ffmpeg 未找到") && \
    # 确保所有可执行文件有执行权限
    find /root/.cache/ms-playwright -type f -name "chrome" -exec chmod +x {} \; 2>/dev/null || true && \
    find /root/.cache/ms-playwright -type f -name "headless_shell" -exec chmod +x {} \; 2>/dev/null || true && \
    find /root/.cache/ms-playwright -type f -name "ffmpeg*" -exec chmod +x {} \; 2>/dev/null || true && \
    echo "=== 权限设置完成 ==="
```

**关键改进**：

1. 使用 `--chown=root:root` 确保文件所有权正确
2. 添加详细的验证步骤，列出文件路径和权限
3. 显式设置可执行权限（`chmod +x`）
4. 验证三个关键组件：chromium、headless_shell、ffmpeg

### 2. 启动脚本增强

修改 `scripts/start.cjs` 中的 `setup()` 函数：

```javascript
// 安装 Playwright 浏览器
async function setup() {
  try {
    // 检测 Docker 环境
    const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
    
    // Docker 环境使用固定路径
    const playwrightCachePath = isDocker
      ? '/root/.cache/ms-playwright'
      : (isWindows 
          ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
          : path.join(os.homedir(), '.cache', 'ms-playwright'));
    
    console.log(`   🔍 检查 Playwright 缓存路径: ${playwrightCachePath}`);
    
    // 验证 headless_shell 文件
    if (headlessDir) {
      const headlessPath = path.join(playwrightCachePath, headlessDir, 'chrome-linux', 'headless_shell');
      headlessOk = fs.existsSync(headlessPath);
      
      if (headlessOk) {
        console.log(`   📦 headless_shell: ${headlessDir} ✓ (${headlessPath})`);
        
        // 验证文件权限（仅 Linux/Docker）
        if (!isWindows) {
          const stats = fs.statSync(headlessPath);
          const isExecutable = (stats.mode & 0o111) !== 0;
          if (!isExecutable) {
            console.log(`   ⚠️ headless_shell 没有执行权限，正在修复...`);
            fs.chmodSync(headlessPath, 0o755);
            console.log(`   ✅ 已设置执行权限`);
          }
        }
      } else {
        // 列出目录内容以诊断问题
        console.log(`   ❌ headless_shell 可执行文件不存在: ${headlessPath}`);
        // ... 诊断代码 ...
      }
    }
    
    // Docker 环境下如果缺少浏览器，说明构建有问题
    if (isDocker && (!chromiumOk || !headlessOk || !ffmpegOk)) {
      console.error(`   ❌ Docker 环境中 Playwright 浏览器缺失，这不应该发生！`);
      console.error(`   💡 请检查 Dockerfile 中的 COPY 指令是否正确`);
      console.error(`   💡 或者重新构建镜像: docker compose build --no-cache`);
      process.exit(1);
    }
  } catch (error) {
    // 错误处理
  }
}
```

**关键改进**：

1. 检测 Docker 环境，使用正确的缓存路径
2. 验证文件存在性和可执行权限
3. 自动修复权限问题
4. 提供详细的诊断信息
5. Docker 环境下如果浏览器缺失，立即报错

### 3. 验证脚本

创建 `scripts/verify-playwright-docker.sh` 用于诊断：

```bash
#!/bin/bash
# 验证 Playwright 浏览器安装

CACHE_PATH="/root/.cache/ms-playwright"

# 检查目录
ls -lah "$CACHE_PATH"

# 验证 headless_shell
HEADLESS_DIR=$(ls -d "$CACHE_PATH"/chromium_headless_shell-* 2>/dev/null | head -n 1)
if [ -n "$HEADLESS_DIR" ]; then
    HEADLESS_PATH="$HEADLESS_DIR/chrome-linux/headless_shell"
    if [ -f "$HEADLESS_PATH" ]; then
        echo "✓ headless_shell 存在"
        ls -lh "$HEADLESS_PATH"
        
        # 检查权限
        if [ -x "$HEADLESS_PATH" ]; then
            echo "✓ 可执行权限正常"
        else
            echo "⚠️ 缺少执行权限，正在修复..."
            chmod +x "$HEADLESS_PATH"
        fi
    fi
fi
```

## 使用方法

### 重新构建镜像

```bash
# 清理旧镜像和缓存
docker compose down -v
docker system prune -af

# 重新构建（不使用缓存）
docker compose build --no-cache

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f
```

### 验证浏览器安装

在容器内运行验证脚本：

```bash
# 进入容器
docker compose exec sakura-ai bash

# 运行验证脚本
bash scripts/verify-playwright-docker.sh

# 或手动检查
ls -la /root/.cache/ms-playwright/
ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell
```

### 手动修复权限

如果仍有问题，可以手动修复：

```bash
# 进入容器
docker compose exec sakura-ai bash

# 设置执行权限
find /root/.cache/ms-playwright -type f -name "chrome" -exec chmod +x {} \;
find /root/.cache/ms-playwright -type f -name "headless_shell" -exec chmod +x {} \;
find /root/.cache/ms-playwright -type f -name "ffmpeg*" -exec chmod +x {} \;

# 验证权限
ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell
```

## 验证修复

### 1. 构建日志检查

构建时应该看到：

```
=== 验证运行阶段 Playwright 浏览器 ===
drwxr-xr-x 5 root root 4096 Feb 10 01:35 .
drwxr-xr-x 1 root root 4096 Feb 10 01:34 ..
drwxr-xr-x 3 root root 4096 Feb 10 01:35 chromium-1194
drwxr-xr-x 3 root root 4096 Feb 10 01:35 chromium_headless_shell-1194
drwxr-xr-x 2 root root 4096 Feb 10 01:35 ffmpeg-1011

=== 验证 headless_shell ===
-rwxr-xr-x 1 root root 305768840 Feb 10 01:35 /root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell

=== 权限设置完成 ===
```

### 2. 启动日志检查

启动时应该看到：

```
[6/6] 安装 Playwright 浏览器...
   🔍 检查 Playwright 缓存路径: /root/.cache/ms-playwright
   📂 缓存目录内容: chromium-1194, chromium_headless_shell-1194, ffmpeg-1011
   📦 chromium: chromium-1194 ✓ (/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome)
   📦 headless_shell: chromium_headless_shell-1194 ✓ (/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell)
   📦 ffmpeg: ffmpeg-1011 ✓ (/root/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux)
   ✅ Playwright 浏览器已完整安装，跳过下载
```

### 3. 测试执行

运行测试应该成功：

```bash
# 在容器内
docker compose exec sakura-ai bash

# 运行简单测试
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ headless: true }); console.log('✓ 浏览器启动成功'); await browser.close(); })()"
```

## 常见问题

### Q1: 为什么构建时显示文件存在，运行时却找不到？

**A**: 多阶段构建中，COPY 指令可能不保留文件权限或符号链接。解决方法：
- 使用 `--chown` 确保所有权正确
- 在运行阶段显式设置执行权限
- 验证文件确实被复制

### Q2: 如何确认是权限问题还是文件缺失？

**A**: 使用验证脚本或手动检查：
```bash
# 检查文件是否存在
ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell

# 检查权限（第一列应该是 -rwxr-xr-x）
stat /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell
```

### Q3: 为什么需要在运行阶段再次验证？

**A**: 因为：
1. 构建阶段和运行阶段是不同的文件系统层
2. COPY 指令可能改变文件属性
3. 环境变量可能不同
4. 早期发现问题比运行时失败更好

### Q4: 本地环境会受影响吗？

**A**: 不会。修改只影响 Docker 环境：
- 启动脚本会检测环境类型
- 本地环境使用用户目录的缓存路径
- Docker 环境使用 `/root/.cache/ms-playwright`

## 相关文件

- `Dockerfile.debian` - Docker 镜像构建文件
- `scripts/start.cjs` - 应用启动脚本
- `scripts/verify-playwright-docker.sh` - 浏览器验证脚本
- `commit/git-commit-log.md` - 详细的修改记录

## 参考资料

- [Playwright Docker 文档](https://playwright.dev/docs/docker)
- [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)
- [Linux 文件权限](https://www.linux.com/training-tutorials/understanding-linux-file-permissions/)
