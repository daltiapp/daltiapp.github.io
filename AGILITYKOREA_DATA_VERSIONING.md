# AgilityKorea Data Versioning

## 목적

JSON 구조가 바뀌는 강제 업데이트는 기존 `/agilitykorea`를 덮어쓰지 않고, manifest가 가리키는 짧은 버전 폴더로 전환한다.

## 경로 규칙

- 기존 경로 `/agilitykorea`는 레거시 앱과 기존 운영 경로로 유지한다.
- 신규 데이터는 `/ak/vN` 아래에 둔다.
- 현재 활성 신규 경로는 `/ak/v1` 이다.
- 버전 폴더에는 JSON만 둔다. HTML, `.DS_Store`, `@eaDir`, `.gitkeep` 는 포함하지 않는다.
- 앱은 `/agilitykorea-manifest.json` 을 먼저 읽고 `basePath` 기준으로 하위 JSON을 요청한다.

## 버전 규칙

- `schemaVersion` 은 JSON 구조가 깨지는 변경이 있을 때만 올린다.
- `dataVersion` 은 같은 schema 안에서 데이터만 바뀔 때 올린다.
- `forceRefreshKey` 는 `vN:dataVersion` 형식으로 유지한다.
- 날짜는 폴더명이 아니라 `dataVersion` 에만 둔다.
- rollback은 이전 버전 폴더를 삭제하지 않고 manifest의 `basePath`, `schemaVersion`, `forceRefreshKey` 를 되돌리는 방식으로 처리한다.

## 운영 규칙

- 일반 데이터 변경은 현재 활성 버전 폴더와 manifest의 `dataVersion`/`forceRefreshKey` 를 함께 갱신한다.
- 구조 변경은 새 `/ak/vN` 폴더를 만들고 전체 JSON을 복제 또는 재생성한 뒤 manifest를 전환한다.
- `notice.json` 의 `detail_path` 는 기존처럼 `notice/notice.json` 파일 위치 기준 상대 경로로 유지한다.
- 앱은 manifest의 `basePath` 와 `files.notice` 의 디렉터리를 합친 위치를 기준으로 상세 JSON 경로를 해석한다.
- 일정 푸시 스크립트는 활성 버전의 `match/match.json` 하나만 기준으로 읽어야 한다.
- 새 버전 폴더 생성이나 전체 JSON 복사는 앱 푸시 발송 조건으로 직접 연결하지 않는다.

## v1 match.json 필드

`/ak/v1/match/match.json` 은 각 대회에 아래 필드만 유지한다.

- `applicationEndAt`
- `applicationStartAt`
- `club`
- `detailNotice`
- `detailStatus`
- `endAt`
- `eventType`
- `judge`
- `location`
- `matchTypes`
- `name`
- `startAt`
- `url`

## 검증 체크리스트

- 원본과 버전 폴더의 JSON 개수가 맞는지 확인한다.
- 모든 JSON 문법을 검증한다.
- manifest의 `basePath + files.*` 경로가 실제 파일을 가리키는지 확인한다.
- `notice.json` 의 `detail_path` 샘플이 `basePath + files.notice 디렉터리` 기준으로 실제 상세 JSON에 연결되는지 확인한다.
- 앱에서 `forceRefreshKey` 변경 시 기존 캐시를 버리고 새 `basePath` 데이터를 다시 받는지 확인한다.
