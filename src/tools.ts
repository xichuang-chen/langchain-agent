import { exec } from "child_process";
import { DynamicTool } from "langchain/tools";
import { promisify } from "util";

const execAsync = promisify(exec);

export const tools = [
  {
    name: "get_current_time",
    description: "获取当前系统时间",
    func: async () => {
      return new Date().toLocaleString();
    },
  },
];

const openBrowser = {
  name: "open_browser",
  description: "在浏览器中打开并搜索指定内容。注意：这个工具只是打开浏览器，不会返回搜索结果的内容。如果用户需要查看搜索结果，应该直接告诉用户去浏览器中查看，而不是重复调用此工具。输入应该是要搜索的关键词或URL。",
  func: async (input: string) => {
    const searchQuery = input || "";
    // macOS 使用 open 命令，Windows 使用 start 命令
    const isMac = process.platform === "darwin";
    const isWindows = process.platform === "win32";
    
    try {
      if (isMac) {
        if (searchQuery) {
          // 如果有搜索内容，打开 Google 搜索
          await execAsync(`open "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`);
          return `已在浏览器中打开并搜索: ${searchQuery}。请查看浏览器中的搜索结果。`;
        } else {
          // 如果没有搜索内容，只打开浏览器
          await execAsync('open -a "Google Chrome"');
          return "浏览器已打开";
        }
      } else if (isWindows) {
        if (searchQuery) {
          await execAsync(`start chrome "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`);
          return `已在浏览器中打开并搜索: ${searchQuery}。请查看浏览器中的搜索结果。`;
        } else {
          await execAsync("start chrome");
          return "浏览器已打开";
        }
      } else {
        return "不支持的操作系统";
      }
    } catch (error) {
      return `打开浏览器时出错: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};