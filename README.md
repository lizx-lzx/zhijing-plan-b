# 知径 · Plan B

知径的独立开发副本。保留“读懂一篇文章”，在此基础上探索“把知识用到自己的生活里”。

当前已完成源码复制和本地隔离；新的生活应用对话、经验检索与文章推荐尚未实现。

## 开始运行

Node.js 24；在本目录执行：

```sh
npm ci
npm run demo:install
npm run demo:build
npm run dev:plan-b
```

打开 [Plan B 欢迎页](http://localhost:3100/zhijing/?start=welcome) 或 [问卷](http://localhost:3100/zhijing/?start=questionnaire)。

`dev:plan-b` 在前台同时启动网页和 API，退出终端或 Ctrl+C 停止；不安装自启动服务。
端口已被占用时拒绝启动，不连接到别的项目。

浏览预置作品不需要模型密钥。AI 问卷设计、陪读等功能需要单独配置本目录 `.env.plan-b`，模板为 `.env.example`。未配置时保留真实错误与原有基础规则选项，不伪装模型生成。

## 与原版隔离

| 项目       | Plan B                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| 起点       | 原知径 `17d7d50225fa7cfce2061a62454c8422a90c0eb8`                         |
| Git        | 独立仓库与完整原版历史；`codex/plan-b`；无远程推送目标                    |
| 网页 / API | `localhost:3100` / `127.0.0.1:4430`                                       |
| 数据       | 本目录 `data-plan-b/`，不带原版账户、恢复码或作品记录                     |
| 会话       | `zhijing_plan_b_session`，不覆盖原版 Cookie；不同网页端口也隔离浏览器存储 |
| 配置       | 本目录 `.env.plan-b`；拒绝导入其他项目的配置或数据目录                    |
| 部署       | 尚未配置。原站点、GitHub 与服务器不变                                     |

因为现有案例沿用 `/zhijing/` 相对路径，本地保持此路径，但使用不同网页源；它不是原站点的线上副本地址。

## 下一阶段

见 [Plan B 产品边界与开发顺序](docs/PLAN-B.md)。已确认：从学习页可主动进入新的独立对话页；结合用户困境、文章知识、可追溯的类似经历，必要时补充方法或其他文章。不能强制读完、强制行动，也不把推荐变成新的信息堆积。

## 验证与资料

```sh
npm run test:plan-b
npm run test:unit
npm run typecheck
npm run build:complete
```

原版的完整产品说明见 [原版 README](README.知径原版.md)，仅作为复制起点的历史背景，运行命令以本 README 为准。
文章、图片、音视频、小猫等素材保留原有来源及权利边界，见 [THIRD-PARTY.md](THIRD-PARTY.md)。
