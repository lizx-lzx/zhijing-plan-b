# Plan B 独立服务器部署

li 于 2026-09-18 明确授权常驻部署。入口：<https://app.chainvalley.top/zhijing-b/?start=welcome>。

| 项目 | B 版配置 |
| --- | --- |
| 根目录 | `/home/ubuntu/apps/zhijing-plan-b` |
| 版本目录 | `releases/20260918-standalone`，`current` 指向当前版本 |
| 数据 | 根目录下 `data-plan-b/`，独立于版本目录 |
| 网页 | `zhijing-plan-b-web.service`，回环端口 4359 |
| API | `zhijing-plan-b-api.service`，回环端口 4360 |
| Nginx | `zhijing-plan-b-location.conf`，仅 `/zhijing-b/` |
| 私有配置 | 根目录下 `private/.env.plan-b`，当前无需模型密钥 |

两个服务均配置 `Restart=always` 和开机自启。网页、API 使用生产模式，不依赖 SSH 会话、开发终端或用户电脑持续开机。数据库不随版本切换清空，页面和 API 仅在本机回环监听，由现有 HTTPS 入口转发。

## 构建与发布原则

```sh
npm ci
npm run demo:install
NEXT_PUBLIC_BASE_PATH=/zhijing-b ZH_PUBLIC_ORIGIN=https://app.chainvalley.top npm run build:complete
```

上传源码、`dist/`、两个重建的文章案例目录；在服务器的独立版本目录安装对应 Linux 依赖。不上传本地 `node_modules/`、`.env*`、SQLite、私人对话或运行缓存。

`ZH_PLAN_B_ROOT` 只允许当前源码位于独立 `zhijing-plan-b/releases/<版本>` 下时使用，持久化数据和私有配置不得越过该 B 根目录，也不能借助软链接指向 A。

首次发布前检查 4359/4360 空闲、A 的进程与网页基线；先启动 B 两个服务并检查内部健康，再仅向共享 HTTPS server 增加 B include。共享 Nginx 配置保留副本并比对哈希，`nginx -t` 成功才平滑 reload；校验失败恢复原配置。

更新时先上传新的独立版本并验证，不覆盖运行中的版本目录。切换 `current` 后只重启 B 两个服务；失败退回原 B 版本并重启，不重启 A。首次部署的 Nginx 原配置保留在服务器 B 私有目录，不能上传到公开仓库。

## 维护

在服务器执行：

```sh
sudo systemctl status zhijing-plan-b-web zhijing-plan-b-api
sudo systemctl is-enabled zhijing-plan-b-web zhijing-plan-b-api
sudo journalctl -u zhijing-plan-b-web -u zhijing-plan-b-api -n 80
curl -fsS http://127.0.0.1:4360/zhijing-b/api/health
```

只需临时停用 B 时，可停止这两个 B 服务；不要操作 `zhijing-learning` 或 `zhijing-api`。没有安装本机自启，没有改 A 数据和原 `/zhijing/` 路由。旧部署脚本仍在 `docs/upstream-deploy-reference/` 且保持禁用。

常驻不等于零故障保证：服务器、网络、域名和证书仍需维护；本次未添加异地备份或外部监控。
