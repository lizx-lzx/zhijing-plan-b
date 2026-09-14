import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { config, AppError } from "./config.mjs";

export const db = new DatabaseSync(path.join(config.dataDir, "zhijing.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, recovery_hash TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profile_versions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,url TEXT NOT NULL,mode TEXT NOT NULL,blocks TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),source_id TEXT NOT NULL REFERENCES sources(id),profile TEXT NOT NULL,formats TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,result TEXT,analysis TEXT,media TEXT NOT NULL DEFAULT '{}',error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,feedback TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotas(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS companion_chats(lesson_id TEXT PRIMARY KEY REFERENCES lessons(id),data TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS companion_lobby(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS life_spaces(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),source_key TEXT NOT NULL,title TEXT NOT NULL,context TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS life_turns(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES life_spaces(id),request_id TEXT NOT NULL,question TEXT NOT NULL,reply TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(space_id,request_id));
CREATE TABLE IF NOT EXISTS life_notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),space_id TEXT NOT NULL REFERENCES life_spaces(id),data TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS life_note_versions(note_id TEXT NOT NULL REFERENCES life_notes(id),version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(note_id,version));
CREATE INDEX IF NOT EXISTS idx_life_owner ON life_spaces(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_life_notes_owner ON life_notes(user_id,space_id);
CREATE INDEX IF NOT EXISTS idx_lessons_owner ON lessons(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_queue ON lessons(status,created_at);
CREATE INDEX IF NOT EXISTS idx_sources_owner ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_versions_owner ON profile_versions(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery ON users(recovery_hash) WHERE recovery_hash IS NOT NULL;
`);
// Append-only, additive migration; old releases ignore this table on rollback.
if (db.prepare("PRAGMA user_version").get().user_version < 2) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      fs.readFileSync(
        new URL("./migrations/002-study-state.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export const uid = () => randomBytes(16).toString("hex");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const now = () => new Date().toISOString();
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
const sessionCookieName = "zhijing_plan_b_session";

export function session(req, res) {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  const existing =
    raw && raw.length <= 128
      ? one(
          "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
          hash(raw),
          Date.now(),
        )
      : null;
  if (existing) return existing.user_id;
  const user = uid();
  run("INSERT INTO users(id,created_at) VALUES(?,?)", user, now());
  setSession(res, user);
  return user;
}
export function setSession(res, user) {
  const token = randomBytes(32).toString("base64url");
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    user,
    Date.now() + 1000 * 86400 * 180,
  );
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=${config.basePath || "/"}; HttpOnly; SameSite=Lax; Max-Age=15552000${config.production ? "; Secure" : ""}`,
  );
}
export function limit(key, max, seconds = 86400) {
  const bucket = `${key}:${Math.floor(Date.now() / 1000 / seconds)}`;
  const row = one("SELECT count FROM quotas WHERE key=?", bucket);
  if (row && row.count >= max)
    throw new AppError(
      "今天的使用次数已达到保护限额，请稍后再来。已保存的内容仍可查看。",
      429,
      "RATE_LIMIT",
    );
  run(
    "INSERT INTO quotas VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    bucket,
    Date.now() + seconds * 2000,
  );
}
export function getProfile(user) {
  const r = one("SELECT data FROM profiles WHERE user_id=?", user);
  return r ? JSON.parse(r.data) : null;
}
export function saveProfile(user, data) {
  const time = now();
  const saved = { ...data, updatedAt: time };
  db.exec("BEGIN IMMEDIATE");
  try {
    run(
      "INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      user,
      JSON.stringify(saved),
      time,
    );
    run(
      "INSERT INTO profile_versions VALUES(?,?,?,?)",
      uid(),
      user,
      JSON.stringify(saved),
      time,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return saved;
}
export function getSource(user, id) {
  const r = one("SELECT * FROM sources WHERE id=? AND user_id=?", id, user);
  if (!r) throw new AppError("找不到这篇内容。", 404);
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    mode: r.mode,
    blocks: JSON.parse(r.blocks),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export function lessonView(r, details = true) {
  const stored = one(
    "SELECT data,updated_at FROM lesson_state WHERE lesson_id=?",
    r.id,
  );
  const state = stored
    ? { ...JSON.parse(stored.data), updatedAt: stored.updated_at }
    : {};
  return {
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    status: r.status,
    stage: r.stage,
    progress: r.progress,
    result: details && r.result ? JSON.parse(r.result) : null,
    profile: details ? JSON.parse(r.profile) : null,
    formats: JSON.parse(r.formats),
    media: JSON.parse(r.media),
    error: r.error,
    createdAt: r.created_at,
    completed: !!r.completed,
    feedback: r.feedback ? JSON.parse(r.feedback) : null,
    studyState: details
      ? state
      : {
          mode: state.mode,
          chapter: state.chapter,
          updatedAt: state.updatedAt,
        },
  };
}
export function ownedLesson(user, id) {
  const r = one("SELECT * FROM lessons WHERE id=? AND user_id=?", id, user);
  if (!r) throw new AppError("找不到这份学习作品。", 404);
  return r;
}
export function updateLesson(id, fields) {
  const keys = Object.keys(fields).filter((k) =>
    [
      "title",
      "status",
      "stage",
      "progress",
      "result",
      "analysis",
      "media",
      "error",
      "attempts",
      "completed",
      "feedback",
      "formats",
    ].includes(k),
  );
  run(
    `UPDATE lessons SET ${keys.map((k) => `${k}=?`).join(",")},updated_at=? WHERE id=?`,
    ...keys.map((k) => fields[k]),
    now(),
    id,
  );
}
run("DELETE FROM sessions WHERE expires_at<?", Date.now());
run("DELETE FROM quotas WHERE expires_at<?", Date.now());
