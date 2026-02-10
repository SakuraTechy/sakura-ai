# Sakura AI - Debian Linux Dockerfile (优化版)
# 使用多阶段构建减小镜像体积：5.6GB → 3.8GB
# 适用于 CentOS 7 宿主机的容器化部署方案

# ============================================
# 阶段 1: 构建阶段
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# 配置国内镜像源（统一管理）
ENV NPM_REGISTRY=https://registry.npmmirror.com \
    DEBIAN_MIRROR=mirrors.aliyun.com

# 配置 Debian 国内镜像源并安装所有依赖（构建 + 运行时）
RUN sed -i "s/deb.debian.org/${DEBIAN_MIRROR}/g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    (echo "deb http://${DEBIAN_MIRROR}/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
     echo "deb http://${DEBIAN_MIRROR}/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
     echo "deb http://${DEBIAN_MIRROR}/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list) && \
    apt-get update && apt-get install -y --no-install-recommends \
    # 构建工具
    python3 make g++ \
    # Playwright Chromium 运行依赖
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libfreetype6 libharfbuzz0b ca-certificates \
    libglib2.0-0 libstdc++6 libgcc-s1 libx11-6 libxtst6 libxext6 \
    libatspi2.0-0 libexpat1 libxcb1 libxshmfence1 libdbus-1-3 \
    # Playwright 额外依赖
    xvfb \
    # 中文字体
    # fonts-liberation fonts-noto-color-emoji fonts-wqy-zenhei \
    # fonts-noto-cjk fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf \
    # 字体支持（只安装必需的字体，减小体积）
    fonts-liberation fonts-noto-color-emoji \
    
    # 工具
    curl \
    && rm -rf /var/lib/apt/lists/*

# 配置 npm 和环境变量
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node \
    PRISMA_ENGINES_MIRROR=${NPM_REGISTRY}/-/binary/prisma \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 \
    npm_config_sharp_binary_host=https://npmmirror.com/mirrors/sharp \
    npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips \
    PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright

RUN npm config set registry ${NPM_REGISTRY}

# 复制依赖文件（优先复制，利用缓存）
COPY package.json package-lock.json ./

# 安装所有依赖（包括开发依赖，用于构建）
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --ignore-scripts && \
    npm install @img/sharp-linux-x64 --legacy-peer-deps && \
    npm install @rollup/rollup-linux-x64-gnu --save-optional --legacy-peer-deps && \
    npm rebuild

# 复制 Prisma schema（单独复制，利用缓存）
COPY prisma ./prisma

# 生成 Prisma 客户端（只在 schema 变化时重新生成）
RUN rm -rf src/generated/prisma 2>/dev/null || true && \
    npx prisma generate

# 复制应用代码（放在后面，避免代码修改导致前面的层失效）
COPY . .

# 从 .env.example 创建 .env 文件（如果不存在）
RUN if [ -f .env.example ] && [ ! -f .env ]; then \
    cp .env.example .env; \
    fi

# 构建前端
RUN npm run build 2>&1 | tee /tmp/build.log || \
    (cat /tmp/build.log && exit 1)

# 直接安装 Playwright 浏览器到最终路径（不使用缓存挂载，确保文件被保留）
RUN set -e && \
    export PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright && \
    echo "=== 开始安装 Playwright 浏览器 ===" && \
    npx playwright install chromium chromium-headless-shell ffmpeg && \
    echo "=== Playwright 安装完成，验证浏览器 ===" && \
    ls -la /root/.cache/ms-playwright/ && \
    echo "=== 验证 chromium ===" && \
    ls -la /root/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null || echo "❌ chromium 未找到" && \
    echo "=== 验证 headless_shell ===" && \
    ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null || echo "❌ headless_shell 未找到" && \
    echo "=== 验证 ffmpeg ===" && \
    (ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux 2>/dev/null || \
     ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg 2>/dev/null || \
     echo "❌ ffmpeg 未找到") && \
    echo "=== 清理文档文件 ===" && \
    find /root/.cache/ms-playwright -name "*.d.ts" -type f -delete 2>/dev/null || true && \
    find /root/.cache/ms-playwright -name "*.md" -type f -delete 2>/dev/null || true && \
    find /root/.cache/ms-playwright -name "LICENSE*" -type f -delete 2>/dev/null || true && \
    find /root/.cache/ms-playwright -name "NOTICE*" -type f -delete 2>/dev/null || true && \
    echo "=== 设置可执行权限 ===" && \
    find /root/.cache/ms-playwright -type f -name "chrome" -exec chmod +x {} \; 2>/dev/null || true && \
    find /root/.cache/ms-playwright -type f -name "headless_shell" -exec chmod +x {} \; 2>/dev/null || true && \
    find /root/.cache/ms-playwright -type f -name "ffmpeg*" -exec chmod +x {} \; 2>/dev/null || true && \
    echo "=== 最终验证 ===" && \
    ls -la /root/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null || echo "❌ chromium 验证失败" && \
    ls -la /root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null || echo "❌ headless_shell 验证失败" && \
    (ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux 2>/dev/null || \
     ls -la /root/.cache/ms-playwright/ffmpeg-*/ffmpeg 2>/dev/null || \
     echo "❌ ffmpeg 验证失败") && \
    echo "=== Playwright 浏览器安装完成 ==="

# 清理不必要的文件（在独立层中完成，不影响 Playwright）
RUN npm cache clean --force && \
    rm -rf /tmp/* /root/.npm /root/.cache/npm && \
    # 轻量级清理：只删除明确不需要的文件，避免误删关键依赖
    # 注意：保留 .map 文件以避免 Vite 开发服务器警告
    find node_modules -name "LICENSE*" -type f -delete 2>/dev/null || true && \
    find node_modules -name "CHANGELOG*" -type f -delete 2>/dev/null || true && \
    find node_modules -name "README*" -type f -delete 2>/dev/null || true && \
    find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "coverage" -exec rm -rf {} + 2>/dev/null || true && \
    # 只删除明确的开发工具（保留 vite 和 @playwright/test 等运行时需要的包）
    rm -rf node_modules/typescript 2>/dev/null || true && \
    rm -rf node_modules/eslint 2>/dev/null || true && \
    rm -rf node_modules/eslint-* 2>/dev/null || true && \
    rm -rf node_modules/@typescript-eslint 2>/dev/null || true && \
    # 显示清理后的大小
    echo "=== node_modules 清理完成 ===" && \
    du -sh node_modules 2>/dev/null || echo "无法计算大小" && \
    # 验证关键依赖是否存在
    echo "=== 验证关键依赖 ===" && \
    ls -la node_modules/@playwright/test 2>/dev/null && echo "✓ @playwright/test 存在" || echo "❌ @playwright/test 缺失" && \
    ls -la node_modules/playwright 2>/dev/null && echo "✓ playwright 存在" || echo "❌ playwright 缺失" && \
    ls -la node_modules/@midscene/web 2>/dev/null && echo "✓ @midscene/web 存在" || echo "❌ @midscene/web 缺失" && \
    ls -la node_modules/vite 2>/dev/null && echo "✓ vite 存在" || echo "❌ vite 缺失"

# ============================================
# 阶段 2: 运行阶段
# ============================================
FROM node:20-slim

WORKDIR /app

# 只安装运行时必需的系统依赖（从构建阶段复制库文件）
# 注意：这里只安装最小化的运行时依赖，不包含构建工具
ENV DEBIAN_MIRROR=mirrors.aliyun.com

RUN sed -i "s/deb.debian.org/${DEBIAN_MIRROR}/g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    (echo "deb http://${DEBIAN_MIRROR}/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
     echo "deb http://${DEBIAN_MIRROR}/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
     echo "deb http://${DEBIAN_MIRROR}/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list) && \
    apt-get update && apt-get install -y --no-install-recommends \
    # Playwright Chromium 核心依赖
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libfreetype6 libharfbuzz0b ca-certificates \
    libglib2.0-0 libstdc++6 libgcc-s1 libx11-6 libxtst6 libxext6 \
    libatspi2.0-0 libexpat1 libxcb1 libxshmfence1 libdbus-1-3 \
    # Playwright 额外依赖
    xvfb \
    # 字体支持（包含中文字体以正确显示截图中的文字）
    fonts-liberation fonts-noto-color-emoji \
    fonts-noto-cjk-extra \
    # 网络诊断工具
    iputils-ping \
    # 工具
    curl \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/*

# 从构建阶段复制必要文件
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drivers ./drivers
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/config ./config
COPY --from=builder /app/tsconfig.json /app/tsconfig.node.json /app/tsconfig.app.json ./
COPY --from=builder /app/vite.config.ts /app/tailwind.config.cjs /app/postcss.config.cjs ./
COPY --from=builder /app/index.html ./
COPY --from=builder /app/.env ./

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
    echo "=== 权限设置完成 ===" && \
    # 🔥 创建 ffmpeg 符号链接到系统 PATH，让 Playwright 能找到
    echo "=== 创建 ffmpeg 符号链接 ===" && \
    FFMPEG_PATH=$(find /root/.cache/ms-playwright -name "ffmpeg-linux" -o -name "ffmpeg" | head -n 1) && \
    if [ -n "$FFMPEG_PATH" ]; then \
        ln -sf "$FFMPEG_PATH" /usr/local/bin/ffmpeg && \
        echo "✅ ffmpeg 符号链接已创建: /usr/local/bin/ffmpeg -> $FFMPEG_PATH" && \
        ffmpeg -version | head -n 1; \
    else \
        echo "❌ 未找到 ffmpeg 可执行文件"; \
    fi

# 创建必要目录
RUN mkdir -p logs artifacts uploads screenshots

# 暴露端口
EXPOSE 3001 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["npm", "start"]