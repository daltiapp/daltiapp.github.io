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
{
  print -r -- "[$(/bin/date)] launcher: node=$NODE_BIN npm=$NPM_BIN"
  "$NPM_BIN" --version
  "$NPM_BIN" install --no-audit --no-fund
} >>"$LOG_FILE" 2>&1
install_status=$?
if (( install_status != 0 )); then
  if [[ -x "$STUDIO_DIR/node_modules/.bin/vite" ]]; then
    print -r -- "[$(/bin/date)] launcher: npm install failed ($install_status), using existing node_modules for offline start" >>"$LOG_FILE"
  else
    show_error "의존성 갱신에 실패했습니다. 로그: ${LOG_FILE}"
    exit 1
  fi
fi

"$NPM_BIN" run dev >>"$LOG_FILE" 2>&1 &
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
