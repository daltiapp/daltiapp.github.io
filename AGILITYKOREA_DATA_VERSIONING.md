# AgilityKorea Active Data Contract

## 목적

앱, 공지 배치, 일정 배치는 모두 루트의 `/agilitykorea-manifest.json`만 진입점으로 사용한다. 구버전 `/agilitykorea` JSON fallback은 사용하지 않는다.

## 경로 규칙

- 활성 JSON은 `/ak/vN` 아래에 둔다.
- 현재 활성 경로는 manifest의 `basePath`가 결정하며 현재 값은 `/ak/v1`이다.
- `/ak/vN`에는 JSON만 둔다. HTML, `.DS_Store`, `@eaDir`, `.gitkeep`는 금지한다.
- 모든 소비자는 `basePath + files.<key>`로 파일을 찾는다. `/ak/v1`을 코드나 NAS 환경파일에 직접 고정하지 않는다.
- manifest를 읽지 못하거나 필수 key/file이 없으면 오류로 종료한다. 구경로 fallback은 금지한다.

## 버전 규칙

- `schemaVersion`은 breaking schema 변경 때만 올린다.
- `dataVersion`은 같은 schema의 데이터 변경 때 올린다.
- `forceRefreshKey`는 `vN:dataVersion` 형식으로 유지한다.
- 구조 변경은 새 `/ak/vN` 전체 JSON과 manifest를 함께 준비한 뒤 manifest를 전환한다.
- rollback은 manifest의 `basePath`, `schemaVersion`, `forceRefreshKey`를 이전 버전으로 되돌린다.

## 공지 규칙

- 공지 자동화는 manifest의 `files.notice`가 가리키는 디렉터리에 직접 배포한다.
- `notice.json.detail_path`는 `notice.json` 위치 기준 상대 경로(`./kkf/129.json`)다.
- 공지 배포 시 active notice JSON과 manifest의 `dataVersion`/`forceRefreshKey`를 같은 커밋으로 반영한다.
- 공지 배포 성공 여부와 푸시 후보 판단은 분리한다. 전체 JSON 복사만으로 앱 푸시를 만들지 않는다.

## 일정 규칙

- 일정 푸시와 일정 감지는 manifest의 `files.match`가 가리키는 파일 하나만 읽는다.
- `/ak/v1/match/match.json`의 각 대회는 아래 13개 필드만 유지한다.

```text
applicationEndAt, applicationStartAt, club, detailNotice, detailStatus,
endAt, eventType, judge, location, matchTypes, name, startAt, url
```

- 구버전 `date`, `applicationPeriod`, `sponsor` 필드를 배치 입력으로 사용하지 않는다.

## 검증

스크립트 저장소에서 아래 명령으로 실제 FCM 없이 전체 계약을 확인한다.

```sh
/bin/sh /volume1/work/git/agility-scraper/active_data_check_real
```

검증 항목:

- manifest 필수 key와 모든 `files.*` 존재 여부
- `/ak/vN` JSON-only 규칙과 전체 JSON 문법
- 공지 목록의 모든 `detail_path` 연결
- 일정 13개 필드, ISO 날짜, 중복 대회 식별자
- 오늘 일정 푸시 후보 수와 3건 이상 수동 확인 가드
