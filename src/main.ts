import "dotenv/config";
import readline from "readline";
import { createAgent } from "./agent";

async function main() {
  const agent = await createAgent();

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
      console.error("Agent 执行出错:", error);
    }
  });
}

main();
