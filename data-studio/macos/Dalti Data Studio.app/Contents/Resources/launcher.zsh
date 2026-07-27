#!/bin/zsh
set -u

APP_RESOURCES="${0:A:h}"
STATE_DIR="${HOME}/Library/Application Support/DaltiDataStudio"
LOG_DIR="${HOME}/Library/Logs/DaltiDataStudio"
LAUNCH_LOG="${LOG_DIR}/launcher.log"
SERVER_LOG="${LOG_DIR}/server.log"
PID_FILE="${STATE_DIR}/server.pid"
PORT_FILE="${STATE_DIR}/server.port"
ROOT_FILE="${STATE_DIR}/studio-root"
LOCK_DIR="${STATE_DIR}/launcher.lock"
SPAWN_HELPER="${APP_RESOURCES}/spawn_server.py"
PREFERRED_PORT="${DALTI_DATA_STUDIO_PORT:-4190}"
PORT_RANGE_END=$((PREFERRED_PORT + 19))
SESSION_ID="$(/bin/date '+%Y%m%d-%H%M%S')-$$"
STAGE="bootstrap"
STUDIO_DIR=""
PORT=""
URL=""
server_pid=""
lock_acquired=0

/bin/mkdir -p "$STATE_DIR" "$LOG_DIR"

log_event() {
  local level="$1"
  shift
  print -r -- "[$(/bin/date '+%Y-%m-%dT%H:%M:%S%z')] [$level] session=$SESSION_ID stage=$STAGE $*" >>"$LAUNCH_LOG"
}

show_error() {
  /usr/bin/osascript - "$1" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run arguments
  display alert "Dalti Data Studio" message (item 1 of arguments) as critical
end run
APPLESCRIPT
}

fail_launch() {
  local message="$1"
  log_event "ERROR" "$message"
  show_error "${message}

실패 단계: ${STAGE}
진단 로그: ${LAUNCH_LOG}
서버 로그: ${SERVER_LOG}"
  exit 1
}

release_lock() {
  if (( lock_acquired == 1 )); then
    /bin/rm -f "$LOCK_DIR/pid"
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap release_lock EXIT

STAGE="discover-project"
requested_root="${DALTI_DATA_STUDIO_ROOT:-}"
if [[ -n "$requested_root" && -f "$requested_root/server.mjs" && -f "$requested_root/package.json" ]]; then
  STUDIO_DIR="${requested_root:A}"
else
  search_dir="$APP_RESOURCES"
  for _ in {1..12}; do
    if [[ -f "$search_dir/server.mjs" && -f "$search_dir/package.json" ]]; then
      STUDIO_DIR="${search_dir:A}"
      break
    fi
    parent_dir="${search_dir:h}"
    [[ "$parent_dir" == "$search_dir" ]] && break
    search_dir="$parent_dir"
  done
fi

if [[ -z "$STUDIO_DIR" ]]; then
  log_event "ERROR" "server.mjs를 찾지 못함 app_resources=$APP_RESOURCES"
  show_error "Data Studio 프로젝트를 찾지 못했습니다.

앱을 data-studio 폴더 안의 macos 폴더에서 실행하세요.
현재 앱 위치: ${APP_RESOURCES}
진단 로그: ${LAUNCH_LOG}"
  exit 1
fi

INSTALL_STAMP="${STUDIO_DIR}/node_modules/.dalti-package-lock.sha256"
LEGACY_PID_FILE="${STUDIO_DIR}/.dalti-data-studio.pid"
LEGACY_PORT_FILE="${STUDIO_DIR}/.dalti-data-studio.port"
log_event "INFO" "launcher start app_resources=$APP_RESOURCES studio_dir=$STUDIO_DIR preferred_port=$PREFERRED_PORT"

STAGE="acquire-lock"
for _ in {1..100}; do
  if /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
    print -r -- "$$" >"$LOCK_DIR/pid"
    lock_acquired=1
    break
  fi
  lock_pid="$(/bin/cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ "$lock_pid" != <-> ]] || ! /bin/kill -0 "$lock_pid" 2>/dev/null; then
    /bin/rm -f "$LOCK_DIR/pid"
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
    continue
  fi
  /bin/sleep 0.2
done
(( lock_acquired == 1 )) || fail_launch "다른 Data Studio 재시작 작업이 끝나지 않았습니다."

find_executable() {
  local candidate
  for candidate in "$@"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      print -r -- "$candidate"
      return 0
    fi
  done
  return 1
}

STAGE="resolve-runtime"
NODE_BIN="$(find_executable \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /Users/sam/.homebrew/bin/node \
  "${HOME}/.nvm/current/bin/node" \
  "${HOME}/.volta/bin/node" \
  "$(command -v node 2>/dev/null || true)" \
  || true)"
[[ -n "$NODE_BIN" ]] || fail_launch "Node.js 실행 파일을 찾지 못했습니다."

NODE_DIR="${NODE_BIN:h}"
NPM_BIN="$(find_executable \
  "$NODE_DIR/npm" \
  /opt/homebrew/bin/npm \
  /usr/local/bin/npm \
  /Users/sam/.homebrew/bin/npm \
  "${HOME}/.volta/bin/npm" \
  "$(command -v npm 2>/dev/null || true)" \
  || true)"
[[ -n "$NPM_BIN" ]] || fail_launch "npm 실행 파일을 찾지 못했습니다."
[[ -x /usr/bin/python3 ]] || fail_launch "서버 분리에 필요한 /usr/bin/python3를 찾지 못했습니다."
[[ -f "$SPAWN_HELPER" ]] || fail_launch "서버 분리 도우미를 찾지 못했습니다: $SPAWN_HELPER"
export PATH="$NODE_DIR:$PATH"

stop_server_pid() {
  local pid="$1"
  local expected_root="$2"
  local command
  [[ "$pid" == <-> ]] || return 0
  /bin/kill -0 "$pid" 2>/dev/null || return 0
  command="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ -z "$expected_root" || "$command" != *"$expected_root/server.mjs"* ]]; then
    log_event "WARN" "PID 파일 대상이 Data Studio 서버와 다름 pid=$pid command=$command expected_root=$expected_root"
    return 0
  fi
  log_event "INFO" "기존 서버 종료 pid=$pid root=$expected_root"
  /bin/kill "$pid" 2>/dev/null || true
  for _ in {1..40}; do
    /bin/kill -0 "$pid" 2>/dev/null || return 0
    /bin/sleep 0.1
  done
  /bin/kill -KILL "$pid" 2>/dev/null || true
}

port_is_busy() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

STAGE="stop-previous-server"
previous_root="$(/bin/cat "$ROOT_FILE" 2>/dev/null || true)"
previous_pid="$(/bin/cat "$PID_FILE" 2>/dev/null || true)"
stop_server_pid "$previous_pid" "$previous_root"
legacy_pid="$(/bin/cat "$LEGACY_PID_FILE" 2>/dev/null || true)"
stop_server_pid "$legacy_pid" "$STUDIO_DIR"
/bin/rm -f "$PID_FILE" "$PORT_FILE"
/bin/rm -f "$LEGACY_PID_FILE" "$LEGACY_PORT_FILE"

STAGE="select-port"
candidate="$PREFERRED_PORT"
while (( candidate <= PORT_RANGE_END )); do
  if ! port_is_busy "$candidate"; then
    PORT="$candidate"
    break
  fi
  log_event "INFO" "port busy port=$candidate"
  candidate=$((candidate + 1))
done
[[ -n "$PORT" ]] || fail_launch "사용 가능한 포트가 없습니다: ${PREFERRED_PORT}~${PORT_RANGE_END}"
URL="http://127.0.0.1:${PORT}/?fresh=$(/bin/date +%s)"

STAGE="preflight"
cd "$STUDIO_DIR" || fail_launch "Data Studio 폴더로 이동하지 못했습니다: $STUDIO_DIR"
if ! "$NODE_BIN" --check "$STUDIO_DIR/server.mjs" >>"$LAUNCH_LOG" 2>&1; then
  fail_launch "server.mjs 문법 검사에 실패했습니다."
fi
if ! "$NPM_BIN" --version >>"$LAUNCH_LOG" 2>&1; then
  fail_launch "npm 실행에 실패했습니다: $NPM_BIN"
fi

lock_hash="$(/usr/bin/shasum -a 256 "$STUDIO_DIR/package-lock.json" | /usr/bin/awk '{print $1}')"
installed_hash="$(/bin/cat "$INSTALL_STAMP" 2>/dev/null || true)"
if [[ ! -x "$STUDIO_DIR/node_modules/.bin/vite" || "$lock_hash" != "$installed_hash" ]]; then
  STAGE="install-dependencies"
  log_event "INFO" "npm install 시작"
  if "$NPM_BIN" install --no-audit --no-fund >>"$LAUNCH_LOG" 2>&1; then
    print -r -- "$lock_hash" >"$INSTALL_STAMP"
  elif [[ -x "$STUDIO_DIR/node_modules/.bin/vite" ]]; then
    log_event "WARN" "npm install 실패, 기존 node_modules로 계속 진행"
  else
    fail_launch "의존성 설치에 실패했고 사용할 node_modules도 없습니다."
  fi
else
  log_event "INFO" "package-lock unchanged, reusing node_modules"
fi

STAGE="spawn-server"
log_event "INFO" "detached server spawn node=$NODE_BIN port=$PORT studio_dir=$STUDIO_DIR"
server_pid="$(
  /usr/bin/python3 "$SPAWN_HELPER" \
    "$NODE_BIN" \
    "$STUDIO_DIR/server.mjs" \
    "$STUDIO_DIR" \
    "$SERVER_LOG" \
    "$PORT" \
    2>>"$LAUNCH_LOG"
)"
if [[ "$server_pid" != <-> ]]; then
  log_event "ERROR" "spawn helper returned invalid pid=<$server_pid>"
  fail_launch "Data Studio 서버 프로세스를 분리하지 못했습니다."
fi
print -r -- "$server_pid" >"$PID_FILE"
print -r -- "$PORT" >"$PORT_FILE"
print -r -- "$STUDIO_DIR" >"$ROOT_FILE"

STAGE="health-check"
for _ in {1..100}; do
  if ! /bin/kill -0 "$server_pid" 2>/dev/null; then
    /usr/bin/tail -30 "$SERVER_LOG" >>"$LAUNCH_LOG" 2>/dev/null || true
    /bin/rm -f "$PID_FILE" "$PORT_FILE"
    fail_launch "Node 서버가 상태 확인 전에 종료됐습니다."
  fi
  health_payload="$(/usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
  if [[ "$health_payload" == *'"service":"dalti-data-studio"'* ]]; then
    log_event "INFO" "server healthy pid=$server_pid port=$PORT root=$STUDIO_DIR"
    if [[ "${DALTI_DATA_STUDIO_NO_OPEN:-0}" != "1" ]]; then
      /usr/bin/open "$URL" || log_event "WARN" "browser open failed url=$URL"
    fi
    exit 0
  fi
  /bin/sleep 0.2
done

/usr/bin/tail -30 "$SERVER_LOG" >>"$LAUNCH_LOG" 2>/dev/null || true
/bin/kill "$server_pid" 2>/dev/null || true
/bin/rm -f "$PID_FILE" "$PORT_FILE"
fail_launch "서버 상태 확인 시간이 초과됐습니다: port=$PORT pid=$server_pid"
