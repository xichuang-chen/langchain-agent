import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

export function getLLM() {
  return new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.2,

    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    },
  });
}
