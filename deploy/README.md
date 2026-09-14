# Plan B 部署边界

本副本当前只在本地运行，尚未连接任何线上发布目标。

不要更新 `/home/ubuntu/apps/zhijing`、原知径的 systemd 服务、Nginx 路由或数据库。
原部署资料移至 `docs/upstream-deploy-reference/` 仅供理解历史，执行脚本已禁用。
将来部署时应使用独立目录、服务名、访问入口与数据库，再单独验证。
