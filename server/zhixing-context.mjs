import fs from "node:fs";
import { config, AppError } from "./config.mjs";
import { ownedLesson, getSource } from "./store.mjs";
import {
  article,
  chapters,
} from "../experiments/openmaic-preview/lessons/window-five-years/content.mjs";

const original = fs.readFileSync(
  new URL(
    "../experiments/openmaic-preview/lessons/window-five-years/original.txt",
    import.meta.url,
  ),
  "utf8",
);
const modes = ["video", "slides", "audio", "reading", "overview", "practice"];

// Canonical content comes from our edition or the visitor's owned lesson, never URL text.
export function lifeContext(user, input = {}) {
  if (!input || typeof input !== "object")
    throw new AppError("文章信息不正确。");
  if (input.article === "window-five-years") {
    const mode = modes.includes(input.mode) ? input.mode : "video";
    const at = Math.min(408.79, Math.max(0, Number(input.at) || 0));
    const chapter =
      chapters.find((c) => c.id === input.chapter)?.id || chapters[0].id;
    return {
      key: "demo:window-five-years",
      title: article.title,
      url: article.url,
      author: article.author,
      version: "window-five-years-v1",
      chapter,
      mode,
      at,
      returnTo: `${config.basePath}/demo/zhihu-window-20260908/?experience=demo&resume=1&mode=${mode}&at=${at}`,
      evidence: chapters
        .filter((c) => original.includes(c.quote))
        .map((c) => ({
          id: c.id,
          title: c.title,
          quote: c.quote,
          interpretation: c.takeaway,
          kind: "作者观点与情景推演，未经独立核验",
          url: article.url,
        })),
    };
  }
  if (input.lessonId) {
    const row = ownedLesson(user, String(input.lessonId));
    const source = getSource(user, row.source_id);
    return {
      key: `lesson:${row.id}`,
      title: source.title,
      url: source.url,
      version: source.createdAt,
      chapter: "",
      mode: "",
      at: 0,
      returnTo: `${config.basePath}/?lesson=${row.id}`,
      evidence: source.blocks.slice(0, 60).map((b) => ({
        id: b.id,
        title: "原文段落",
        quote: b.text.slice(0, 1500),
        kind: "原文陈述，未经独立核验",
        url: source.url,
      })),
    };
  }
  if (input.article) throw new AppError("找不到这篇文章。", 404);
  return {
    key: "personal",
    title: "从身边的一件事开始",
    evidence: [],
    returnTo: `${config.basePath}/`,
  };
}
