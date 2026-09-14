# 继续打磨知径

本目录为独立 Plan B，先阅读 `README.md` 与 `docs/PLAN-B.md`。旧版部署记录仅供参考，不得用于更新原知径。

先阅读 README 与 `docs/21-运行与完整打包.md`。当前线上以预置文章演示为主；未经明确切换，不要把输入区改回真实生成，也不要让预置答案伪装成针对本次输入生成的结果。

## 界面方向

- 宣纸色、朱红点缀、温馨书房。动效服务于内容和操作反馈，不增加无关装饰。
- 重要内容清楚，重复小字减少；必要的错误提示、来源和授权说明仍保留在合适位置。
- 问卷只需完成一次，录屏用快捷键反复回到起点；不要在主页面增加重置面板。
- 六种形式共用知识结构和学习位置。主要形式与勾选项必须联动，清空、全选、取消主要形式都需保持一致。
- 原文在学习页左侧完整呈现并高亮对应句子；手机保留可用的原文入口。
- 小猫可拖动、点击在上方聊天；开始对话后不重复展示初始快捷问题，不催促或惩罚用户。

## 修改位置

| 想改什么                   | 从哪里开始                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| 欢迎页、书房输入区、问卷   | `components/learning-*.tsx`、`app/*.css`                                        |
| 六形式勾选联动             | `lib/demo-route.ts`、`components/learning-workbench.tsx`                        |
| 个性化学法 / 内容生成      | `lib/domain.ts`、`server/prompts/`、`server/model.mjs`                          |
| 原文对照、学习进度         | `components/source-reader.tsx`、`components/use-study-state.ts`                 |
| 预置文章播放器及多形式展示 | `experiments/openmaic-preview/main.jsx`、`format-views.jsx`                     |
| 逐章图解                   | `experiments/openmaic-preview/narrative-slide.mjs`、`study-ui.jsx`              |
| 动效视频                   | `experiments/article-motion/`                                                   |
| 小猫及陪读                 | `components/reading-companion.tsx`、`companion-cat.tsx`、`server/companion.mjs` |

改样式通常不需要调用模型。修改讲稿、时间轴或画面后，检查冻结媒体是否仍匹配；不把旧成片标成新生成。保留用户已有作品和当前未提交改动，不上传密钥或运行数据。
