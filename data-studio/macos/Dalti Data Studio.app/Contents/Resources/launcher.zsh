#!/bin/zsh
set -u

APP_RESOURCES="${0:A:h}"
PROJECT_ROOT="${APP_RESOURCES}/../../../../../"
STUDIO_DIR="${PROJECT_ROOT}/data-studio"
PID_FILE="${STUDIO_DIR}/.dalti-data-studio.pid"
LOG_FILE="${STUDIO_DIR}/.dalti-data-studio.log"
URL="http://127.0.0.1:4173/?fresh=$(date +%s)"

show_error() {
  /usr/bin/osascript -e "display alert \"Dalti Data Studio\" message \"$1\" as critical" >/dev/null 2>&1 || true
}

if [[ ! -d "$STUDIO_DIR" ]]; then
  show_error "data-studio 폴더를 찾지 못했습니다. 저장소 위치를 확인하세요."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  show_error "Node.js가 필요합니다. Node.js 20 이상을 설치한 뒤 다시 실행하세요."
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(/bin/cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$old_pid" == <-> ]] && /bin/kill -0 "$old_pid" 2>/dev/null; then
    old_command="$(/bin/ps -p "$old_pid" -o command= 2>/dev/null || true)"
    if [[ "$old_command" == *"data-studio/server.mjs"* ]]; then
      /bin/kill "$old_pid" 2>/dev/null || true
      for _ in {1..20}; do
        /bin/kill -0 "$old_pid" 2>/dev/null || break
        /bin/sleep 0.1
      done
    fi
  fi
  /bin/rm -f "$PID_FILE"
fi

cd "$STUDIO_DIR" || exit 1
/usr/bin/env npm install --no-audit --no-fund >>"$LOG_FILE" 2>&1 || {
  show_error "의존성 갱신에 실패했습니다. 로그: data-studio/.dalti-data-studio.log"
  exit 1
}

/usr/bin/env npm run dev >>"$LOG_FILE" 2>&1 &
server_pid=$!
echo "$server_pid" >"$PID_FILE"

for _ in {1..100}; do
  if /usr/bin/curl -fsS --max-time 1 http://127.0.0.1:4173/api/state >/dev/null 2>&1; then
    /usr/bin/open "$URL"
    exit 0
  fi
  /bin/sleep 0.2
done

show_error "Data Studio 서버가 시작되지 않았습니다. 로그를 확인하세요."
exit 1
