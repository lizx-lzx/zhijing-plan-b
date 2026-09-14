"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileText,
  Headphones,
  List,
} from "lucide-react";
import type { Lesson, Medium, StudyMode } from "../lib/domain";
import {
  api,
  endpoint,
  ErrorNotice,
  Modal,
  Spinner,
  Visual,
} from "./learning-ui";
import { useStudyState } from "./use-study-state";
import { SourceReader } from "./source-reader";
import { ReadingCompanion } from "./reading-companion";

const modes: { id: StudyMode; label: string }[] = [
  { id: "video", label: "讲解视频" },
  { id: "reading", label: "完整图文" },
  { id: "diagrams", label: "逐章图解" },
  { id: "audio", label: "独立听读" },
  { id: "overview", label: "全文关系" },
  { id: "practice", label: "互动复习" },
  { id: "animation", label: "网页讲解" },
];
const clock = (t = 0) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function scrollTo(selector: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    if (el)
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY +
            el.getBoundingClientRect().top -
            (document.querySelector(".z-lesson-toolbar")?.clientHeight || 0) -
            16,
        ),
        behavior: "instant",
      });
  });
}

export function LessonView({
  initial,
  onBack,
  onUpdate,
  notify,
  onRegenerated,
}: {
  initial: Lesson;
  onBack: () => void;
  onUpdate: () => void;
  notify: (message: string) => void;
  onRegenerated?: (lesson: Lesson) => void;
}) {
  const [lesson, setLesson] = useState(initial);
  const [petTarget, setPetTarget] = useState<{
    paragraphIndex?: number;
    id: string;
    title: string;
    nonce: number;
  } | null>(null);
  const { state, patch, saved, flush } = useStudyState(
    initial.id,
    initial.studyState,
  );
  const [medium, setMedium] = useState<StudyMode>(
    initial.studyState?.mode ||
      initial.profile?.answers.primary ||
      initial.formats[0] ||
      "reading",
  );
  const [active, setActive] = useState(initial.studyState?.chapter || 0);
  const [dialog, setDialog] = useState<
    "source" | "chapters" | "downloads" | "notes" | null
  >(null);
  const [focus, setFocus] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [sourceExplanation, setSourceExplanation] = useState("");
  const [connectionError, setConnectionError] = useState(""),
    [rate, setRate] = useState(1),
    [time, setTime] = useState(0);
  const [practice, setPractice] = useState("scenarios"),
    [revealed, setRevealed] = useState(false),
    [transcript, setTranscript] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null),
    saveTick = useRef(0);
  const currentTime = useRef({
    video: initial.studyState?.videoTime || 0,
    audio: initial.studyState?.audioTime || 0,
  });
  const pending = ["queued", "working"].includes(lesson.status);
  const result = lesson.result,
    study = result?.study;
  const chapter =
    result?.chapters[Math.min(active, result.chapters.length - 1)];
  const legacyReady =
    lesson.media.status === "ready" &&
    !lesson.media.audioFile &&
    !result?.schemaVersion;
  const videoReady =
    lesson.media.videoReady ||
    (legacyReady && lesson.formats.includes("video"));
  const audioReady = lesson.media.audioReady || legacyReady;
  const audioFile = lesson.media.audioFile || "audio.m4a";
  const audioScenes = lesson.media.audioScenes || lesson.media.scenes || [];
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !result) return;
    resumed.current = true;
    if (initial.studyState?.mode === "reading" && initial.studyState.chapter)
      scrollTo(`#chapter-${result.chapters[initial.studyState.chapter]?.id}`);
  }, [result, initial.studyState]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const data = await api<{ lesson: Lesson }>(`/lessons/${initial.id}`);
        if (mounted) {
          setLesson(data.lesson);
          setConnectionError("");
          if (!["queued", "working"].includes(data.lesson.status)) onUpdate();
        }
      } catch {
        if (mounted)
          setConnectionError("连接暂时中断，内容与制作任务仍会保留。");
      }
    };
    void refresh();
    const timer = pending ? setInterval(() => void refresh(), 3500) : undefined;
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [initial.id, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (medium !== "reading") return;
    let frame = 0;
    const update = () => {
      if (frame || document.querySelector("dialog[open]")) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const threshold =
          (document.querySelector(".z-lesson-toolbar")?.getBoundingClientRect()
            .bottom || 0) + 40;
        let index = 0;
        document.querySelectorAll(".z-chapter").forEach((el, i) => {
          if (el.getBoundingClientRect().top <= threshold) index = i;
        });
        if (index !== active) {
          setActive(index);
          patch({ chapter: index });
        }
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, [medium, active, patch]);

  function source(ids: string[] = [], explanation = "") {
    setFocus(ids);
    setSourceExplanation(explanation);
    setDialog("source");
  }
  function track(at: number, lane: "video" | "audio", force = false) {
    currentTime.current[lane] = at;
    setTime(at);
    const scenes = lane === "audio" ? audioScenes : lesson.media.scenes || [];
    const index = scenes.findIndex((s) => at >= s.start && at < s.end);
    if (index >= 0) setActive(index);
    // This function only runs from media and click events, never during render.
    // eslint-disable-next-line react-hooks/purity
    const eventTime = Date.now();
    if (force || eventTime - saveTick.current > 5000) {
      saveTick.current = eventTime;
      patch({
        [lane === "audio" ? "audioTime" : "videoTime"]: at,
        ...(index >= 0 ? { chapter: index } : {}),
      });
    }
  }
  function seek(at: number, lane: "video" | "audio") {
    const el = lane === "audio" ? audio.current : video.current;
    const end =
      lane === "audio"
        ? lesson.media.audioDuration || lesson.media.duration || 900
        : lesson.media.duration || 900;
    const next = Math.max(0, Math.min(at, end - 0.01));
    if (el) el.currentTime = next;
    track(next, lane, true);
  }
  function switchMedium(next: StudyMode, index = active) {
    video.current?.pause();
    audio.current?.pause();
    setTranscript(false);
    if (next === "video" || next === "audio") {
      const scenes = next === "audio" ? audioScenes : lesson.media.scenes || [];
      const current = currentTime.current[next];
      if (
        scenes[index] &&
        !(current >= scenes[index].start && current < scenes[index].end)
      )
        currentTime.current[next] = scenes[index].start;
    }
    setMedium(next);
    setActive(index);
    patch({ mode: next, chapter: index });
    if (next === "reading") scrollTo(`#chapter-${result?.chapters[index]?.id}`);
    else scrollTo(".z-learning-main");
  }
  function selectChapter(index: number) {
    setDialog(null);
    setActive(index);
    patch({ chapter: index });
    if (medium === "video" || medium === "audio") {
      const scenes =
        medium === "audio" ? audioScenes : lesson.media.scenes || [];
      if (scenes[index]) seek(scenes[index].start, medium);
      scrollTo(".z-learning-main");
    } else if (medium === "diagrams" || medium === "overview")
      scrollTo(".z-learning-main");
    else switchMedium("reading", index);
  }
  async function job(
    action: "retry" | "formats" | "regenerate",
    formats?: Medium[],
  ) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ lesson?: Lesson }>(
        `/lessons/${lesson.id}/${action}`,
        "POST",
        formats ? { formats } : {},
      );
      if (action === "regenerate" && data.lesson) {
        flush();
        onRegenerated?.(data.lesson);
        return;
      }
      const fresh = await api<{ lesson: Lesson }>(`/lessons/${lesson.id}`);
      setLesson(fresh.lesson);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function feedback(helpful: boolean | null, completed: boolean) {
    try {
      await api(`/lessons/${lesson.id}/feedback`, "POST", {
        helpful,
        completed,
      });
      setLesson({ ...lesson, completed });
      onUpdate();
      notify(
        completed
          ? "已标记学完，作品仍保留在知藏。"
          : "已记录，不会自动修改个人 Skill。",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const chapterButtons = result?.chapters.map((c, i) => (
    <button
      type="button"
      key={c.id}
      className={i === active ? "active" : ""}
      aria-current={i === active ? "step" : undefined}
      onClick={() => selectChapter(i)}
    >
      <small>{String(i + 1).padStart(2, "0")}</small>
      {c.title}
    </button>
  ));
  const mediaWait = (lane: "video" | "audio") => (
    <div className="z-media-wait">
      <h2>
        {pending
          ? "正在制作，可以先看其他内容"
          : lane === "video"
            ? "为这篇文章制作讲解视频"
            : result?.schemaVersion
              ? "为这篇文章制作独立听读"
              : "补做旧版讲解音轨"}
      </h2>
      {lane === "audio" && !result?.schemaVersion && (
        <p>旧版使用原讲解稿；独立听读需生成新版，原作品保留。</p>
      )}
      <button
        className="button button-primary"
        disabled={busy || pending}
        onClick={() => void job("formats", [lane])}
      >
        生成{lane === "video" ? "视频" : "音频"}
      </button>
      <button
        className="button button-quiet"
        onClick={() => switchMedium("reading")}
      >
        先看图文
      </button>
    </div>
  );

  return (
    <main className="z-lesson">
      <ReadingCompanion
        lessonId={lesson.id}
        target={petTarget}
        onSource={source}
        onLife={() => flush()}
      />
      <header className="z-lesson-header z-container">
        <button
          className="z-text-link"
          onClick={() => {
            flush();
            onBack();
          }}
        >
          <ArrowLeft size={16} />
          返回知藏
        </button>
        <div className="z-lesson-title">
          {lesson.source?.mode === "sample" && (
            <span className="z-kicker">体验文章 · 虚构示例</span>
          )}
          <h1>{result?.title || lesson.title}</h1>
          {result?.lead && <p>{result.lead}</p>}
        </div>
      </header>
      {result && (
        <div className="z-lesson-toolbar z-container">
          <span className="z-current-medium">
            {modes.find((m) => m.id === medium)?.label}
          </span>
          <details className="z-other-formats">
            <summary>
              换一种方式看 <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <label className="z-format-switch">
              <span>学习形式</span>
              <select
                aria-label="学习形式"
                value={medium}
                onChange={(e) => {
                  switchMedium(e.target.value as StudyMode);
                  e.target.closest("details")?.removeAttribute("open");
                }}
              >
                {modes
                  .filter(
                    (m) => study || !["overview", "practice"].includes(m.id),
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          </details>
          <div className="z-study-tools">
            <button
              type="button"
              className="z-text-link"
              onClick={() => setDialog("chapters")}
              aria-label="打开章节目录"
            >
              <List size={16} />
              目录
            </button>
            <button
              type="button"
              className="z-text-link"
              onClick={() => setDialog("notes")}
            >
              <FileText size={16} />
              拾句
            </button>
            <button
              type="button"
              className="z-text-link"
              onClick={() => setDialog("downloads")}
            >
              <Download size={16} />
              导出
            </button>
          </div>
        </div>
      )}
      <div className="z-container">
        <ErrorNotice message={error || connectionError} />
        {pending && (
          <section className="z-job-progress" role="status">
            <h2>
              {result
                ? "内容可先看，其他形式正在制作"
                : "正在按你的学法整理文章"}
            </h2>
            <div>
              <Spinner text={lesson.stage} />
              <span>{lesson.progress}%</span>
            </div>
            <div className="z-progress">
              <span style={{ width: `${lesson.progress}%` }} />
            </div>
            <p>可以离开，完成后会保存在知藏。</p>
            <button className="button button-quiet" onClick={onBack}>
              先回知藏
            </button>
          </section>
        )}
        {["failed", "partial"].includes(lesson.status) && (
          <div className="z-error" role="alert">
            <strong>还有部分内容没有制作完成</strong>
            <p>{lesson.error || lesson.media.error}</p>
            <button
              className="button button-quiet"
              disabled={busy}
              onClick={() => void job("retry")}
            >
              重试未完成部分
            </button>
            {result && (
              <button
                className="button button-quiet"
                onClick={() => switchMedium("reading")}
              >
                先看已保存内容
              </button>
            )}
          </div>
        )}
        {result && !result.schemaVersion && !pending && (
          <div className="z-legacy-note">
            <p>
              这是旧版作品。原内容继续保留，也可以按当前学法制作一份新版全套作品。
            </p>
            <button
              className="z-text-link"
              disabled={busy}
              onClick={() => void job("regenerate")}
            >
              生成新版，保留原版 →
            </button>
          </div>
        )}
      </div>
      {result && chapter && (
        <div className="z-container z-learning-layout">
          <aside className="z-chapter-nav">
            <span>章节目录 · {result.chapters.length}</span>
            {chapterButtons}
            <button className="z-text-link" onClick={() => source()}>
              查看原文与来源
            </button>
          </aside>
          <div className="z-learning-main">
            {medium === "video" &&
              (videoReady ? (
                <section className="z-media-surface">
                  <video
                    ref={video}
                    controls
                    playsInline
                    preload="metadata"
                    poster={endpoint(`/lessons/${lesson.id}/media/poster.jpg`)}
                    aria-label={result.title}
                    onTimeUpdate={(e) =>
                      track(e.currentTarget.currentTime, "video")
                    }
                    onPause={(e) =>
                      track(e.currentTarget.currentTime, "video", true)
                    }
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = Math.min(
                        currentTime.current.video,
                        e.currentTarget.duration || 0,
                      );
                    }}
                    onError={() =>
                      setError("视频暂时无法加载，已生成的其他内容仍可使用。")
                    }
                  >
                    <source
                      src={endpoint(`/lessons/${lesson.id}/media/video.mp4`)}
                      type="video/mp4"
                    />
                    <track
                      kind="captions"
                      src={endpoint(`/lessons/${lesson.id}/media/captions.vtt`)}
                      srcLang="zh-CN"
                      label="章节内近似时间字幕"
                    />
                  </video>
                </section>
              ) : (
                mediaWait("video")
              ))}
            {medium === "audio" &&
              (audioReady ? (
                <section className="z-audio-surface">
                  <Headphones size={32} />
                  {audioFile !== "listen.m4a" && (
                    <span className="z-kicker">旧版讲解音轨</span>
                  )}
                  <h2>{chapter.title}</h2>
                  <p>{chapter.takeaway || result.lead}</p>
                  <audio
                    ref={audio}
                    controls
                    preload="metadata"
                    src={endpoint(`/lessons/${lesson.id}/media/${audioFile}`)}
                    aria-label="完整听读音频"
                    onTimeUpdate={(e) =>
                      track(e.currentTarget.currentTime, "audio")
                    }
                    onPause={(e) =>
                      track(e.currentTarget.currentTime, "audio", true)
                    }
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = Math.min(
                        currentTime.current.audio,
                        e.currentTarget.duration || 0,
                      );
                      e.currentTarget.playbackRate = rate;
                      setTime(e.currentTarget.currentTime);
                    }}
                    onError={() =>
                      setError("音频暂时无法加载，可先看下方听读讲稿。")
                    }
                  >
                    <track
                      kind="captions"
                      src={endpoint(
                        `/lessons/${lesson.id}/media/${audioFile === "listen.m4a" ? "listen.vtt" : "captions.vtt"}`,
                      )}
                      srcLang="zh-CN"
                      label="近似时间字幕（完整文本见听读稿）"
                    />
                  </audio>
                  <div className="z-audio-controls">
                    <button onClick={() => seek(time - 15, "audio")}>
                      后退 15 秒
                    </button>
                    <button onClick={() => seek(time + 15, "audio")}>
                      前进 15 秒
                    </button>
                    <label>
                      倍速
                      <select
                        value={rate}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRate(value);
                          if (audio.current) audio.current.playbackRate = value;
                        }}
                      >
                        {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                          <option key={r} value={r}>
                            {r}×
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <details className="z-detail">
                    <summary>本章听读稿</summary>
                    <p>{chapter.audioNarration || chapter.narration}</p>
                  </details>
                </section>
              ) : (
                <>
                  {mediaWait("audio")}
                  <details className="z-detail">
                    <summary>先看完整听读稿</summary>
                    {result.chapters.map((c) => (
                      <section key={c.id}>
                        <h3>{c.title}</h3>
                        <p>{c.audioNarration || c.narration}</p>
                      </section>
                    ))}
                  </details>
                </>
              ))}
            {medium === "animation" && (
              <section className="z-animation-surface">
                <iframe
                  key={`${lesson.id}-${lesson.media.trackReady}`}
                  src={endpoint(`/lessons/${lesson.id}/player`)}
                  title="个性化网页讲解"
                  sandbox="allow-scripts allow-same-origin allow-downloads"
                />
                {!lesson.media.trackReady && !legacyReady && (
                  <button
                    className="button button-quiet"
                    disabled={busy || pending}
                    onClick={() => void job("formats", ["animation"])}
                  >
                    为网页讲解配音
                  </button>
                )}
              </section>
            )}
            {(medium === "diagrams" ||
              medium === "audio" ||
              medium === "video") && (
              <div className="z-chapter-controls">
                <button
                  disabled={active === 0}
                  onClick={() => selectChapter(active - 1)}
                >
                  上一章
                </button>
                <span>
                  {active + 1} / {result.chapters.length}
                </span>
                <button
                  disabled={active === result.chapters.length - 1}
                  onClick={() => selectChapter(active + 1)}
                >
                  下一章
                </button>
              </div>
            )}
            {medium === "diagrams" && (
              <section className="z-diagram-work">
                <span className="z-kicker">
                  {chapter.kind}
                  {chapter.fictional ? " · 教学假设" : ""}
                </span>
                <h2>{chapter.title}</h2>
                <Visual chapter={chapter} />
                <p className="z-study-takeaway">
                  {chapter.takeaway || chapter.body}
                </p>
                {chapter.premise && <p>{chapter.premise}</p>}
                <div className="z-chapter-foot">
                  <button
                    className="z-text-link"
                    onClick={() => switchMedium("reading")}
                  >
                    阅读本章解释 →
                  </button>
                  <a
                    className="z-text-link"
                    href={endpoint(`/lessons/${lesson.id}/diagram/${active}`)}
                  >
                    下载本章图解 ↓
                  </a>
                </div>
              </section>
            )}
            {medium === "overview" && study && (
              <section className="z-overview-work">
                <span className="z-kicker">
                  全文关系 · 分组不是必然发生的时间顺序
                </span>
                <h2>{study.overview.title}</h2>
                <div className="z-overview-groups">
                  {study.overview.groups.map((g, i) => (
                    <section key={i}>
                      <h3>{g.title}</h3>
                      <p>{g.description}</p>
                      {g.chapterIds.map((id) => {
                        const index = result.chapters.findIndex(
                          (c) => c.id === id,
                        );
                        return (
                          <button
                            key={id}
                            aria-pressed={active === index}
                            onClick={() => {
                              setActive(index);
                              patch({ chapter: index });
                              scrollTo(".z-overview-detail");
                            }}
                          >
                            {result.chapters[index].title} ↗
                          </button>
                        );
                      })}
                    </section>
                  ))}
                </div>
                <section className="z-overview-detail">
                  <h3>{chapter.title}</h3>
                  <p>{chapter.takeaway}</p>
                  <p>{chapter.premise}</p>
                  <button
                    className="z-text-link"
                    onClick={() => switchMedium("reading")}
                  >
                    读这一章 →
                  </button>
                </section>
                {study.overview.connections.length > 0 && (
                  <details className="z-detail">
                    <summary>各章之间怎样联系？</summary>
                    {study.overview.connections.map((r, i) => (
                      <div className="z-connection" key={i}>
                        <strong>
                          {result.chapters.find((c) => c.id === r.from)?.title}
                        </strong>
                        <span>{r.label}</span>
                        <strong>
                          {result.chapters.find((c) => c.id === r.to)?.title}
                        </strong>
                        <button
                          className="z-text-link"
                          onClick={() => source(r.sourceIds)}
                        >
                          看依据
                        </button>
                      </div>
                    ))}
                  </details>
                )}
              </section>
            )}
            {medium === "practice" && study && (
              <section className="z-practice-work">
                <div
                  className="z-practice-tabs"
                  role="group"
                  aria-label="互动方式"
                >
                  {[
                    ["scenarios", "条件推演"],
                    ["cards", "复习卡"],
                    ["quiz", "理解自测"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={practice === id}
                      onClick={() => setPractice(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {practice === "scenarios" &&
                  (study.scenarios.length ? (
                    <>
                      <nav className="z-scenario-nav" aria-label="推演情境">
                        {study.scenarios.map((s, i) => (
                          <button
                            key={s.id}
                            aria-pressed={(state.scenario || 0) === i}
                            onClick={() => patch({ scenario: i })}
                          >
                            情境 {i + 1}
                          </button>
                        ))}
                      </nav>
                      {study.scenarios
                        .filter((_, i) => i === (state.scenario || 0))
                        .map((s) => {
                          const selected = s.options.find(
                            (o) => o.id === state.answers?.[s.id],
                          );
                          return (
                            <section key={s.id}>
                              <h2>{s.title}</h2>
                              <p>{s.setup}</p>
                              <p className="z-scenario-notice">
                                教学假设，不是事实或预测结果
                              </p>
                              <div className="z-scenario-options">
                                {s.options.map((o) => (
                                  <button
                                    key={o.id}
                                    aria-pressed={o.id === selected?.id}
                                    onClick={() =>
                                      patch({
                                        answers: {
                                          ...state.answers,
                                          [s.id]: o.id,
                                        },
                                      })
                                    }
                                  >
                                    {o.label}
                                    <span>看看这条路径 →</span>
                                  </button>
                                ))}
                              </div>
                              {selected && (
                                <div
                                  className="z-scenario-result"
                                  role="status"
                                >
                                  <ol>
                                    {selected.path.map((step, i) => (
                                      <li key={i}>{step}</li>
                                    ))}
                                  </ol>
                                  <p>{selected.explanation}</p>
                                  <p className="z-study-takeaway">
                                    {s.takeaway}
                                  </p>
                                </div>
                              )}
                              <button
                                className="z-text-link"
                                onClick={() => source(s.sourceIds)}
                              >
                                查看知识依据
                              </button>
                              <button
                                className="z-text-link"
                                onClick={() =>
                                  switchMedium(
                                    "reading",
                                    result.chapters.findIndex(
                                      (c) => c.id === s.chapterId,
                                    ),
                                  )
                                }
                              >
                                回到对应章节 →
                              </button>
                            </section>
                          );
                        })}
                    </>
                  ) : (
                    <p>
                      {study.practiceNote ||
                        "这篇内容没有适合的条件推演，可以看复习卡。"}
                    </p>
                  ))}
                {practice === "cards" &&
                  result.chapters
                    .filter((_, i) => i === (state.card || 0))
                    .map((c) => (
                      <section className="z-recall-work" key={c.id}>
                        <span>
                          {(state.card || 0) + 1} / {result.chapters.length}
                        </span>
                        <h2>{c.recallQuestion}</h2>
                        <button
                          className="button button-primary"
                          aria-expanded={revealed}
                          onClick={() => setRevealed(!revealed)}
                        >
                          {revealed ? "收起答案" : "直接看答案"}
                        </button>
                        {revealed && (
                          <div className="z-card-answer">
                            <p>{c.takeaway}</p>
                            <p>{c.premise}</p>
                            <button
                              className="z-text-link"
                              onClick={() => source(c.sourceIds)}
                            >
                              回到原文依据
                            </button>
                          </div>
                        )}
                        <div className="z-chapter-controls">
                          <button
                            disabled={!state.card}
                            onClick={() => {
                              setRevealed(false);
                              patch({ card: (state.card || 0) - 1 });
                            }}
                          >
                            上一张
                          </button>
                          <button
                            disabled={
                              (state.card || 0) === result.chapters.length - 1
                            }
                            onClick={() => {
                              setRevealed(false);
                              patch({ card: (state.card || 0) + 1 });
                            }}
                          >
                            下一张
                          </button>
                        </div>
                      </section>
                    ))}
                {practice === "quiz" &&
                  (result.quiz.length ? (
                    result.quiz.map((q, i) => (
                      <section className="z-quiz-work" key={i}>
                        <h3>{q.question}</h3>
                        <div className="z-choices">
                          {q.options.map((o, j) => (
                            <button
                              key={j}
                              className={`z-choice${state.answers?.[`quiz-${i}`] === String(j) ? " selected" : ""}`}
                              aria-pressed={
                                state.answers?.[`quiz-${i}`] === String(j)
                              }
                              onClick={() =>
                                patch({
                                  answers: {
                                    ...state.answers,
                                    [`quiz-${i}`]: String(j),
                                  },
                                })
                              }
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                        {state.answers?.[`quiz-${i}`] !== undefined && (
                          <p className="z-answer">{q.explanation}</p>
                        )}
                        <button
                          className="z-text-link"
                          onClick={() =>
                            patch({
                              answers: {
                                ...state.answers,
                                [`quiz-${i}`]: String(q.correct),
                              },
                            })
                          }
                        >
                          直接看解释
                        </button>
                      </section>
                    ))
                  ) : (
                    <p>这篇内容没有适合的选择题，不需要完成测验。</p>
                  ))}
              </section>
            )}
            {medium !== "reading" && (
              <button
                className="z-reading-toggle"
                aria-expanded={transcript}
                onClick={() => setTranscript(!transcript)}
              >
                <FileText size={18} />
                {transcript ? "收起配套图文" : "展开配套图文与来源"}
                <ChevronDown size={16} />
              </button>
            )}
            <div
              hidden={medium !== "reading" && !transcript}
              className={medium === "reading" ? "z-reading" : "z-transcript"}
            >
              <div className="z-section-title">
                <h2>完整图文</h2>
                <button className="z-text-link" onClick={() => source()}>
                  原文
                </button>
              </div>
              {result.chapters.map((c, i) => (
                <section
                  className="z-chapter"
                  id={`chapter-${c.id}`}
                  key={c.id}
                >
                  <div className="z-chapter-number">
                    {String(i + 1).padStart(2, "0")}{" "}
                    <span>
                      {c.kind}
                      {c.fictional ? " · 教学假设" : ""}
                    </span>
                  </div>
                  <h2>{c.title}</h2>
                  {c.body
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((p, j) => (
                      <div className="z-explain-paragraph" key={j}>
                        <p>{p}</p>
                        <button
                          className="z-text-link"
                          aria-label={`问小猫：第${j + 1}段`}
                          onClick={() =>
                            setPetTarget({
                              id: c.id,
                              title: `${c.title} · 第${j + 1}段`,
                              paragraphIndex: j,
                              nonce: Date.now(),
                            })
                          }
                        >
                          没看懂？
                        </button>
                      </div>
                    ))}
                  <Visual chapter={c} />
                  {c.takeaway && (
                    <p className="z-study-takeaway">{c.takeaway}</p>
                  )}
                  {c.premise && (
                    <details className="z-detail">
                      <summary>成立条件与边界</summary>
                      <p>{c.premise}</p>
                    </details>
                  )}
                  <div className="z-chapter-foot">
                    <button
                      className="z-source-button"
                      onClick={() =>
                        setPetTarget({
                          id: c.id,
                          title: c.title,
                          nonce: Date.now(),
                        })
                      }
                    >
                      问问小猫
                    </button>
                    <button
                      className="z-source-button"
                      onClick={() => source(c.sourceIds, c.body)}
                    >
                      查看对应原文
                    </button>
                    <a href={endpoint(`/lessons/${lesson.id}/diagram/${i}`)}>
                      <Download size={15} />
                      保存图解
                    </a>
                  </div>
                </section>
              ))}
            </div>
            {!study && result.quiz.length > 0 && (
              <details className="z-detail">
                <summary>可选自测 · 不影响阅读</summary>
                {result.quiz.map((q, i) => (
                  <section key={i}>
                    <h3>{q.question}</h3>
                    {q.options.map((o, j) => (
                      <p key={j}>
                        {j + 1}. {o}
                      </p>
                    ))}
                    <details>
                      <summary>直接看解释</summary>
                      <p>{q.explanation}</p>
                    </details>
                  </section>
                ))}
              </details>
            )}
            <details className="z-detail z-adaptation">
              <summary>这篇怎样按我的习惯讲？</summary>
              <ul>
                {result.adaptation.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
            {study && (
              <>
                <details className="z-detail">
                  <summary>术语速查</summary>
                  {study.glossary.map((g) => (
                    <section key={g.term}>
                      <h3>{g.term}</h3>
                      <p>{g.explanation}</p>
                      <button
                        className="z-text-link"
                        onClick={() => source(g.sourceIds)}
                      >
                        原文语境
                      </button>
                    </section>
                  ))}
                </details>
                <details className="z-detail">
                  <summary>哪些是观点、假设与待核验内容？</summary>
                  <p>
                    本次核对的是与输入材料是否一致，不是对外部事实的全面认证。
                  </p>
                  {study.boundaries.map((b, i) => (
                    <p key={i}>{b}</p>
                  ))}
                </details>
              </>
            )}
            <section className="z-takeaways">
              <span className="z-kicker">带走这几个判断</span>
              <ul>
                {result.takeaways.map((t, i) => (
                  <li key={i}>
                    <Check size={18} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="z-feedback">
              <h3>这版让你更容易开始学习了吗？</h3>
              <div>
                <button
                  className="button button-quiet"
                  onClick={() => void feedback(true, lesson.completed)}
                >
                  更容易了
                </button>
                <button
                  className="button button-quiet"
                  onClick={() => void feedback(false, lesson.completed)}
                >
                  还不够
                </button>
                <button
                  className="button button-primary"
                  onClick={() => void feedback(null, !lesson.completed)}
                >
                  {lesson.completed ? "已完成，点击取消" : "标记学完"}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
      {dialog === "chapters" && (
        <Modal title="章节目录" onClose={() => setDialog(null)}>
          <nav className="z-directory-dialog" aria-label="选择章节">
            {chapterButtons}
          </nav>
        </Modal>
      )}
      {dialog === "notes" && (
        <Modal
          title="拾句 · 笔记"
          onClose={() => {
            flush();
            setDialog(null);
          }}
        >
          <textarea
            className="z-study-notes"
            aria-label="拾句 · 笔记"
            value={state.notes || ""}
            maxLength={8000}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="摘一句原文，或记下你的想法…"
          />
          <p role="status" className="z-help">
            {saved}
          </p>
          <button className="button button-quiet" onClick={flush}>
            保存笔记
          </button>
        </Modal>
      )}
      {dialog === "downloads" && result && (
        <Modal title="带走学习作品" onClose={() => setDialog(null)}>
          <div className="z-download-grid">
            <a href={endpoint(`/lessons/${lesson.id}/export.html`)}>
              完整离线学习网页
            </a>
            <a href={endpoint(`/lessons/${lesson.id}/notes.md`)}>
              图文、讲稿与复习卡
            </a>
            <a href={endpoint(`/lessons/${lesson.id}/export.json`)}>
              完整内容与来源
            </a>
            {audioReady && (
              <a
                href={endpoint(
                  `/lessons/${lesson.id}/media/${audioFile}?download`,
                )}
              >
                听读音频 ·{" "}
                {clock(lesson.media.audioDuration || lesson.media.duration)}
              </a>
            )}
            {videoReady && (
              <>
                <a
                  href={endpoint(
                    `/lessons/${lesson.id}/media/video.mp4?download`,
                  )}
                >
                  MP4 讲解视频
                </a>
                <a
                  href={endpoint(
                    `/lessons/${lesson.id}/media/captions.vtt?download`,
                  )}
                >
                  视频字幕
                </a>
              </>
            )}
          </div>
          <details className="z-detail">
            <summary>下载各章关系图</summary>
            {result.chapters.map((c, i) => (
              <a
                className="z-download-row"
                key={c.id}
                href={endpoint(`/lessons/${lesson.id}/diagram/${i}`)}
              >
                {i + 1}. {c.title} ↓
              </a>
            ))}
          </details>
        </Modal>
      )}
      {dialog === "source" && lesson.source && (
        <Modal title="原文与来源" onClose={() => setDialog(null)}>
          <h3>{lesson.source.title}</h3>
          <p className="z-help">
            {lesson.source.mode === "sample"
              ? "知径自编体验文章，数据为虚构示例。"
              : "由你提供或允许提取的材料。来源中的陈述不等于已经独立核验。"}
          </p>
          {lesson.source.url && (
            <a
              className="z-text-link"
              href={lesson.source.url}
              target="_blank"
              rel="noreferrer"
            >
              在知乎查看原文 ↗
            </a>
          )}
          <SourceReader
            blocks={lesson.source.blocks}
            ids={focus}
            explanation={sourceExplanation}
            onClose={() => setDialog(null)}
          />
          <button
            className="button button-quiet"
            onClick={() => setDialog(null)}
          >
            返回学习
          </button>
        </Modal>
      )}
    </main>
  );
}
