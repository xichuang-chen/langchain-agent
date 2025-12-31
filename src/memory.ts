import { BufferMemory } from "langchain/memory";

export const createShortTermMemory = () => {
  return new BufferMemory({
    memoryKey: "chat_history",
    inputKey: "input", // AgentExecutor 的输入键
    outputKey: "output", // AgentExecutor 的输出键
    returnMessages: true, // 返回完整消息给 LLM
  });
}
