# macOS 실행 아이콘

`Dalti Data Studio.app`을 더블클릭하면 다음 순서로 실행됩니다.

1. 네이티브 런처가 현재 앱 위치 또는 보안 북마크에서 `data-studio` 폴더를
   찾습니다.
2. 첫 실행이거나 외장하드 경로가 바뀌면 폴더 선택창에서 현재
   `data-studio` 폴더 접근을 요청합니다.
3. 기존 Data Studio 서버 PID를 확인하고 같은 프로젝트 서버일 때만
   종료합니다.
4. 4190부터 4209까지 다른 프로그램이 사용하지 않는 포트를 선택합니다.
5. `package-lock.json`이 바뀐 경우에만 의존성을 갱신합니다.
6. 분리된 새 서버를 시작하고 `/api/health`의 서비스 식별자, PID, 포트,
   저장소 경로를 확인한 뒤 브라우저를 새로 엽니다.

앱은 로컬 `127.0.0.1`에만 바인딩됩니다. 앱이나 외장하드 경로가 바뀌어도
실행 상태와 로그는 고정된 사용자 라이브러리 경로를 사용합니다.

- 단계별 실행 로그:
  `~/Library/Logs/DaltiDataStudio/launcher.log`
- Node 서버 출력:
  `~/Library/Logs/DaltiDataStudio/server.log`
- PID, 포트, 프로젝트 경로, 보안 북마크:
  `~/Library/Application Support/DaltiDataStudio/`

실패 알림에는 `discover-project`, `resolve-runtime`, `preflight`,
`spawn-server`, `health-check` 같은 정확한 실패 단계와 위 로그 경로가
표시됩니다.

## 런처 다시 빌드

`Launcher/main.swift`, `launcher.zsh`, `spawn_server.py`를 수정한 뒤 실행합니다.

```sh
data-studio/macos/build-app.zsh
```

빌드 스크립트는 키체인을 조회하지 않고 현재 Mac에서 실행 가능한 ad-hoc
서명을 적용한 뒤 번들을 검증합니다. 다른 Mac에 배포하려면 Developer ID
서명과 공증을 별도로 진행해야 합니다.

아이콘은 `icon.svg`에서 생성한 `DaltiDataStudio.icns`입니다.
