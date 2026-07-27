#!/bin/zsh
set -u

APP_RESOURCES="${0:A:h}"
PROJECT_ROOT="${APP_RESOURCES}/../../../../../"
PROJECT_ROOT="${PROJECT_ROOT:A}"
STUDIO_DIR="${PROJECT_ROOT}/data-studio"
PID_FILE="${STUDIO_DIR}/.dalti-data-studio.pid"
LOG_FILE="${STUDIO_DIR}/.dalti-data-studio.log"
INSTALL_STAMP="${STUDIO_DIR}/node_modules/.dalti-package-lock.sha256"
URL="http://127.0.0.1:4173/?fresh=$(date +%s)"
PORT="4173"

show_error() {
  /usr/bin/osascript -e "display alert \"Dalti Data Studio\" message \"$1\" as critical" >/dev/null 2>&1 || true
}

find_executable() {
  local candidate
  for candidate in "$@"; do
    if [[ -x "$candidate" ]]; then
      print -r -- "$candidate"
      return 0
    fi
  done
  return 1
}

stop_server_pid() {
  local pid="$1"
  local command
  local process_cwd
  [[ "$pid" == <-> ]] || return 0
  /bin/kill -0 "$pid" 2>/dev/null || return 0
  command="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$command" != *"$STUDIO_DIR/server.mjs"* ]]; then
    process_cwd="$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p' | /usr/bin/head -1)"
    if [[ "$command" != *"node server.mjs"* || "$process_cwd" != "$STUDIO_DIR" ]]; then
      return 0
    fi
  fi
  print -r -- "[$(/bin/date)] launcher: stopping pid=$pid" >>"$LOG_FILE"
  /bin/kill "$pid" 2>/dev/null || true
  for _ in {1..30}; do
    /bin/kill -0 "$pid" 2>/dev/null || return 0
    /bin/sleep 0.1
  done
  /bin/kill -KILL "$pid" 2>/dev/null || true
}

stop_server_listener() {
  local listener_pid
  listener_pid="$(/usr/sbin/lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | /usr/bin/head -1 || true)"
  [[ -n "$listener_pid" ]] && stop_server_pid "$listener_pid"
}

if [[ ! -d "$STUDIO_DIR" ]]; then
  show_error "data-studio 폴더를 찾지 못했습니다. 저장소 위치를 확인하세요."
  exit 1
fi

NODE_BIN="$(find_executable \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /Users/sam/.homebrew/bin/node \
  "$HOME/.nvm/current/bin/node" \
  "$HOME/.volta/bin/node" \
  "$(command -v node 2>/dev/null || true)" \
  || true)"

if [[ -z "$NODE_BIN" ]]; then
  show_error "Node.js를 찾지 못했습니다. Node.js 20 이상을 설치하세요. (Finder는 터미널 PATH를 자동으로 상속하지 않습니다.)"
  exit 1
fi

NODE_DIR="${NODE_BIN:h}"
NPM_BIN="$(find_executable "$NODE_DIR/npm" /opt/homebrew/bin/npm /usr/local/bin/npm /Users/sam/.homebrew/bin/npm "$HOME/.volta/bin/npm" "$(command -v npm 2>/dev/null || true)" || true)"
if [[ -z "$NPM_BIN" ]]; then
  show_error "npm을 찾지 못했습니다. Node.js 설치에 npm이 포함되어 있는지 확인하세요."
  exit 1
fi
export PATH="$NODE_DIR:$PATH"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(/bin/cat "$PID_FILE" 2>/dev/null || true)"
  stop_server_pid "$old_pid"
  /bin/rm -f "$PID_FILE"
fi
stop_server_listener

if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  show_error "포트 ${PORT}을 다른 프로그램이 사용 중입니다. 로그: ${LOG_FILE}"
  exit 1
fi

cd "$STUDIO_DIR" || exit 1
lock_hash="$(/usr/bin/shasum -a 256 "$STUDIO_DIR/package-lock.json" | /usr/bin/awk '{print $1}')"
installed_hash="$(/bin/cat "$INSTALL_STAMP" 2>/dev/null || true)"
install_required=0
if [[ ! -x "$STUDIO_DIR/node_modules/.bin/vite" || "$lock_hash" != "$installed_hash" ]]; then
  install_required=1
fi

{
  print -r -- "[$(/bin/date)] launcher: node=$NODE_BIN npm=$NPM_BIN"
  "$NODE_BIN" --check "$STUDIO_DIR/server.mjs"
  "$NPM_BIN" --version
} >>"$LOG_FILE" 2>&1

if (( install_required == 1 )); then
  "$NPM_BIN" install --no-audit --no-fund >>"$LOG_FILE" 2>&1
  install_status=$?
  if (( install_status != 0 )); then
    if [[ -x "$STUDIO_DIR/node_modules/.bin/vite" ]]; then
      print -r -- "[$(/bin/date)] launcher: npm install failed ($install_status), using existing node_modules for offline start" >>"$LOG_FILE"
    else
      show_error "의존성 갱신에 실패했습니다. 로그: ${LOG_FILE}"
      exit 1
    fi
  else
    print -r -- "$lock_hash" >"$INSTALL_STAMP"
  fi
else
  print -r -- "[$(/bin/date)] launcher: package-lock unchanged, reusing node_modules" >>"$LOG_FILE"
fi

# Finder가 launcher를 종료해도 Data Studio 서버가 계속 살아 있도록
# npm 중간 프로세스 없이 Node 서버를 직접 독립 실행합니다.
nohup "$NODE_BIN" "$STUDIO_DIR/server.mjs" >>"$LOG_FILE" 2>&1 </dev/null &
server_pid=$!
disown "$server_pid" 2>/dev/null || true
echo "$server_pid" >"$PID_FILE"

for _ in {1..100}; do
  if /usr/bin/curl -fsS --max-time 1 http://127.0.0.1:4173/api/state >/dev/null 2>&1; then
    if [[ "${DALTI_DATA_STUDIO_NO_OPEN:-0}" != "1" ]]; then
      /usr/bin/open "$URL"
    fi
    exit 0
  fi
  /bin/sleep 0.2
done

/bin/kill "$server_pid" 2>/dev/null || true
/bin/rm -f "$PID_FILE"
show_error "Data Studio 서버가 시작되지 않았습니다. 로그를 확인하세요."
exit 1
