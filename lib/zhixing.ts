export type LifeEvidence = {
  id: string;
  title: string;
  quote: string;
  interpretation?: string;
  kind: string;
  url?: string;
};
export type LifeContext = {
  key: string;
  title: string;
  returnTo: string;
  evidence: LifeEvidence[];
  chapter?: string;
  mode?: string;
  at?: number;
};
export type LifeSuggestion = {
  title: string;
  understanding: string;
  action: string;
  check: string;
  citations: LifeEvidence[];
};
export type LifeNote = LifeSuggestion & {
  id?: string;
  version?: number;
  reflection: string;
  status: "planned" | "tried" | "paused";
  updatedAt?: string;
};
export type LifeChoice = { id: string; label: string };
export const lifeDemoChoices: LifeChoice[] = [
  { id: "work", label: "把 AI 用进工作" },
  { id: "learn", label: "学了不少，还是用不上" },
  { id: "worry", label: "看完后有点焦虑" },
];
export type LifeTurn = {
  id: string;
  requestId: string;
  question: string;
  status: string;
  reply: {
    answer: string;
    citations: LifeEvidence[];
    suggestion: LifeSuggestion | null;
    choices: LifeChoice[];
    engine: "preset-demo";
  } | null;
};
export type LifeSpace = {
  id: string;
  title: string;
  context: LifeContext;
  updatedAt: string;
  turns: LifeTurn[];
  notes: LifeNote[];
};
export const emptyLifeNote = (): LifeNote => ({
  title: "",
  understanding: "",
  action: "",
  check: "",
  reflection: "",
  status: "planned",
  citations: [],
});
export function zhixingEntry(
  base: string,
  context?: {
    article?: string;
    lessonId?: string;
    chapter?: string;
    mode?: string;
    at?: number;
  },
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(context || {}))
    if (value != null) params.set(key, String(value));
  return `${base}/zhixing/${params.size ? `?${params}` : ""}`;
}
