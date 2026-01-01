import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

export function getLLM(modelNameOverride?: string) {
  const modelName = modelNameOverride || process.env.OPENAI_CHAT_MODEL || "gpt-5-chat";
  return new ChatOpenAI({
    // LiteLLM / Azure / 自建 OpenAI 兼容网关通常要求使用“部署名/路由名”
    // 用环境变量可配置，避免触发内容策略或路由到不期望的 model group
    modelName,
    temperature: 0.2,

    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    },
  });
}
