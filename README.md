# Optix Pro — 美股期权可视化平台

一个个人使用的美股期权链可视化工具。当前版本主要通过 yfinance 获取行情、期权链和财报日历，并可选接入 OpenAI-compatible Responses API 做 AI 分析。

## 功能

### 📊 市场仪表盘
- 股票搜索（自动补全）
- K线图（分时/5日/1月/1年/全部）
- 期权链表格（看涨/看跌，按行权价分组）
- 到期日选择器
- 即将公布的财报日历
- 恐惧与贪婪指数

### ⚡ 期权异动
- 全市场实时异常期权活动扫描
- 按类型筛选（全部/看涨/看跌）
- 成交量/持仓量比率过滤
- 市场热度指标（看涨/看跌比率）

### 🔥 板块分析
- 板块 IV（隐含波动率）百分位排名
- IV 热力图（可视化各标的波动率水平）
- 板块：半导体、软件基础设施、生物技术、消费电子、能源
- 点击标的查看期权链

### 🤖 AI 财报中心
- 财报日历与影响分析
- 板块隐含波动率概览
- 分析师情绪展示

## 技术栈

- **后端**: Python FastAPI + httpx (async)
- **前端**: Vanilla JS SPA + Tailwind CSS + TradingView Lightweight Charts
- **数据源**: yfinance / Yahoo Finance；Massive.com 客户端为遗留备用代码
- **部署**: Docker + docker-compose

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 复制环境变量文件
cp .env.example .env

# 2. 如需 AI 分析，填入 OpenAI-compatible API 配置
# 编辑 .env 文件，设置 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL

# 3. 启动
docker compose up --build

# 访问 http://localhost:2000
```

默认 Docker 只绑定 `127.0.0.1`，适合个人本机使用。如果需要局域网或公网访问，先在 `.env` 设置 `APP_AUTH_TOKEN`，再把 `HOST_BIND` 改成需要监听的地址。前端带 token 的方式：

```js
localStorage.setItem('optix.app.token', 'your-token-here');
location.reload();
```

### 本地开发

```bash
cd backend
pip install -r requirements.txt
OPENAI_API_KEY=your_key_here uvicorn app.main:app --reload --port 8000
```

## API 文档

Docker 启动后访问 http://localhost:2000/docs 查看 Swagger 文档；本地 `uvicorn --port 8000` 开发时访问 http://localhost:8000/docs。

### 主要接口

| 接口 | 说明 |
|------|------|
| `GET /api/stocks/search?q=nvidia` | 搜索股票 |
| `GET /api/stocks/{ticker}` | 股票概况 |
| `GET /api/stocks/{ticker}/chart?range=1d` | K线数据 |
| `GET /api/options/{ticker}/expirations` | 可用到期日 |
| `GET /api/options/{ticker}/chain?expiration=2026-07-18` | 期权链 |
| `GET /api/options/unusual` | 期权异动 |
| `GET /api/sectors` | 板块列表 |
| `GET /api/sectors/{id}/iv-ranking` | 板块 IV 排名 |
| `GET /api/sectors/{id}/heatmap` | IV 热力图 |
| `GET /api/market/status` | 市场状态 |

## 项目结构

```
option-pro/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── config.py            # 配置管理
│   │   ├── api/                 # API 路由
│   │   │   ├── stocks.py
│   │   │   ├── options.py
│   │   │   ├── sectors.py
│   │   │   └── market.py
│   │   ├── services/            # 业务逻辑
│   │   │   ├── massive.py       # Massive.com 备用客户端（当前主流程未使用）
│   │   │   ├── cache.py         # 内存 TTL 缓存
│   │   │   └── sectors.py       # 板块定义 & IV 计算
│   │   └── models/
│   │       └── schemas.py       # Pydantic 数据模型
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html               # SPA 主页
│   └── static/
│       ├── css/styles.css
│       └── js/
│           ├── app.js           # 路由 & 状态管理
│           ├── api.js           # API 封装
│           ├── pages/           # 4 个页面
│           └── components/      # 共享组件
├── docker-compose.yml
├── .env.example
└── README.md
```

## 设计系统

基于 "Precision Fluidity" 设计语言：
- **主色**: Deep Indigo `#2a14b4`
- **涨**: Mint Green `#006c49`
- **跌**: Coral Red `#ba1a1a`
- **字体**: Inter
- **风格**: 轻盈、通透、专业

## License

MIT
