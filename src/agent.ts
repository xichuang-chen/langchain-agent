import { createReactAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { DynamicTool } from "langchain/tools";
import { pull } from "langchain/hub";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getLLM } from "./config";
import { tools as toolDefs } from "./tools";

export async function createAgent() {
  const llm = getLLM();

  const tools = toolDefs.map(
    (t) =>
      new DynamicTool({
        name: t.name,
        description: t.description,
        func: t.func,
      })
  );

  const prompt = await pull<ChatPromptTemplate>("hwchase17/react");
  const agent = await createReactAgent({ llm, tools, prompt });
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
  });

  return executor;
}
