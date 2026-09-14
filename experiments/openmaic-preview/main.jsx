import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SlideCanvas } from "@openmaic/renderer";
import lesson from "@lesson";
import timing from "@timing";
import { locateSegment, captionAt } from "./contract.mjs";
import { ResponsiveDiagram, StudyDialog } from "./study-ui.jsx";
import { InlineDiagram, Overview, Practice } from "./format-views.jsx";
import { clampTime, playbackRates } from "./learning-formats.mjs";
import "./style.css";
import "./formats.css";
import { Brand } from "../../components/learning-ui";
import { ReadingCompanion } from "../../components/reading-companion";
import { useExperienceShortcut } from "../../components/use-experience-shortcut";
import "../../app/study.css";
import "./room.css";
import { narrativeSlide } from "./narrative-slide.mjs";
import { chapters as articleChapters } from "./lessons/window-five-years/content.mjs";
import originalText from "./lessons/window-five-years/original.txt?raw";
import { zhixingEntry } from "../../lib/zhixing";

const query = new URLSearchParams(location.search);
const capture = query.has("capture"),
  still = query.has("still");
const clock = (value) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
const duration = timing.segments.at(-1).end;
const sceneStarts = lesson.scenes.map(
  (_, i) => timing.segments.find((s) => s.scene === i).start,
);
const title = lesson.title;
// Version visual assets so a cached blue video cannot outlive the new theme.
const visualAsset = (path) => `${path}?v=rice-20260910`;
const videoAsset = (file) =>
  title === "窗口期可能只剩五年"
    ? `../zhihu-motion-20260910/${file}`
    : visualAsset(`./media/${file}`);
const sourceNote =
  lesson.sourceNote || "示例里的五人读书组及阅读量均为虚构数据。";
const thesis =
  lesson.thesis || "平均数没有算错。它回答的问题，未必是你想问的那个。";
const preferences = lesson.preference || [
  "先讲故事",
  "图解配讲解",
  "不中途提问",
];
function scrollToContent(selector) {
  const target = document.querySelector(selector);
  if (!target) return;
  const toolbarHeight =
    document.querySelector(".study-toolbar")?.offsetHeight || 0;
  window.scrollTo({
    top: Math.max(
      0,
      window.scrollY + target.getBoundingClientRect().top - toolbarHeight - 12,
    ),
    behavior: "instant",
  });
}

function App() {
  useExperienceShortcut("/zhijing");
  const [time, setTime] = useState(() => {
    if (capture || query.get("experience") !== "demo") return 0;
    if (query.has("at")) return clampTime(Number(query.get("at")), duration);
    try {
      return clampTime(
        Number(localStorage.getItem("zhijing-demo-time")) || 0,
        duration,
      );
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    if (capture || query.get("experience") !== "demo") return;
    try {
      localStorage.setItem("zhijing-demo-time", String(time));
    } catch {}
  }, [time]);
  const [mode, setMode] = useState(() => {
    const requested = query.get("mode");
    const allowed = [
      "slides",
      "reading",
      ...(timing.voiceReady ? ["video", "audio"] : []),
      ...(lesson.learningFormats ? ["overview", "practice"] : []),
    ];
    return allowed.includes(requested)
      ? requested
      : timing.voiceReady
        ? "video"
        : "slides";
  });
  const [playbackRate, setPlaybackRate] = useState(1);
  useEffect(() => {
    if (mode !== "reading" || !time || capture) return;
    const chapter = locateSegment(timing.segments, time).scene;
    const frame = requestAnimationFrame(() =>
      scrollToContent(`#reading-${lesson.scenes[chapter].id}`),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (capture || query.get("experience") !== "demo") return;
    try {
      localStorage.setItem("zhijing-demo-mode", mode);
    } catch {}
  }, [mode]);
  const [scenarioAnswers, setScenarioAnswers] = useState({});
  const [cardIndex, setCardIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [practiceView, setPracticeView] = useState("scenarios");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [sidebar, setSidebar] = useState("chapters");
  const [stageHeight, setStageHeight] = useState(640);
  const video = useRef(null),
    audio = useRef(null),
    playerBox = useRef(null),
    readingFrame = useRef(0);
  const current = locateSegment(timing.segments, time);
  const index = current.scene,
    scene = lesson.scenes[index];
  useEffect(() => {
    const container = document.querySelector(".full-original .source-panel");
    const target = container?.querySelector("mark");
    if (target)
      container.scrollTop +=
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        60;
  }, [index, mode]);
  const sourcePanel = (
    <div className="source-panel full-original-text">
      {originalText.split("\n").map((line, i) => {
        const quote = scene.sourceAnchor?.quote;
        const at = quote ? line.indexOf(quote) : -1;
        return (
          <p key={i}>
            {at >= 0 ? (
              <>
                {line.slice(0, at)}
                <mark className="source-highlight">{quote}</mark>
                {line.slice(at + quote.length)}
              </>
            ) : (
              line
            )}
          </p>
        );
      })}
    </div>
  );
  const excerptPanel = (
    <div className="source-panel" key={scene.id}>
      <h3>{scene.title}</h3>
      {scene.sourceAnchor ? (
        <>
          <blockquote>
            {scene.sourceAnchor.context?.split(scene.sourceAnchor.quote)[0]}
            <mark className="source-highlight">{scene.sourceAnchor.quote}</mark>
            {scene.sourceAnchor.context
              ?.split(scene.sourceAnchor.quote)
              .slice(1)
              .join(scene.sourceAnchor.quote)}
          </blockquote>
          {lesson.sourceMeta?.url && (
            <a
              className="source-link"
              href={`${lesson.sourceMeta.url}#:~:text=${encodeURIComponent(scene.sourceAnchor.quote)}`}
              target="_blank"
              rel="noreferrer"
            >
              阅读全文 ↗
            </a>
          )}
        </>
      ) : (
        <p>这一章暂未关联原文片段。</p>
      )}
      <div className="source-navigation">
        <button
          disabled={index === 0}
          onClick={() => seek(sceneStarts[index - 1])}
        >
          上一段
        </button>
        <button
          disabled={index === lesson.scenes.length - 1}
          onClick={() => seek(sceneStarts[index + 1])}
        >
          下一段
        </button>
      </div>
    </div>
  );
  const effects =
    !still && current.effect
      ? {
          [current.effect.type]: {
            elementId: current.effect.elementId,
            dimness: 0.22,
            color: "#b3402a",
            opacity: 0.055,
            borderWidth: 0,
            animated: false,
          },
        }
      : {};
  useEffect(() => {
    document.title = `${title} · 知径`;
    if (!capture) return;
    document.body.classList.add("capture");
    window.renderAt = (at) => {
      flushSync(() => setTime(Math.max(0, Math.min(at, duration - 0.001))));
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    };
    window.previewReady = true;
    return () => {
      delete window.renderAt;
      delete window.previewReady;
    };
  }, []);
  useEffect(() => {
    if (capture || !playerBox.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageHeight(entry.contentRect.height),
    );
    observer.observe(playerBox.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (mode !== "reading" || capture) return;
    const update = () => {
      if (readingFrame.current || document.querySelector("dialog[open]"))
        return;
      readingFrame.current = requestAnimationFrame(() => {
        readingFrame.current = 0;
        const sections = [...document.querySelectorAll(".reading-chapter")];
        let active = 0;
        sections.forEach((section, i) => {
          const threshold =
            document.querySelector(".study-toolbar").getBoundingClientRect()
              .bottom + 32;
          if (section.getBoundingClientRect().top <= threshold) active = i;
        });
        setTime((previous) =>
          locateSegment(timing.segments, previous).scene === active
            ? previous
            : sceneStarts[active],
        );
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      cancelAnimationFrame(readingFrame.current);
      readingFrame.current = 0;
    };
  }, [mode]);
  useEffect(() => {
    if (capture) return;
    const list = document.querySelector(".chapter-list");
    const active = list?.querySelector(".chapter.active");
    if (!active || !list.clientHeight) return;
    const item = active.getBoundingClientRect(),
      bounds = list.getBoundingClientRect();
    if (item.bottom > bounds.bottom)
      list.scrollTop += item.bottom - bounds.bottom + 8;
    else if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top + 8;
  }, [index]);
  const seek = (at) => {
    const bounded = clampTime(at, duration);
    setTime(bounded);
    if (video.current) video.current.currentTime = bounded;
    if (audio.current) audio.current.currentTime = bounded;
  };
  const switchMode = (next) => {
    if (next === mode) return;
    const media =
      mode === "video"
        ? video.current
        : mode === "audio"
          ? audio.current
          : null;
    const position =
      media && media.readyState > 0
        ? clampTime(media.currentTime, duration)
        : time;
    const chapter = locateSegment(timing.segments, position).scene;
    video.current?.pause();
    audio.current?.pause();
    flushSync(() => {
      setTime(position);
      setMode(next);
    });
    setError("");
    requestAnimationFrame(() => {
      if (next === "reading")
        scrollToContent(`#reading-${lesson.scenes[chapter].id}`);
      else if (window.scrollY > 250) scrollToContent(".player");
    });
  };
  const chooseChapter = (i) => {
    if (mode === "practice") {
      setDialog(null);
      readChapter(lesson.scenes[i].id);
      return;
    }
    seek(sceneStarts[i]);
    setDialog(null);
    requestAnimationFrame(() => {
      if (mode === "reading")
        scrollToContent(`#reading-${lesson.scenes[i].id}`);
      else scrollToContent(".player");
    });
  };
  const readChapter = (id) => {
    const target = lesson.scenes.findIndex((s) => s.id === id);
    if (target < 0) return;
    video.current?.pause();
    audio.current?.pause();
    seek(sceneStarts[target]);
    setMode("reading");
    setError("");
    requestAnimationFrame(() => scrollToContent(`#reading-${id}`));
  };
  const expandVideo = async () => {
    try {
      if (video.current?.webkitEnterFullscreen)
        video.current.webkitEnterFullscreen();
      else if (video.current?.requestFullscreen)
        await video.current.requestFullscreen();
      else setError("当前浏览器不支持全屏，可切到图解查看清晰大字版。");
    } catch {
      setError("暂时无法进入全屏，可切到图解查看清晰大字版。");
    }
  };
  const chapterButtons = lesson.scenes.map((s, i) => (
    <button
      key={s.id}
      type="button"
      className={`chapter${i === index ? " active" : ""}`}
      aria-current={i === index ? "step" : undefined}
      onClick={() => chooseChapter(i)}
    >
      <span className="chapter-no">{String(i + 1).padStart(2, "0")}</span>
      <span className="chapter-title">{s.title}</span>
      <span className="chapter-time">{clock(sceneStarts[i])}</span>
    </button>
  ));
  const canvas = (
    <div className="canvas">
      <SlideCanvas
        slide={
          !capture &&
          lesson.sourceMeta &&
          articleChapters[index]?.id === scene.id
            ? narrativeSlide(
                articleChapters[index],
                index,
                lesson.scenes.length,
              )
            : scene.content.canvas
        }
        effects={effects}
        chrome={false}
      />
    </div>
  );
  const audioPlayer = (
    <div className="audio-player">
      <audio
        ref={audio}
        controls
        preload="metadata"
        src="./media/audio.m4a"
        aria-label="完整讲解音频"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = time;
          e.currentTarget.playbackRate = playbackRate;
        }}
        onError={() => setError("配音未能加载，文字梳理和图解仍可阅读。")}
      />
      <div className="audio-tools">
        <button type="button" onClick={() => seek(time - 15)}>
          后退 15 秒
        </button>
        <button type="button" onClick={() => seek(time + 15)}>
          前进 15 秒
        </button>
        <label>
          倍速
          <select
            aria-label="音频播放速度"
            value={playbackRate}
            onChange={(e) => {
              const rate = Number(e.target.value);
              setPlaybackRate(rate);
              if (audio.current) audio.current.playbackRate = rate;
            }}
          >
            {playbackRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
  if (capture)
    return (
      <div className="capture-layout">
        {canvas}
        <div className="capture-caption">
          {still ? scene.takeaway || thesis : captionAt(current, time)}
        </div>
        {!still && (
          <div
            className="capture-progress"
            style={{ width: `${(time / duration) * 100}%` }}
          />
        )}
      </div>
    );
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/zhijing/">
          <Brand />
        </a>
        {timing.voiceReady && (
          <button
            className="download-trigger"
            type="button"
            onClick={() => setDialog("downloads")}
          >
            下载作品 ↓
          </button>
        )}
      </header>
      <main>
        <div className="heading">
          <div>
            <h1>{title}</h1>
            {query.get("experience") === "demo" && (
              <p className="lesson-meta">演示</p>
            )}
          </div>
        </div>
        <div className="study-toolbar">
          <button
            className="mobile-source-trigger"
            onClick={() => {
              video.current?.pause();
              audio.current?.pause();
              setDialog("source");
            }}
          >
            对照原文
          </button>
          <div
            className={`view-tabs${lesson.learningFormats ? " extended-tabs" : ""}`}
            role="group"
            aria-label="观看方式"
          >
            {(lesson.learningFormats
              ? [
                  ["video", "视频"],
                  ["slides", "图解"],
                  ["audio", "音频"],
                  ["reading", "图文"],
                  ["overview", "全景图"],
                  ["practice", "互动"],
                ]
              : [
                  ["video", "观看讲解"],
                  ["slides", "逐页看图"],
                  ["audio", "只听音频"],
                  ["reading", "文字梳理"],
                ]
            ).map(([key, label]) => (
              <button
                key={key}
                data-mode={key}
                type="button"
                disabled={
                  !timing.voiceReady && ["audio", "video"].includes(key)
                }
                aria-pressed={mode === key}
                onClick={() => switchMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="mobile-chapter-trigger"
            type="button"
            onClick={() => setDialog("chapters")}
            aria-label="打开章节目录"
          >
            <span>
              {String(index + 1).padStart(2, "0")} / {lesson.scenes.length}{" "}
              <strong>{scene.title}</strong>
            </span>
            <span>目录 ☰</span>
          </button>
        </div>
        <section
          className="lesson-layout"
          aria-label="学习作品"
          style={{ "--stage-height": `${stageHeight}px` }}
        >
          <aside className="full-original" aria-label="作者原文">
            <h2>原文</h2>
            {sourcePanel}
          </aside>
          <div className="player-column">
            <div className={`player mode-${mode}`} ref={playerBox}>
              {mode === "video" && (
                <video
                  ref={video}
                  controls
                  playsInline
                  preload="metadata"
                  poster={videoAsset("poster.jpg")}
                  aria-label={`${title}讲解视频`}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    if (time > 0) e.currentTarget.currentTime = time;
                  }}
                  onError={() =>
                    setError("视频未能加载，可以切到图解或文字继续学习。")
                  }
                >
                  <source src={videoAsset("video.mp4")} type="video/mp4" />
                  <track
                    kind="captions"
                    src="./media/captions.vtt"
                    srcLang="zh"
                    label="中文"
                  />
                </video>
              )}
              {mode === "slides" && (
                <>
                  <div className={scene.diagram ? "landscape-diagram" : ""}>
                    {canvas}
                  </div>
                  {scene.diagram && (
                    <ResponsiveDiagram
                      diagram={scene.diagram}
                      title={scene.title}
                    />
                  )}
                  <div className="spoken">{current.text}</div>
                  <div className="slide-controls">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => seek(sceneStarts[index - 1])}
                    >
                      上一页
                    </button>
                    <span>
                      {index + 1} / {lesson.scenes.length}
                    </span>
                    <button
                      type="button"
                      disabled={index === lesson.scenes.length - 1}
                      onClick={() => seek(sceneStarts[index + 1])}
                    >
                      下一页
                    </button>
                    <button
                      type="button"
                      className="expand"
                      onClick={() => setDialog("diagram")}
                    >
                      放大画面
                    </button>
                  </div>
                  {timing.voiceReady ? (
                    audioPlayer
                  ) : (
                    <p className="data-note">图文已整理，配音正在制作。</p>
                  )}
                </>
              )}
              {mode === "audio" && (
                <div className="audio-view">
                  <h2>{scene.title}</h2>
                  <p>{current.text}</p>
                  {audioPlayer}
                  <div className="audio-chapters">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => seek(sceneStarts[index - 1])}
                    >
                      上一章
                    </button>
                    <button
                      type="button"
                      onClick={() => seek(sceneStarts[index])}
                    >
                      重听本章
                    </button>
                    <button
                      type="button"
                      disabled={index === lesson.scenes.length - 1}
                      onClick={() => seek(sceneStarts[index + 1])}
                    >
                      下一章
                    </button>
                  </div>
                  <details className="format-details" key={scene.id}>
                    <summary>本章讲稿</summary>
                    <div className="audio-transcript">
                      {timing.segments
                        .filter((s) => s.scene === index)
                        .map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            aria-current={s === current ? "true" : undefined}
                            title="跳到这一段（近似时间）"
                            onClick={() => seek(s.start)}
                          >
                            <span>{clock(s.start)}</span>
                            {s.text}
                          </button>
                        ))}
                    </div>
                  </details>
                </div>
              )}
              {mode === "reading" && (
                <div className="long-reading">
                  <h2>{thesis}</h2>
                  {lesson.scenes.map((s, i) => (
                    <section
                      id={`reading-${s.id}`}
                      key={s.id}
                      className="reading-chapter"
                    >
                      <h3>{s.title}</h3>
                      {s.diagram && <InlineDiagram diagram={s.diagram} />}
                      {(
                        s.reading ||
                        s.actions
                          .filter((a) => a.type === "speech")
                          .map((a) => a.text)
                      ).map((p, n) => (
                        <p key={n}>{p}</p>
                      ))}
                      {s.takeaway && <p className="key-line">{s.takeaway}</p>}
                      {s.premise && (
                        <details>
                          <summary>这一步成立，需要什么条件？</summary>
                          <p>{s.premise}</p>
                        </details>
                      )}
                    </section>
                  ))}
                </div>
              )}
              {mode === "overview" && lesson.learningFormats && (
                <Overview
                  lesson={lesson}
                  onRead={readChapter}
                  activeChapter={scene.id}
                  onSelect={(id) => {
                    const i = lesson.scenes.findIndex((s) => s.id === id);
                    if (i >= 0 && i !== index) seek(sceneStarts[i]);
                  }}
                />
              )}
              {mode === "practice" && lesson.learningFormats && (
                <Practice
                  lesson={lesson}
                  onRead={readChapter}
                  answers={scenarioAnswers}
                  onAnswer={(id, value) =>
                    setScenarioAnswers((previous) => ({
                      ...previous,
                      [id]: value,
                    }))
                  }
                  cardIndex={cardIndex}
                  onCard={(next) => {
                    setCardIndex(next);
                    setCardRevealed(false);
                  }}
                  revealed={cardRevealed}
                  onReveal={setCardRevealed}
                  view={practiceView}
                  onView={setPracticeView}
                  scenarioIndex={scenarioIndex}
                  onScenario={setScenarioIndex}
                />
              )}
            </div>
            {mode === "video" && (
              <div className="player-actions">
                <span>
                  {index + 1} / {lesson.scenes.length} · {scene.title}
                </span>
                <button type="button" onClick={expandVideo}>
                  全屏观看 ⛶
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <aside className="chapters" aria-label="讲解片段" hidden>
            <div className="chapter-heading">
              <div className="source-tabs" role="group" aria-label="目录与原文">
                <button
                  aria-pressed={sidebar === "chapters"}
                  onClick={() => setSidebar("chapters")}
                >
                  目录
                </button>
                <button
                  aria-pressed={sidebar === "source"}
                  onClick={() => setSidebar("source")}
                >
                  原文
                </button>
              </div>
            </div>
            {sidebar === "source" ? (
              sourcePanel
            ) : (
              <nav className="chapter-list" aria-label="章节导航">
                {chapterButtons}
              </nav>
            )}
          </aside>
        </section>
        <section className="reading" aria-label="补充学习资料">
          {lesson.glossary && (
            <details>
              <summary>术语速查</summary>
              <div className="reading-body glossary">
                {lesson.glossary.map(([term, definition]) => (
                  <div key={term}>
                    <h3>{term}</h3>
                    <p>{definition}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          {lesson.checks && (
            <details>
              <summary>哪些是事实，哪些是推演？</summary>
              <div className="reading-body">
                <p>
                  只核验几个关键说法，不是对整篇文章的事实认证。原文写作语境是
                  2026 年 2 月；下方后续研究单独标明日期。
                </p>
                {lesson.checks.map((c) => (
                  <section className="claim-check" key={c.label}>
                    <span className="status-label">{c.status}</span>
                    <h3>{c.label}</h3>
                    <p>{c.text}</p>
                    {c.links.map((l) => (
                      <a
                        className="source-link"
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {l.title} ↗
                      </a>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          )}
          {lesson.reviewQuestions && (
            <details>
              <summary>小练习（可选）</summary>
              <div className="reading-body">
                {lesson.reviewQuestions.map((q) => (
                  <section className="self-check" key={q.question}>
                    <h3>{q.question}</h3>
                    <details>
                      <summary>查看参考理解</summary>
                      <p>{q.answer}</p>
                    </details>
                  </section>
                ))}
              </div>
            </details>
          )}
          <details>
            <summary>完整讲稿</summary>
            <div className="reading-body">
              {lesson.scenes.map((s, i) => (
                <section key={s.id}>
                  <h2>{s.title}</h2>
                  {timing.segments
                    .filter((seg) => seg.scene === i)
                    .map((seg, n) => (
                      <p key={n}>{seg.text}</p>
                    ))}
                </section>
              ))}
            </div>
          </details>
          <details>
            <summary>文章来源</summary>
            <div className="reading-body">
              <p>{sourceNote}</p>
              {lesson.sourceMeta ? (
                <>
                  <h2>{lesson.sourceMeta.title}</h2>
                  <p>
                    {lesson.sourceMeta.author} · {lesson.sourceMeta.context}
                  </p>
                  <p>
                    {lesson.sourceMeta.acquisition}
                    。原文栏展示用户提供的完整文本。
                  </p>
                  <a
                    className="source-link"
                    href={lesson.sourceMeta.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    用户提供的原始链接 ↗
                  </a>
                </>
              ) : (
                <>
                  <h2>原文</h2>
                  {lesson.source.split("\n\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </>
              )}
            </div>
          </details>
        </section>
        {dialog === "downloads" && (
          <StudyDialog title="下载学习作品" onClose={() => setDialog(null)}>
            <section className="downloads" aria-label="带走学习作品">
              <div className="download-links">
                <a download href={videoAsset("video.mp4")}>
                  讲解视频 ↓
                </a>
                <a download href="./media/audio.m4a">
                  完整音频 ↓
                </a>
                {lesson.sourceMeta && (
                  <>
                    <a download href="./learning-notes.md">
                      学习笔记 ↓
                    </a>
                    <a download href="./learning-skill.md">
                      学习 Skill ↓
                    </a>
                    <a download href="./media/captions.vtt">
                      中文字幕 ↓
                    </a>
                    {lesson.learningFormats && (
                      <a download href="./learning-formats.md">
                        关系图与复习卡 ↓
                      </a>
                    )}
                  </>
                )}
              </div>
              {lesson.sourceMeta && (
                <details>
                  <summary>下载章节图解</summary>
                  <div className="diagram-links">
                    {lesson.scenes.map((s, i) => (
                      <a
                        key={s.id}
                        download
                        href={visualAsset(`./diagrams/chapter-${i + 1}.png`)}
                      >
                        {String(i + 1).padStart(2, "0")} {s.title} ↓
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </section>
          </StudyDialog>
        )}
        {dialog === "source" && (
          <StudyDialog
            title="对照原文"
            className="source-dialog"
            onClose={() => setDialog(null)}
          >
            {sourcePanel}
          </StudyDialog>
        )}
        {dialog === "chapters" && (
          <StudyDialog
            title="章节目录"
            className="chapter-dialog"
            onClose={() => setDialog(null)}
          >
            <nav aria-label="选择章节">{chapterButtons}</nav>
          </StudyDialog>
        )}
        {dialog === "preferences" && (
          <StudyDialog title="本次讲解设置" onClose={() => setDialog(null)}>
            <p className="dialog-note">
              这份作品使用示例偏好，不是对你的测评结果。
            </p>
            <div className="preference">
              {preferences.map((p) => (
                <strong key={p}>{p}</strong>
              ))}
            </div>
            {lesson.profile.rules.map((r) => (
              <p className="preference-rule" key={r.id}>
                <strong>{r.title}</strong>
                {r.instruction}
              </p>
            ))}
          </StudyDialog>
        )}
        {dialog === "diagram" && (
          <StudyDialog
            title={scene.title}
            className="diagram-dialog"
            onClose={() => setDialog(null)}
          >
            <div className="diagram-pan">{canvas}</div>
            {scene.takeaway && <p className="dialog-note">{scene.takeaway}</p>}
          </StudyDialog>
        )}
        <footer>
          <a href="/zhijing/">回到书房</a>
          <a href="./THIRD-PARTY-NOTICES.txt">开源说明</a>
        </footer>
      </main>
      {!capture && (
        <ReadingCompanion
          lifeHref={zhixingEntry("/zhijing", {
            article: "window-five-years",
            chapter: scene.id,
            mode,
            at: time,
          })}
          onLife={() => {
            video.current?.pause();
            audio.current?.pause();
          }}
          target={null}
          onSource={() => {}}
          studyContext={{
            id: scene.id,
            title: scene.title,
            quote: scene.sourceAnchor?.context,
          }}
          onOriginal={() => {
            if (window.innerWidth <= 1000) {
              video.current?.pause();
              audio.current?.pause();
              setDialog("source");
            } else {
              const panel = document.querySelector(
                ".full-original .source-panel",
              );
              const mark = panel?.querySelector("mark");
              if (mark)
                panel.scrollTop +=
                  mark.getBoundingClientRect().top -
                  panel.getBoundingClientRect().top -
                  60;
            }
          }}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
