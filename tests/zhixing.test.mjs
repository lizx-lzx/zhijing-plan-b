import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { demoLifeReply, lifeDemoChoices } from "../server/zhixing-demo.mjs";
import {
  lifeDemoChoices as clientChoices,
  zhixingEntry,
} from "../lib/zhixing.ts";

const context = {
  evidence: ["workflow", "action", "window"].map((id) => ({
    id,
    quote: `source ${id}`,
  })),
};
test("conversation progressively reveals panels and restores the latest step without a fixed-height window", async () => {
  const ui = await fs.readFile("components/zhixing-space.tsx", "utf8");
  const css = await fs.readFile("app/zhixing.css", "utf8");
  assert.match(ui, /panelOpen &&/);
  assert.match(ui, /archiveOpen &&/);
  assert.match(ui, /returning &&/);
  assert.match(ui, /接着上次/);
  assert.match(ui, /useReducedMotion/);
  assert.match(ui, /<motion\.article/);
  assert.match(ui, /<motion\.section className="life-suggestion"|<motion\.section\s+className="life-suggestion"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /height:\s*(?:calc\(100dvh|75dvh|80dvh|570px|600px)/);
});
test("three authored demo routes yield different plans without a model or invented experience", () => {
  assert.deepEqual(clientChoices, lifeDemoChoices);
  const answers = [];
  for (const choice of lifeDemoChoices) {
    const first = demoLifeReply(context, [], [], choice.label, choice.id);
    const second = demoLifeReply(
      context,
      [{ reply: first }],
      [],
      "继续",
      first.choices[0].id,
    );
    assert.equal(first.engine, "preset-demo");
    assert.equal(second.engine, "preset-demo");
    assert.ok(second.suggestion.action);
    assert.ok(second.citations.every((c) => context.evidence.includes(c)));
    answers.push(second.suggestion.action);
    const smaller = demoLifeReply(
      context,
      [{ reply: first }, { reply: second }],
      [],
      "太大了",
      "smaller",
    );
    assert.notEqual(smaller.suggestion.action, second.suggestion.action);
    const paused = demoLifeReply(
      context,
      [{ reply: smaller }],
      [],
      "之后再来",
      "pause",
    );
    const resumed = demoLifeReply(
      context,
      [{ reply: smaller }, { reply: paused }],
      [],
      "接着说",
      "resume",
    );
    assert.equal(resumed.suggestion.action, smaller.suggestion.action);
  }
  assert.equal(new Set(answers).size, 3);
  assert.equal(
    demoLifeReply(context, [], [], "自述", undefined).suggestion,
    null,
  );
  assert.deepEqual(
    demoLifeReply(context, [], [], "bad", "__proto__").choices,
    lifeDemoChoices,
  );
});

test("pet entry carries only article location; the study player accepts explicit return time", async () => {
  const href = zhixingEntry("/zhijing", {
    article: "window-five-years",
    chapter: "income",
    mode: "slides",
    at: 81.2,
  });
  assert.equal(
    href,
    "/zhijing/zhixing/?article=window-five-years&chapter=income&mode=slides&at=81.2",
  );
  assert.equal(zhixingEntry("/zhijing"), "/zhijing/zhixing/");
  const pet = await fs.readFile("components/reading-companion.tsx", "utf8");
  assert.equal((pet.match(/用到我的生活里/g) || []).length, 1);
  const player = await fs.readFile(
    "experiments/openmaic-preview/main.jsx",
    "utf8",
  );
  assert.match(player, /query\.has\("at"\)/);
  const flow = await fs.readFile("server/zhixing.mjs", "utf8");
  assert.doesNotMatch(flow, /modelJSON|modelKey|answerLife|fetch\(/);
});

test("private scenes, confirmed knowledge revisions and demo conversations persist across restarts", async () => {
  await fs.mkdir("test-results", { recursive: true });
  const temp = await fs.mkdtemp(path.resolve("test-results/zhixing-test-"));
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  let child;
  async function start() {
    child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        ZH_API_PORT: String(port),
        ZH_DATA_DIR: temp,
        ZH_ENV_SOURCE: "",
        ZH_ENV_FILE: path.join(temp, "absent.env"),
        ZH_MODEL_KEY: "test-must-never-be-used",
        ZH_MODEL_BASE: "http://127.0.0.1:9",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
      } catch {
        // The isolated test server may still be starting.
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(logs || "API did not start");
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = once(child, "exit");
    child.kill("SIGTERM");
    await done;
  }
  function client() {
    let cookie = "";
    return async (route, method = "GET", body, headers = {}) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${route}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      return { status: res.status, data: await res.json() };
    };
  }
  try {
    await start();
    const a = client(),
      b = client();
    assert.equal((await a("/zhixing")).data.demo, true);
    assert.deepEqual((await b("/zhixing")).data.spaces, []);
    assert.equal(
      (await a("/zhixing", "POST", {}, { Origin: "https://evil.example" }))
        .status,
      403,
    );
    let space = (
      await a("/zhixing", "POST", {
        context: {
          article: "window-five-years",
          mode: "slides",
          at: 81.2,
          chapter: "income",
          returnTo: "https://evil.example",
        },
      })
    ).data;
    const id = space.id,
      endpoint = `/zhixing/${id}`;
    assert.match(
      space.context.returnTo,
      /^\/zhijing\/demo\/.+mode=slides&at=81.2$/,
    );
    const original = await fs.readFile(
      "experiments/openmaic-preview/lessons/window-five-years/original.txt",
      "utf8",
    );
    assert.equal(space.context.evidence.length, 10);
    for (const e of space.context.evidence)
      assert.ok(original.includes(e.quote));
    assert.equal((await b(endpoint)).status, 404);
    assert.equal(
      (
        await b(endpoint + "/turns", "POST", {
          question: "偷看",
          requestId: "unauthorized",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await a("/zhixing", "POST", {
          context: { article: "window-five-years" },
        })
      ).data.id,
      id,
    );
    const first = {
      requestId: "test-message-1",
      question: "想把 AI 用进工作",
      choice: "work",
    };
    space = (await a(endpoint + "/turns", "POST", first)).data;
    assert.equal(space.turns[0].reply.engine, "preset-demo");
    assert.equal(
      (await a(endpoint + "/turns", "POST", first)).data.turns.length,
      1,
    );
    assert.equal(
      (
        await a(endpoint + "/turns", "POST", {
          ...first,
          question: "different",
        })
      ).status,
      409,
    );
    space = (
      await a(endpoint + "/turns", "POST", {
        requestId: "test-message-2",
        question: "每周写周报",
        choice: "report",
      })
    ).data;
    const suggestion = space.turns.at(-1).reply.suggestion;
    assert.match(suggestion.action, /周报/);
    assert.deepEqual(space.notes, []);
    const note = {
      ...suggestion,
      reflection: "",
      status: "planned",
      citationIds: suggestion.citations.map((c) => c.id),
    };
    assert.equal((await a(endpoint + "/notes", "POST", note)).status, 400);
    assert.equal(
      (
        await a(endpoint + "/notes", "POST", {
          ...note,
          confirmed: true,
          citationIds: ["invented"],
        })
      ).status,
      400,
    );
    space = (await a(endpoint + "/notes", "POST", { ...note, confirmed: true }))
      .data;
    assert.equal(space.notes.length, 1);
    assert.equal(space.notes[0].version, 1);
    const nid = space.notes[0].id;
    assert.equal(
      (
        await b(endpoint + "/notes/" + nid, "PUT", {
          ...note,
          version: 1,
          confirmed: true,
        })
      ).status,
      404,
    );
    space = (
      await a(endpoint + "/notes/" + nid, "PUT", {
        ...note,
        version: 1,
        confirmed: true,
        status: "tried",
        reflection: "结构更清楚了，但事实还要自己核对。",
      })
    ).data;
    assert.equal(space.notes[0].version, 2);
    assert.equal(
      (
        await a(endpoint + "/notes/" + nid, "PUT", {
          ...note,
          version: 1,
          confirmed: true,
        })
      ).status,
      409,
    );
    assert.equal((await a("/me")).data.profile, null);
    await stop();
    await start();
    space = (await a(endpoint)).data;
    assert.equal(space.turns.length, 2);
    assert.equal(space.notes[0].status, "tried");
    assert.equal(space.notes[0].version, 2);
    assert.match(space.notes[0].reflection, /事实/);
    space = (
      await a(endpoint + "/turns", "POST", {
        requestId: "test-message-3",
        question: "想复盘",
        choice: "feedback",
      })
    ).data;
    assert.match(space.turns.at(-1).reply.answer, /已经收下/);
    const code = (await a("/recovery", "POST", {})).data.code;
    const c = client();
    assert.equal((await c("/recovery/restore", "POST", { code })).status, 200);
    assert.equal((await c(endpoint)).data.id, id);
    assert.deepEqual((await b("/zhixing")).data.spaces, []);
  } finally {
    await stop();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
