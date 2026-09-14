"use client";
import { useEffect, useRef, useState } from "react";
import { api, base } from "./learning-ui";
import { zhixingEntry } from "../lib/zhixing";
import { CompanionCat } from "./companion-cat";
import { useCompanionDrag } from "./use-companion-drag";
import { studyNudges, useStudyNudge } from "./use-study-nudge";
type Message = {
  role: string;
  text: string;
  citations?: { id: string; quote: string }[];
};
export function ReadingCompanion({
  lessonId,
  target,
  onSource,
  studyContext,
  onOriginal,
  lifeHref,
  onLife,
}: {
  lessonId?: string;
  target: {
    id: string;
    title: string;
    nonce: number;
    paragraphIndex?: number;
  } | null;
  onSource: (ids: string[], text: string) => void;
  studyContext?: { id: string; title: string; quote?: string };
  onOriginal?: () => void;
  lifeHref?: string;
  onLife?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<{
      id: string;
      title: string;
      paragraphIndex?: number;
    } | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const chatPath = lessonId ? `/lessons/${lessonId}/chat` : "/companion/chat";
  const conversation = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const floating = useCompanionDrag(launcher, panel, open);
  const hint = useStudyNudge(studyContext?.id, open);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  useEffect(() => {
    if (conversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, busy, open]);
  useEffect(() => {
    if (target) {
      setScope(target);
      setOpen(true);
    }
  }, [target]);
  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    api<{ messages: Message[] }>(chatPath)
      .then((d) => {
        if (active) {
          setMessages(d.messages);
          setLoaded(true);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("对话暂时无法读取，请关闭后重试。");
      });
    return () => {
      active = false;
    };
  }, [open, loaded, chatPath]);
  async function send(text: string) {
    if (busy || !loaded || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ messages: Message[] }>(chatPath, "POST", {
        question: text,
        chapterId: scope?.id,
        paragraphIndex: scope?.paragraphIndex,
      });
      setMessages(d.messages);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="z-pet"
        ref={launcher}
        style={floating.style}
        {...floating.handlers}
        onKeyDown={(e) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-20, 0],
            ArrowRight: [20, 0],
            ArrowUp: [0, -20],
            ArrowDown: [0, 20],
          };
          if (delta[e.key]) {
            e.preventDefault();
            floating.moveBy(...delta[e.key]);
          }
        }}
        aria-expanded={open}
        aria-controls="companion-popover"
        aria-label="打开陪读小猫"
        onClick={() => {
          if (floating.consumeClick()) return;
          if (hint.nudge) {
            const action = hint.nudge;
            hint.dismiss();
            if (action === "original" && onOriginal) {
              onOriginal();
              return;
            }
            setQuestion(
              `请帮我梳理「${studyContext?.title || "这一章"}」。${studyContext?.quote ? `参考原文：${studyContext.quote}` : ""}`,
            );
            setOpen(true);
            return;
          }
          if (open) close();
          else setOpen(true);
        }}
      >
        <CompanionCat busy={busy} open={open} />
        {hint.nudge && (
          <span className="z-pet-nudge" role="status">
            {studyNudges.find((item) => item.id === hint.nudge)?.text}
          </span>
        )}
      </button>
      {open && (
        <section
          id="companion-popover"
          className="z-pet-popover"
          role="dialog"
          aria-label="陪读小猫"
          aria-modal="false"
          ref={panel}
          style={floating.panelStyle}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <header className="z-pet-popover-header">
            <strong>陪读小猫</strong>
            <button className="z-text-link" aria-label="关闭" onClick={close}>
              ×
            </button>
          </header>
          {(scope || lessonId) && (
            <div className="z-pet-scope">
              {scope ? scope.title : "这篇文章"}
              {scope && (
                <button className="z-text-link" onClick={() => setScope(null)}>
                  聊整篇
                </button>
              )}
            </div>
          )}
          <div className="z-pet-messages" aria-live="polite" ref={conversation}>
            {messages.map((m, i) => (
              <div className={`z-pet-message ${m.role}`} key={i}>
                <strong>{m.role === "user" ? "你" : "小猫"}</strong>
                <p>{m.text}</p>
                {m.citations?.map((c, j) => (
                  <button
                    className="z-text-link"
                    key={j}
                    onClick={() => {
                      setOpen(false);
                      onSource([c.id], c.quote);
                    }}
                  >
                    查看原文：{c.quote.slice(0, 32)}…
                  </button>
                ))}
              </div>
            ))}
            {busy && <p role="status">小猫正在翻书…</p>}
          </div>
          {loaded && messages.length === 0 && !busy && (
            <div className="z-pet-shortcuts">
              {(lessonId
                ? ["讲简单点", "换个例子", "帮我回顾重点", "问我一个小问题"]
                : [
                    "怎么开始学习？",
                    "帮我选一种学习方式",
                    "今天不太想学，陪我聊聊",
                    "怎么找到之前的文章？",
                  ]
              ).map((t) => (
                <button
                  className="button button-quiet"
                  disabled={busy || !loaded}
                  key={t}
                  onClick={() => void send(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(question);
            }}
          >
            <textarea
              aria-label="问小猫"
              placeholder="写下你想问的…"
              value={question}
              maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)}
              className="z-pet-input"
            />
            <div className="z-pet-actions">
              <button
                type="button"
                className="z-text-link"
                onClick={() => {
                  setOpen(false);
                }}
              >
                继续阅读
              </button>
              <button
                className="button button-primary"
                disabled={busy || !loaded || !question.trim()}
              >
                发送
              </button>
            </div>
          </form>
          {error && <p role="alert">{error}</p>}
          <a
            className="z-pet-life-entry"
            href={
              lifeHref ||
              zhixingEntry(base, lessonId ? { lessonId } : undefined)
            }
            onClick={onLife}
          >
            用到我的生活里 <span aria-hidden="true">↗</span>
          </a>
        </section>
      )}
    </>
  );
}
