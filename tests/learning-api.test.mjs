import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { buildProfile } from "../lib/domain.ts";
import { DatabaseSync } from "node:sqlite";
import { sampleText } from "../server/sample.mjs";

test("HTTP contract: persistence, isolation, CSRF, recovery and honest failure", async (t) => {
  await mkdir("test-results", { recursive: true });
  const temp = await mkdtemp(path.resolve("test-results/zhijing-api-test-"));
  const finder = net.createServer();
  finder.listen(0, "127.0.0.1");
  await once(finder, "listening");
  const port = finder.address().port;
  await new Promise((r) => finder.close(r));
  let child;
  async function start() {
    child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ZH_API_PORT: String(port),
        ZH_DATA_DIR: temp,
        ZH_MODEL_KEY: "",
        ZH_ENV_SOURCE: "",
        ZH_ENV_FILE: path.join(temp, "absent.env"),
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok) return;
      } catch {
        /* The child may not have bound its listener yet. */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(logs || "server did not start");
  }
  async function stop() {
    const done = once(child, "exit");
    child.kill("SIGTERM");
    await done;
  }
  function client() {
    let cookie = "";
    return async (route, method = "GET", body, headers = {}) => {
      const r = await fetch(`http://127.0.0.1:${port}/api${route}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = r.headers.get("set-cookie");
      if (set) {
        assert.match(set, /^zhijing_plan_b_session=/);
        assert.match(set, /HttpOnly/);
        assert.match(set, /SameSite=Lax/);
        cookie = set.split(";")[0];
      }
      return { status: r.status, data: await r.json() };
    };
  }
  try {
    await start();
    const a = client(),
      b = client();
    assert.equal((await a("/me")).data.profile, null);
    assert.equal((await b("/me")).data.profile, null);
    assert.deepEqual((await a("/companion/chat")).data.messages, []);
    assert.equal(
      (await a("/companion/chat", "POST", { question: "" })).status,
      400,
    );
    assert.equal(
      (
        await a(
          "/companion/chat",
          "POST",
          { question: "你好" },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    const profile = buildProfile({
      entry: "story",
      primary: "reading",
      avoid: ["questions"],
    });
    await t.test("profile is persisted and private", async () => {
      assert.equal((await a("/profile", "PUT", { profile })).status, 200);
      assert.equal((await a("/me")).data.profile.answers.entry, "story");
      assert.equal((await b("/me")).data.profile, null);
    });
    await t.test("cross-origin writes fail", async () => {
      assert.equal(
        (
          await a(
            "/profile",
            "PUT",
            { profile },
            { Origin: "https://evil.example" },
          )
        ).status,
        403,
      );
    });
    await t.test("unsafe source URL and insufficient text fail", async () => {
      assert.equal(
        (await a("/sources", "POST", { url: "http://localhost:4330/api/me" }))
          .status,
        400,
      );
      assert.equal((await a("/sources", "POST", { text: "不足" })).status, 400);
    });
    assert.equal((await a("/sources/sample", "POST", {})).status, 410);
    const source = (
      await a("/sources", "POST", {
        title: "平均数为什么不一定代表大多数人？",
        text: sampleText,
      })
    ).data.source;
    await t.test(
      "another user cannot generate from an owned source",
      async () => {
        assert.equal(
          (await b("/lessons", "POST", { sourceId: source.id })).status,
          404,
        );
      },
    );
    const job = (await a("/lessons", "POST", { sourceId: source.id })).data
      .lesson;
    await t.test(
      "private result, export and media endpoints are isolated",
      async () => {
        for (const suffix of [
          "",
          "/export.json",
          "/player",
          "/media/video.mp4",
          "/chat",
        ])
          assert.equal((await b("/lessons/" + job.id + suffix)).status, 404);
      },
    );
    await t.test(
      "missing model produces a saved, retryable failure instead of a fake result",
      async () => {
        let result;
        for (let i = 0; i < 40; i++) {
          result = (await a("/lessons/" + job.id)).data.lesson;
          if (result.status === "failed") break;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(result.status, "failed");
        assert.equal(result.result, null);
        assert.ok(result.error.length > 0);
        assert.equal(result.source.id, source.id);
      },
    );
    const code = (await a("/recovery", "POST", {})).data.code;
    await t.test(
      "private progress and notes persist without changing the personal Skill",
      async () => {
        const before = JSON.stringify((await a("/me")).data.profile);
        assert.equal(
          (
            await a(`/lessons/${job.id}/state`, "PUT", {
              notes: "保留我的理解",
              mode: "reading",
              chapter: 99,
            })
          ).status,
          200,
        );
        assert.equal(
          (await a(`/lessons/${job.id}`)).data.lesson.studyState.notes,
          "保留我的理解",
        );
        assert.equal(
          (await b(`/lessons/${job.id}/state`, "PUT", { notes: "入侵" }))
            .status,
          404,
        );
        assert.equal(JSON.stringify((await a("/me")).data.profile), before);
        assert.equal(
          (
            await b(`/lessons/${job.id}/formats`, "POST", {
              formats: ["audio"],
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await a(`/lessons/${job.id}/formats`, "POST", {
              formats: ["audio"],
            })
          ).status,
          409,
        );
        const list = await a("/lessons?q=&offset=0.5");
        assert.equal(list.status, 200);
        assert.equal(list.data.total, 1);
        assert.equal(list.data.lessons[0].studyState.mode, "reading");
        assert.equal((await b("/lessons")).data.total, 0);
        assert.equal((await a("/lessons?q=nonexistent")).data.total, 0);
      },
    );
    const c = client();
    await t.test(
      "retired built-in samples disappear without hiding a user's same-title article",
      async () => {
        const fixture = new DatabaseSync(path.join(temp, "zhijing.sqlite"));
        const legacySource = "e".repeat(32),
          legacyLesson = "f".repeat(32);
        try {
          fixture
            .prepare(
              "INSERT INTO sources SELECT ?,user_id,title,url,'sample',blocks,created_at FROM sources WHERE id=?",
            )
            .run(legacySource, source.id);
          fixture
            .prepare(
              "INSERT INTO lessons(id,user_id,source_id,profile,formats,title,status,stage,created_at,updated_at) SELECT ?,user_id,?,profile,formats,'读了两本，为什么没到平均水平？','failed','旧体验',created_at,updated_at FROM lessons WHERE id=?",
            )
            .run(legacyLesson, legacySource, job.id);
        } finally {
          fixture.close();
        }
        const list = (await a("/lessons")).data;
        assert.equal(list.total, 1);
        assert.equal(list.lessons[0].id, job.id);
        assert.ok(
          !(await a("/me")).data.lessons.some((x) => x.id === legacyLesson),
        );
        assert.equal(
          (await a("/lessons?q=" + encodeURIComponent("读了两本"))).data.total,
          0,
        );
        assert.equal(
          (await a(`/lessons/${legacyLesson}`)).status,
          200,
          "Historical data stays recoverable by its owner",
        );
        assert.equal((await b(`/lessons/${legacyLesson}`)).status, 404);
      },
    );
    await t.test(
      "library pagination reaches older rows and escapes wildcard searches",
      async () => {
        const fixture = new DatabaseSync(path.join(temp, "zhijing.sqlite"));
        for (let n = 1; n <= 30; n++)
          fixture
            .prepare(
              "INSERT INTO lessons(id,user_id,source_id,profile,formats,title,status,stage,created_at,updated_at) SELECT ?,user_id,source_id,profile,formats,?,'failed','测试固定数据',created_at,updated_at FROM lessons WHERE id=?",
            )
            .run(n.toString(16).padStart(32, "0"), `分页作品 ${n}`, job.id);
        fixture.close();
        const first = (await a("/lessons?q=" + encodeURIComponent("分页作品")))
          .data;
        const second = (
          await a(
            "/lessons?q=" +
              encodeURIComponent("分页作品") +
              "&offset=" +
              first.nextOffset,
          )
        ).data;
        assert.equal(first.total, 30);
        assert.equal(first.lessons.length, 24);
        assert.equal(second.lessons.length, 6);
        assert.equal(second.nextOffset, null);
        assert.equal(
          new Set([...first.lessons, ...second.lessons].map((item) => item.id))
            .size,
          30,
        );
        assert.equal((await a("/lessons?q=%25")).data.total, 0);
        assert.equal((await b("/lessons")).data.total, 0);
      },
    );
    await t.test(
      "recovery transfers access only with the correct secret",
      async () => {
        assert.equal(
          (await c("/recovery/restore", "POST", { code: "wrong" })).status,
          403,
        );
        assert.equal(
          (await c("/recovery/restore", "POST", { code })).status,
          200,
        );
        assert.equal((await c("/lessons/" + job.id)).status, 200);
      },
    );
    await stop();
    await start();
    await t.test(
      "profile, session, source and job survive a restart",
      async () => {
        assert.equal((await a("/me")).data.profile.answers.entry, "story");
        assert.equal(
          (await a(`/lessons/${job.id}`)).data.lesson.studyState.notes,
          "保留我的理解",
        );
        assert.equal(
          (await a("/lessons/" + job.id)).data.lesson.source.id,
          source.id,
        );
      },
    );
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(temp, { recursive: true, force: true });
  }
});
