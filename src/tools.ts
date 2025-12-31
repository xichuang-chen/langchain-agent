import { exec } from "child_process";

export const tools = [
  {
    name: "get_current_time",
    description: "获取当前系统时间",
    func: async () => {
      return new Date().toLocaleString();
    },
  },
  {
    name: "open_browser",
    description: "在浏览器中打开并搜索指定内容。输入应该是要搜索的关键词或URL。",
    func: async (input: string) => {
      const searchQuery = input || "";
      // macOS 使用 open 命令，Windows 使用 start 命令
      const isMac = process.platform === "darwin";
      const isWindows = process.platform === "win32";
      
      if (isMac) {
        if (searchQuery) {
          // 如果有搜索内容，打开 Google 搜索
          exec(`open "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`);
          return `已在浏览器中打开并搜索: ${searchQuery}`;
        } else {
          // 如果没有搜索内容，只打开浏览器
          exec('open -a "Google Chrome"');
          return "浏览器已打开";
        }
      } else if (isWindows) {
        if (searchQuery) {
          exec(`start chrome "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`);
          return `已在浏览器中打开并搜索: ${searchQuery}`;
        } else {
          exec("start chrome");
          return "浏览器已打开";
        }
      } else {
        return "不支持的操作系统";
      }
    },
  },
];
