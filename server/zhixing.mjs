import { AppError, requiredText } from "./config.mjs";
import { all, one, run, uid, now, limit, db } from "./store.mjs";
import { demoLifeReply } from "./zhixing-demo.mjs";
import { lifeContext } from "./zhixing-context.mjs";

const working = new Set();
const optionalText = (s, max, name) =>
  s == null || s === "" ? "" : requiredText(s, 1, max, name);
const owned = (user, id) => {
  const row = one(
    "SELECT * FROM life_spaces WHERE user_id=? AND id=?",
    user,
    id,
  );
  if (!row) throw new AppError("找不到这个知行场景。", 404);
  return row;
};
const spaceView = (row) => ({
  id: row.id,
  title: row.title,
  context: JSON.parse(row.context),
  updatedAt: row.updated_at,
});
const noteView = (row) => ({
  ...JSON.parse(row.data),
  id: row.id,
  version: row.version,
  updatedAt: row.updated_at,
});
const turnView = (row) => ({
  id: row.id,
  requestId: row.request_id,
  question: row.question,
  reply: row.reply ? JSON.parse(row.reply) : null,
  status: row.status,
  createdAt: row.created_at,
});
const detail = (user, id) => ({
  ...spaceView(owned(user, id)),
  turns: all(
    "SELECT * FROM life_turns WHERE space_id=? ORDER BY rowid",
    id,
  ).map(turnView),
  notes: all(
    "SELECT * FROM life_notes WHERE space_id=? AND user_id=? ORDER BY updated_at DESC",
    id,
    user,
  ).map(noteView),
});

// Called after the common session and CSRF checks. Never touches profiles/Skill versions.
export async function routeLife(route, method, user, readBody) {
  if (!route.startsWith("/api/zhixing")) return null;
  if (route === "/api/zhixing" && method === "GET")
    return {
      demo: true,
      externalSearchAvailable: false,
      spaces: all(
        "SELECT * FROM life_spaces WHERE user_id=? ORDER BY updated_at DESC",
        user,
      ).map((row) => {
        const summary = spaceView(row);
        summary.context.evidence = [];
        return summary;
      }),
    };
  if (route === "/api/zhixing" && method === "POST") {
    const input = await readBody();
    const context = lifeContext(user, input.context);
    const existing =
      !input.newScene &&
      one(
        "SELECT * FROM life_spaces WHERE user_id=? AND source_key=? ORDER BY updated_at DESC LIMIT 1",
        user,
        context.key,
      );
    if (existing) {
      // Update only the reading return point; retain the saved source snapshot.
      const saved = JSON.parse(existing.context);
      Object.assign(saved, {
        returnTo: context.returnTo,
        chapter: context.chapter,
        mode: context.mode,
        at: context.at,
      });
      run(
        "UPDATE life_spaces SET context=?,updated_at=? WHERE id=?",
        JSON.stringify(saved),
        now(),
        existing.id,
      );
      return detail(user, existing.id);
    }
    limit(`life:create:${user}`, 100);
    const id = uid(),
      date = now();
    run(
      "INSERT INTO life_spaces VALUES(?,?,?,?,?,?,?)",
      id,
      user,
      context.key,
      "还没命名的一件事",
      JSON.stringify(context),
      date,
      date,
    );
    return detail(user, id);
  }
  const match = route.match(
    /^\/api\/zhixing\/([a-f0-9]{32})(?:\/(turns|notes)(?:\/([a-f0-9]{32}))?)?$/,
  );
  if (!match) throw new AppError("未找到知行页面。", 404);
  const [, id, action, noteId] = match;
  const row = owned(user, id);
  if (!action && method === "GET") return detail(user, id);
  if (!action && method === "PUT") {
    const input = await readBody();
    run(
      "UPDATE life_spaces SET title=?,updated_at=? WHERE id=?",
      requiredText(input.title, 1, 80, "场景名称"),
      now(),
      id,
    );
    return detail(user, id);
  }
  if (action === "turns" && method === "POST") {
    const input = await readBody();
    const requestId = requiredText(input.requestId, 8, 100, "消息标识");
    const question = requiredText(input.question, 1, 4000, "场景描述");
    if (working.has(user) || working.size >= 4)
      throw new AppError("正在整理上一条，稍等一下。", 429);
    let turn = one(
      "SELECT * FROM life_turns WHERE space_id=? AND request_id=?",
      id,
      requestId,
    );
    if (turn && turn.question !== question)
      throw new AppError("这条消息已经保存，请刷新后继续。", 409);
    if (turn?.status === "complete") return detail(user, id);
    if (!turn) {
      const turnId = uid();
      run(
        "INSERT INTO life_turns VALUES(?,?,?,?,?,?,?,?)",
        turnId,
        id,
        requestId,
        question,
        null,
        "recorded",
        now(),
        now(),
      );
      turn = one("SELECT * FROM life_turns WHERE id=?", turnId);
      run(
        "UPDATE life_spaces SET title=?,updated_at=? WHERE id=?",
        row.title === "还没命名的一件事" ? question.slice(0, 28) : row.title,
        now(),
        id,
      );
    }
    working.add(user);
    run(
      "UPDATE life_turns SET status='working',updated_at=? WHERE id=?",
      now(),
      turn.id,
    );
    try {
      const snapshot = detail(user, id);
      const history = snapshot.turns.filter((t) => t.id !== turn.id);
      const reply = demoLifeReply(
        snapshot.context,
        history,
        snapshot.notes,
        question,
        input.choice,
      );
      run(
        "UPDATE life_turns SET reply=?,status='complete',updated_at=? WHERE id=?",
        JSON.stringify(reply),
        now(),
        turn.id,
      );
      run("UPDATE life_spaces SET updated_at=? WHERE id=?", now(), id);
      return detail(user, id);
    } catch (e) {
      run(
        "UPDATE life_turns SET status='failed',updated_at=? WHERE id=?",
        now(),
        turn.id,
      );
      throw e;
    } finally {
      working.delete(user);
    }
  }
  if (action === "notes" && ["POST", "PUT"].includes(method)) {
    if ((method === "PUT" && !noteId) || (method === "POST" && noteId))
      throw new AppError("记录路径不正确。");
    const input = await readBody();
    const existing =
      noteId &&
      one(
        "SELECT * FROM life_notes WHERE id=? AND user_id=? AND space_id=?",
        noteId,
        user,
        id,
      );
    if (noteId && !existing) throw new AppError("找不到这条记录。", 404);
    if (existing && input.version !== existing.version)
      throw new AppError("这条记录已在其他页面更新，请刷新后再编辑。", 409);
    if (input.confirmed !== true) throw new AppError("请确认后再收进知行。");
    const context = JSON.parse(row.context);
    const citationIds = Array.isArray(input.citationIds)
      ? input.citationIds
      : [];
    if (
      citationIds.length > 3 ||
      citationIds.some((ref) => !context.evidence.some((e) => e.id === ref))
    )
      throw new AppError("记录的原文来源不正确。");
    const data = {
      title: requiredText(input.title, 1, 80, "标题"),
      understanding: optionalText(input.understanding, 2000, "我的理解"),
      action: optionalText(input.action, 1500, "先试的一步"),
      check: optionalText(input.check, 1000, "观察点"),
      reflection: optionalText(input.reflection, 3000, "实践反馈"),
      status: ["planned", "tried", "paused"].includes(input.status)
        ? input.status
        : "planned",
      citations: context.evidence.filter((e) => citationIds.includes(e.id)),
      provenance: "user-confirmed",
    };
    limit(`life:notes:${user}`, 200);
    const entryId = noteId || uid(),
      date = now(),
      version = existing ? existing.version + 1 : 1;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (existing)
        run(
          "UPDATE life_notes SET data=?,version=?,updated_at=? WHERE id=?",
          JSON.stringify(data),
          version,
          date,
          entryId,
        );
      else
        run(
          "INSERT INTO life_notes VALUES(?,?,?,?,?,?,?)",
          entryId,
          user,
          id,
          JSON.stringify(data),
          version,
          date,
          date,
        );
      run(
        "INSERT INTO life_note_versions VALUES(?,?,?,?)",
        entryId,
        version,
        JSON.stringify(data),
        date,
      );
      run("UPDATE life_spaces SET updated_at=? WHERE id=?", date, id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return detail(user, id);
  }
  throw new AppError("未找到知行操作。", 404);
}
