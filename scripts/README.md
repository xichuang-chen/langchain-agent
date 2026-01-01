# scripts 使用说明

## Chroma Server（本地 + 持久化）

本目录提供 `chroma.sh` 用于**一键启动/停止**本地 Chroma Server（基于 Docker），并将数据**持久化**到本地目录。

### 前置条件

- 已安装并启动 Docker（Docker Desktop）
- 本项目已安装依赖（`npm install`）

### 基本用法

先给脚本执行权限：

```bash
chmod +x scripts/chroma.sh
```

启动 Chroma（默认端口 8000，数据目录 `./chroma_db`）：

```bash
./scripts/chroma.sh start
```

查看运行状态：

```bash
./scripts/chroma.sh status
```

查看日志（持续跟随）：

```bash
./scripts/chroma.sh logs
```

停止服务：

```bash
./scripts/chroma.sh stop
```

重启服务：

```bash
./scripts/chroma.sh restart
```

### 可配置项（环境变量）

你可以通过环境变量自定义镜像、容器名、端口、数据目录、CORS：

```bash
CHROMA_IMAGE=chromadb/chroma:latest \
CHROMA_CONTAINER_NAME=chroma-server \
CHROMA_PORT=8000 \
CHROMA_DATA_DIR=./chroma_db \
CHROMA_SERVER_CORS_ALLOW_ORIGINS="*" \
./scripts/chroma.sh start
```

- **CHROMA_PORT**：对外暴露端口（默认 `8000`），服务访问地址即 `http://localhost:$CHROMA_PORT`
- **CHROMA_DATA_DIR**：本地数据持久化目录（默认 `./chroma_db`）
- **CHROMA_SERVER_CORS_ALLOW_ORIGINS**：仅浏览器调用时通常需要；纯 Node.js 调用一般不需要配置

### （可选）让本项目连接到本地 Chroma Server

如果你在代码里使用 `@langchain/community/vectorstores/chroma`，请确保连接的是 **URL/host**（Chroma Server），而不是本地路径。

例如：服务启动后默认地址为：

- `http://localhost:8000`

你可以在 `src/vectorstore/chroma.ts` 把连接参数改为 `url: "http://localhost:8000"`（或等价的 host/port 配置），然后再运行：

```bash
npm run dev
```

### Embedding 模型配置（避免 400 Invalid model）

长期记忆向量化使用 `OpenAIEmbeddings`，模型名可通过环境变量指定：

```bash
export OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
```

如果你使用的是 LiteLLM/自建 OpenAI 兼容服务，请填你那边实际支持的 embedding 模型名。

### Chat 模型配置（避免路由/内容策略问题）

聊天模型（LLM）可通过环境变量指定（对于 Azure/LiteLLM 通常需要填写“部署名/路由名”）：

```bash
export OPENAI_CHAT_MODEL="gpt-4o-mini"
```

如果你遇到 Azure/LiteLLM 偶发内容过滤或路由到不稳定的模型组，可以设置一个降级模型：当触发 Content Policy 时会自动重试一次：

```bash
export OPENAI_FALLBACK_CHAT_MODEL="gpt-4o-mini-2024-07-18"
```


