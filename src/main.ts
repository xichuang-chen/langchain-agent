import "dotenv/config";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import { createAgent } from "./agent";

function sanitizeForTts(text: string) {
  // 避免播报过长/包含奇怪控制字符
  const t = text
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
  // 简单限长，防止一次说太久（可按需调整）
  return t.length > 500 ? `${t.slice(0, 500)}...` : t;
}

function looksLikeToolCallText(output: string) {
  // 模型偶发会把“工具调用”当成纯文本输出，导致工具不执行
  // 典型形态：{"name":"functions.get_xxx", ...} 或 {"name":"functions.get_xxx"...}
  return (
    /"name"\s*:\s*"functions\.get_/i.test(output) ||
    /functions\.get_(weather|air_quality|current_time|calendar_events|open_browser)/i.test(output)
  );
}

async function main() {
  let agent = await createAgent();
  const fallbackModel = process.env.OPENAI_FALLBACK_CHAT_MODEL;

  // 语音输出（方案一）：macOS 使用系统自带 `say`
  const ttsEnabled = process.platform === "darwin" && !["0", "false", "off", "no"].includes(String(process.env.TTS_ENABLED ?? "").toLowerCase());
  const ttsVoice = process.env.TTS_VOICE; // 例如 "Tingting" / "Mei-Jia" / "Samantha"
  const ttsRate = process.env.TTS_RATE;   // say -r 语速（数字）
  let ttsProc: ChildProcessWithoutNullStreams | null = null;

  function speak(text: string) {
    if (!ttsEnabled) return;
    const toSpeak = sanitizeForTts(text);
    if (!toSpeak) return;

    // 新消息来时中断上一段播报，避免叠音
    if (ttsProc && !ttsProc.killed) {
      try {
        ttsProc.kill("SIGKILL");
      } catch {
        // ignore
      }
      ttsProc = null;
    }

    const args: string[] = [];
    if (ttsVoice) args.push("-v", ttsVoice);
    if (ttsRate && /^\d+$/.test(ttsRate)) args.push("-r", ttsRate);
    args.push(toSpeak);

    ttsProc = spawn("say", args);
    // 避免子进程错误导致主流程崩溃
    ttsProc.on("error", () => {});
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🤖 本地 Agent 已启动，输入 exit 退出");

  rl.on("line", async (input) => {
    if (input === "exit") {
      if (ttsProc && !ttsProc.killed) {
        try {
          ttsProc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
      rl.close();
      process.exit(0);
    }

    // 过滤空输入
    if (!input.trim()) {
      console.log("请输入有效的问题");
      return;
    }

    try {
      const question = input.trim();
      let result = await agent.invoke({ input: question });
      let output = String(result.output ?? "");

      // 兜底：若输出是“伪工具调用文本”，用全新 agent 重试一次（避免被 chat_history 污染）
      if (looksLikeToolCallText(output)) {
        const fresh = await createAgent();
        result = await fresh.invoke({ input: question });
        output = String(result.output ?? "");
        agent = fresh;
      }

      console.log("Agent:", output);
      speak(output);
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
            const output = String(retry.output ?? "");
            console.log("Agent:", output);
            speak(output);
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
