import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  projectPath,
  projectRoot,
  releaseStorageRoot,
} from "../server/plan-b-scope.mjs";
import { planBStorageKey } from "../lib/plan-b-storage.ts";
import { localDemoIndex } from "../build/local-demo-index.ts";

const read = (name) => fs.readFileSync(path.join(projectRoot, name), "utf8");

test("public B build isolates URLs, browser state and persistent release data", () => {
  const player = read("experiments/openmaic-preview/main.jsx");
  assert.match(player, /zhixingEntry\(base,/);
  assert.match(player, /useExperienceShortcut\(base\)/);
  assert.doesNotMatch(player, /href="\/zhijing\//);
  assert.ok(planBStorageKey("zhijing-demo-time").startsWith("zhijing-plan-b:"));
  for (const file of [
    "components/learning-workbench.tsx",
    "components/learning-app.tsx",
    "experiments/openmaic-preview/main.jsx",
  ])
    assert.doesNotMatch(
      read(file),
      /localStorage\.(?:getItem|setItem)\("zhijing-/,
    );
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "zhijing-release-test-")));
  try {
    const b = path.join(root, "zhijing-plan-b");
    fs.mkdirSync(b);
    assert.equal(releaseStorageRoot(b, path.join(b, "releases", "v1")), b);
    assert.throws(() =>
      releaseStorageRoot(root, path.join(b, "releases", "v1")),
    );
    assert.throws(() =>
      releaseStorageRoot(b, path.join(root, "zhijing", "releases", "v1")),
    );
    assert.throws(() => releaseStorageRoot(b, b));
    assert.equal(releaseStorageRoot(undefined), projectRoot);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const nginx = read("deploy/zhijing-plan-b-location.conf");
  assert.doesNotMatch(nginx, /apps\/zhijing\//);
  for (const name of ["web", "api"]) {
    const service = read(`deploy/zhijing-plan-b-${name}.service`);
    assert.match(service, /Restart=always/);
    assert.match(service, /WantedBy=multi-user.target/);
    assert.doesNotMatch(service, /apps\/zhijing\//);
  }
});

test("Plan B has independent runtime, source hosting identity and session", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "zhijing-plan-b");
  assert.match(pkg.scripts.dev, /--port 3100/);
  assert.match(read("vite.config.ts"), /127\.0\.0\.1:4430/);
  assert.doesNotMatch(read("vite.config.ts"), /127\.0\.0\.1:4330/);
  assert.match(read("server/store.mjs"), /"zhijing_plan_b_session"/);
  assert.equal(JSON.parse(read(".openai/hosting.json")).project_id, null);
  assert.match(read(".gitignore"), /\/data-plan-b\//);
});

test("data and configuration cannot escape the fork, including via symlink", () => {
  assert.equal(
    projectPath(undefined, "data-plan-b"),
    path.join(projectRoot, "data-plan-b"),
  );
  assert.throws(() => projectPath("../个性化学习平台/data", "data-plan-b"));
  assert.throws(() =>
    projectPath("/home/ubuntu/apps/zhijing/data", "data-plan-b"),
  );
  fs.mkdirSync(path.join(projectRoot, "test-results"), { recursive: true });
  const temp = fs.mkdtempSync(
    path.join(projectRoot, "test-results/plan-b-isolation-"),
  );
  try {
    const link = path.join(temp, "outside");
    fs.symlinkSync(os.tmpdir(), link);
    assert.throws(() => projectPath(path.join(link, "data"), "data-plan-b"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("configuration refuses old external env imports before starting the API", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "import './server/config.mjs'"],
    {
      cwd: projectRoot,
      env: { ...process.env, ZH_ENV_SOURCE: "/not-read/production.env" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Plan B 不读取其他项目/);
});

test("local preview supports lesson directory URLs without touching other routes", () => {
  fs.mkdirSync(path.join(projectRoot, "test-results"), { recursive: true });
  const temp = fs.mkdtempSync(
    path.join(projectRoot, "test-results/demo-index-"),
  );
  try {
    fs.mkdirSync(path.join(temp, "demo/test-lesson"), { recursive: true });
    fs.writeFileSync(
      path.join(temp, "demo/test-lesson/index.html"),
      "<!doctype html>",
    );
    let handler;
    localDemoIndex().configureServer({
      config: { publicDir: temp },
      middlewares: {
        use(fn) {
          handler = fn;
        },
      },
    });
    for (const [url, expected] of [
      [
        "/zhijing/demo/test-lesson/?mode=video",
        "/zhijing/demo/test-lesson/index.html?mode=video",
      ],
      ["/demo/test-lesson/", "/demo/test-lesson/index.html"],
      ["/zhijing/api/me", "/zhijing/api/me"],
      ["/zhijing/demo/missing/", "/zhijing/demo/missing/"],
    ]) {
      const request = { method: "GET", url };
      let next = false;
      handler(request, {}, () => {
        next = true;
      });
      assert.equal(request.url, expected);
      assert.equal(next, true);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("upstream deployment scripts stop before any legacy action", () => {
  for (const script of [
    "activate.sh",
    "activate-ui.sh",
    "activate-system.sh",
  ]) {
    const result = spawnSync(
      "bash",
      [path.join(projectRoot, "docs/upstream-deploy-reference", script)],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Plan B.*已禁用/);
  }
  const result = spawnSync(
    process.execPath,
    ["docs/upstream-deploy-reference/provision-private.mjs"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Plan B.*已禁用/);
});

test("demo questionnaire saves preset rules and enters the workbench without model generation", () => {
  const onboarding = read("components/learning-onboarding.tsx").split(
    "export function Onboarding",
  )[1];
  assert.match(onboarding, /profile: buildProfile\(answers\)/);
  assert.match(onboarding, /"\/profile", "PUT"/);
  assert.match(onboarding, /onSave\(data.profile\)/);
  assert.match(onboarding, /进入待启集/);
  assert.doesNotMatch(
    onboarding,
    /\/profile\/design|<SkillEditor|setDraft|生成我的学习方式/,
  );
  const app = read("components/learning-app.tsx");
  assert.match(
    app,
    /function saved\(p: Profile\)\s*\{\s*setProfile\(p\);\s*go\("workspace"\)/,
  );
});

test("demo formats stay directly switchable regardless of entry selection or resume history", () => {
  const player = read("experiments/openmaic-preview/main.jsx");
  const tabs = player.split('aria-label="观看方式"')[1].split("</div>")[0];
  for (const [mode, label] of [
    ["video", "视频"],
    ["slides", "图解"],
    ["audio", "音频"],
    ["reading", "图文"],
    ["overview", "全景图"],
    ["practice", "互动"],
  ]) {
    assert.ok(tabs.includes(`["${mode}", "${label}"]`));
  }
  assert.match(tabs, /onClick=\{\(\) => switchMode\(key\)\}/);
  assert.doesNotMatch(tabs, /<select|\.filter\(/);
  assert.doesNotMatch(
    player,
    /visibleModes|query\.get\("formats"\)|zhijing-demo-formats/,
  );
  // The chosen main format and the shared learning position still drive entry/switching.
  assert.match(player, /const requested = query\.get\("mode"\)/);
  assert.match(player, /setTime\(position\);\s*setMode\(next\)/);
});

test("welcome starts the learning flow without a featured demo shortcut", () => {
  const welcome = read("components/learning-welcome.tsx");
  assert.match(welcome, /找到我的学法/);
  assert.match(welcome, /onClick=\{onStart\}/);
  assert.doesNotMatch(
    welcome,
    /z-featured-work|\/demo\/|窗口期可能只剩五年|学习作品示例/,
  );
  const workbench = read("components/learning-workbench.tsx");
  assert.match(workbench, /demoVisited &&/);
  assert.match(workbench, /上回读到/);
  assert.match(workbench, /demoStudyUrl\(base, resumeMode, true\)/);
});
