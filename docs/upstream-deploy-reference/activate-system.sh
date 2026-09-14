#!/usr/bin/env bash
printf '%s\n' 'Plan B: 原知径部署脚本仅供参考，已禁用。' >&2
exit 2
set -euo pipefail
# Main frontend + API release. No nginx, credential or provider configuration changes.
app=/home/ubuntu/apps/zhijing
release=${1:?Provide the staged release}
expected=${2:?Provide the expected current release}
node=/home/ubuntu/opt/node-v24.19.0-linux-x64/bin/node
case "$release" in "$app"/releases/*) ;; *) exit 2 ;; esac
case "$expected" in "$app"/releases/*) ;; *) exit 2 ;; esac
test "$(readlink -f "$release")" = "$release"
test "$(readlink -f "$app/current")" = "$expected"
test "$release" != "$expected"
test -s "$release/dist/server/index.js"
test -s "$release/server/migrations/002-study-state.sql"
test -s "$release/public/demo/zhihu-window-20260908/index.html"
test -s "$release/public/demo/openmaic-20260908/index.html"
test -x "$release/node_modules/.bin/vinext"
cmp -s "$release/package-lock.json" "$expected/package-lock.json"
test ! -e "$app/current-system-next"
test ! -L "$app/current-system-next"
test ! -e "$app/current-system-rollback"
test ! -L "$app/current-system-rollback"
curl -fsS --max-time 10 http://127.0.0.1:4330/zhijing/api/health | "$node" --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(!h.ok||h.queue!==0)process.exit(1);'
# Stop the old API during snapshot/activation. Additive migration only:
# rollback never restores an older DB over new user data.
rollback() {
  trap - ERR
  if test "$(readlink -f "$app/current")" != "$expected"; then
    sudo ln -s "$expected" "$app/current-system-rollback"
    sudo mv -Tf "$app/current-system-rollback" "$app/current"
  fi
  sudo systemctl restart zhijing-api.service zhijing-learning.service
  printf 'System release failed; both previous services restored. User data was not rolled back.\n' >&2
}
trap rollback ERR
sudo systemctl stop zhijing-api.service
backup=$(mktemp -d /home/ubuntu/zhijing-db-before-system-v2.XXXXXX)
chmod 700 "$backup"
ZH_BACKUP_TARGET="$backup/zhijing.sqlite" "$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/home/ubuntu/apps/zhijing/data/zhijing.sqlite");db.prepare("VACUUM INTO ?").run(process.env.ZH_BACKUP_TARGET);console.log("Database snapshot created");db.close();'
chmod 600 "$backup/zhijing.sqlite"
sudo ln -s "$release" "$app/current-system-next"
sudo mv -Tf "$app/current-system-next" "$app/current"
sudo systemctl restart zhijing-api.service zhijing-learning.service
healthy=false
for ((attempt=0; attempt<30; attempt++)); do
  if curl -fsS --max-time 4 -o /dev/null http://127.0.0.1:4329/zhijing/ && curl -fsS --max-time 4 http://127.0.0.1:4330/zhijing/api/health | "$node" --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(!h.ok||h.version!=="2.0.0")process.exit(1);'; then healthy=true; break; fi
  sleep 1
done
test "$healthy" = true
curl -fsS --max-time 15 -o /dev/null https://app.chainvalley.top/zhijing/
curl -fsS --max-time 15 https://app.chainvalley.top/zhijing/api/health | "$node" --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;if(JSON.parse(s).version!=="2.0.0")process.exit(1);'
trap - ERR
printf 'System active: %s\nPrevious release retained: %s\nPrivate DB snapshot: %s\n' "$release" "$expected" "$backup"
