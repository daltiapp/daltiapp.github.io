#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_BUNDLE="${SCRIPT_DIR}/Dalti Data Studio.app"
EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/Dalti Data Studio"

/usr/bin/xcrun swiftc \
  -O \
  -framework AppKit \
  "${SCRIPT_DIR}/Launcher/main.swift" \
  -o "$EXECUTABLE"

/bin/chmod +x \
  "$EXECUTABLE" \
  "${APP_BUNDLE}/Contents/Resources/launcher.zsh" \
  "${APP_BUNDLE}/Contents/Resources/spawn_server.py"

# 로컬 실행 번들은 키체인을 조회하지 않고 ad-hoc 서명합니다.
/usr/bin/codesign --force --deep --sign - "$APP_BUNDLE"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

print -r -- "Built and verified: $APP_BUNDLE"
