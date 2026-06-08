#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────
#  Optix Pro — 一键安装脚本
#  美股期权可视化平台 + AI 分析
# ─────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "  ┌─────────────────────────────────────┐"
echo "  │        Optix Pro Setup              │"
echo "  │   美股期权可视化 + AI 分析平台       │"
echo "  └─────────────────────────────────────┘"
echo -e "${NC}"

# ── 1. Check Docker ──
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker 未安装。请先安装 Docker Desktop: https://docker.com${NC}"
    exit 1
fi
if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}✗ Docker 未运行。请先启动 Docker Desktop${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker 已就绪"

# ── 2. Configure API Keys ──
if [ -f .env ]; then
    echo -e "${YELLOW}! .env 文件已存在，跳过配置${NC}"
    echo "  如需重新配置，请删除 .env 后重新运行"
else
    echo ""
    echo -e "${BOLD}配置 OpenAI Response API${NC}"
    echo -e "  用于 AI 异动分析和财报关联分析"
    echo ""

    # API Base URL
    read -rp "  API Base URL [https://api.openweb-ui.xyz/v1]: " api_base
    api_base=${api_base:-https://api.openweb-ui.xyz/v1}

    # API Key
    read -rp "  API Key: " api_key
    if [ -z "$api_key" ]; then
        echo -e "${YELLOW}! 未提供 API Key，AI 分析功能将不可用${NC}"
        api_key="not-set"
    fi

    # Model
    read -rp "  模型 [gpt-5.4-mini-2026-03-17]: " model
    model=${model:-gpt-5.4-mini-2026-03-17}

    # Reasoning effort
    read -rp "  推理等级 (low/medium/high/xhigh) [xhigh]: " reasoning
    reasoning=${reasoning:-xhigh}

    # Write .env (never committed to git)
    cat > .env << EOF
OPENAI_API_KEY=${api_key}
OPENAI_BASE_URL=${api_base}
OPENAI_MODEL=${model}
OPENAI_REASONING=${reasoning}
HOST_BIND=127.0.0.1
PORT=2000
APP_AUTH_TOKEN=
TRUST_PROXY_HEADERS=false
ALLOWED_ORIGINS=
EOF

    echo -e "${GREEN}✓${NC} .env 已生成（已加入 .gitignore，不会泄露）"
    echo -e "  默认仅监听 127.0.0.1；如需外网访问，请设置 APP_AUTH_TOKEN 后再修改 HOST_BIND。"
fi

# ── 3. Build & Start ──
echo ""
echo -e "${BOLD}构建 Docker 镜像...${NC}"
docker compose build --quiet

echo -e "${BOLD}启动服务...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}${BOLD}✓ Optix Pro 启动成功！${NC}"
echo ""
PORT=${PORT:-2000}
echo -e "  ${CYAN}${BOLD}打开浏览器访问: http://localhost:${PORT}${NC}"
echo ""
echo -e "  API 文档: http://localhost:${PORT}/docs"
echo ""
echo -e "  ${BOLD}功能:${NC}"
echo "    • 市场总览 — 51 只热门美股按板块分组"
echo "    • 个股详情 — K线图 + EMA/SMA + 成交量"
echo "    • 期权链 — IV/持仓量/异动检测"
echo "    • 顶部/底部信号 — 25 指标评分系统"
echo "    • AI 分析 — GPT 联网分析异动置信度"
echo "    • 板块 IV — 波动率排名 + 热力图"
echo "    • 财报中心 — 69 家公司实时财报日历"
echo ""
echo -e "  ${BOLD}管理:${NC}"
echo "    停止: docker compose down"
echo "    重启: docker compose restart"
echo "    日志: docker compose logs -f"
echo ""
