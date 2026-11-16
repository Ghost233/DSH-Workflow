#!/bin/bash
# hub-bot 开发实例一键重启：杀旧进程(按 PID，不误杀) → 起新实例 → 等就绪。
# 后端代码 (src/*.js) 改动后跑一次即可；面板前端与设置改动不需要本脚本。
set -euo pipefail

DSH_HOME_DIR="${DSH_HOME_DIR:-/tmp/dsh-hub-bot-dev}"
PORT="${PORT:-3199}"
DSH_BIN="/Applications/Ghost DSH Station.app/Contents/Resources/node_modules/@deepseek-ai/dsh/lib/bin.js"

PID=$(pgrep -f "lib/bin.js hub-bot-dev" | head -1 || true)
if [ -n "$PID" ]; then kill -9 "$PID" 2>/dev/null || true; sleep 2; fi

DSH_HOME="$DSH_HOME_DIR" nohup node "$DSH_BIN" hub-bot-dev --port "$PORT" --no-open \
  > "$DSH_HOME_DIR/boot-$(date +%Y%m%d-%H%M%S).log" 2>&1 &

for i in $(seq 1 25); do
  code=$(curl -s -m 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/hub-bot/panel/" 2>/dev/null || true)
  if [ "$code" = "200" ]; then
    echo "ready: http://127.0.0.1:$PORT/hub-bot/panel/"
    exit 0
  fi
  sleep 2
done
echo "not ready after 50s — check the boot log in $DSH_HOME_DIR" >&2
exit 1
