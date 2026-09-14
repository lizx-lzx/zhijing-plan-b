"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Plus, Send, X } from "lucide-react";
import { api, base, Brand } from "./learning-ui";
import {
  emptyLifeNote,
  lifeDemoChoices,
  type LifeChoice,
  type LifeContext,
  type LifeEvidence,
  type LifeNote,
  type LifeSpace,
  type LifeTurn,
} from "../lib/zhixing";

type Index = {
  demo: boolean;
  externalSearchAvailable: boolean;
  spaces: Omit<LifeSpace, "turns" | "notes">[];
};
function contextInput(context?: LifeContext) {
  return context?.key === "demo:window-five-years"
    ? {
        article: "window-five-years",
        chapter: context.chapter,
        mode: context.mode,
        at: context.at,
      }
    : context?.key.startsWith("lesson:")
      ? { lessonId: context.key.slice(7) }
      : { article: "window-five-years" };
}
function Evidence({ entries }: { entries: LifeEvidence[] }) {
  if (!entries.length) return null;
  return (
    <details className="life-evidence">
      <summary>原文依据 · {entries.length}</summary>
      {entries.map((entry) => (
        <blockquote key={entry.id}>
          <p>{entry.quote}</p>
          <cite>
            {entry.title} · {entry.kind}
          </cite>
          {entry.url &&
            /^https:\/\/(?:zhuanlan\.)?zhihu\.com\//.test(entry.url) && (
              <a href={entry.url} target="_blank" rel="noopener noreferrer">
                打开来源 ↗
              </a>
            )}
        </blockquote>
      ))}
    </details>
  );
}

export default function ZhixingSpace() {
  const [index, setIndex] = useState<Index | null>(null);
  const [space, setSpace] = useState<LifeSpace | null>(null);
  const [busy, setBusy] = useState(false),
    [boot, setBoot] = useState(true),
    [error, setError] = useState("");
  const [question, setQuestion] = useState(""),
    [search, setSearch] = useState("");
  const [tab, setTab] = useState<"notes" | "source">("notes");
  const [editor, setEditor] = useState<LifeNote | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const draftScope = useRef("");
  const request = useRef<{ id: string; space: string; text: string } | null>(
    null,
  );

  const restoreDraft = useCallback((id: string) => {
    const key = `zhijing-life-draft:${id}`;
    if (draftScope.current === key) return;
    draftScope.current = key;
    try {
      setQuestion(sessionStorage.getItem(key) || "");
    } catch {
      setQuestion("");
    }
  }, []);
  const accept = useCallback(
    (data: LifeSpace) => {
      restoreDraft(data.id);
      setSpace(data);
      setIndex((old) =>
        old
          ? {
              ...old,
              spaces: [data, ...old.spaces.filter((s) => s.id !== data.id)],
            }
          : old,
      );
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({ scene: data.id }).toString();
      window.history.replaceState(null, "", url);
    },
    [restoreDraft],
  );
  async function loadScene(id: string) {
    if (sending.current) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<LifeSpace>(`/zhixing/${id}`);
      accept(data);
      setEditor(null);
      setRename(null);
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function start() {
      try {
        const data = await api<Index>("/zhixing");
        if (!active) return;
        setIndex(data);
        const params = new URLSearchParams(window.location.search);
        let current: LifeSpace | null = null;
        if (params.get("article") || params.get("lessonId")) {
          current = await api<LifeSpace>("/zhixing", "POST", {
            context: Object.fromEntries(params),
          });
        } else if (params.get("scene")) {
          current = await api<LifeSpace>(
            `/zhixing/${encodeURIComponent(params.get("scene")!)}`,
          );
        } else if (data.spaces[0]) {
          current = await api<LifeSpace>(`/zhixing/${data.spaces[0].id}`);
        }
        if (active) {
          if (current) accept(current);
          else restoreDraft("new");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setBoot(false);
      }
    }
    void start();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [accept, restoreDraft]);
  // Only unsent text lives in session storage; saved conversations are server-owned.
  function editQuestion(text: string) {
    setQuestion(text);
    try {
      sessionStorage.setItem(draftScope.current, text);
    } catch {
      /* Saving still works if browser storage is unavailable. */
    }
  }
  const lastTurnStatus = space?.turns.at(-1)?.status;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [space?.turns.length, lastTurnStatus]);
  async function newScene() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<LifeSpace>("/zhixing", "POST", {
        context: contextInput(space?.context),
        newScene: true,
      });
      accept(data);
      setEditor(null);
      setRename(null);
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(retry?: LifeTurn, choice?: LifeChoice) {
    const text =
      retry?.question ||
      [question.trim(), choice?.label].filter(Boolean).join("\n");
    if (sending.current || busy || !text || !index) return;
    sending.current = true;
    setReplyBusy(true);
    setBusy(true);
    setError("");
    setNotice("");
    let current = space;
    try {
      if (!current) {
        current = await api<LifeSpace>("/zhixing", "POST", {
          context: contextInput(),
        });
        accept(current);
        editQuestion(text);
      }
      const prior = request.current;
      const requestId =
        retry?.requestId ||
        (prior?.space === current.id && prior.text === text
          ? prior.id
          : crypto.randomUUID());
      request.current = { id: requestId, space: current.id, text };
      const data = await api<LifeSpace>(
        `/zhixing/${current.id}/turns`,
        "POST",
        { question: text, requestId, choice: choice?.id },
      );
      if (!mounted.current) return;
      accept(data);
      if (!retry) editQuestion("");
      request.current = null;
    } catch (e) {
      if (!mounted.current) return;
      setError((e as Error).message);
      // Recover an already saved message rather than duplicating it after a network failure.
      if (current) {
        try {
          const data = await api<LifeSpace>(`/zhixing/${current.id}`);
          accept(data);
          if (data.turns.some((t) => t.requestId === request.current?.id))
            editQuestion("");
        } catch {
          /* Keep the local draft if the server cannot be reached. */
        }
      }
    } finally {
      sending.current = false;
      if (mounted.current) {
        setBusy(false);
        setReplyBusy(false);
      }
    }
  }
  async function saveNote() {
    if (!space || !editor || busy || !editor.title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<LifeSpace>(
        `/zhixing/${space.id}/notes${editor.id ? `/${editor.id}` : ""}`,
        editor.id ? "PUT" : "POST",
        {
          ...editor,
          citationIds: editor.citations.map((c) => c.id),
          confirmed: true,
        },
      );
      accept(data);
      setEditor(null);
      setTab("notes");
      setNotice("已收进你的知行。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTitle() {
    if (!space || !rename?.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      accept(
        await api<LifeSpace>(`/zhixing/${space.id}`, "PUT", { title: rename }),
      );
      setRename(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    index?.spaces.filter((s) =>
      `${s.title} ${s.context.title}`.includes(search.trim()),
    ) || [];
  return (
    <main className="life-app">
      <header className="life-header">
        <a href={`${base}/`} aria-label="回到知径">
          <Brand />
        </a>
        <span className="life-wordmark">知行</span>
        <span className="life-demo-label">演示对话</span>
        <a className="life-return" href={space?.context.returnTo || `${base}/`}>
          <ArrowLeft size={16} />
          {space?.context.key !== "personal" && space
            ? "回到刚才那一段"
            : "回到书房"}
        </a>
      </header>
      <div className="life-layout" aria-busy={busy || boot}>
        <aside className="life-scenes">
          <details open>
            <summary>我的知行</summary>
            <button
              type="button"
              className="life-new"
              onClick={() => void newScene()}
              disabled={busy || boot}
            >
              <Plus size={17} />
              聊另一件事
            </button>
            <input
              aria-label="查找知行场景"
              placeholder="找一件事"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <nav aria-label="知行场景">
              {filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={space?.id === item.id ? "page" : undefined}
                  onClick={() => void loadScene(item.id)}
                  disabled={busy}
                >
                  <strong>{item.title}</strong>
                  <span>{item.context.title}</span>
                </button>
              ))}
            </nav>
            {!filtered.length && !boot && (
              <p className="life-muted">
                {search ? "还没找到这件事。" : "从眼前的一件事开始。"}
              </p>
            )}
          </details>
        </aside>
        <section className="life-conversation" aria-label="知行对话">
          <div className="life-scene-heading">
            {rename !== null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTitle();
                }}
              >
                <input
                  aria-label="场景名称"
                  value={rename}
                  maxLength={80}
                  onChange={(e) => setRename(e.target.value)}
                />
                <button disabled={busy}>保存</button>
                <button type="button" onClick={() => setRename(null)}>
                  取消
                </button>
              </form>
            ) : (
              <>
                <h1>
                  {space?.title && space.turns.length
                    ? space.title
                    : "让读到的，走进生活。"}
                </h1>
                {space && (
                  <button
                    type="button"
                    className="life-text-button"
                    onClick={() => setRename(space.title)}
                  >
                    起个名字
                  </button>
                )}
              </>
            )}
            {space && space.context.key !== "personal" && (
              <p className="life-article">
                <BookOpen size={16} />
                {space.context.title}
              </p>
            )}
          </div>
          <div className="life-messages" aria-live="polite">
            {boot && <p role="status">正在打开你的知行…</p>}
            {!boot && !space?.turns.length && (
              <div className="life-welcome">
                <span className="life-sprout" aria-hidden="true">
                  ✳
                </span>
                <h2>
                  最近有什么事，
                  <br />
                  想在这里一起想想？
                </h2>
                <p>从你的处境说起，不必先整理好。</p>
              </div>
            )}
            {space?.turns.map((turn) => (
              <article className="life-turn" key={turn.id}>
                <div className="life-user">
                  <span>你</span>
                  <p>{turn.question}</p>
                </div>
                {turn.reply && (
                  <div className="life-answer">
                    <span>知行</span>
                    <p>{turn.reply.answer}</p>
                    <Evidence entries={turn.reply.citations} />
                    {turn.reply.suggestion && (
                      <section className="life-suggestion">
                        <h3>{turn.reply.suggestion.title}</h3>
                        <p>{turn.reply.suggestion.understanding}</p>
                        <strong>可以先试</strong>
                        <p>{turn.reply.suggestion.action}</p>
                        <strong>试后看看</strong>
                        <p>{turn.reply.suggestion.check}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditor({
                              ...emptyLifeNote(),
                              ...turn.reply!.suggestion!,
                            });
                            setTab("notes");
                          }}
                          disabled={busy}
                        >
                          整理后收进知行 <ArrowUpRight size={15} />
                        </button>
                      </section>
                    )}
                  </div>
                )}
                {turn.status !== "complete" && (
                  <button
                    className="life-text-button"
                    disabled={busy}
                    onClick={() => void send(turn)}
                  >
                    {turn.status === "failed"
                      ? "重新整理这条"
                      : "从这件事继续聊"}
                  </button>
                )}
              </article>
            ))}
            {!boot && (
              <div className="life-demo-choices" aria-label="继续对话">
                {(space?.turns.length
                  ? space.turns.at(-1)?.reply?.choices || []
                  : lifeDemoChoices
                ).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={busy || !index}
                    onClick={() => void send(undefined, choice)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
            {replyBusy && <p role="status">正在接着聊…</p>}
            <div ref={bottom} />
          </div>
          <div className="life-composer">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                aria-label="说说你的处境"
                placeholder={
                  space?.turns.length
                    ? "接着说，或者记下后来发生的变化…"
                    : "比如：我想把 AI 用在工作里，但不知道先从哪件事开始。"
                }
                value={question}
                maxLength={4000}
                onChange={(e) => editQuestion(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy || boot || !index || !question.trim()}
              >
                <span>一起想想</span>
                <Send size={17} />
              </button>
            </form>
            {error && (
              <p className="life-error" role="alert">
                {error}{" "}
                <button type="button" onClick={() => window.location.reload()}>
                  刷新
                </button>
              </p>
            )}
            {notice && (
              <p className="life-notice" role="status">
                {notice}
              </p>
            )}
          </div>
        </section>
        <aside className="life-knowledge" aria-label="知行知识记录">
          <div className="life-tabs">
            <button
              aria-pressed={tab === "notes"}
              onClick={() => setTab("notes")}
            >
              我的记录
            </button>
            <button
              aria-pressed={tab === "source"}
              onClick={() => setTab("source")}
            >
              文章线索
            </button>
          </div>
          {tab === "source" ? (
            <div className="life-source-list">
              {space?.context.evidence.map((entry) => (
                <article key={entry.id}>
                  <h3>{entry.title}</h3>
                  <blockquote>{entry.quote}</blockquote>
                  <span className="life-muted">{entry.kind}</span>
                  {entry.interpretation && (
                    <details>
                      <summary>学习讲解</summary>
                      <p>{entry.interpretation}</p>
                    </details>
                  )}
                  <button
                    className="life-text-button"
                    disabled={busy}
                    onClick={() => {
                      setEditor({
                        ...emptyLifeNote(),
                        title: entry.title,
                        citations: [entry],
                      });
                      setTab("notes");
                    }}
                  >
                    记下我的理解 ↗
                  </button>
                </article>
              ))}
              {!space?.context.evidence.length && (
                <p className="life-muted">
                  从文章里的猫猫进入，会带上那篇文章。
                </p>
              )}
            </div>
          ) : (
            <>
              {editor ? (
                <form
                  className="life-note-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveNote();
                  }}
                >
                  <div className="life-editor-heading">
                    <h2>{editor.id ? "更新这条记录" : "留下自己的一步"}</h2>
                    <button
                      type="button"
                      aria-label="取消编辑记录"
                      onClick={() => setEditor(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <label>
                    给它一个名字
                    <input
                      aria-label="记录标题"
                      maxLength={80}
                      required
                      value={editor.title}
                      onChange={(e) =>
                        setEditor({ ...editor, title: e.target.value })
                      }
                    />
                  </label>
                  {(
                    [
                      ["understanding", "我的理解", 2000],
                      ["action", "先试的一步", 1500],
                      ["check", "试后观察什么", 1000],
                      ["reflection", "后来怎么样了", 3000],
                    ] as const
                  ).map(([field, label, max]) => (
                    <label key={field}>
                      {label}
                      <textarea
                        aria-label={label}
                        maxLength={max}
                        value={editor[field]}
                        onChange={(e) =>
                          setEditor({ ...editor, [field]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    现在的状态
                    <select
                      aria-label="实践状态"
                      value={editor.status}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          status: e.target.value as LifeNote["status"],
                        })
                      }
                    >
                      <option value="planned">准备试试</option>
                      <option value="tried">试过了</option>
                      <option value="paused">先放一放</option>
                    </select>
                  </label>
                  <Evidence entries={editor.citations} />
                  <button
                    className="life-save"
                    disabled={busy || !editor.title.trim()}
                  >
                    {editor.id ? "保存更新" : "确认收进知行"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="life-notes-heading">
                    <h2>留给自己的收获</h2>
                    <button
                      className="life-text-button"
                      disabled={!space || busy}
                      onClick={() => setEditor(emptyLifeNote())}
                    >
                      <Plus size={16} />
                      记一笔
                    </button>
                  </div>
                  {!space?.notes.length && (
                    <div className="life-empty-note">
                      <p>
                        一个理解、一次尝试，
                        <br />
                        以及试过之后的发现。
                      </p>
                      <span>由你确认，才收在这里。</span>
                    </div>
                  )}
                  {space?.notes.map((note) => (
                    <article className="life-note" key={note.id}>
                      <span className="life-note-status">
                        {
                          {
                            planned: "准备试试",
                            tried: "试过了",
                            paused: "先放一放",
                          }[note.status]
                        }
                      </span>
                      <h3>{note.title}</h3>
                      {note.understanding && <p>{note.understanding}</p>}
                      {note.action && (
                        <p>
                          <strong>我的一步</strong>
                          {note.action}
                        </p>
                      )}
                      {note.check && (
                        <p>
                          <strong>观察点</strong>
                          {note.check}
                        </p>
                      )}
                      {note.reflection && (
                        <p>
                          <strong>后来的发现</strong>
                          {note.reflection}
                        </p>
                      )}
                      <Evidence entries={note.citations} />
                      <button
                        className="life-text-button"
                        disabled={busy}
                        onClick={() => setEditor(note)}
                      >
                        编辑 · 记下反馈
                      </button>
                    </article>
                  ))}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
