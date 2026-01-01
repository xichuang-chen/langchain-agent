# langchain-agent

一个基于 **LangChain（Node/TS）** 的本地 CLI Chat Agent，支持 **短期记忆（BufferMemory）** + **长期记忆（Chroma 向量库）**。

## 使用

安装依赖：

```bash
npm install
```

（可选）启动本地 Chroma Server（用于长期记忆，默认端口 `8000`）：

```bash
chmod +x scripts/chroma.sh
./scripts/chroma.sh start
```

配置环境变量（按需填写）：

```bash
export OPENAI_BASE_URL="..."
export OPENAI_API_KEY="..."
export OPENAI_CHAT_MODEL="gpt-5-chat"
# 可选：触发 Azure/LiteLLM 内容策略时自动降级重试一次
export OPENAI_FALLBACK_CHAT_MODEL="gpt-5-mini-2025-08-07"

# （可选）日历：指向你的 .ics 文件（本地日历导出文件）
# 例如：export CALENDAR_ICS_PATH="/Users/you/Downloads/calendar.ics"
export CALENDAR_ICS_PATH="..."

# （可选）语音输出（方案一 / macOS）：默认开启；如需关闭：
export TTS_ENABLED="0"
# （可选）选择音色/语速（macOS say）
# export TTS_VOICE="Tingting"
# export TTS_RATE="200"
```

启动 Agent（输入 `exit` 退出）：

```bash
npm run dev
```

## 内置能力（Tools）

你可以直接用自然语言提问，Agent 会在需要时自动调用工具：

- **默认地点/时区**
  - 未明确说明地点/时区时：时间/天气/空气质量默认按 **西安市（北京时间/Asia/Shanghai）**
  - 若你明确给出其他城市/经纬度/时区，则以你提供的为准

- **查时间**
  - “现在几点了？”
  - “现在纽约时间是多少？”（更推荐：直接说时区，例如 “Asia/Shanghai”）

- **查天气（需要联网，使用 Open-Meteo）**
  - “北京今天什么天气？”
  - “上海现在多少度？”
  - 会附带空气质量：AQI(US)、PM2.5、PM10

- **查空气质量（需要联网，使用 Open-Meteo）**
  - “北京空气质量怎么样？”
  - “上海 AQI 是多少？”
  - 指标只返回 AQI 数值，但会附带“优/良/是否建议戴口罩”等简短建议总结

- **查日历（读取本地 .ics）**
  - 先设置 `CALENDAR_ICS_PATH`
  - 然后问：“我今天有什么日程？”、“明天有哪些会议？”

## 发版（standard-version）

发版会自动：更新 `CHANGELOG.md`、更新版本号、创建 git tag。

- 版本号变更示例（假设当前版本是 `1.0.0`）：
  - `npm run release:patch` -> `1.0.1`
  - `npm run release:minor` -> `1.1.0`
  - `npm run release:major` -> `2.0.0`
  - `npm run release:alpha` -> `1.0.1-alpha.0`（预发布）
  - `npm run release:beta`  -> `1.0.1-beta.0`（预发布）

- patch/minor/major：

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

- 预发布：

```bash
npm run release:alpha
npm run release:beta
```

把 **commit + tag** 推送到远端：

```bash
npm run push
```

## Commit 前缀规范（建议）

建议使用 Conventional Commits，方便 `standard-version` 自动生成 changelog：

- **feat**：新功能（minor）
- **fix**：修复 bug（patch）
- **docs**：文档
- **chore**：杂项/依赖/脚本
- **refactor**：重构（不改功能）
- **perf**：性能优化
- **test**：测试
- **build/ci**：构建/CI

示例：

```text
feat(memory): add chroma long-term memory
fix(memory): cap long_memory chars to avoid embedding overflow
docs: update usage
```

破坏性变更（major）：

```text
feat!: change memory keys

BREAKING CHANGE: memory key "long_memory" renamed to "memory"
```

## 版本记录

- [v1.0.0](./doc/v1.0.0.md)
- [v1.0.1](./doc/v1.0.1.md)
- [v1.0.2](./doc/v1.0.2.md)