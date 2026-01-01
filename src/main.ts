import "dotenv/config";
import readline from "readline";
import { createAgent } from "./agent";

async function main() {
  let agent = await createAgent();
  const fallbackModel = process.env.OPENAI_FALLBACK_CHAT_MODEL;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🤖 本地 Agent 已启动，输入 exit 退出");

  rl.on("line", async (input) => {
    if (input === "exit") {
      rl.close();
      process.exit(0);
    }

    // 过滤空输入
    if (!input.trim()) {
      console.log("请输入有效的问题");
      return;
    }

    try {
      const result = await agent.invoke({ input: input.trim() });
      console.log("Agent:", result.output);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("ContentPolicyViolationError") ||
        msg.includes("content management policy") ||
        msg.includes("The response was filtered")
      ) {
        // 可选：使用 fallback 模型自动重试一次（常见于 LiteLLM/Azure 路由或内容过滤误判）
        if (fallbackModel) {
          try {
            agent = await createAgent({ llmModelName: fallbackModel });
            const retry = await agent.invoke({ input: input.trim() });
            console.log("Agent:", retry.output);
            return;
          } catch {
            // fallback 也失败则走下面的提示
          }
        }
        console.error(
          [
            "Agent 触发了上游内容过滤（Azure/LiteLLM Content Policy）。",
            "你可以：",
            "- 换一个可用的聊天模型/部署名：设置环境变量 OPENAI_CHAT_MODEL",
            "- 或设置一个自动降级模型：OPENAI_FALLBACK_CHAT_MODEL（触发过滤时会自动重试一次）",
            "- 或调整你的输入/系统提示词后再试",
            "",
            `原始错误：${msg}`,
          ].join("\n")
        );
        return;
      }
      console.error("Agent 执行出错:", error);
    }
  });
}

main();
