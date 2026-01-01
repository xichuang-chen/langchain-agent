import {
  getInputValue,
  getOutputValue,
  InputValues,
  OutputValues,
  VectorStoreRetrieverMemory,
  type VectorStoreRetrieverMemoryParams,
} from "langchain/memory";
import { getChromaVectorStore } from "../vectorstore/chroma";
import { Document } from "@langchain/core/documents";

function truncateByChars(text: string, maxChars: number) {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...(truncated)";
}

function isRealtimeQuery(input: string) {
  // 实时信息不应依赖长期记忆（容易过期且会“背答案”绕过工具）
  // 这里用关键词做保守过滤：时间/天气/空气质量
  return /空气质量|aqi|pm2\.?5|pm10|天气|气温|温度|降水|下雨|风速|几点|时间|现在几点|今天几号|日期/i.test(
    input
  );
}

/**
 * 修复 VectorStoreRetrieverMemory 默认 saveContext 会把整个 inputValues 全量写入向量库的问题：
 * CombinedMemory/AgentExecutor 会把 chat_history 等 memory 变量塞进 inputValues，
 * 导致每轮写入都把历史对话再次 embedding，最终触发 embedding 模型上下文超限。
 *
 * 这里覆盖 saveContext，仅保存 input/output（并截断），彻底阻断递归膨胀。
 */
class SafeVectorStoreRetrieverMemory extends VectorStoreRetrieverMemory {
  private readonly outputKey?: string;
  private readonly saveMaxChars: number;
  private readonly loadMaxChars: number;

  constructor(
    fields: VectorStoreRetrieverMemoryParams & {
      outputKey?: string;
      saveMaxChars?: number;
      loadMaxChars?: number;
    }
  ) {
    super(fields);
    this.outputKey = fields.outputKey;
    this.saveMaxChars = fields.saveMaxChars ?? 4000;
    this.loadMaxChars = fields.loadMaxChars ?? 6000;
  }

  override async saveContext(inputValues: InputValues, outputValues: OutputValues) {
    const metadata =
      typeof this.metadata === "function"
        ? this.metadata(inputValues, outputValues)
        : this.metadata;

    const input = String(getInputValue(inputValues, this.inputKey) ?? "").trim();
    const output = String(getOutputValue(outputValues, this.outputKey ?? "output") ?? "").trim();

    // 跳过“实时类问题”的长期记忆写入，避免后续召回时用过期答案覆盖工具调用
    if (isRealtimeQuery(input)) return;

    const raw = `input: ${input}\noutput: ${output}`.trim();
    const pageContent = truncateByChars(raw, this.saveMaxChars);
    if (!pageContent) return;

    await this.vectorStoreRetriever.addDocuments([
      new Document({
        pageContent,
        metadata,
      }),
    ]);
  }

  override async loadMemoryVariables(values: InputValues) {
    const input = String(getInputValue(values, this.inputKey) ?? "").trim();
    // 实时类问题：不注入长期记忆，强制模型走工具
    if (isRealtimeQuery(input)) {
      return { [this.memoryKey]: "" };
    }
    const vars = await super.loadMemoryVariables(values);
    const v = vars[this.memoryKey];
    if (typeof v === "string") {
      vars[this.memoryKey] = truncateByChars(v, this.loadMaxChars);
    }
    return vars;
  }
}

export async function createLongTermMemory() {
  const vectorStore = await getChromaVectorStore();

  const longMemory = new SafeVectorStoreRetrieverMemory({
    vectorStoreRetriever: vectorStore.asRetriever({
      k: 5, // 每次召回 5 条长期记忆
    }),
    memoryKey: "long_memory",
    inputKey: "input", // 和 AgentExecutor 保持一致
    outputKey: "output",
    // 写入向量库的内容必须足够短，避免 embedding 上下文超限
    saveMaxChars: 4000,
    // 注入到 prompt 的 long_memory 也要做上限，避免 prompt 膨胀
    loadMaxChars: 6000,
    // Chroma v3 会校验 metadata 不能为空；这里给每条写入提供最小 metadata
    metadata: () => ({
      source: "long_memory",
      ts: Date.now(),
    }),
  });

  return longMemory;
}


