#!/bin/bash
# Sakura AI Docker 统一管理脚本
# 整合安装、构建、部署、运维功能
# 
# 使用方法：
#   ./sakura.sh install     - 首次安装
#   ./sakura.sh build       - 构建镜像（有缓存，日常开发：快速构建测试）
#   ./sakura.sh push        - 推送镜像
#   ./sakura.sh rebuild     - 无缓存重建（无缓存，发布版本：完全重建）
#   ./sakura.sh upgrade     - 升级到最新版本
#   ./sakura.sh start       - 启动服务
#   ./sakura.sh stop        - 停止服务
#   ./sakura.sh restart     - 重启服务
#   ./sakura.sh status      - 查看状态
#   ./sakura.sh logs        - 查看日志
#   ./sakura.sh backup      - 备份数据库
#   ./sakura.sh restore     - 恢复数据库
#   ./sakura.sh clean       - 清理所有数据

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载统一配置
if [ -f "${SCRIPT_DIR}/config.sh" ]; then
    source "${SCRIPT_DIR}/config.sh"
fi

# 配置文件路径
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 日志函数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() { echo -e "${BLUE}▶ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }

# 检查 Docker 环境
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        echo "安装命令: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
    
    log_success "Docker 环境检查通过"
}

# 转换 Windows 换行符
convert_line_endings() {
    local file="$1"
    if [ -f "$file" ] && grep -q $'\r' "$file" 2>/dev/null; then
        log_warning "检测到 Windows 换行符，正在转换: $file"
        sed -i 's/\r$//' "$file"
    fi
}

# 检查环境变量
check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$ENV_EXAMPLE" ]; then
            log_warning ".env 文件不存在，从示例文件创建..."
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            log_warning "请编辑 $ENV_FILE 配置必要的环境变量"
            exit 1
        else
            log_error ".env 文件和示例文件都不存在"
            exit 1
        fi
    fi
    
    convert_line_endings "$ENV_FILE"
    
    set -a
    source "$ENV_FILE"
    set +a
    
    local missing_vars=()
    [ -z "$MYSQL_ROOT_PASSWORD" ] && missing_vars+=("MYSQL_ROOT_PASSWORD")
    [ -z "$DB_PASSWORD" ] && missing_vars+=("DB_PASSWORD")
    [ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "缺少必要的环境变量: ${missing_vars[*]}"
        log_info "请编辑 $ENV_FILE 配置这些变量"
        exit 1
    fi
    
    log_success "环境变量检查通过"
}

# ============================================
# 命令: install - 首次安装
# ============================================
cmd_install() {
    print_header "🚀 首次安装 Sakura AI"
    
    check_docker
    check_env
    
    log_info "📁 创建数据目录..."
    mkdir -p "$SCRIPT_DIR/uploads" "$SCRIPT_DIR/artifacts" "$SCRIPT_DIR/screenshots" "$SCRIPT_DIR/logs" "$SCRIPT_DIR/mysql-init"
    
    log_info "🔨 构建 Docker 镜像..."
    docker compose -f "$COMPOSE_FILE" build
    
    log_info "🚀 启动服务..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_info "⏳ 等待服务就绪..."
    sleep 10
    
    log_success "🎉 安装完成！"
    echo ""
    echo "💡 提示："
    echo "   - 应用启动时会自动执行数据库迁移"
    echo "   - 首次启动可能需要 1-2 分钟"
    echo "   - 可以使用 './sakura.sh logs' 查看启动日志"
    echo ""
    cmd_status
    
    echo ""
    log_info "访问地址: http://localhost:5173"
    log_info "API 地址: http://localhost:3001"
}

# ============================================
# 命令: build - 构建镜像（使用缓存）
# ============================================
cmd_build() {
    local VERSION="${1:-latest}"
    local FULL_IMAGE=$(get_remote_image "$VERSION")
    
    # 返回项目根目录
    cd "$SCRIPT_DIR/../.." || exit 1
    
    print_header "🚀 构建 Sakura AI Docker 镜像（使用缓存）"
    echo "本地镜像: ${LOCAL_IMAGE}"
    echo "远程镜像: ${FULL_IMAGE}"
    echo "版本标签: ${VERSION}"
    echo ""
    
    # 阶段 1: 环境检查
    print_header "📋 [1/4] 环境检查"
    
    print_step "检查必需文件"
    local files=("package.json" "package-lock.json" "prisma/schema.prisma" ".env.example" "docker/Debian Linux/Dockerfile.debian")
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "缺少文件: $file"
            exit 1
        fi
    done
    print_success "必需文件检查通过"
    
    print_step "检查开发环境"
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null || ! command -v docker &> /dev/null; then
        print_error "缺少必要的开发工具"
        exit 1
    fi
    print_success "开发环境检查通过"
    
    # 阶段 2: 修复常见问题
    print_header "🔧 [2/4] 修复常见问题"
    
    print_step "检查 Prisma 客户端"
    if [ ! -d "src/generated/prisma" ] || [ ! -f "src/generated/prisma/index.js" ]; then
        print_warning "Prisma 客户端未生成，正在重新生成..."
        rm -rf src/generated/prisma 2>/dev/null || true
        npx prisma generate
        print_success "Prisma 客户端重新生成成功"
    else
        print_success "Prisma 客户端已存在"
    fi
    
    print_step "清理构建缓存"
    rm -rf dist node_modules/.vite 2>/dev/null || true
    print_success "构建缓存已清理"
    
    # 阶段 3: 构建验证
    print_header "🏗️  [3/4] 构建验证"
    
    print_step "构建前端..."
    if npm run build > /tmp/build-check.log 2>&1; then
        print_success "前端构建成功"
        rm -rf dist
    else
        print_error "前端构建失败"
        tail -30 /tmp/build-check.log
        exit 1
    fi
    
    # 阶段 4: Docker 镜像构建
    print_header "🐳 [4/4] Docker 镜像构建（使用缓存）"
    
    print_step "开始构建 Docker 镜像..."
    echo "💡 提示: 如需完全重建，请使用: ./sakura.sh rebuild"
    echo ""
    
    if docker build \
        -f "docker/Debian Linux/Dockerfile.debian" \
        -t "${LOCAL_IMAGE}" \
        -t "${FULL_IMAGE}" \
        . 2>&1 | tee /tmp/docker-build.log; then
        print_success "Docker 镜像构建成功"
    else
        print_error "Docker 镜像构建失败"
        tail -50 /tmp/docker-build.log
        exit 1
    fi
    
    IMAGE_SIZE=$(docker images "${LOCAL_IMAGE}" --format "{{.Size}}")
    echo "  镜像大小: ${IMAGE_SIZE}"
    
    print_header "🎉 构建完成"
    echo "本地镜像: ${LOCAL_IMAGE}"
    echo "远程镜像: ${FULL_IMAGE}"
    echo "镜像大小: ${IMAGE_SIZE}"
    echo ""
    echo "下一步:"
    echo "  本地测试: docker run --rm -p 5173:5173 ${LOCAL_IMAGE}"
    echo "  推送镜像: ./sakura.sh push ${VERSION}"
    echo "  部署服务: ./sakura.sh start"
}

# ============================================
# 命令: push - 推送镜像到阿里云
# ============================================
cmd_push() {
    local VERSION="${1:-latest}"
    local FULL_IMAGE=$(get_remote_image "$VERSION")
    
    print_header "📤 推送镜像到阿里云"
    echo "镜像: ${FULL_IMAGE}"
    echo "版本: ${VERSION}"
    echo ""
    
    # 检查本地镜像是否存在
    print_step "检查本地镜像..."
    if ! docker images "${LOCAL_IMAGE}" --format "{{.Repository}}" | grep -q "${LOCAL_IMAGE}"; then
        print_error "本地镜像不存在: ${LOCAL_IMAGE}"
        echo "请先构建镜像: ./sakura.sh build ${VERSION}"
        exit 1
    fi
    print_success "本地镜像已存在"
    
    # 检查登录状态
    print_step "检查 Docker 登录状态..."
    if ! docker info 2>/dev/null | grep -q "Username"; then
        print_warning "未登录 Docker，尝试登录..."
        if ! docker login ${DOCKER_REGISTRY}; then
            print_error "Docker 登录失败"
            exit 1
        fi
    fi
    print_success "Docker 已登录"
    
    # 推送镜像
    print_step "推送镜像到阿里云..."
    if docker push ${FULL_IMAGE}; then
        print_success "镜像推送成功"
    else
        print_error "镜像推送失败"
        exit 1
    fi
    
    print_header "🎉 推送完成"
    echo "镜像地址: ${FULL_IMAGE}"
    echo "版本标签: ${VERSION}"
    echo ""
    echo "部署命令:"
    echo "  docker pull ${FULL_IMAGE}"
    echo "  docker compose -f docker-compose.yml up -d"
}

# ============================================
# 命令: rebuild - 无缓存重建
# ============================================
cmd_rebuild() {
    cd "$SCRIPT_DIR/../.." || exit 1
    
    print_header "🔄 无缓存重建 Sakura AI"
    
    print_step "停止并删除旧容器..."
    docker stop sakura-ai-app 2>/dev/null || echo "容器未运行"
    docker rm sakura-ai-app 2>/dev/null || echo "容器不存在"
    
    print_step "删除旧镜像..."
    docker rmi ${LOCAL_IMAGE} 2>/dev/null || echo "本地镜像不存在"
    docker rmi $(get_remote_image "latest") 2>/dev/null || echo "远程镜像不存在"
    
    print_step "清理 Docker 构建缓存..."
    docker builder prune -f
    
    print_step "开始无缓存构建（这可能需要 10-20 分钟）..."
    docker build \
        --no-cache \
        -f "docker/Debian Linux/Dockerfile.debian" \
        -t "${LOCAL_IMAGE}" \
        -t "$(get_remote_image 'latest')" \
        .
    
    print_success "重建完成！"
    echo ""
    echo "镜像大小: $(docker images ${LOCAL_IMAGE} --format '{{.Size}}')"
    echo ""
    echo "下一步:"
    echo "  启动服务: ./sakura.sh start"
    echo "  推送镜像: docker push $(get_remote_image 'latest')"
}

# ============================================
# 命令: upgrade - 升级
# ============================================
cmd_upgrade() {
    print_header "🚀 升级 Sakura AI"
    
    check_docker
    check_env
    
    cmd_backup
    
    if [ -d "$SCRIPT_DIR/../../.git" ]; then
        log_info "📥 拉取最新代码..."
        cd "$SCRIPT_DIR/../.." && git pull origin main
        cd "$SCRIPT_DIR"
    fi
    
    log_info "🔨 重新构建镜像..."
    docker compose -f "$COMPOSE_FILE" build sakura-ai
    
    log_info "🔄 重启服务..."
    docker compose -f "$COMPOSE_FILE" up -d sakura-ai
    
    log_info "📊 执行数据库迁移..."
    docker compose -f "$COMPOSE_FILE" exec -T sakura-ai npx prisma migrate deploy || true
    
    log_info "🧹 清理旧镜像..."
    docker image prune -f
    
    log_success "🎉 升级完成！"
    cmd_status
}

# ============================================
# 命令: start/stop/restart/status
# ============================================
cmd_start() {
    log_info "🚀 启动 Sakura AI 服务..."
    check_env
    docker compose -f "$COMPOSE_FILE" up -d
    log_success "服务已启动"
    cmd_status
}

cmd_stop() {
    log_info "🛑 停止 Sakura AI 服务..."
    docker compose -f "$COMPOSE_FILE" down
    log_success "服务已停止"
}

cmd_restart() {
    log_info "🔄 重启 Sakura AI 服务..."
    cmd_stop
    cmd_start
}

cmd_status() {
    log_info "📊 服务状态:"
    docker compose -f "$COMPOSE_FILE" ps
}

# ============================================
# 命令: logs - 查看日志
# ============================================
cmd_logs() {
    local service="${1:-sakura-ai}"
    log_info "📋 查看 $service 日志..."
    docker compose -f "$COMPOSE_FILE" logs -f "$service"
}

# ============================================
# 命令: backup - 备份数据库
# ============================================
cmd_backup() {
    check_env
    
    local backup_dir="$SCRIPT_DIR/backups"
    local backup_file="$backup_dir/sakura_ai_$(date +%Y%m%d_%H%M%S).sql"
    
    mkdir -p "$backup_dir"
    
    log_info "💾 备份数据库到 $backup_file..."
    
    if docker compose -f "$COMPOSE_FILE" exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" sakura_ai > "$backup_file" 2>/dev/null; then
        log_success "数据库备份成功: $backup_file"
    else
        log_warning "数据库备份跳过（服务可能未运行）"
    fi
}

# ============================================
# 命令: restore - 恢复数据库
# ============================================
cmd_restore() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "请指定备份文件路径"
        echo "用法: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "备份文件不存在: $backup_file"
        exit 1
    fi
    
    check_env
    
    log_warning "⚠️  即将恢复数据库，这将覆盖现有数据！"
    read -p "确认继续？(y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "操作已取消"
        exit 0
    fi
    
    log_info "📥 恢复数据库..."
    docker compose -f "$COMPOSE_FILE" exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" sakura_ai < "$backup_file"
    log_success "数据库恢复成功"
}

# ============================================
# 命令: clean - 清理所有数据
# ============================================
cmd_clean() {
    log_warning "⚠️  即将删除所有容器、镜像和数据卷！"
    read -p "确认继续？(y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "操作已取消"
        exit 0
    fi
    
    log_info "🧹 清理所有资源..."
    docker compose -f "$COMPOSE_FILE" down -v --rmi all
    log_success "清理完成"
}

# ============================================
# 命令: diagnose - 诊断 MySQL 启动问题
# ============================================
cmd_diagnose() {
    print_header "🔍 MySQL 启动失败排查"
    
    # 1. 检查环境变量
    print_step "[1/6] 检查环境变量"
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        
        if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
            print_error "MYSQL_ROOT_PASSWORD 未设置"
        else
            print_success "MYSQL_ROOT_PASSWORD 已设置"
        fi
        
        if [ -z "$DB_PASSWORD" ]; then
            print_error "DB_PASSWORD 未设置"
        else
            print_success "DB_PASSWORD 已设置"
        fi
    else
        print_error ".env 文件不存在: $ENV_FILE"
    fi
    echo ""
    
    # 2. 检查端口占用
    print_step "[2/6] 检查端口占用"
    if netstat -tuln 2>/dev/null | grep -q ":3306 "; then
        print_warning "端口 3306 已被占用"
        echo "占用进程："
        netstat -tulnp 2>/dev/null | grep ":3306 " || lsof -i :3306 2>/dev/null || echo "无法获取进程信息"
    else
        print_success "端口 3306 未被占用"
    fi
    echo ""
    
    # 3. 检查 Docker 资源
    print_step "[3/6] 检查 Docker 资源"
    docker system df
    echo ""
    
    # 4. 查看容器状态
    print_step "[4/6] 查看容器状态"
    docker compose -f "$COMPOSE_FILE" ps -a
    echo ""
    
    # 5. 查看 MySQL 容器日志
    print_step "[5/6] 查看 MySQL 容器日志（最后 50 行）"
    if docker ps -a | grep -q sakura-ai-mysql; then
        docker logs --tail 50 sakura-ai-mysql 2>&1 || echo "无法获取日志"
    else
        print_warning "MySQL 容器不存在"
    fi
    echo ""
    
    # 6. 检查数据卷
    print_step "[6/6] 检查数据卷"
    docker volume ls | grep mysql-data || echo "mysql-data 卷不存在"
    if docker volume inspect debianlinux_mysql-data >/dev/null 2>&1; then
        echo "数据卷信息："
        docker volume inspect debianlinux_mysql-data | grep -E "(Name|Mountpoint|CreatedAt)" || docker volume inspect debianlinux_mysql-data
    fi
    echo ""
    
    # 建议的解决方案
    print_header "💡 常见解决方案"
    echo ""
    echo "1. 清理并重新启动："
    echo "   ./sakura.sh clean"
    echo "   ./sakura.sh install"
    echo ""
    echo "2. 如果端口被占用，停止占用进程或修改端口："
    echo "   # 修改 docker-compose.yml 中的端口映射"
    echo "   ports:"
    echo "     - \"3307:3306\"  # 改用 3307 端口"
    echo ""
    echo "3. 如果是权限问题，清理数据卷："
    echo "   docker volume rm debianlinux_mysql-data"
    echo "   ./sakura.sh install"
    echo ""
    echo "4. 如果是内存不足，增加 Docker 内存限制或使用 MySQL 5.7："
    echo "   # 修改 docker-compose.yml"
    echo "   image: mysql:5.7  # 改用 MySQL 5.7"
    echo ""
    echo "5. 查看完整日志："
    echo "   docker logs sakura-ai-mysql"
    echo ""
}

# ============================================
# 命令: help - 帮助信息
# ============================================
cmd_help() {
    cat << EOF
Sakura AI Docker 统一管理脚本

用法: $0 <命令> [参数]

📦 安装部署:
  install         首次安装 Sakura AI
  build [版本]    构建镜像（使用缓存，默认: latest）
  push [版本]     推送镜像到阿里云（默认: latest）
  rebuild         无缓存完全重建镜像
  upgrade         升级到最新版本

🚀 服务管理:
  start           启动服务
  stop            停止服务
  restart         重启服务
  status          查看服务状态
  logs [服务]     查看日志（默认: sakura-ai）

💾 数据管理:
  backup          备份数据库
  restore <文件>  恢复数据库
  clean           清理所有数据（危险）

📖 其他:
  help            显示此帮助信息
  diagnose        诊断 MySQL 启动问题

示例:
  $0 install              # 首次安装
  $0 build v1.0.0         # 构建 v1.0.0 版本（使用缓存，快速）
  $0 push v1.0.0          # 推送 v1.0.0 版本到阿里云
  $0 rebuild              # 无缓存完全重建（确保最新）
  $0 logs mysql           # 查看 MySQL 日志
  $0 restore backup.sql   # 恢复数据库

EOF
}

# ============================================
# 主入口
# ============================================
case "${1:-help}" in
    install)    cmd_install ;;
    build)      cmd_build "$2" ;;
    push)       cmd_push "$2" ;;
    rebuild)    cmd_rebuild ;;
    upgrade)    cmd_upgrade ;;
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    restart)    cmd_restart ;;
    status)     cmd_status ;;
    logs)       cmd_logs "$2" ;;
    backup)     cmd_backup ;;
    restore)    cmd_restore "$2" ;;
    clean)      cmd_clean ;;
    diagnose)   cmd_diagnose ;;
    help|*)     cmd_help ;;
esac
