#!/usr/bin/env bash
printf '%s\n' 'Plan B: 原知径部署脚本仅供参考，已禁用。' >&2
exit 2
set -euo pipefail
# Run on the user's server, after staging checks; touches only the Zhijing service and location.
app=/home/ubuntu/apps/zhijing
release="$app/releases/20260907-v1"
previous=$(readlink -f "$app/current")
test "$previous" = "$app/releases/20260829-145102-b28d351"
test -s "$release/dist/server/index.js"
test -s "$previous/deploy/zhijing-location.conf"
cmp -s "$previous/deploy/zhijing-location.conf" /etc/nginx/snippets/zhijing-location.conf
test ! -e "$app/current-next"
rollback() {
  sudo systemctl disable --now zhijing-api.service || true
  sudo ln -s "$previous" "$app/current-rollback"
  sudo mv -Tf "$app/current-rollback" "$app/current"
  sudo install -m 644 "$previous/deploy/zhijing-location.conf" /etc/nginx/snippets/zhijing-location.conf
  sudo nginx -t && sudo systemctl reload nginx
  sudo systemctl restart zhijing-learning.service
  printf 'New release failed; restored previous Zhijing version.\n' >&2
}
trap rollback ERR
sudo install -m 644 "$release/deploy/zhijing-api.service" /etc/systemd/system/zhijing-api.service
sudo install -m 644 "$release/deploy/zhijing-location.conf" /etc/nginx/snippets/zhijing-location.conf
sudo nginx -t
sudo ln -s "$release" "$app/current-next"
sudo mv -Tf "$app/current-next" "$app/current"
sudo systemctl daemon-reload
sudo systemctl restart zhijing-learning.service
sudo systemctl enable --now zhijing-api.service
healthy=false
for attempt in $(seq 1 15); do
  if curl -fsS --max-time 4 -o /dev/null http://127.0.0.1:4329/zhijing/ && curl -fsS --max-time 4 -o /dev/null http://127.0.0.1:4330/zhijing/api/health; then healthy=true; break; fi
  sleep 2
done
test "$healthy" = true
sudo systemctl reload nginx
# A successful HUP returns before new nginx workers have taken over all listeners.
# Poll the public route instead of treating the first old-worker 404 as a failed release.
public_healthy=false
for attempt in $(seq 1 15); do
  if curl -fsS --max-time 10 https://app.chainvalley.top/zhijing/api/health; then public_healthy=true; break; fi
  sleep 2
done
test "$public_healthy" = true
trap - ERR
printf '\nNew Zhijing release active; previous release retained.\n'
