"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Library, Pause, Play, Plus, Settings2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { Answers, Lesson, Profile } from "../lib/domain";
import { defaultAnswers, normalizeAnswers } from "../lib/domain";
import { entryRoute } from "../lib/entry-route";
import { planBStorageKey } from "../lib/plan-b-storage";
import { pageMotionEnabled } from "../lib/motion-policy";
import { Welcome } from "./learning-welcome";
import {
  api,
  base,
  Brand,
  downloadText,
  ErrorNotice,
  Modal,
  Spinner,
} from "./learning-ui";
import { Onboarding, SkillEditor } from "./learning-onboarding";
import { LearningLibrary, Workbench } from "./learning-workbench";
import { LessonView } from "./learning-lesson";
import { ReadingCompanion } from "./reading-companion";
import { useExperienceShortcut } from "./use-experience-shortcut";

export default function LearningApp() {
  useExperienceShortcut(base);
  const reducedMotion = useReducedMotion();
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const motionEnabled = pageMotionEnabled(
    motionPaused,
    !!reducedMotion,
    pageVisible,
  );
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const [boot, setBoot] = useState(true),
    [bootError, setBootError] = useState("");
  const [view, setView] = useState("welcome"),
    [profile, setProfile] = useState<Profile | null>(null),
    [lessons, setLessons] = useState<Lesson[]>([]),
    [lesson, setLesson] = useState<Lesson | null>(null);
  const [legacy, setLegacy] = useState<Answers | null>(null),
    [freshQuestionnaire, setFreshQuestionnaire] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [account, setAccount] = useState(false),
    [recovery, setRecovery] = useState(""),
    [restore, setRestore] = useState(""),
    [hasRecovery, setHasRecovery] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<{
      profile: Profile | null;
      lessons: Lesson[];
      hasRecovery: boolean;
    }>("/me");
    setProfile(data.profile);
    setLessons(data.lessons);
    setHasRecovery(data.hasRecovery);
    return data;
  }, []);
  useEffect(() => {
    let active = true;
    api<{ profile: Profile | null; lessons: Lesson[]; hasRecovery: boolean }>(
      "/me",
    )
      .then(async (data) => {
        if (!active) return;
        setProfile(data.profile);
        setLessons(data.lessons);
        setHasRecovery(data.hasRecovery);
        const route = entryRoute(!!data.profile, window.location.search);
        setFreshQuestionnaire(
          new URLSearchParams(window.location.search).get("start") ===
            "questionnaire",
        );
        setView(route.view);
        const resume = route.lesson;
        if (resume) {
          try {
            const found = await api<{ lesson: Lesson }>(`/lessons/${resume}`);
            if (active) {
              setLesson(found.lesson);
              setView("learning");
            }
          } catch {
            if (active) setNotice("无法打开这份作品，请从自己的知藏选择。");
          }
        }
        if (!data.profile) {
          try {
            const old = JSON.parse(
              localStorage.getItem(
                planBStorageKey("zhijing-learning-profile"),
              ) || "null",
            );
            if (old?.questionnaire)
              setLegacy(
                normalizeAnswers({
                  ...old.questionnaire,
                  primary:
                    old.questionnaire.entry === "video" ? "video" : "reading",
                  entry: ["story", "map", "question"].includes(
                    old.questionnaire.entry,
                  )
                    ? old.questionnaire.entry
                    : "adaptive",
                  support: old.questionnaire.support
                    ? [old.questionnaire.support]
                    : [],
                  avoid: [],
                }),
              );
          } catch {
            /* Keep original local prototype data untouched. */
          }
        }
      })
      .catch((e) => {
        if (active) setBootError(e.message);
      })
      .finally(() => {
        if (active) setBoot(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (
      !["workspace", "library"].includes(view) ||
      !lessons.some((l) => ["queued", "working"].includes(l.status))
    )
      return;
    const timer = setInterval(() => void refresh().catch(() => {}), 6000);
    return () => clearInterval(timer);
  }, [view, lessons, refresh]);
  function go(next: string, fresh = false) {
    if (next !== "learning") {
      const url = new URL(window.location.href);
      url.searchParams.delete("lesson");
      if (next === "welcome") url.searchParams.set("start", "welcome");
      else if (next === "questionnaire")
        url.searchParams.set("start", fresh ? "questionnaire" : "preferences");
      else url.searchParams.delete("start");
      window.history.replaceState(null, "", url);
    }
    if (next === "questionnaire") setFreshQuestionnaire(fresh);
    setView(next);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function saved(p: Profile) {
    setProfile(p);
    go("workspace");
    setNotice("学习方式已保存。以后可以直接开始。");
  }
  function generated(l: Lesson) {
    const url = new URL(window.location.href);
    url.searchParams.set("lesson", l.id);
    url.searchParams.delete("start");
    window.history.replaceState(null, "", url);
    setLesson(l);
    go("learning");
    void refresh();
  }
  async function open(id: string) {
    setBusy("正在打开作品");
    try {
      const data = await api<{ lesson: Lesson }>(`/lessons/${id}`);
      const url = new URL(window.location.href);
      url.searchParams.set("lesson", id);
      url.searchParams.delete("start");
      window.history.replaceState(null, "", url);
      setLesson(data.lesson);
      go("learning");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function makeRecovery() {
    setBusy("正在生成恢复码");
    try {
      const result = await api<{ code: string }>("/recovery", "POST", {});
      setRecovery(result.code);
      setHasRecovery(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function restoreAccount() {
    setBusy("正在恢复");
    setError("");
    try {
      await api("/recovery/restore", "POST", { code: restore });
      const data = await refresh();
      setAccount(false);
      setRestore("");
      setRecovery("");
      setLesson(null);
      go(data.profile ? "workspace" : "welcome");
      setNotice("学习方式和作品已恢复。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (boot)
    return (
      <main className="z-loading">
        <Brand />
        <Spinner text="正在打开知径" />
      </main>
    );
  if (bootError)
    return (
      <main className="z-loading">
        <Brand />
        <p role="alert">暂时连接不上学习服务。</p>
        <button
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          重新连接
        </button>
      </main>
    );
  return (
    <div
      className={`z-app${profile && view !== "welcome" ? " z-signed-in" : ""}`}
      data-motion={motionEnabled ? "on" : "off"}
    >
      <a className="z-skip-link" href="#learning-content">
        跳到主要内容
      </a>
      <header className="z-top">
        <button
          className="z-brand-button"
          onClick={() => go("welcome")}
          aria-label="知径首页"
        >
          <Brand />
        </button>
        {profile && view !== "welcome" && (
          <nav aria-label="主要导航">
            <button
              className={view === "workspace" ? "active" : ""}
              aria-current={view === "workspace" ? "page" : undefined}
              onClick={() => go("workspace")}
            >
              <Plus size={17} />
              开始学习
            </button>
            <button
              className={view === "library" ? "active" : ""}
              aria-current={view === "library" ? "page" : undefined}
              onClick={() => {
                void refresh();
                go("library");
              }}
            >
              <Library size={17} />
              知藏
            </button>
            <button
              className={view === "profile" ? "active" : ""}
              aria-current={view === "profile" ? "page" : undefined}
              onClick={() => go("profile")}
            >
              <Settings2 size={17} />
              读法笺
            </button>
          </nav>
        )}
      </header>
      <div className="z-main-area" id="learning-content">
        {notice && (
          <div className="z-toast" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}
        {busy && !account && (
          <div className="z-global-busy" role="status">
            <Spinner text={busy} />
          </div>
        )}
        {error && !account && (
          <div className="z-container">
            <ErrorNotice message={error} />
          </div>
        )}
        {view !== "learning" && (
          <ReadingCompanion target={null} onSource={() => {}} />
        )}
        {view === "welcome" && (
          <Welcome
            returning={!!profile}
            onContinue={() => go("workspace")}
            onStart={() => go("questionnaire", true)}
          />
        )}
        {view === "questionnaire" && (
          <Onboarding
            initial={
              freshQuestionnaire
                ? defaultAnswers
                : profile?.answers || legacy || defaultAnswers
            }
            onSave={saved}
            onCancel={() =>
              go(
                freshQuestionnaire
                  ? "welcome"
                  : profile
                    ? "profile"
                    : "welcome",
              )
            }
          />
        )}
        {view === "profile" && profile && (
          <SkillEditor
            key={profile.updatedAt}
            profile={profile}
            existing
            onSave={saved}
            onBack={() => go("workspace")}
            onRetake={() => go("questionnaire")}
          />
        )}
        {view === "workspace" && profile && (
          <Workbench
            profile={profile}
            lessons={lessons}
            onOpen={(id) => void open(id)}
            onGenerated={generated}
            onProfile={() => go("profile")}
            onLibrary={() => go("library")}
          />
        )}
        {view === "library" && (
          <LearningLibrary
            lessons={lessons}
            onOpen={(id) => void open(id)}
            onAdd={() => go("workspace")}
          />
        )}
        {view === "learning" && lesson && (
          <LessonView
            key={lesson.id}
            initial={lesson}
            onBack={() => {
              void refresh();
              go("library");
            }}
            onUpdate={() => void refresh()}
            onRegenerated={generated}
            notify={setNotice}
          />
        )}
        {account && (
          <Modal title="设置" onClose={() => setAccount(false)}>
            <details className="z-detail">
              <summary>关于知径 · 素材致谢</summary>
              <p>
                <a
                  href="https://rive.app/marketplace/27136-51126-cat-pomodoro/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cat Pomodoro · AnggaMotion
                </a>{" "}
                ·{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
              </p>
              <p>知径改编：角色显示与对话动作联动。原角色造型未重绘。</p>
            </details>
            <button
              className="z-motion-toggle"
              type="button"
              aria-label="页面动效"
              aria-pressed={!motionPaused && !reducedMotion}
              disabled={!!reducedMotion}
              title={
                reducedMotion
                  ? "跟随系统的减少动态效果设置"
                  : "只影响页面动效，不影响音视频播放"
              }
              onClick={() => setMotionPaused((value) => !value)}
            >
              {!motionPaused && !reducedMotion ? (
                <Pause size={17} />
              ) : (
                <Play size={17} />
              )}
              <span>
                {reducedMotion
                  ? "已减少动态"
                  : motionPaused
                    ? "开启动效"
                    : "暂停动效"}
              </span>
            </button>
            <details className="z-detail z-device-settings">
              <summary>在其他设备继续学习</summary>
              <p>
                偏好与作品已保存在服务器。恢复码是你的私人钥匙，换浏览器或清除
                Cookie 后，用它找回内容。
              </p>
              {recovery ? (
                <div className="z-recovery">
                  <label>
                    请私下保存，不要发给别人
                    <input
                      readOnly
                      value={recovery}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    onClick={() =>
                      downloadText(
                        "知径-私人恢复码.txt",
                        `知径：${window.location.origin}${base}/\n私人恢复码：${recovery}\n请勿分享。持有码的人可访问你的学习内容。`,
                      )
                    }
                  >
                    下载保存恢复码
                  </button>
                </div>
              ) : (
                <button
                  className="button button-primary"
                  disabled={!!busy}
                  onClick={() => void makeRecovery()}
                >
                  {hasRecovery
                    ? "生成新恢复码（旧码会失效）"
                    : "生成我的恢复码"}
                </button>
              )}
              <hr />
              <h3>已有恢复码？</h3>
              <label className="z-field-label">
                恢复码
                <input
                  value={restore}
                  onChange={(e) => setRestore(e.target.value)}
                  placeholder="粘贴以前保存的恢复码"
                  autoComplete="off"
                />
              </label>
              <ErrorNotice message={error} />
              <button
                className="button button-quiet"
                disabled={!!busy || !restore.trim()}
                onClick={() => void restoreAccount()}
              >
                {busy ? <Spinner text={busy} /> : "恢复我的知藏"}
              </button>
            </details>
          </Modal>
        )}
        <footer className="z-footer z-container">
          <button
            className="z-text-link"
            onClick={() => {
              setError("");
              setAccount(true);
            }}
          >
            设置
          </button>
        </footer>
      </div>
    </div>
  );
}
