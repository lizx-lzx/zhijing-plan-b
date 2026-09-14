#!/usr/bin/env bash
printf '%s\n' 'Plan B: 原知径部署脚本仅供参考，已禁用。' >&2
exit 2
set -euo pipefail
# Frontend-only release. Does not change nginx, API service, private env or data.
# Usage on the server: bash deploy/activate-ui.sh /absolute/new/release /absolute/expected/current
app=/home/ubuntu/apps/zhijing
release=${1:?Provide the staged release}
expected=${2:?Provide the expected current release}
case "$release" in "$app"/releases/*) ;; *) exit 2 ;; esac
case "$expected" in "$app"/releases/*) ;; *) exit 2 ;; esac
test "$(readlink -f "$release")" = "$release"
test "$(readlink -f "$app/current")" = "$expected"
test "$release" != "$expected"
test -s "$release/dist/server/index.js"
test -s "$release/public/demo/zhihu-window-20260908/index.html"
test -x "$release/node_modules/.bin/vinext"
cmp -s "$release/package-lock.json" "$expected/package-lock.json"
test ! -e "$app/current-ui-next"
test ! -L "$app/current-ui-next"
test ! -e "$app/current-ui-rollback"
test ! -L "$app/current-ui-rollback"
curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:4330/zhijing/api/health

rollback() {
  trap - ERR
  sudo ln -s "$expected" "$app/current-ui-rollback"
  sudo mv -Tf "$app/current-ui-rollback" "$app/current"
  sudo systemctl restart zhijing-learning.service
  printf 'Frontend verification failed; restored the previous release. API was left running.\n' >&2
}
sudo ln -s "$release" "$app/current-ui-next"
trap rollback ERR
sudo mv -Tf "$app/current-ui-next" "$app/current"
sudo systemctl restart zhijing-learning.service
healthy=false
for ((attempt=0; attempt<20; attempt++)); do
  if curl -fsS --max-time 4 -o /dev/null http://127.0.0.1:4329/zhijing/; then healthy=true; break; fi
  sleep 1
done
test "$healthy" = true
curl -fsS --max-time 15 -o /dev/null https://app.chainvalley.top/zhijing/
curl -fsS --max-time 15 -o /dev/null https://app.chainvalley.top/zhijing/api/health
trap - ERR
printf 'Frontend release active: %s\nPrevious release retained: %s\n' "$release" "$expected"
