// Authored demo dialogue, not model inference. Personal text is saved, never treated
// as a verified biography; the visitor chooses a route explicitly.
export const lifeDemoChoices = [
  { id: "work", label: "把 AI 用进工作" },
  { id: "learn", label: "学了不少，还是用不上" },
  { id: "worry", label: "看完后有点焦虑" },
];
const followups = [
  { id: "smaller", label: "这一步能再小一点吗" },
  { id: "feedback", label: "我试过了，想复盘一下" },
  { id: "pause", label: "先放一放，之后再来" },
];
const routes = {
  work: {
    answer:
      "文章把使用工具分成了“知道、会用、用得好”。这里先不追求学会所有工具，只拿一件重复的小事试试。\n\n你更想从哪件事开始？",
    choices: [
      { id: "report", label: "写一份周报" },
      { id: "research", label: "整理一份资料" },
      { id: "start", label: "我还没想好" },
    ],
    reference: "workflow",
    title: "让工具进入一件真实工作",
    understanding:
      "认识工具与把工具用在工作里是两件事。先验证它能否帮上一件小事，再决定要不要深入。",
    action:
      "选一份已经完成、可以安全使用的材料，只请工具做一个小步骤，再与原来的做法对照。",
    check: "是否真的省时？有哪些错误需要返工？最终质量是否还能由自己把关？",
  },
  learn: {
    answer:
      "先不增加新的收藏。这次只留住一个能和生活发生关系的想法。\n\n你想把它放进哪类事情里？",
    choices: [
      { id: "task", label: "眼前的一件工作" },
      { id: "daily", label: "生活里的一个小决定" },
      { id: "unsure", label: "还没有具体场景" },
    ],
    reference: "action",
    title: "把一个想法变成一次小尝试",
    understanding:
      "读懂不等于已经用上。可以先把一个知识点与一个具体情境连起来，不要求一次改变整个生活。",
    action:
      "选文章里的一个想法，写下“如果遇到什么事，我可以尝试怎么做”，只在一件低风险的小事上试一次。",
    check: "这个想法在哪一步帮上了忙？哪里不适用？要补充什么条件？",
  },
  worry: {
    answer:
      "这篇文章把未来写得很紧迫，但“五年”是作者的情景推演，不是给每个人设定的倒计时。我们可以先把宏大的变化和眼前能做的事分开。\n\n哪一点更接近你现在的感受？",
    choices: [
      { id: "begin", label: "不知道从哪里开始" },
      { id: "behind", label: "担心自己跟不上" },
      { id: "waste", label: "怕投入最后白费" },
    ],
    reference: "window",
    title: "把远处的不确定，放回眼前的一步",
    understanding:
      "作者描绘的是一种可能路径，不是我的既定未来。先区分可观察的事实、自己的担心和能够尝试的小事。",
    action:
      "写下一个具体担心，再写一件这周可以低成本验证的事。先不据此做辞职、借贷或投资等重大决定。",
    check: "这次尝试带来了什么新信息？哪些担心仍缺少证据，哪些条件需要再了解？",
  },
};

export function demoLifeReply(context, history, notes, question, choice) {
  const last = history.at(-1)?.reply;
  const citations = (id) =>
    context.evidence.filter((e) => e.id === id).slice(0, 1);
  const finish = (
    answer,
    options,
    route = null,
    suggestion = null,
    stage = "direction",
  ) => ({
    answer,
    choices: options,
    route,
    stage,
    suggestion,
    citations: route ? citations(routes[route].reference) : [],
    engine: "preset-demo",
  });
  const available = last?.choices || lifeDemoChoices;
  // Old buttons cannot rewind an unrelated conversation.
  if (choice && !available.some((item) => item.id === choice)) {
    return finish(
      "这件事已经聊到下一步了。我们换个方向继续，之前的内容仍然保留。",
      lifeDemoChoices,
    );
  }
  if (routes[choice]) {
    const route = routes[choice];
    return finish(route.answer, route.choices, choice, null, "situation");
  }
  if (!last?.route)
    return finish(
      "先选一个最接近的方向，我们拿刚才读到的想法往下走。你的描述会留在这个场景里。",
      lifeDemoChoices,
    );
  const routeId = last.route,
    route = routes[routeId];
  const previous =
    notes[0] ||
    [...history].reverse().find((turn) => turn.reply?.suggestion)?.reply
      .suggestion;
  const suggestion = {
    title: route.title,
    understanding: route.understanding,
    action: route.action,
    check: route.check,
    citations: citations(route.reference),
    ...(previous
      ? {
          title: previous.title,
          understanding: previous.understanding,
          action: previous.action,
          check: previous.check,
          citations: previous.citations,
        }
      : {}),
  };
  if (choice === "pause")
    return finish(
      "好，先放在这里。不需要现在就做完，下次从猫猫进来，仍能接着这件事。",
      [{ id: "resume", label: "接着上次聊" }],
      routeId,
      null,
      "paused",
    );
  if (choice === "feedback") {
    return finish(
      notes.length
        ? "我们回看你已经收下的那一步。实际试的时候，哪一点帮上了忙，哪一点和想象的不一样？\n\n你可以接着说，也可以打开“我的记录”写下反馈。"
        : "试过之后的感受，比计划写得漂亮更重要。实际发生了什么？哪一步顺利，哪一步卡住了？",
      [],
      routeId,
      null,
      "reflection",
    );
  }
  if (last.stage === "reflection")
    return finish(
      "这段实践经过已经留在对话里。你可以把其中最重要的一点，写进记录的“后来怎么样了”，再决定保留原做法、缩小一步，还是先放一放。\n\n不必把一次尝试解释成成功或失败，先留下实际发生的变化。",
      followups,
      routeId,
      null,
      "reviewed",
    );
  if (choice === "smaller") {
    suggestion.title = "先用五分钟试一下";
    suggestion.action =
      routeId === "work"
        ? "只拿一段不含敏感信息的旧材料，请工具列出三个要点，然后自己逐句核对。五分钟后就停。"
        : routeId === "learn"
          ? "只写一句：“这篇文章让我想到生活里的哪件事？”今天先不要求落实更多。"
          : "只写下眼前最担心的一件事，再标出其中哪一点是已知事实。今天可以到这里为止。";
    return finish(
      "可以，我们把它缩小到今天就能结束的一步。做完之后再决定，不给它加上必须坚持的负担。",
      followups,
      routeId,
      suggestion,
      "plan",
    );
  }
  if (choice === "report")
    suggestion.action =
      "找一份已完成的周报，移除公司和个人敏感信息。请工具只把内容分成“进展、问题、下一步”，再自己核对一次，不直接把输出当成可交付稿。";
  if (choice === "research")
    suggestion.action =
      "选一小段公开资料，请工具列出三个要点，并逐条返回原文核对。先测试它是否帮你更快定位信息，不让它代替事实核查。";
  if (choice === "daily")
    suggestion.action =
      "选一个可逆的小决定，例如要不要花一小时尝试某个工具。写下想验证的一个问题、最多投入多少时间，以及什么时候停止。";
  if (choice === "unsure" || choice === "start")
    suggestion.action =
      "今天先记下工作或生活中一件重复、费力的小事。只把它描述清楚，暂时不必选工具或做计划。";
  const opening =
    last.stage === "paused"
      ? "我们接着上次的方向，把下一步重新摆在这里。"
      : "先试一个可以随时停下的小步骤。这张记录不是任务指标，只是给未来的自己留个落点。";
  return finish(opening, followups, routeId, suggestion, "plan");
}
