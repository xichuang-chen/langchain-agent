#!/usr/bin/env bash
set -euo pipefail

# Chroma Server launcher (Docker-based)
#
# Usage:
#   ./scripts/chroma.sh start
#   ./scripts/chroma.sh stop
#   ./scripts/chroma.sh restart
#   ./scripts/chroma.sh status
#   ./scripts/chroma.sh logs
#
# Config via env:
#   CHROMA_IMAGE=chromadb/chroma:latest
#   CHROMA_CONTAINER_NAME=chroma-server
#   CHROMA_PORT=8000
#   CHROMA_DATA_DIR=./chroma_db
#   CHROMA_SERVER_CORS_ALLOW_ORIGINS=*

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHROMA_IMAGE="${CHROMA_IMAGE:-chromadb/chroma:latest}"
CHROMA_CONTAINER_NAME="${CHROMA_CONTAINER_NAME:-chroma-server}"
CHROMA_PORT="${CHROMA_PORT:-8000}"
CHROMA_DATA_DIR="${CHROMA_DATA_DIR:-${PROJECT_ROOT}/chroma_db}"

usage() {
  cat <<EOF
Usage: $0 <start|stop|restart|status|logs>

Env:
  CHROMA_IMAGE=${CHROMA_IMAGE}
  CHROMA_CONTAINER_NAME=${CHROMA_CONTAINER_NAME}
  CHROMA_PORT=${CHROMA_PORT}
  CHROMA_DATA_DIR=${CHROMA_DATA_DIR}
  CHROMA_SERVER_CORS_ALLOW_ORIGINS=\${CHROMA_SERVER_CORS_ALLOW_ORIGINS:-}
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker 未安装或不在 PATH 中。请先安装并启动 Docker Desktop。" >&2
    exit 1
  fi
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -qx "${CHROMA_CONTAINER_NAME}"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -qx "${CHROMA_CONTAINER_NAME}"
}

start() {
  require_docker

  mkdir -p "${CHROMA_DATA_DIR}"

  if container_running; then
    echo "Chroma 已在运行：container=${CHROMA_CONTAINER_NAME} port=${CHROMA_PORT}"
    echo "日志：$0 logs"
    return 0
  fi

  if container_exists; then
    echo "发现已存在但未运行的容器：${CHROMA_CONTAINER_NAME}，正在启动..."
    docker start "${CHROMA_CONTAINER_NAME}" >/dev/null
  else
    echo "正在启动 Chroma Server..."
    echo "- image: ${CHROMA_IMAGE}"
    echo "- port:  ${CHROMA_PORT}"
    echo "- data:  ${CHROMA_DATA_DIR}"

    # 注意：在 `set -u` 下，空数组展开也可能触发 "unbound variable"（取决于 shell/配置）
    # 这里显式声明为本地数组，并在 docker run 中做安全展开。
    local -a DOCKER_ENVS=()
    if [[ -n "${CHROMA_SERVER_CORS_ALLOW_ORIGINS:-}" ]]; then
      DOCKER_ENVS+=(-e "CHROMA_SERVER_CORS_ALLOW_ORIGINS=${CHROMA_SERVER_CORS_ALLOW_ORIGINS}")
    fi

    docker run -d --rm \
      --name "${CHROMA_CONTAINER_NAME}" \
      -p "${CHROMA_PORT}:8000" \
      -v "${CHROMA_DATA_DIR}:/chroma/chroma" \
      ${DOCKER_ENVS[@]+"${DOCKER_ENVS[@]}"} \
      "${CHROMA_IMAGE}" >/dev/null
  fi

  echo "✅ Chroma Server 已启动：http://localhost:${CHROMA_PORT}"
}

stop() {
  require_docker
  if container_running; then
    echo "正在停止：${CHROMA_CONTAINER_NAME}"
    docker stop "${CHROMA_CONTAINER_NAME}" >/dev/null
    echo "✅ 已停止"
  else
    echo "Chroma 未在运行：${CHROMA_CONTAINER_NAME}"
  fi
}

status() {
  require_docker
  if container_running; then
    echo "✅ running: ${CHROMA_CONTAINER_NAME} (http://localhost:${CHROMA_PORT})"
  elif container_exists; then
    echo "⏸️  exists but stopped: ${CHROMA_CONTAINER_NAME}"
  else
    echo "❌ not found: ${CHROMA_CONTAINER_NAME}"
  fi
}

logs() {
  require_docker
  if container_exists; then
    docker logs -f "${CHROMA_CONTAINER_NAME}"
  else
    echo "容器不存在：${CHROMA_CONTAINER_NAME}"
    exit 1
  fi
}

restart() {
  stop || true
  start
}

cmd="${1:-}"
case "${cmd}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  logs) logs ;;
  -h|--help|"") usage; exit 0 ;;
  *) echo "未知命令：${cmd}"; usage; exit 1 ;;
esac


