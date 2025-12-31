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
    description: "打开本地浏览器",
    func: async () => {
      exec("start chrome"); // mac: open -a "Google Chrome"
      return "浏览器已打开";
    },
  },
];
