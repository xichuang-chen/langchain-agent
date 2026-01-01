import { exec } from "child_process";
import fs from "node:fs/promises";
import { promisify } from "util";

const execAsync = promisify(exec);

export type ToolDef = {
  name: string;
  description: string;
  // langchain/tools DynamicTool 的 func 形态：接收一个 string，返回 string
  func: (input?: string) => Promise<string>;
};

const DEFAULT_CITY = "西安";
const DEFAULT_TIMEZONE = "Asia/Shanghai";

function safeJsonParse<T>(input?: string): T | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  if (!(s.startsWith("{") && s.endsWith("}"))) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function formatDateTimeZh(date: Date, timeZone?: string) {
  const locale = "zh-CN";
  const fmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "long",
    ...(timeZone ? { timeZone } : {}),
  });
  return fmt.format(date);
}

function isLikelyIanaTimeZone(s: string) {
  // 不是严格校验，但足够用于区分 “Asia/Shanghai”
  return /^[A-Za-z_]+\/[A-Za-z0-9_\-+]+$/.test(s);
}

function weatherCodeToZh(code: number): string {
  // Open-Meteo WMO weathercode（常用子集）
  const map: Record<number, string> = {
    0: "晴",
    1: "大部晴朗",
    2: "多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "强阵雨",
    82: "暴雨",
    95: "雷暴",
    96: "雷暴伴小冰雹",
    99: "雷暴伴大冰雹",
  };
  return map[code] ?? `未知天气码(${code})`;
}

function usAqiCategoryZh(aqi: number) {
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "对敏感人群不健康";
  if (aqi <= 200) return "不健康";
  if (aqi <= 300) return "非常不健康";
  return "危险";
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`请求失败: ${res.status} ${res.statusText}${text ? ` | ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as unknown;
}

type CalendarEvent = {
  start?: Date;
  end?: Date;
  summary?: string;
  location?: string;
  description?: string;
  uid?: string;
};

function unfoldIcsLines(raw: string): string[] {
  // RFC5545: 以空格/Tab 开头的行是上一行的续行
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseIcsDate(value: string): Date | undefined {
  // 支持三类：
  // 1) YYYYMMDD
  // 2) YYYYMMDDTHHMMSSZ
  // 3) YYYYMMDDTHHMMSS（按本地时区解释；TZID 暂不精确处理）
  const v = value.trim();
  if (!v) return undefined;
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6));
    const d = Number(v.slice(6, 8));
    return new Date(y, m - 1, d, 0, 0, 0);
  }
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = v.slice(0, 4);
    const mo = v.slice(4, 6);
    const d = v.slice(6, 8);
    const hh = v.slice(9, 11);
    const mm = v.slice(11, 13);
    const ss = v.slice(13, 15);
    return new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6));
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(y, mo - 1, d, hh, mm, ss);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseIcsEvents(raw: string): CalendarEvent[] {
  const lines = unfoldIcsLines(raw);
  const events: CalendarEvent[] = [];
  let inEvent = false;
  let current: CalendarEvent = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent) events.push(current);
      inEvent = false;
      current = {};
      continue;
    }
    if (!inEvent) continue;

    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = left.split(";")[0]?.toUpperCase();
    if (!key) continue;

    if (key === "DTSTART") current.start = parseIcsDate(value);
    else if (key === "DTEND") current.end = parseIcsDate(value);
    else if (key === "SUMMARY") current.summary = value;
    else if (key === "LOCATION") current.location = value;
    else if (key === "DESCRIPTION") current.description = value;
    else if (key === "UID") current.uid = value;
  }
  return events;
}

function overlap(aStart?: Date, aEnd?: Date, bStart?: Date, bEnd?: Date) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function startOfTodayLocal(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export const tools: ToolDef[] = [
  {
    name: "get_current_time",
    description:
      `获取当前时间。输入可为空（默认 ${DEFAULT_CITY} 时间/${DEFAULT_TIMEZONE}），或传 JSON：{"timeZone":"Asia/Shanghai"}，或直接传 IANA 时区字符串如 "Asia/Shanghai"。`,
    func: async (input?: string) => {
      const now = new Date();
      const parsed = safeJsonParse<{ timeZone?: string }>(input);
      const tz =
        parsed?.timeZone ||
        (input && isLikelyIanaTimeZone(input.trim()) ? input.trim() : undefined) ||
        DEFAULT_TIMEZONE;
      const formatted = formatDateTimeZh(now, tz);
      return [
        `当前时间：${formatted}（时区：${tz}）`,
        `ISO：${now.toISOString()}`,
      ].join("\n");
    },
  },
  {
    name: "get_weather",
    description:
      `查询天气（需要联网）。输入可为空（默认 ${DEFAULT_CITY}），或传 JSON：{"location":"北京"} / {"latitude":39.9,"longitude":116.4}。默认使用 Open-Meteo（无需 key）。会同时返回空气质量（AQI/PM2.5/PM10）。`,
    func: async (input?: string) => {
      type WeatherInput = { location?: string; latitude?: number; longitude?: number };
      const parsed = safeJsonParse<WeatherInput>(input) ?? {};
      const raw = (input ?? "").trim();

      let latitude = parsed.latitude;
      let longitude = parsed.longitude;
      let location = parsed.location ?? (raw && !raw.startsWith("{") ? raw : undefined) ?? DEFAULT_CITY;

      if ((latitude == null || longitude == null) && location) {
        const geo = (await fetchJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=zh&format=json`
        )) as any;
        const best = geo?.results?.[0];
        if (!best) return `没找到“${location}”的坐标。请换个更具体的地点（例如“北京朝阳”）或直接给我经纬度。`;
        latitude = best.latitude;
        longitude = best.longitude;
        location = `${best.name}${best.admin1 ? `, ${best.admin1}` : ""}${best.country ? `, ${best.country}` : ""}`;
      }

      // 若仍无坐标，则 fallback 为默认城市（正常不会走到这里）
      if (latitude == null || longitude == null) {
        return `请提供地点，例如传 JSON：{"location":"上海"} 或 {"latitude":31.2304,"longitude":121.4737}。（默认地点：${DEFAULT_CITY}）`;
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        String(latitude)
      )}&longitude=${encodeURIComponent(
        String(longitude)
      )}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;

      const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(
        String(latitude)
      )}&longitude=${encodeURIComponent(
        String(longitude)
      )}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&timezone=auto`;

      const [data, air] = (await Promise.all([
        fetchJson(weatherUrl),
        fetchJson(airUrl).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) })),
      ])) as any[];

      const current = data?.current;
      const daily = data?.daily;
      const tz = data?.timezone;

      const code = Number(current?.weather_code);
      const desc = Number.isFinite(code) ? weatherCodeToZh(code) : "未知";
      const t = current?.temperature_2m;
      const feels = current?.apparent_temperature;
      const wind = current?.wind_speed_10m;
      const nowTime = current?.time;

      // 今天预报（取 daily 的第 0 项）
      const d0Max = daily?.temperature_2m_max?.[0];
      const d0Min = daily?.temperature_2m_min?.[0];
      const d0Pop = daily?.precipitation_probability_max?.[0];
      const d0Code = Number(daily?.weather_code?.[0]);
      const d0Desc = Number.isFinite(d0Code) ? weatherCodeToZh(d0Code) : "未知";

      const aqi = Number(air?.current?.us_aqi);
      const pm25 = air?.current?.pm2_5;
      const pm10 = air?.current?.pm10;
      const aqiTime = air?.current?.time;
      const airTz = air?.timezone;
      const airLine =
        air?.__error
          ? `空气质量：获取失败（${air.__error}）`
          : Number.isFinite(aqi)
            ? `空气质量：AQI(US) ${aqi}（${usAqiCategoryZh(aqi)}），PM2.5 ${pm25 ?? "?"} μg/m³，PM10 ${pm10 ?? "?"} μg/m³（${aqiTime ?? "?"}${airTz ? `，${airTz}` : ""}）`
            : "空气质量：暂无数据";

      return [
        `地点：${location ?? `${latitude},${longitude}`}`,
        `当前：${desc}，气温 ${t ?? "?"}°C（体感 ${feels ?? "?"}°C），风速 ${wind ?? "?"} km/h`,
        `今天：${d0Desc}，${d0Min ?? "?"}～${d0Max ?? "?"}°C，降水概率 ${d0Pop ?? "?"}%`,
        airLine,
        `数据时间：${nowTime ?? "?"}${tz ? `（${tz}）` : ""}`,
      ].join("\n");
    },
  },
  {
    name: "get_air_quality",
    description:
      `查询空气质量（需要联网，Open-Meteo）。输入可为空（默认 ${DEFAULT_CITY}），或传 JSON：{"location":"北京"} / {"latitude":39.9,"longitude":116.4}。仅返回 AQI(US)。`,
    func: async (input?: string) => {
      type AQInput = { location?: string; latitude?: number; longitude?: number };
      const parsed = safeJsonParse<AQInput>(input) ?? {};
      const raw = (input ?? "").trim();

      let latitude = parsed.latitude;
      let longitude = parsed.longitude;
      let location = parsed.location ?? (raw && !raw.startsWith("{") ? raw : undefined) ?? DEFAULT_CITY;

      if ((latitude == null || longitude == null) && location) {
        const geo = (await fetchJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=zh&format=json`
        )) as any;
        const best = geo?.results?.[0];
        if (!best) return `没找到“${location}”的坐标。请换个更具体的地点（例如“北京朝阳”）或直接给我经纬度。`;
        latitude = best.latitude;
        longitude = best.longitude;
        location = `${best.name}${best.admin1 ? `, ${best.admin1}` : ""}${best.country ? `, ${best.country}` : ""}`;
      }

      // 若仍无坐标，则 fallback 为默认城市（正常不会走到这里）
      if (latitude == null || longitude == null) {
        return `请提供地点，例如传 JSON：{"location":"上海"} 或 {"latitude":31.2304,"longitude":121.4737}。（默认地点：${DEFAULT_CITY}）`;
      }

      const air = (await fetchJson(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(
          String(latitude)
        )}&longitude=${encodeURIComponent(
          String(longitude)
        )}&current=us_aqi&timezone=auto`
      )) as any;

      const aqi = Number(air?.current?.us_aqi);
      if (!Number.isFinite(aqi)) return "暂无数据";
      // 仅返回数字，方便上层用统一中文句式输出（避免出现 AQI(US) 等字样）
      return String(aqi);
    },
  },
  {
    name: "get_calendar_events",
    description:
      '查询本地日历事件（读取 .ics 文件）。需要先设置环境变量 CALENDAR_ICS_PATH 指向你的 .ics 文件路径。输入建议传 JSON：{"start":"2026-01-01T00:00:00","end":"2026-01-02T00:00:00","keyword":"会议","limit":20}。',
    func: async (input?: string) => {
      const icsPath = process.env.CALENDAR_ICS_PATH;
      if (!icsPath) {
        return [
          "未配置日历文件路径。",
          '请先设置环境变量：export CALENDAR_ICS_PATH="/绝对路径/你的日历.ics"',
          "然后再让我查询（例如：今天/本周有什么安排）。",
        ].join("\n");
      }

      type CalendarInput = { start?: string; end?: string; keyword?: string; limit?: number };
      const parsed = safeJsonParse<CalendarInput>(input) ?? {};
      const now = new Date();
      const defaultStart = startOfTodayLocal(now);
      const defaultEnd = addDays(defaultStart, 1);
      const start = parsed.start ? new Date(parsed.start) : defaultStart;
      const end = parsed.end ? new Date(parsed.end) : defaultEnd;
      const keyword = parsed.keyword?.trim();
      const limit = Math.max(1, Math.min(50, parsed.limit ?? 20));

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return '时间范围解析失败。请用 ISO 字符串，例如 {"start":"2026-01-01T00:00:00","end":"2026-01-02T00:00:00"}。';
      }

      const raw = await fs.readFile(icsPath, "utf-8");
      let events = parseIcsEvents(raw);

      events = events
        .filter((e) => e.start && (e.end ?? e.start))
        .map((e) => ({ ...e, end: e.end ?? e.start }))
        .filter((e) => overlap(e.start, e.end, start, end));

      if (keyword) {
        const kw = keyword.toLowerCase();
        events = events.filter((e) => {
          const hay = `${e.summary ?? ""}\n${e.location ?? ""}\n${e.description ?? ""}`.toLowerCase();
          return hay.includes(kw);
        });
      }

      events.sort((a, b) => (a.start!.getTime() - b.start!.getTime()));
      const sliced = events.slice(0, limit);

      if (sliced.length === 0) {
        return `在 ${formatDateTimeZh(start)} ～ ${formatDateTimeZh(end)} 之间没有匹配的日程。`;
      }

      const lines = sliced.map((e, i) => {
        const s = e.start!;
        const ed = e.end!;
        const title = e.summary ?? "（无标题）";
        const loc = e.location ? ` @ ${e.location}` : "";
        const time = `${s.toLocaleString("zh-CN")} - ${ed.toLocaleString("zh-CN")}`;
        return `${i + 1}. ${time}｜${title}${loc}`;
      });

      return [
        `日程（${formatDateTimeZh(start)} ～ ${formatDateTimeZh(end)}，最多 ${limit} 条）：`,
        ...lines,
        "",
        "注：当前解析器为轻量实现，TZID/重复事件（RRULE）可能不完全精确；如需更强解析可再升级。",
      ].join("\n");
    },
  },
  {
    name: "open_browser",
    description:
      "在浏览器中打开并搜索指定内容。注意：这个工具只是打开浏览器，不会返回搜索结果内容。如果用户需要查看结果，应提示用户去浏览器里看。输入为关键词或 URL。",
    func: async (input?: string) => {
      const searchQuery = (input || "").trim();
      const isMac = process.platform === "darwin";
      const isWindows = process.platform === "win32";

      try {
        if (isMac) {
          if (searchQuery) {
            await execAsync(
              `open "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`
            );
            return `已在浏览器中打开并搜索：${searchQuery}。请查看浏览器中的搜索结果。`;
          }
          await execAsync('open -a "Google Chrome"');
          return "浏览器已打开";
        }
        if (isWindows) {
          if (searchQuery) {
            await execAsync(
              `start chrome "https://www.google.com/search?q=${encodeURIComponent(searchQuery)}"`
            );
            return `已在浏览器中打开并搜索：${searchQuery}。请查看浏览器中的搜索结果。`;
          }
          await execAsync("start chrome");
          return "浏览器已打开";
        }
        return "不支持的操作系统";
      } catch (error) {
        return `打开浏览器时出错: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
];