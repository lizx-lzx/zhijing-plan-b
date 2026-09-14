// Component render acceptance, without opening or interacting with a browser.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { buildProfile, questions } from "../lib/domain.ts";
import { entryRoute } from "../lib/entry-route.ts";
import { pageMotionEnabled } from "../lib/motion-policy.ts";
import { stat, readFile } from "node:fs/promises";

test("page motion can stop independently of saved profiles and media playback", async () => {
  for (const paused of [true, false])
    for (const reduced of [true, false])
      for (const visible of [true, false])
        assert.equal(
          pageMotionEnabled(paused, reduced, visible),
          !paused && !reduced && visible,
        );
  const css = await readFile("app/learning-motion.css", "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[data-motion="off"\]/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(css, /opacity:\s*1 !important/);
  assert.doesNotMatch(css, /zHeroFloat|ease-in-out infinite/);
  const source = await readFile("components/learning-app.tsx", "utf8");
  assert.match(source, /visibilitychange/);
  assert.match(source, /aria-label="页面动效"/);
  assert.doesNotMatch(
    await readFile("components/learning-welcome.tsx", "utf8"),
    /requestAnimationFrame|setInterval/,
  );
});

test("welcome entry is non-destructive and takes precedence over a resume link", () => {
  const id = "a".repeat(32);
  assert.deepEqual(entryRoute(true, `?start=welcome&lesson=${id}`), {
    view: "welcome",
    lesson: null,
  });
  assert.deepEqual(entryRoute(true, `?lesson=${id}`), {
    view: "workspace",
    lesson: id,
  });
  assert.deepEqual(entryRoute(false, `?lesson=${id}`), {
    view: "welcome",
    lesson: null,
  });
  assert.equal(entryRoute(true, "?lesson=../other").lesson, null);
  assert.equal(entryRoute(true, "").view, "workspace");
});

test("questionnaire URLs survive reloads for new and returning visitors", () => {
  const id = "b".repeat(32);
  for (const hasProfile of [true, false]) {
    for (const start of ["questionnaire", "preferences"]) {
      assert.deepEqual(
        entryRoute(hasProfile, `?ui=old-cache-key&start=${start}&lesson=${id}`),
        { view: "questionnaire", lesson: null },
      );
    }
  }
  assert.deepEqual(entryRoute(true, "?ui=ec106ba"), {
    view: "workspace",
    lesson: null,
  });
  assert.deepEqual(entryRoute(false, ""), { view: "welcome", lesson: null });
});

test("recording entry preserves saved data and distinguishes editing answers", async () => {
  const app = await readFile("components/learning-app.tsx", "utf8");
  const shortcut = await readFile("components/use-experience-shortcut.ts", "utf8");
  assert.match(app, /fresh \? "questionnaire" : "preferences"/);
  assert.match(app, /onStart=\{\(\) => go\("questionnaire", true\)\}/);
  assert.match(app, /onRetake=\{\(\) => go\("questionnaire"\)\}/);
  assert.match(app, /freshQuestionnaire\s*\? defaultAnswers/);
  assert.match(shortcut, /\?start=questionnaire/);
  assert.doesNotMatch(shortcut, /localStorage|sessionStorage|document\.cookie|\/profile|\/recovery/);
});

test("utility controls stay in secondary settings, not the learning navigation", async () => {
  const source = await readFile("components/learning-app.tsx", "utf8");
  const header = source.match(
    /<header className="z-top">([\s\S]*?)<\/header>/,
  )?.[1];
  assert.ok(header);
  assert.match(header, /<Brand/);
  assert.match(header, /知藏/);
  assert.doesNotMatch(
    header,
    /保存与恢复|z-account|z-motion-toggle|setAccount/,
  );
  assert.doesNotMatch(source, /保存与恢复/);
  const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0];
  assert.match(footer, /设置/);
  assert.match(footer, /setAccount\(true\)/);
  assert.doesNotMatch(footer, /AI 辅助理解|重要判断请核对原文/);
  const layout = await readFile("app/product.css", "utf8");
  assert.doesNotMatch(
    layout,
    /margin-left:\s*(?:224|196)px|\.z-signed-in \.z-top/,
  );
  assert.match(layout, /max-width: 860px/);
  const settings = source.match(/<Modal title="设置"[\s\S]*?<\/Modal>/)?.[0];
  assert.match(settings, /aria-label="页面动效"/);
  assert.match(settings, /<details className="z-detail z-device-settings">/);
  assert.match(settings, /在其他设备继续学习/);
  assert.match(settings, /旧码会失效/);
  assert.match(settings, /请私下保存，不要发给别人/);
  assert.match(settings, /makeRecovery\(\)/);
  assert.match(settings, /restoreAccount\(\)/);
});

test("welcome, preference examples and private library covers use real visual assets", async () => {
  const server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { Welcome } = await server.ssrLoadModule(
      "/components/learning-welcome.tsx",
    );
    const { Brand } = await server.ssrLoadModule("/components/learning-ui.tsx");
    const brand = parseHTML(
      renderToStaticMarkup(createElement(Brand)),
    ).document;
    const mark = brand.querySelector("svg.brand-mark");
    assert.equal(mark.getAttribute("data-brand-version"), "rounded-jing-v1");
    assert.equal(mark.getAttribute("aria-hidden"), "true");
    assert.equal(
      mark.querySelector("g").getAttribute("stroke-linecap"),
      "round",
    );
    assert.equal(brand.querySelector(".brand-copy strong").textContent, "知径");
    const { ChoicePreview } = await server.ssrLoadModule(
      "/components/learning-previews.tsx",
    );
    const { LessonCard } = await server.ssrLoadModule(
      "/components/learning-workbench.tsx",
    );
    const html = renderToStaticMarkup(
      createElement(Welcome, { onStart() {}, returning: true }),
    );
    assert.match(html, /reading-nook-v1.webp/);
    assert.doesNotMatch(html, /z-featured-work|window-cover.jpg|\/demo\/|窗口期可能只剩五年/);
    assert.doesNotMatch(html, /原有作品保留|z-journey-strip|z-learning-hero/);
    assert.match(html, /找到我的学法/);
    assert.match(html, /8 题 · 约 2 分钟/);
    assert.doesNotMatch(html, /<span>示例<\/span>/);
    assert.doesNotMatch(html, /学习作品 · 示例/);
    assert.ok((await stat("public/images/window-cover.jpg")).size < 100000);
    assert.doesNotMatch(
      html,
      /让长文更容易开始|看示例，不用给自己分类|按你的节奏，随时继续|<figcaption/,
    );
    assert.ok(
      (await stat("public/images/learning-paths-v1.webp")).size < 100000,
    );
    for (const [question, values] of Object.entries({
      pace: ["compact", "balanced", "gentle"],
    })) {
      for (const value of values) {
        const preview = renderToStaticMarkup(
          createElement(ChoicePreview, { question, value }),
        );
        assert.match(preview, /class="z-pace-preview/);
        if (question === "pace") assert.match(preview, /结论/);
        assert.match(preview, /aria-hidden="true"/);
        assert.doesNotMatch(preview, /<button|<audio|<video/);
      }
    }
    const { ArticleCasePreview, ArticleCaseDialog, casePreviewUrl } =
      await server.ssrLoadModule("/components/learning-case-preview.tsx");
    for (const [medium, mode] of Object.entries({
      video: "video",
      reading: "reading",
      audio: "audio",
      animation: "overview",
    })) {
      assert.equal(
        renderToStaticMarkup(
          createElement(ChoicePreview, { question: "primary", value: medium }),
        ),
        "",
      );
      const tile = renderToStaticMarkup(
        createElement(ArticleCasePreview, { medium }),
      );
      assert.match(tile, /窗口期可能只剩五年/);
      assert.match(tile, /window-cover.jpg/);
      const entry = parseHTML(tile).document.querySelector(".z-article-case");
      if (medium === "video") {
        assert.equal(entry.tagName, "A");
        assert.equal(entry.getAttribute("href"), casePreviewUrl(medium));
        assert.equal(entry.getAttribute("target"), "_blank");
      } else {
        assert.equal(entry.tagName, "BUTTON");
      }
      assert.doesNotMatch(tile, /平均|<iframe|<video|<audio|<dialog/);
      const dialog = renderToStaticMarkup(
        createElement(ArticleCaseDialog, {
          medium,
          onChange() {},
          onClose() {},
        }),
      );
      const { document } = parseHTML(dialog);
      const frame = document.querySelector("iframe");
      assert.ok(frame);
      assert.equal(frame.getAttribute("src"), casePreviewUrl(medium));
      if (medium === "animation") {
        assert.match(frame.getAttribute("src"), /zhihu-motion-20260910\/$/);
      } else {
        assert.ok(frame.getAttribute("src").endsWith(`&mode=${mode}`));
        assert.match(frame.getAttribute("src"), /zhihu-window-20260908/);
      }
      assert.match(frame.getAttribute("title"), /窗口期可能只剩五年/);
      assert.equal(frame.getAttribute("allow"), "fullscreen");
      assert.equal(
        document.querySelectorAll('.z-case-modes button[aria-pressed="true"]')
          .length,
        1,
      );
      assert.doesNotMatch(dialog, /autoPlay|autoplay|平均数/);
    }
    const opening = questions.find((q) => q.id === "entry");
    assert.deepEqual(
      opening.options.map((o) => o.value),
      ["story", "analysis", "map", "question", "adaptive"],
    );
    for (const option of opening.options) {
      assert.equal(
        renderToStaticMarkup(
          createElement(ChoicePreview, {
            question: "entry",
            value: option.value,
          }),
        ),
        "",
      );
      assert.ok(!option.detail);
      assert.doesNotMatch(option.label, /平均|读书|中位数/);
    }
    const onboarding = await readFile(
      "components/learning-onboarding.tsx",
      "utf8",
    );
    assert.match(onboarding, /z-onboarding-entry/);
    assert.doesNotMatch(
      onboarding.split("export function Onboarding")[1],
      /\["primary", "entry"/,
    );
    const lesson = {
      id: "a".repeat(32),
      formats: ["video"],
      status: "ready",
      media: { videoReady: true },
      createdAt: "2026-09-08T00:00:00Z",
      title: "用户自己的文章",
    };
    const card = renderToStaticMarkup(
      createElement(LessonCard, { lesson, onOpen() {} }),
    );
    assert.ok(card.includes(`/lessons/${lesson.id}/media/poster.jpg`));
    assert.ok(card.includes("用户自己的文章"));
    assert.doesNotMatch(card, /平均数|读书量/);
    const pending = renderToStaticMarkup(
      createElement(LessonCard, {
        lesson: { ...lesson, media: {} },
        onOpen() {},
      }),
    );
    assert.match(pending, /learning-paths-v1.webp/);
  } finally {
    await server.close();
  }
});
test("concise settings preserve the full questionnaire and explicit save boundaries", async () => {
  const server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { SkillEditor, Onboarding } = await server.ssrLoadModule(
      "/components/learning-onboarding.tsx",
    );
    const { Workbench, LearningLibrary } = await server.ssrLoadModule(
      "/components/learning-workbench.tsx",
    );
    const profile = buildProfile({
      primary: "video",
      extras: ["reading", "audio"],
    });
    const before = JSON.stringify(profile);
    const html = renderToStaticMarkup(
      createElement(SkillEditor, {
        profile,
        existing: true,
        onSave() {},
        onBack() {},
        onRetake() {},
      }),
    );
    const { document } = parseHTML(html);
    assert.equal(
      document.querySelector(".z-profile-summary").children.length,
      3,
    );
    assert.equal(
      document.querySelector(".z-profile-rules").hasAttribute("open"),
      false,
    );
    assert.equal(
      document.querySelectorAll(".z-rule").length,
      profile.rules.length,
    );
    assert.equal(document.querySelectorAll(".z-profile-visual").length, 0);
    for (const copy of [
      "保存并开始学习",
      "查看与编辑学习规则",
      "下载 Skill",
      "重新做问卷",
    ])
      assert.ok(html.includes(copy), copy);
    assert.ok(!html.includes("按偏好定制，不是能力测评。保存后生效。"));

    const workbench = renderToStaticMarkup(
      createElement(Workbench, {
        profile,
        lessons: [],
        onOpen() {},
        onGenerated() {},
        onProfile() {},
        onLibrary() {},
      }),
    );
    const work = parseHTML(workbench).document;
    assert.match(workbench, /演示模式/);
    assert.doesNotMatch(workbench, /平均数|为我制作这篇/);
    assert.equal(work.querySelectorAll(".z-article-case").length, 0);
    assert.match(work.querySelector(".z-recent").textContent, /上回读到/);
    assert.doesNotMatch(
      await readFile("components/learning-workbench.tsx", "utf8"),
      /sources\/sample/,
    );
    const settings = work.querySelector(".z-temporary");
    assert.ok(settings);
    assert.equal(settings.querySelectorAll("select").length, 4);
    assert.equal(settings.querySelectorAll("select[disabled]").length, 3);
    assert.equal(
      settings
        .querySelector("select:not([disabled])")
        .querySelectorAll("option").length,
      6,
    );
    assert.ok(work.querySelector('[aria-controls="demo-formats"]'));
    assert.ok(work.querySelector('.z-full-package input[type="checkbox"]'));
    assert.match(
      work.querySelector(".z-full-package").textContent,
      /体验全部形式/,
    );
    assert.equal(work.querySelectorAll(".z-current-profile").length, 0);
    assert.equal(
      work.querySelectorAll(".z-composer .z-format-preview").length,
      0,
    );
    for (const copy of ["演示模式", "预置学习作品", "开始体验"])
      assert.ok(workbench.includes(copy), copy);
    assert.doesNotMatch(workbench, /把想读懂的，放在这里|输入任意内容，体验/);
    assert.equal(work.querySelectorAll(".z-page-heading p").length, 1);
    assert.equal(work.querySelectorAll(".z-character-count").length, 0);
    assert.equal(
      JSON.stringify(profile),
      before,
      "view rendering does not mutate the saved profile",
    );

    const questionnaire = renderToStaticMarkup(
      createElement(Onboarding, {
        initial: profile.answers,
        onSave() {},
        onCancel() {},
      }),
    );
    assert.equal(questions.length, 8);
    assert.equal(questions.filter((q) => q.multiple).length, 2);
    assert.match(questionnaire, /随时可改/);
    assert.doesNotMatch(questionnaire, /不判断能力/);
    const goals = questions.find((q) => q.id === "goal");
    assert.match(
      goals.options.find((o) => o.value === "remember").detail,
      /过几天/,
    );
    assert.match(
      goals.options.find((o) => o.value === "apply").detail,
      /实际问题/,
    );
    assert.match(
      questions.find((q) => q.id === "interaction").help,
      /不答题也能看完/,
    );

    const library = renderToStaticMarkup(
      createElement(LearningLibrary, { lessons: [], onOpen() {}, onAdd() {} }),
    );
    assert.doesNotMatch(library, /自动保存在这里/);
    assert.match(library, /从第一篇开始/);
    assert.match(library, /添加一篇内容/);
    assert.match(library, /按标题搜索作品/);
  } finally {
    await server.close();
  }
});
test("main product renders all seven study modes from a single private lesson", async () => {
  const server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { LessonView } = await server.ssrLoadModule(
      "/components/learning-lesson.tsx",
    );
    const chapters = [1, 2, 3].map((i) => ({
      id: `s${i}`,
      title: `真实内容章节${i}`,
      kind: "解释",
      body: "具体内容与来源解释",
      narration: "视频解释",
      audioNarration: "独立听读解释",
      sourceIds: ["p1"],
      takeaway: "带走具体判断",
      premise: "判断需要条件",
      recallQuestion: "判断依据是什么？",
      visual: {
        type: "chain",
        relation: "条件",
        items: [
          { label: "前提", detail: "假设成立" },
          { label: "结论", detail: "有条件判断" },
        ],
      },
    }));
    const lesson = {
      id: "a".repeat(32),
      title: "作品",
      status: "ready",
      formats: ["video", "reading", "audio", "animation"],
      progress: 100,
      stage: "已完成",
      profile: buildProfile({}),
      media: {
        status: "ready",
        videoReady: true,
        audioReady: true,
        audioFile: "listen.m4a",
        trackReady: true,
        duration: 90,
        audioDuration: 100,
        scenes: chapters.map((_, i) => ({ start: i * 30, end: (i + 1) * 30 })),
      },
      result: {
        title: "全文学习作品",
        lead: "原文的关键问题",
        schemaVersion: 2,
        chapters,
        adaptation: ["按规则讲解"],
        takeaways: ["区分假设"],
        quiz: [],
        study: {
          version: 2,
          overview: {
            title: "全景结构",
            groups: [
              {
                title: "知识组合",
                description: "展开",
                chapterIds: ["s1", "s2", "s3"],
              },
            ],
            connections: [],
          },
          glossary: [],
          scenarios: [],
          practiceNote: "本文无需推演",
          boundaries: ["假设不是事实"],
        },
      },
    };
    for (const [mode, expected] of Object.entries({
      video: "video.mp4",
      audio: "listen.m4a",
      reading: "完整图文",
      diagrams: "下载本章图解",
      overview: "全景结构",
      practice: "本文无需推演",
      animation: "个性化网页讲解",
    })) {
      const html = renderToStaticMarkup(
        createElement(LessonView, {
          initial: { ...lesson, studyState: { mode } },
          onBack() {},
          onUpdate() {},
          notify() {},
        }),
      );
      assert.ok(html.includes(expected), mode);
      assert.ok(html.includes("拾句"));
      assert.ok(html.includes("导出"));
      const select = parseHTML(html).document.querySelector(
        'select[aria-label="学习形式"]',
      );
      assert.equal(select.querySelectorAll("option").length, 7);
      assert.equal(select.querySelector("option[selected]").value, mode);
      assert.equal(
        parseHTML(html).document.querySelectorAll(".z-medium-tabs").length,
        0,
      );
      assert.doesNotMatch(html, /×\s*OpenMAIC/);
      assert.doesNotMatch(
        html,
        /AI 配音讲解 · 字幕为近似对齐|不依赖画面的独立听读|反馈不会自动改写/,
      );
    }
    const preferred = renderToStaticMarkup(
      createElement(LessonView, {
        initial: {
          ...lesson,
          studyState: {},
          formats: ["video", "reading"],
          profile: {
            ...lesson.profile,
            answers: { ...lesson.profile?.answers, primary: "reading" },
          },
        },
        onBack() {},
        onUpdate() {},
        notify() {},
      }),
    );
    const preferredDoc = parseHTML(preferred).document;
    assert.equal(
      preferredDoc.querySelector("option[selected]").value,
      "reading",
      "primary preference wins over generation order",
    );
    assert.equal(
      preferredDoc.querySelector(".z-other-formats").hasAttribute("open"),
      false,
    );
    assert.match(preferred, /换一种方式看/);
    const legacy = structuredClone(lesson);
    delete legacy.result.schemaVersion;
    delete legacy.result.study;
    const html = renderToStaticMarkup(
      createElement(LessonView, {
        initial: legacy,
        onBack() {},
        onUpdate() {},
        notify() {},
      }),
    );
    assert.ok(html.includes("生成新版，保留原版"));
    const select = parseHTML(html).document.querySelector(
      'select[aria-label="学习形式"]',
    );
    assert.equal(select.querySelectorAll("option").length, 5);
    assert.equal(
      select.querySelector("option[selected]").value,
      "video",
      "new works use the preferred first format",
    );
  } finally {
    await server.close();
  }
});
