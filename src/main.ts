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

    const result = await agent.run(input);
    console.log("Agent:", result);
  });
}

main();
