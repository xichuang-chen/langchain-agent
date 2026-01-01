import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicTool } from "langchain/tools";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getLLM } from "./config";
import { tools as toolDefs } from "./tools";
import { createShortTermMemory } from "./memory/shortMemory";
import { createLongTermMemory } from "./memory/longMemory";
import { CombinedMemory } from "langchain/memory";

export async function createAgent(params?: { llmModelName?: string }) {
  const llm = getLLM(params?.llmModelName);

  const shortMemory = createShortTermMemory();
  const longMemory = await createLongTermMemory();

  const memory = new CombinedMemory({
    memories: [shortMemory, longMemory],
  });

  const tools = toolDefs.map(
    (t) =>
      new DynamicTool({
        name: t.name,
        description: t.description,
        func: t.func,
      })
  );

  // Tool-calling agent：支持“不需要工具时直接回复”，避免 ReAct 文本解析产生 Action: None 导致循环
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "你是一个有帮助的中文助手。",
        "你可以在需要时调用工具来获取信息或执行操作；如果不需要工具，请直接给出最终回答。",
        "严禁输出类似“Action: None/无/空”的伪工具调用；当不需要工具时，请直接输出最终回答。",
      ].join("\n"),
    ],
    [
      "system",
      "长期记忆（可为空，仅供参考）：\n{long_memory}",
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = createToolCallingAgent({ llm, tools, prompt });
  
  const executor = new AgentExecutor({
    agent,
    tools,
    memory,
    verbose: true,
    maxIterations: 15, // 限制最大迭代次数，避免无限循环
  });

  return executor;
}

