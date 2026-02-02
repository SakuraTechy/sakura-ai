#!/bin/bash
# Sakura AI Docker 安装/升级脚本 (Alpine Linux)
# 
# 使用方法：
#   首次安装: ./docker-install.sh install
#   升级更新: ./docker-install.sh upgrade
#   启动服务: ./docker-install.sh start
#   停止服务: ./docker-install.sh stop
#   查看状态: ./docker-install.sh status
#   查看日志: ./docker-install.sh logs
#   备份数据: ./docker-install.sh backup

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.alpine.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.alpine.example"

# 日志函数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        echo "Alpine 安装命令: apk add docker docker-compose"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    log_success "Docker 环境检查通过"
}

# 转换 Windows 换行符为 Unix 格式
convert_line_endings() {
    local file="$1"
    if [ -f "$file" ] && grep -q $'\r' "$file" 2>/dev/null; then
        log_warning "检测到 Windows 换行符，正在转换: $file"
        sed -i 's/\r$//' "$file"
    fi
}

# 检查环境变量文件
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
    
    # 转换 Windows 换行符
    convert_line_endings "$ENV_FILE"
    
    # 加载环境变量
    set -a
    source "$ENV_FILE"
    set +a
    
    # 检查必要的环境变量
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

# 首次安装
install() {
    log_info "🚀 开始安装 Sakura AI..."
    
    check_docker
    check_env
    
    # 创建必要的目录
    log_info "📁 创建数据目录..."
    mkdir -p "$SCRIPT_DIR/uploads" "$SCRIPT_DIR/artifacts" "$SCRIPT_DIR/screenshots" "$SCRIPT_DIR/logs" "$SCRIPT_DIR/mysql-init"
    
    # 构建并启动服务
    log_info "🔨 构建 Docker 镜像..."
    docker compose -f "$COMPOSE_FILE" build
    
    log_info "🚀 启动服务..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    # 等待 MySQL 就绪
    log_info "⏳ 等待数据库就绪..."
    sleep 10
    
    # 执行数据库迁移
    log_info "📊 执行数据库迁移..."
    docker compose -f "$COMPOSE_FILE" exec -T sakura-ai npx prisma migrate deploy || log_warning "迁移可能需要稍后手动执行"
    
    log_success "🎉 安装完成！"
    status
    
    echo ""
    log_info "访问地址: http://localhost:5173"
    log_info "API 地址: http://localhost:3001"
}

# 升级更新
upgrade() {
    log_info "🚀 开始升级 Sakura AI..."
    
    check_docker
    check_env
    
    # 备份数据库
    backup
    
    # 拉取最新代码（如果在 git 仓库中）
    if [ -d "$SCRIPT_DIR/../../.git" ]; then
        log_info "📥 拉取最新代码..."
        cd "$SCRIPT_DIR/../.." && git pull origin main
        cd "$SCRIPT_DIR"
    fi
    
    # 重新构建镜像
    log_info "🔨 重新构建镜像..."
    docker compose -f "$COMPOSE_FILE" build sakura-ai
    
    # 重启服务
    log_info "🔄 重启服务..."
    docker compose -f "$COMPOSE_FILE" up -d sakura-ai
    
    # 执行数据库迁移
    log_info "📊 执行数据库迁移..."
    docker compose -f "$COMPOSE_FILE" exec -T sakura-ai npx prisma migrate deploy || log_warning "无新迁移"
    
    # 清理旧镜像
    log_info "🧹 清理旧镜像..."
    docker image prune -f
    
    log_success "🎉 升级完成！"
    status
}

# 启动服务
start() {
    log_info "🚀 启动 Sakura AI 服务..."
    check_env
    docker compose -f "$COMPOSE_FILE" up -d
    log_success "服务已启动"
    status
}

# 停止服务
stop() {
    log_info "🛑 停止 Sakura AI 服务..."
    docker compose -f "$COMPOSE_FILE" down
    log_success "服务已停止"
}

# 重启服务
restart() {
    log_info "🔄 重启 Sakura AI 服务..."
    stop
    start
}

# 查看状态
status() {
    log_info "📊 服务状态:"
    docker compose -f "$COMPOSE_FILE" ps
}

# 查看日志
logs() {
    local service="${1:-sakura-ai}"
    log_info "📋 查看 $service 日志..."
    docker compose -f "$COMPOSE_FILE" logs -f "$service"
}

# 备份数据库
backup() {
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

# 恢复数据库
restore() {
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

# 清理所有数据（危险操作）
clean() {
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

# 显示帮助
help() {
    echo "Sakura AI Docker 管理脚本 (Alpine Linux)"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  install     首次安装 Sakura AI"
    echo "  upgrade     升级到最新版本"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  logs [服务] 查看日志（默认: sakura-ai）"
    echo "  backup      备份数据库"
    echo "  restore     恢复数据库"
    echo "  clean       清理所有数据（危险）"
    echo "  help        显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 install          # 首次安装"
    echo "  $0 logs mysql       # 查看 MySQL 日志"
    echo "  $0 restore backup.sql  # 恢复数据库"
}

# 主入口
case "${1:-help}" in
    install)  install ;;
    upgrade)  upgrade ;;
    start)    start ;;
    stop)     stop ;;
    restart)  restart ;;
    status)   status ;;
    logs)     logs "$2" ;;
    backup)   backup ;;
    restore)  restore "$2" ;;
    clean)    clean ;;
    help|*)   help ;;
esac
