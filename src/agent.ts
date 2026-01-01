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
        "你具备：查当前时间、查天气、查本地日历（.ics）、以及打开浏览器进行搜索的能力；当用户问题涉及这些信息时，优先调用对应工具。",
        "当工具需要关键信息但用户未提供时（例如日历缺少时间范围/未配置 CALENDAR_ICS_PATH），请先向用户追问澄清，再决定是否调用工具。",
        "当用户未明确指定地点/时区时：查询天气/空气质量/时间一律直接默认使用中国陕西省西安市（北京时间/Asia/Shanghai）并调用工具，不要再询问“要不要查西安”。若用户明确给出其他城市/经纬度/时区，则以用户提供为准。",
        "长期记忆仅供参考，可能过期；凡是“实时信息”（天气/空气质量/当前时间等）一律不要从长期记忆里直接给结论，必须调用工具获取最新结果。",
        "严禁把工具调用以纯文本/JSON 的形式输出（例如输出类似：name=functions.get_xxx 或 input=... 这样的“伪调用”文本）。当需要调用工具时，必须使用模型的 tool_calls/function calling 机制；当不需要工具时，直接输出自然语言答案。",
        [
          "当用户询问空气质量/AQI 时：必须调用 get_air_quality。",
          '工具会返回一个“数值”或“暂无数据”。最终回答要求：',
          "- 指标只给 AQI(US)（不要输出 PM2.5/PM10 等其他指标）",
          "- 但需要给出总结性文本：空气质量等级（优/良/对敏感人群不健康/不健康/非常不健康/危险）+ 简短建议（是否建议戴口罩、减少户外等）",
          '- 句式固定：用“当前西安的空气质量是<数值>”开头（例如：当前西安的空气质量是167）。不要出现 “AQI(US)” 字样，不要使用加粗/Markdown。',
          "US AQI 分段：0-50 优；51-100 良；101-150 对敏感人群不健康；151-200 不健康；201-300 非常不健康；301+ 危险。",
        ].join("\n"),
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

