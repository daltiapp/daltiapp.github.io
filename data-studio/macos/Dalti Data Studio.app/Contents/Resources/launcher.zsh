#!/bin/zsh
set -u

APP_RESOURCES="${0:A:h}"
PROJECT_ROOT="${APP_RESOURCES}/../../../../../"
PROJECT_ROOT="${PROJECT_ROOT:A}"
STUDIO_DIR="${PROJECT_ROOT}/data-studio"
PID_FILE="${STUDIO_DIR}/.dalti-data-studio.pid"
PORT_FILE="${STUDIO_DIR}/.dalti-data-studio.port"
LOG_FILE="${STUDIO_DIR}/.dalti-data-studio.log"
INSTALL_STAMP="${STUDIO_DIR}/node_modules/.dalti-package-lock.sha256"
PREFERRED_PORT="${DALTI_DATA_STUDIO_PORT:-4190}"
PORT_RANGE_END=$((PREFERRED_PORT + 19))
PORT=""
URL=""

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
  local port="$1"
  local listener_pid
  listener_pid="$(/usr/sbin/lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | /usr/bin/head -1 || true)"
  [[ -n "$listener_pid" ]] && stop_server_pid "$listener_pid"
}

port_is_busy() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
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
if [[ -f "$PORT_FILE" ]]; then
  previous_port="$(/bin/cat "$PORT_FILE" 2>/dev/null || true)"
  if [[ "$previous_port" == <-> ]]; then
    stop_server_listener "$previous_port"
  fi
fi

candidate="$PREFERRED_PORT"
while (( candidate <= PORT_RANGE_END )); do
  if ! port_is_busy "$candidate"; then
    PORT="$candidate"
    break
  fi
  candidate=$((candidate + 1))
done

if [[ -z "$PORT" ]]; then
  show_error "Data Studio 포트 ${PREFERRED_PORT}~${PORT_RANGE_END}가 모두 사용 중입니다. 로그: ${LOG_FILE}"
  exit 1
fi
URL="http://127.0.0.1:${PORT}/?fresh=$(date +%s)"

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
# Python의 새 세션으로 Node 프로세스를 완전히 분리합니다.
export DALTI_DATA_STUDIO_PORT="$PORT"
server_pid="$({
  /usr/bin/python3 - "$NODE_BIN" "$STUDIO_DIR/server.mjs" "$STUDIO_DIR" "$LOG_FILE" "$PORT" <<'PY'
import os
import subprocess
import sys

node_bin, server_path, working_dir, log_path, port = sys.argv[1:]
log_file = open(log_path, "ab", buffering=0)
environment = os.environ.copy()
environment["DALTI_DATA_STUDIO_PORT"] = port
process = subprocess.Popen(
    [node_bin, server_path],
    cwd=working_dir,
    stdin=subprocess.DEVNULL,
    stdout=log_file,
    stderr=subprocess.STDOUT,
    close_fds=True,
    start_new_session=True,
    env=environment,
)
print(process.pid)
PY
})"
if [[ "$server_pid" != <-> ]]; then
  /bin/rm -f "$PID_FILE" "$PORT_FILE"
  show_error "Data Studio 서버 프로세스를 분리하지 못했습니다. 로그: ${LOG_FILE}"
  exit 1
fi
echo "$server_pid" >"$PID_FILE"
echo "$PORT" >"$PORT_FILE"

for _ in {1..100}; do
  if /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/state" >/dev/null 2>&1; then
    if [[ "${DALTI_DATA_STUDIO_NO_OPEN:-0}" != "1" ]]; then
      /usr/bin/open "$URL"
    fi
    exit 0
  fi
  /bin/sleep 0.2
done

/bin/kill "$server_pid" 2>/dev/null || true
/bin/rm -f "$PID_FILE" "$PORT_FILE"
show_error "Data Studio 서버가 시작되지 않았습니다. 로그를 확인하세요."
exit 1
