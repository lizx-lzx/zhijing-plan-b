throw new Error("Plan B: 原知径的密钥配置与部署脚本仅供参考，已禁用。");
// Transfer only the existing pipeline's model/voice settings to this app's private server directory.
// No secrets are logged, saved in this checkout, or included in release archives.
import fs from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
const target = "ubuntu@111.231.60.73";
const ssh = [
  "-i",
  "/Users/li/.ssh/chainvalley_lighthouse",
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
];
const existing = parseEnv(
  fs.readFileSync("/Users/li/Documents/gpt/自媒体流水线/.env", "utf8"),
);
if (
  !existing.LLM_API_KEY ||
  !existing.VOICE_AI_API_KEY ||
  !fs.existsSync(existing.VOICE_AI_REFERENCE_AUDIO)
)
  throw new Error("Existing media runtime is incomplete");
function run(command, args, input) {
  const r = spawnSync(command, args, {
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.status !== 0)
    throw new Error(`${command} failed (secret output withheld)`);
}
run("ssh", [
  ...ssh,
  target,
  "sudo install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/apps/zhijing/private /home/ubuntu/apps/zhijing/data",
]);
const values = {
  NODE_ENV: "production",
  ZH_API_PORT: "4330",
  ZH_DATA_DIR: "/home/ubuntu/apps/zhijing/data",
  ZH_PUBLIC_ORIGIN: "https://app.chainvalley.top",
  NEXT_PUBLIC_BASE_PATH: "/zhijing",
  ZH_MODEL_BASE: existing.LLM_BASE_URL,
  ZH_MODEL: existing.LLM_MODEL,
  ZH_MODEL_KEY: existing.LLM_API_KEY,
  ZH_VOICE_BASE: existing.VOICE_AI_BASE_URL,
  ZH_VOICE_MODEL: existing.VOICE_AI_MODEL,
  ZH_VOICE_KEY: existing.VOICE_AI_API_KEY,
  ZH_VOICE_REFERENCE: "/home/ubuntu/apps/zhijing/private/reference.mp3",
  ZH_MAX_DAILY_JOBS: "40",
  ZH_MAX_IP_JOBS: "12",
  ZH_MAX_USER_JOBS: "8",
  ZH_CHROMIUM:
    "/home/ubuntu/apps/zhijing/private/browser/chrome-headless-shell-linux64/chrome-headless-shell",
};
for (const v of Object.values(values))
  if (typeof v !== "string" || /[\r\n"\\]/.test(v))
    throw new Error("Unsupported environment value");
run(
  "ssh",
  [
    ...ssh,
    target,
    "install -m 600 /dev/stdin /home/ubuntu/apps/zhijing/private/zhijing.env",
  ],
  Object.entries(values)
    .map(([k, v]) => `${k}="${v}"`)
    .join("\n") + "\n",
);
run(
  "ssh",
  [
    ...ssh,
    target,
    "install -m 600 /dev/stdin /home/ubuntu/apps/zhijing/private/reference.mp3",
  ],
  fs.readFileSync(existing.VOICE_AI_REFERENCE_AUDIO),
);
console.log(
  "Private model settings and reference audio transferred; secret values withheld.",
);
