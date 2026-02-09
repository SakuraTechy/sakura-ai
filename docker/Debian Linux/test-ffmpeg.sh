#!/bin/bash
# FFmpeg 测试脚本 - 只检查 Playwright 自带的 ffmpeg

echo "=========================================="
echo "Playwright FFmpeg 环境检查"
echo "=========================================="

# 1. 检查 Playwright ffmpeg
echo -e "\n1. Playwright ffmpeg:"
PLAYWRIGHT_FFMPEG=$(find /root/.cache/ms-playwright -name "ffmpeg" -type f 2>/dev/null | head -n 1)
if [ -n "$PLAYWRIGHT_FFMPEG" ]; then
    echo "✅ 找到: $PLAYWRIGHT_FFMPEG"
    ls -lh "$PLAYWRIGHT_FFMPEG"
    "$PLAYWRIGHT_FFMPEG" -version 2>&1 | head -n 1
else
    echo "❌ Playwright ffmpeg 未找到"
    exit 1
fi

# 2. 检查 Playwright 浏览器目录
echo -e "\n2. Playwright 浏览器目录:"
ls -lh /root/.cache/ms-playwright/ 2>/dev/null || echo "❌ 目录不存在"

# 3. 检查环境变量
echo -e "\n3. 环境变量:"
echo "PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
echo "PLAYWRIGHT_DOWNLOAD_HOST=$PLAYWRIGHT_DOWNLOAD_HOST"

# 4. 测试 ffmpeg 功能
echo -e "\n4. 测试 ffmpeg 功能:"
if [ -n "$PLAYWRIGHT_FFMPEG" ]; then
    # 创建测试视频
    echo "正在生成测试视频..."
    "$PLAYWRIGHT_FFMPEG" -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -pix_fmt yuv420p /tmp/test.mp4 -y 2>&1 | tail -n 5
    if [ -f /tmp/test.mp4 ]; then
        echo "✅ ffmpeg 功能正常，生成测试视频: $(ls -lh /tmp/test.mp4 | awk '{print $5}')"
        rm -f /tmp/test.mp4
    else
        echo "❌ ffmpeg 功能异常"
        exit 1
    fi
else
    echo "⚠️  跳过功能测试（ffmpeg 未找到）"
    exit 1
fi

echo -e "\n=========================================="
echo "✅ Playwright ffmpeg 检查通过"
echo "=========================================="
