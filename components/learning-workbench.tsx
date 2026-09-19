"use client";
/* Private posters require the visitor cookie; do not route through an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useReducer, useRef } from "react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Library,
  Headphones,
  MonitorPlay,
  Play,
  Plus,
  Upload,
} from "lucide-react";
import type { Answers, Lesson, Profile, Source } from "../lib/domain";
import { mediaLabels, profileForLesson, questions } from "../lib/domain";
import { planBStorageKey } from "../lib/plan-b-storage";
import { api, base, endpoint, ErrorNotice, Spinner } from "./learning-ui";
import {
  demoEntryMode,
  demoStudyUrl,
  demoModes,
  demoLabels,
  updateDemoSelection,
} from "../lib/demo-route";

export function LessonCard({
  lesson,
  onOpen,
}: {
  lesson: Lesson;
  onOpen: () => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const statuses: Record<string, string> = {
    queued: "排队中",
    working: "正在制作",
    ready: "已完成",
    partial: "图文可看 · 音视频待重试",
    failed: "制作未完成",
  };
  const Icon =
    {
      video: MonitorPlay,
      reading: FileText,
      audio: Headphones,
      animation: Play,
    }[lesson.formats[0]] || FileText;
  return (
    <button className="z-lesson-card" onClick={onOpen}>
      <div className={`z-card-art z-card-art-${lesson.formats[0]}`}>
        <img
          src={
            lesson.media.videoReady && !posterFailed
              ? endpoint(`/lessons/${lesson.id}/media/poster.jpg`)
              : `${base}/images/learning-paths-v1.webp`
          }
          alt=""
          loading="lazy"
          width={640}
          height={360}
          onError={() => setPosterFailed(true)}
        />
        <Icon size={24} className="z-card-medium-icon" />
        <span>{lesson.formats.map((f) => mediaLabels[f]).join(" / ")}</span>
      </div>
      <div className="z-lesson-card-body">
        <span className="z-card-date">
          {new Date(lesson.createdAt).toLocaleDateString("zh-CN")}
          <span
            className={`z-status z-status-${lesson.completed ? "completed" : lesson.status}`}
          >
            {lesson.completed ? "已学完" : statuses[lesson.status]}
          </span>
        </span>
        <h3>{lesson.title}</h3>
        <span className="z-card-action">
          {["queued", "working"].includes(lesson.status)
            ? "查看制作进度"
            : lesson.studyState?.chapter !== undefined
              ? `继续第 ${lesson.studyState.chapter + 1} 章`
              : "打开学习内容"}
          <ArrowRight size={17} />
        </span>
      </div>
    </button>
  );
}
export function LearningLibrary({
  lessons,
  onOpen,
  onAdd,
}: {
  lessons: Lesson[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(lessons.slice(0, 24));
  const [total, setTotal] = useState(lessons.length);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ lessons: Lesson[]; total: number; nextOffset: number | null }>(
        `/lessons?q=${encodeURIComponent(query)}`,
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems(data.lessons);
            setTotal(data.total);
            setNext(data.nextOffset);
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const visibleItems = items.map((item) => {
    const fresh = lessons.find((value) => value.id === item.id);
    return fresh && (fresh.updatedAt || "") > (item.updatedAt || "")
      ? fresh
      : item;
  });
  async function more() {
    setLoading(true);
    try {
      const data = await api<{ lessons: Lesson[]; nextOffset: number | null }>(
        `/lessons?q=${encodeURIComponent(query)}&offset=${next}`,
      );
      setItems((old) => [
        ...old,
        ...data.lessons.filter((x) => !old.some((y) => y.id === x.id)),
      ]);
      setNext(data.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="z-container z-library">
      <div className="z-page-heading">
        <div className="z-heading-row">
          <h1>知藏</h1>
          <button className="button button-primary" onClick={onAdd}>
            <Plus size={17} />
            添加内容
          </button>
        </div>
        {total > 0 && <p>{total} 份作品</p>}
      </div>
      <label className="z-library-search">
        <span className="sr-only">按标题搜索作品</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按标题搜索"
        />
      </label>
      <ErrorNotice message={error} />
      {items.length ? (
        <div className="z-library-grid">
          {visibleItems.map((item) => (
            <LessonCard
              key={item.id}
              lesson={item}
              onOpen={() => onOpen(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="z-empty">
          <Library size={36} />
          <h2>{query ? "没有找到这份作品" : "从第一篇开始"}</h2>
          {query && <p>试试其他关键词，或清空搜索。</p>}
          <button className="button button-primary" onClick={onAdd}>
            添加一篇内容
            <Plus size={16} />
          </button>
        </div>
      )}
      {loading && <Spinner text="正在读取知藏" />}
      {next !== null && (
        <button
          className="button button-quiet z-load-more"
          disabled={loading}
          onClick={() => void more()}
        >
          加载更多
        </button>
      )}
    </main>
  );
}
export function Workbench({
  profile,
  lessons,
  onOpen,
  onGenerated,
  onProfile,
  onLibrary,
}: {
  profile: Profile;
  lessons: Lesson[];
  onOpen: (id: string) => void;
  onGenerated: (lesson: Lesson) => void;
  onProfile: () => void;
  onLibrary: () => void;
}) {
  const [mode, setMode] = useState("link"),
    [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [overrides, setOverrides] = useState<Partial<Answers>>({});
  const [fullPackage, setFullPackage] = useState(false);
  const demoMode = true;
  const [{ primary: primaryMode, modes: selectedModes }, selectFormats] =
    useReducer(updateDemoSelection, profile.answers.primary, (primary) => ({
      primary: demoEntryMode(primary),
      modes: [demoEntryMode(primary)],
    }));
  const allFormats = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allFormats.current)
      allFormats.current.indeterminate =
        demoMode &&
        selectedModes.length > 0 &&
        selectedModes.length < demoModes.length;
  }, [selectedModes.length]);
  const [showFormats, setShowFormats] = useState(false);
  const [demoVisited, setDemoVisited] = useState(false);
  const [resumeMode, setResumeMode] = useState("video");
  useEffect(() => {
    try {
      setDemoVisited(
        localStorage.getItem(planBStorageKey("zhijing-demo-visited")) === "1",
      );
      const saved =
        localStorage.getItem(planBStorageKey("zhijing-demo-mode")) || "video";
      if (demoModes.includes(saved)) setResumeMode(saved);
    } catch {}
  }, []);
  const currentAnswers = profileForLesson(profile, overrides).answers;
  async function generate() {
    if (busy || (demoMode && !selectedModes.length)) return;
    if (demoMode) {
      const selectedMode = primaryMode;
      setError("");
      setBusy("正在准备示例");
      await new Promise((resolve) => setTimeout(resolve, 1800));
      try {
        localStorage.setItem(planBStorageKey("zhijing-demo-visited"), "1");
        localStorage.setItem(
          planBStorageKey("zhijing-demo-mode"),
          selectedMode,
        );
        localStorage.setItem(planBStorageKey("zhijing-demo-time"), "0");
        localStorage.setItem(
          planBStorageKey("zhijing-demo-formats"),
          selectedModes.join(","),
        );
      } catch {}
      window.location.assign(
        demoStudyUrl(base, selectedMode) +
          "&formats=" +
          encodeURIComponent(selectedModes.join(",")),
      );
      return;
    }
    setError("");
    setBusy("正在读取你的内容");
    try {
      const s = await api<{ source: Source }>(
        "/sources",
        "POST",
        mode === "link" ? { url } : { text, title },
      );
      setBusy("正在提交学习任务");
      const d = await api<{ lesson: Lesson }>("/lessons", "POST", {
        sourceId: s.source.id,
        overrides,
        ...(fullPackage
          ? {
              formats: [
                ...new Set([
                  overrides.primary || profile.answers.primary,
                  "reading",
                  "video",
                  "audio",
                  "animation",
                ]),
              ],
            }
          : {}),
      });
      onGenerated({ ...d.lesson, source: s.source });
    } catch (e) {
      setError((e as Error).message);
      if (mode === "link") setMode("text");
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="z-container z-workspace">
      <div className="z-page-heading">
        <h1>待启集</h1>
        {demoMode && <p>演示模式 · 预置学习作品</p>}
      </div>
      <section className="z-composer">
        <div className="z-input-tabs" role="group" aria-label="内容输入方式">
          <button
            aria-pressed={mode === "link"}
            onClick={() => setMode("link")}
          >
            放入链接
          </button>
          <button
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            放入正文
          </button>
          <label className="z-upload">
            <Upload size={16} />
            放入文件
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 200000) {
                  setError("文件太大，请控制在 45000 字以内。");
                  return;
                }
                setText(await file.text());
                setTitle(file.name.replace(/\.(txt|md)$/i, ""));
                setMode("text");
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {mode === "link" ? (
          <label className="z-field-label">
            文章链接
            <input
              className="z-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://zhuanlan.zhihu.com/p/…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !busy) void generate();
              }}
            />
          </label>
        ) : (
          <div className="z-text-inputs">
            <input
              aria-label="文章标题（选填）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文章标题（选填）"
              maxLength={160}
            />
            <textarea
              aria-label="文章正文"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={45000}
              placeholder="放入想读的正文…"
            />
            {text.length >= 40000 && (
              <span className="z-character-count">
                {text.length.toLocaleString()} / 45,000 字
              </span>
            )}
          </div>
        )}
        {
          <details className="z-detail z-temporary">
            <summary>
              <span>
                这次读法：
                <strong>
                  {demoMode
                    ? demoLabels[primaryMode] || "请选择形式"
                    : mediaLabels[currentAnswers.primary]}
                </strong>
                {!demoMode &&
                  currentAnswers.extras.length > 0 &&
                  ` + ${currentAnswers.extras.map((m) => mediaLabels[m]).join("、")}`}
              </span>
              <span className="z-settings-toggle">
                调整 <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <p>{demoMode ? "示例的目标、讲法与节奏固定。" : "仅这次生效"}</p>
            <div className="z-temporary-fields">
              {questions
                .filter((q) =>
                  ["primary", "goal", "entry", "pace"].includes(q.id),
                )
                .map((q) => (
                  <label className="z-field-label" key={q.id}>
                    {
                      {
                        primary: "主要形式",
                        goal: "这次目标",
                        entry: "讲解入口",
                        pace: "讲解节奏",
                      }[q.id as "primary" | "goal" | "entry" | "pace"]
                    }
                    <select
                      disabled={!!busy || (demoMode && q.id !== "primary")}
                      value={
                        demoMode && q.id === "primary"
                          ? primaryMode
                          : (currentAnswers[q.id] as string)
                      }
                      onChange={(e) => {
                        if (demoMode && q.id === "primary") {
                          const value = e.target.value;
                          selectFormats({ type: "primary", mode: value });
                        } else
                          setOverrides((v) => ({
                            ...v,
                            [q.id]: e.target.value,
                          }));
                      }}
                    >
                      {demoMode && q.id === "primary" && !primaryMode && (
                        <option value="" disabled>
                          请选择形式
                        </option>
                      )}
                      {(demoMode && q.id === "primary"
                        ? Object.entries(demoLabels).map(([value, label]) => ({
                            value,
                            label,
                          }))
                        : q.options
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {demoMode &&
                          q.id === "primary" &&
                          o.value === "animation"
                            ? "互动全景图"
                            : o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </div>
            <button className="z-text-link" onClick={onProfile}>
              修改读法笺 <ArrowRight size={15} />
            </button>
          </details>
        }
        <ErrorNotice message={error} />
        <label className="z-full-package">
          <input
            type="checkbox"
            ref={allFormats}
            checked={
              demoMode ? selectedModes.length === demoModes.length : fullPackage
            }
            disabled={!!busy}
            onChange={(e) => {
              setFullPackage(e.target.checked);
              selectFormats({ type: "all", checked: e.target.checked });
            }}
          />
          <span>{demoMode ? "体验全部形式" : "生成全部形式"}</span>
        </label>
        {demoMode && (
          <>
            <button
              type="button"
              className="z-text-link z-formats-expand"
              aria-label={showFormats ? "收起选择学习形式" : "展开选择学习形式"}
              aria-expanded={showFormats}
              aria-controls="demo-formats"
              onClick={() => setShowFormats((expanded) => !expanded)}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {showFormats && (
              <div
                id="demo-formats"
                className="z-demo-formats"
                role="group"
                aria-label="选择学习形式"
              >
                {Object.entries(demoLabels).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={selectedModes.includes(value)}
                      disabled={!!busy}
                      onChange={(e) =>
                        selectFormats({
                          type: "toggle",
                          mode: value,
                          checked: e.target.checked,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        {busy && demoMode && (
          <div className="z-demo-preparing" role="status">
            <span aria-hidden="true">▱</span>
            <p>正在准备示例</p>
          </div>
        )}
        <div className="z-compose-bottom">
          <button
            className="button button-primary button-large"
            onClick={() => void generate()}
            disabled={
              !!busy ||
              (demoMode && !selectedModes.length) ||
              (mode === "link" ? !url.trim() : !text.trim())
            }
          >
            {busy ? (
              <Spinner text={busy} />
            ) : (
              <>
                开始体验
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </section>
      <section className="z-recent">
        <div className="z-section-title">
          <h2>上回读到</h2>
          <button className="z-text-link" onClick={onLibrary}>
            打开知藏
            <ArrowRight size={16} />
          </button>
        </div>
        {demoVisited && (
          <a
            className="z-article-case"
            href={demoStudyUrl(base, resumeMode, true)}
          >
            <img
              src={`${base}/images/window-cover.jpg`}
              alt=""
              width={1280}
              height={720}
            />
            <span className="z-article-case-copy">
              <span>示例</span>
              <strong>窗口期可能只剩五年</strong>
            </span>
            <span className="z-article-case-action">
              接着读 <ArrowRight size={16} />
            </span>
          </a>
        )}
        <div className="z-library-grid">
          {lessons.slice(0, 3).map((item) => (
            <LessonCard
              key={item.id}
              lesson={item}
              onOpen={() => onOpen(item.id)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
