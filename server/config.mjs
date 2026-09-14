import fs from "node:fs";
import { parseEnv } from "node:util";
import { projectPath } from "./plan-b-scope.mjs";

const readEnv = (p) =>
  p && fs.existsSync(p) ? parseEnv(fs.readFileSync(p, "utf8")) : {};
// The fork never imports the original project's environment file or data.
if (process.env.ZH_ENV_SOURCE)
  throw new Error(
    "Plan B 不读取其他项目的环境配置，请使用副本内的 .env.plan-b。",
  );
const local = readEnv(projectPath(process.env.ZH_ENV_FILE, ".env.plan-b"));
const e = { ...local, ...process.env };
export const config = {
  port: Number(e.ZH_API_PORT || 4430),
  dataDir: projectPath(e.ZH_DATA_DIR, "data-plan-b"),
  basePath: e.NEXT_PUBLIC_BASE_PATH ?? "/zhijing",
  origin: e.ZH_PUBLIC_ORIGIN || "http://localhost:3100",
  production: e.NODE_ENV === "production",
  modelBase: (
    e.ZH_MODEL_BASE ||
    e.LLM_BASE_URL ||
    "https://api.deepseek.com"
  ).replace(/\/$/, ""),
  model: e.ZH_MODEL || e.LLM_MODEL || "deepseek-v4-flash",
  modelKey: e.ZH_MODEL_KEY || e.LLM_API_KEY || "",
  voiceBase: (
    e.ZH_VOICE_BASE ||
    e.VOICE_AI_BASE_URL ||
    "https://api.xiaomimimo.com/v1"
  ).replace(/\/$/, ""),
  voiceModel:
    e.ZH_VOICE_MODEL || e.VOICE_AI_MODEL || "mimo-v2.5-tts-voiceclone",
  voiceKey: e.ZH_VOICE_KEY || e.VOICE_AI_API_KEY || "",
  voiceReference: e.ZH_VOICE_REFERENCE || e.VOICE_AI_REFERENCE_AUDIO || "",
  chromium: e.ZH_CHROMIUM || undefined,
  maxDailyJobs: Number(e.ZH_MAX_DAILY_JOBS || 40),
  maxIpJobs: Number(e.ZH_MAX_IP_JOBS || 12),
  maxUserJobs: Number(e.ZH_MAX_USER_JOBS || 8),
};
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

export class AppError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const requiredText = (value, min, max, name) => {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    throw new AppError(`${name}需要 ${min}—${max} 个字符。`);
  return value.trim();
};
