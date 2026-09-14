"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
} from "lucide-react";
import {
  buildProfile,
  defaultAnswers,
  mediaLabels,
  questions,
} from "../lib/domain";
import type { Answers, Medium, Profile } from "../lib/domain";
import { api, endpoint, ErrorNotice, Spinner } from "./learning-ui";
import { ChoicePreview } from "./learning-previews";
import { ArticleCasePreview } from "./learning-case-preview";

export function SkillEditor({
  profile,
  onSave,
  onBack,
  existing = false,
  onRetake,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onBack: () => void;
  existing?: boolean;
  onRetake?: () => void;
}) {
  const [draft, setDraft] = useState(profile),
    [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [versions, setVersions] = useState<
    { id: string; profile: Profile; createdAt: string }[]
  >([]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ profile: Profile }>("/profile", "PUT", {
        profile: draft,
      });
      onSave(data.profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="z-container-small z-profile">
      <div className="z-page-heading">
        <h1>{existing ? "读法笺" : "你的学法，准备好了"}</h1>
      </div>
      <div className="z-profile-summary">
        {(["primary", "entry", "pace"] as const).map((key, i) => (
          <div key={key}>
            <span>{["偏好的形式", "讲解入口", "学习节奏"][i]}</span>
            <strong>
              {
                questions
                  .find((q) => q.id === key)
                  ?.options.find((o) => o.value === draft.answers[key])?.label
              }
            </strong>
          </div>
        ))}
      </div>
      <details className="z-detail z-profile-rules">
        <summary>查看与编辑学习规则</summary>
        <p>{draft.summary}</p>
        <div className="z-rule-list">
          {draft.rules.map((r) => (
            <details
              key={r.id}
              className="z-rule"
              open={editing === r.id ? true : undefined}
            >
              <summary>
                <span>{r.title}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="z-rule-content">
                <p className="z-rule-evidence">依据：{r.evidence}</p>
                {editing === r.id ? (
                  <textarea
                    aria-label={`编辑${r.title}`}
                    value={r.instruction}
                    maxLength={1500}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rules: draft.rules.map((rule) =>
                          rule.id === r.id
                            ? { ...rule, instruction: e.target.value }
                            : rule,
                        ),
                      })
                    }
                  />
                ) : (
                  <p>{r.instruction}</p>
                )}
                {["entry", "goal", "support", "pace", "personal"].includes(
                  r.id,
                ) && (
                  <button
                    className="z-text-link"
                    onClick={() => setEditing(editing === r.id ? null : r.id)}
                  >
                    {editing === r.id ? "收起编辑" : "修改这条"}
                  </button>
                )}
              </div>
            </details>
          ))}
        </div>
      </details>
      <ErrorNotice message={error} />
      {existing && (
        <div className="z-profile-tools">
          <button
            className="button button-quiet"
            onClick={onRetake}
            disabled={busy}
          >
            重新做问卷
          </button>
          <a className="button button-quiet" href={endpoint("/profile/export")}>
            <Download size={16} />
            下载 Skill
          </a>
        </div>
      )}
      <div className="z-profile-actions">
        <button
          className="button button-quiet"
          onClick={onBack}
          disabled={busy}
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <button
          className="button button-primary button-large"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? <Spinner text="正在保存" /> : "保存并开始学习"}
          <ArrowRight size={17} />
        </button>
      </div>
      {existing && (
        <details
          className="z-detail"
          onToggle={(e) => {
            if (e.currentTarget.open)
              void api<{ versions: typeof versions }>("/profile/versions")
                .then((d) => setVersions(d.versions))
                .catch((e) => setError(e.message));
          }}
        >
          <summary>以前的版本</summary>
          {versions.map((v) => (
            <button
              className="z-version"
              key={v.id}
              onClick={() => {
                setDraft(v.profile);
                setEditing(null);
              }}
            >
              <span>{new Date(v.createdAt).toLocaleString("zh-CN")}</span>
              <strong>{v.profile.name}</strong>
              <span>保存后恢复</span>
            </button>
          ))}
        </details>
      )}
    </main>
  );
}

export function Onboarding({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Answers;
  onSave: (p: Profile) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>(
      initial || { ...defaultAnswers },
    ),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = questions[step];
  async function finish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Plan B is a demonstration: use the preset rule templates immediately.
      // Keep selected preferences, but never wait for a model or a second save page.
      const data = await api<{ profile: Profile }>("/profile", "PUT", {
        profile: buildProfile(answers),
      });
      onSave(data.profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className={`z-onboarding z-container-small${q.id === "entry" ? " z-onboarding-entry" : ""}`}
    >
      <div className="z-question-meta">
        <span>
          第 {step + 1} / {questions.length} 题
        </span>
        <strong>随时可改</strong>
      </div>
      <div
        className="z-progress"
        role="progressbar"
        aria-label="问卷进度"
        aria-valuemin={0}
        aria-valuemax={8}
        aria-valuenow={step + 1}
      >
        <span style={{ width: `${((step + 1) / 8) * 100}%` }} />
      </div>
      <div className="z-groups">
        {["认识你的学习习惯", "找到更容易看懂的讲法", "按你舒服的节奏来"].map(
          (g, i) => (
            <button
              type="button"
              disabled={busy}
              className={q.group === g ? "active" : ""}
              aria-current={q.group === g ? "step" : undefined}
              key={g}
              onClick={() =>
                setStep(questions.findIndex((item) => item.group === g))
              }
            >
              <span>{i + 1}</span>
              {["学习习惯", "理解方式", "学习节奏"][i]}
            </button>
          ),
        )}
      </div>
      <section key={step} className="z-question">
        <h1>{q.title}</h1>
        {q.help && <p className="z-help">{q.help}</p>}
        <div
          className={`z-choices${q.id === "pace" ? " z-visual-choices" : ""}`}
          data-multiple={!!q.multiple}
        >
          {q.options.map((option) => {
            const value = answers[q.id];
            const selected = q.multiple
              ? Array.isArray(value) &&
                (value as string[]).includes(option.value)
              : value === option.value;
            return (
              <button
                key={option.value}
                disabled={busy}
                className={`z-choice ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() =>
                  setAnswers((a) => {
                    if (q.multiple) {
                      const values = a[q.id] as string[];
                      return {
                        ...a,
                        [q.id]: selected
                          ? values.filter((v) => v !== option.value)
                          : [...values, option.value],
                      };
                    }
                    return {
                      ...a,
                      [q.id]: option.value,
                      ...(q.id === "primary"
                        ? { extras: a.extras.filter((v) => v !== option.value) }
                        : {}),
                    };
                  })
                }
              >
                <ChoicePreview question={q.id} value={option.value} />
                <span className="z-choice-label">
                  <span className="z-check">
                    {selected && <Check size={16} />}
                  </span>
                  <span>
                    <strong>{option.label}</strong>
                    {option.detail && <small>{option.detail}</small>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {q.id === "primary" && <ArticleCasePreview medium={answers.primary} />}
        {q.id === "primary" && (
          <div className="z-extras">
            <span>其他形式（可选）</span>
            <div>
              {(Object.keys(mediaLabels) as Medium[])
                .filter((m) => m !== answers.primary)
                .map((m) => (
                  <label key={m}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={answers.extras.includes(m)}
                      onChange={(e) =>
                        setAnswers((a) => ({
                          ...a,
                          extras: e.target.checked
                            ? [...a.extras, m]
                            : a.extras.filter((x) => x !== m),
                        }))
                      }
                    />
                    {mediaLabels[m]}
                  </label>
                ))}
            </div>
          </div>
        )}
        {step === 7 && (
          <label className="z-note-label">
            还有什么想告诉我们？（选填）
            <textarea
              disabled={busy}
              maxLength={600}
              value={answers.note}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, note: e.target.value }))
              }
              placeholder="比如：喜欢故事，少用术语。"
            />
          </label>
        )}
        <ErrorNotice message={error} />
        <div className="z-question-actions">
          <button
            className="button button-quiet"
            onClick={() => (step ? setStep(step - 1) : onCancel())}
            disabled={busy}
          >
            <ArrowLeft size={17} />
            上一步
          </button>
          <button
            className="button button-primary button-large"
            disabled={busy}
            onClick={() => (step === 7 ? void finish() : setStep(step + 1))}
          >
            {busy ? (
              <Spinner text="正在进入" />
            ) : step === 7 ? (
              "进入待启集"
            ) : (
              "下一步"
            )}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
      </section>
    </main>
  );
}
