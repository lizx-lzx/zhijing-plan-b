import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { defaultAnswers } from "../lib/domain.ts";
import { sampleText } from "../server/sample.mjs";

const origin = process.env.ZH_ACCEPTANCE_URL || "http://127.0.0.1:4430/zhijing/api";
function client() {
  let cookie = "";
  return async (path, method = "GET", body) => {
    const r = await fetch(origin + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = await r.json();
    return { status: r.status, data };
  };
}
async function wait(c, id) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < 900000) {
    const { data } = await c("/lessons/" + id);
    const l = data.lesson;
    if (l.stage !== last) {
      console.log(l.stage);
      last = l.stage;
    }
    if (["ready", "partial", "failed"].includes(l.status)) return l;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Acceptance timed out");
}
const a = client(),
  b = client();
assert.equal((await a("/me")).status, 200);
assert.equal((await b("/me")).status, 200);
assert.equal(
  (await a("/sources", "POST", { url: "http://127.0.0.1" })).status,
  400,
);
const source = (
  await a("/sources", "POST", { title: "隔离测试材料", text: sampleText })
).data.source;
const runs = [];
for (const entry of ["story", "analysis", "map"]) {
  const design = await a("/profile/design", "POST", {
    answers: { ...defaultAnswers, primary: "reading", entry, pace: "balanced" },
  });
  assert.equal(design.status, 200, JSON.stringify(design.data));
  assert.equal(design.data.profile.engine, "ai");
  const save = await a("/profile", "PUT", { profile: design.data.profile });
  assert.equal(save.status, 200);
  const formats =
    entry === "story" && process.env.ZH_TEST_VIDEO === "1"
      ? ["reading", "video"]
      : ["reading"];
  const job = await a("/lessons", "POST", { sourceId: source.id, formats });
  assert.equal(job.status, 202, JSON.stringify(job.data));
  assert.equal(
    (await b("/lessons/" + job.data.lesson.id)).status,
    404,
    "other user must not read lesson",
  );
  const result = await wait(a, job.data.lesson.id);
  assert.equal(
    result.status,
    "ready",
    JSON.stringify({
      status: result.status,
      error: result.error,
      media: result.media,
    }),
  );
  assert.ok(result.result.chapters.length >= 3);
  assert.equal(result.profile.answers.primary, "reading");
  assert.equal(
    result.result.chapters[0].kind,
    { story: "故事", analysis: "结论", map: "全貌" }[entry],
    "entry must actually change the first chapter, not just the adaptation claims",
  );
  assert.ok(
    result.result.chapters.every(
      (ch) =>
        ch.sourceIds.length &&
        ch.sourceIds.every((id) => source.blocks.some((b) => b.id === id)),
    ),
  );
  runs.push({
    entry,
    lessonId: result.id,
    title: result.title,
    firstChapter: result.result.chapters[0],
    chapterTitles: result.result.chapters.map((c) => c.title),
    adaptation: result.result.adaptation,
    media: result.media,
  });
}
assert.notEqual(runs[0].firstChapter.title, runs[1].firstChapter.title);
const recovery = (await a("/recovery", "POST", {})).data.code;
const c = client();
assert.equal(
  (await c("/recovery/restore", "POST", { code: recovery })).status,
  200,
);
assert.equal((await c("/lessons/" + runs[0].lessonId)).status, 200);
assert.equal(
  (await b("/recovery/restore", "POST", { code: "invalid" })).status,
  403,
);
await fs.mkdir("test-results", { recursive: true });
await fs.writeFile(
  "test-results/real-acceptance.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin,
      passed: true,
      checks: [
        "真实模型生成 Skill",
        "相同文章两套真实编排",
        "来源引用",
        "跨用户隔离",
        "恢复码恢复",
      ],
      runs,
    },
    null,
    2,
  ),
);
console.log(
  "REAL_ACCEPTANCE_PASSED",
  runs.map((r) => ({
    entry: r.entry,
    id: r.lessonId,
    first: r.firstChapter.title,
  })),
);
