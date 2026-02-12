#!/bin/bash
# ============================================
# Sakura AI Docker 构建配置
# ============================================
# 说明：
# - 本文件包含 Docker 镜像构建相关的配置
# - 应用运行时配置请查看: .env.example
# - 所有 Docker 相关脚本的统一配置文件
# - 修改镜像名称只需要在这里修改一次
# ============================================

# ============================================
# 镜像配置（修改这里即可）
# ============================================

# 阿里云镜像仓库地址
export DOCKER_REGISTRY="crpi-f4c88g7tayj7jwle.cn-hangzhou.personal.cr.aliyuncs.com"

# 命名空间（阿里云仓库的命名空间）
export DOCKER_NAMESPACE="sakura-ai"

# 镜像名称
export DOCKER_IMAGE_NAME="sakura-ai"

# 本地构建的镜像名（docker-compose.build.yml 中使用）
export LOCAL_IMAGE_NAME="sakura-ai"

# 本地镜像标签
export LOCAL_IMAGE_TAG="latest"

# ============================================
# 自动生成的配置（不要手动修改）
# ============================================

# 完整的本地镜像名
export LOCAL_IMAGE="${LOCAL_IMAGE_NAME}:${LOCAL_IMAGE_TAG}"

# 完整的远程镜像名（不带版本）
export REMOTE_IMAGE_BASE="${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${DOCKER_IMAGE_NAME}"

# 获取远程镜像名（带版本）
get_remote_image() {
    local version="${1:-latest}"
    echo "${REMOTE_IMAGE_BASE}:${version}"
}

# ============================================
# 配置验证
# ============================================

validate_config() {
    local errors=0
    
    if [ -z "$DOCKER_REGISTRY" ]; then
        echo "错误: DOCKER_REGISTRY 未设置"
        errors=$((errors + 1))
    fi
    
    if [ -z "$DOCKER_NAMESPACE" ]; then
        echo "错误: DOCKER_NAMESPACE 未设置"
        errors=$((errors + 1))
    fi
    
    if [ -z "$DOCKER_IMAGE_NAME" ]; then
        echo "错误: DOCKER_IMAGE_NAME 未设置"
        errors=$((errors + 1))
    fi
    
    if [ -z "$LOCAL_IMAGE_NAME" ]; then
        echo "错误: LOCAL_IMAGE_NAME 未设置"
        errors=$((errors + 1))
    fi
    
    return $errors
}

# ============================================
# 配置信息显示
# ============================================

show_config() {
    echo "Docker 构建配置:"
    echo "  镜像仓库: ${DOCKER_REGISTRY}"
    echo "  命名空间: ${DOCKER_NAMESPACE}"
    echo "  镜像名称: ${DOCKER_IMAGE_NAME}"
    echo "  本地镜像: ${LOCAL_IMAGE}"
    echo "  远程镜像: ${REMOTE_IMAGE_BASE}:VERSION"
}

# 如果直接运行此脚本，显示配置信息
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    show_config
fi
