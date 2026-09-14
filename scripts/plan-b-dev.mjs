import net from "node:net";
import { spawn } from "node:child_process";
import { projectRoot } from "../server/plan-b-scope.mjs";

// A single foreground command; no login items, background service or deployment.
async function ensureFree(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(new Error(`端口 ${port} 已被占用，请先停止对应的 Plan B 进程。`)),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
await Promise.all([ensureFree(3100), ensureFree(4430)]);
const env = {
  ...process.env,
  ZH_API_PORT: "4430",
  ZH_DATA_DIR: "data-plan-b",
  ZH_ENV_SOURCE: "",
  ZH_ENV_FILE: ".env.plan-b",
  ZH_PUBLIC_ORIGIN: "http://localhost:3100",
  NEXT_PUBLIC_BASE_PATH: "/zhijing",
};
const children = [
  spawn(process.execPath, ["server/index.mjs"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  }),
  spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    detached: true,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  children[0].kill("SIGTERM");
  try {
    process.kill(-children[1].pid, "SIGTERM");
  } catch {
    /* Already exited. */
  }
}
children.forEach((child) => {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code || 0));
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log("Plan B: http://localhost:3100/zhijing/?start=welcome");
