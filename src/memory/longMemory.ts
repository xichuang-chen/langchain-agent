import { VectorStoreRetrieverMemory } from "langchain/memory";
import { getChromaVectorStore } from "../vectorstore/chroma";

export async function createLongTermMemory() {
  const vectorStore = await getChromaVectorStore();

  const longMemory = new VectorStoreRetrieverMemory({
    vectorStoreRetriever: vectorStore.asRetriever({
      k: 5, // 每次召回 5 条长期记忆
    }),
    memoryKey: "long_memory",
    inputKey: "input", // 和 AgentExecutor 保持一致
    outputKey: "output",
    // Chroma v3 会校验 metadata 不能为空；这里给每条写入提供最小 metadata
    metadata: () => ({
      source: "long_memory",
      ts: Date.now(),
    }),
  });

  return longMemory;
}


