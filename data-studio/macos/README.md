# macOS 실행 아이콘

`Dalti Data Studio.app`을 더블클릭하면 다음 순서로 실행됩니다.

1. 기존 Data Studio 서버 PID를 확인하고 같은 서버일 때만 종료합니다.
2. `npm install --no-audit --no-fund`로 의존성을 갱신합니다.
3. 새 `npm run dev` 서버를 시작하고 `/api/state` 응답을 확인합니다.
4. `?fresh=<timestamp>` URL로 브라우저를 새로 엽니다.

앱은 로컬 `127.0.0.1`에만 바인딩됩니다. 실행 로그는
`data-studio/.dalti-data-studio.log`에 남습니다.

아이콘은 `icon.svg`에서 생성한 `DaltiDataStudio.icns`입니다. 로컬 실행용
번들이므로 서명·공증은 포함하지 않습니다. 다른 Mac에 배포할 때는 개발자
서명과 공증을 별도로 진행해야 합니다.
