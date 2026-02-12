#!/bin/bash
# Playwright 浏览器验证脚本（Docker 环境）
# 用于诊断和验证 Playwright 浏览器安装问题

set -e

echo "🔍 Playwright 浏览器验证脚本"
echo "=============================="
echo ""

# 检测环境
if [ -f /.dockerenv ] || [ "$DOCKER_CONTAINER" = "true" ]; then
    echo "✓ 检测到 Docker 环境"
    CACHE_PATH="/root/.cache/ms-playwright"
else
    echo "✓ 检测到本地环境"
    CACHE_PATH="$HOME/.cache/ms-playwright"
fi

echo "📂 缓存路径: $CACHE_PATH"
echo ""

# 检查缓存目录是否存在
if [ ! -d "$CACHE_PATH" ]; then
    echo "❌ 缓存目录不存在: $CACHE_PATH"
    exit 1
fi

echo "📋 缓存目录内容:"
ls -lah "$CACHE_PATH"
echo ""

# 查找浏览器目录
CHROMIUM_DIR=$(ls -d "$CACHE_PATH"/chromium-* 2>/dev/null | grep -v headless | head -n 1)
HEADLESS_DIR=$(ls -d "$CACHE_PATH"/chromium_headless_shell-* 2>/dev/null | head -n 1)
FFMPEG_DIR=$(ls -d "$CACHE_PATH"/ffmpeg-* 2>/dev/null | head -n 1)

# 验证 chromium
echo "🔍 验证 chromium..."
if [ -n "$CHROMIUM_DIR" ]; then
    CHROME_PATH="$CHROMIUM_DIR/chrome-linux/chrome"
    if [ -f "$CHROME_PATH" ]; then
        echo "  ✓ 文件存在: $CHROME_PATH"
        ls -lh "$CHROME_PATH"
        if [ -x "$CHROME_PATH" ]; then
            echo "  ✓ 可执行权限正常"
        else
            echo "  ⚠️ 缺少执行权限，正在修复..."
            chmod +x "$CHROME_PATH"
            echo "  ✓ 权限已修复"
        fi
    else
        echo "  ❌ 文件不存在: $CHROME_PATH"
    fi
else
    echo "  ❌ 未找到 chromium 目录"
fi
echo ""

# 验证 headless_shell
echo "🔍 验证 headless_shell..."
if [ -n "$HEADLESS_DIR" ]; then
    HEADLESS_PATH="$HEADLESS_DIR/chrome-linux/headless_shell"
    if [ -f "$HEADLESS_PATH" ]; then
        echo "  ✓ 文件存在: $HEADLESS_PATH"
        ls -lh "$HEADLESS_PATH"
        if [ -x "$HEADLESS_PATH" ]; then
            echo "  ✓ 可执行权限正常"
        else
            echo "  ⚠️ 缺少执行权限，正在修复..."
            chmod +x "$HEADLESS_PATH"
            echo "  ✓ 权限已修复"
        fi
    else
        echo "  ❌ 文件不存在: $HEADLESS_PATH"
        echo "  🔍 列出 headless_shell 目录内容:"
        find "$HEADLESS_DIR" -type f -name "*shell*" -o -name "chrome*" | head -n 20
    fi
else
    echo "  ❌ 未找到 headless_shell 目录"
fi
echo ""

# 验证 ffmpeg
echo "🔍 验证 ffmpeg..."
if [ -n "$FFMPEG_DIR" ]; then
    FFMPEG_PATH="$FFMPEG_DIR/ffmpeg-linux"
    if [ -f "$FFMPEG_PATH" ]; then
        echo "  ✓ 文件存在: $FFMPEG_PATH"
        ls -lh "$FFMPEG_PATH"
        if [ -x "$FFMPEG_PATH" ]; then
            echo "  ✓ 可执行权限正常"
        else
            echo "  ⚠️ 缺少执行权限，正在修复..."
            chmod +x "$FFMPEG_PATH"
            echo "  ✓ 权限已修复"
        fi
    else
        echo "  ❌ 文件不存在: $FFMPEG_PATH"
    fi
else
    echo "  ❌ 未找到 ffmpeg 目录"
fi
echo ""

echo "=============================="
echo "✅ 验证完成"
