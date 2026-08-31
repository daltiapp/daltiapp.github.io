# AgilityKorea Active Data Contract

## 목적

앱, 공지 배치, 일정 배치는 모두 루트의 `/agilitykorea-manifest.json`만 진입점으로 사용한다. 구버전 `/agilitykorea` JSON fallback은 사용하지 않는다.

## 경로 규칙

- 활성 JSON은 `/ak/vN` 아래에 둔다.
- 현재 활성 경로는 manifest의 `basePath`가 결정하며 현재 값은 `/ak/v3`이다.
- `/ak/vN`에는 JSON만 둔다. HTML, `.DS_Store`, `@eaDir`, `.gitkeep`는 금지한다.
- 모든 소비자는 `basePath + files.<key>`로 파일을 찾는다. `/ak/vN`을 코드나 NAS 환경파일에 직접 고정하지 않는다.
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
- 활성 `/ak/vN/match/match.json`의 각 대회는 아래 13개 core 필드를 유지한다.

```text
applicationEndAt, applicationStartAt, club, detailNotice, detailStatus,
endAt, eventType, judge, location, matchTypes, name, startAt, url
```

- 구버전 `date`, `applicationPeriod`, `sponsor` 필드를 배치 입력으로 사용하지 않는다.
- `eventChair`는 선택 필드이며, 존재할 때 비어 있지 않은 문자열이어야 한다.
- `detailImages`는 선택 필드이며, 존재할 때 공개 Google Drive 직접보기 URL 문자열 배열이어야 한다.
- `detailImages`에는 폴더 공유 주소가 아니라
  `https://drive.google.com/uc?export=view&id=<fileId>` 형식의 파일별 주소를 넣는다.
- 선택 필드를 모르는 구버전 앱은 해당 필드를 무시하므로 이 확장은 같은 v2 schema에서 호환된다.

## 세미나 규칙

- v1 세미나 JSON은 `/ak/v1/seminar/seminar.json`에 보존한다.
- 현재 활성 v3 일정 JSON은 기존 대회 이력 56건을 기준으로 하며, agility.co.kr 상세 URL·대회 날짜가 일치한 17건의 canonical URL과 Drive 공개 이미지 `detailImages`를 포함한다.
- v3는 v2와 동일한 schemaVersion 2의 호환 가능한 데이터 재생성 버전이며, rollback은 manifest만 되돌린다.
- `listImage`는 목록에 표시할 선수 이미지 URL이다. 등록 전에는 빈 문자열로 둔다.
- `detailImages`는 상세 화면에 표시할 이미지 URL 문자열 배열이다. 이미지가 확인되지 않은 항목은 빈 배열로 둔다.
- Google Drive의 `/app/agilitykorea/seminar/list`에는 선수 목록 이미지를, `/app/agilitykorea/seminar/detail`에는 상세 이미지를 저장한다.

## 대회 이미지 규칙

- 한국어질리티연합 게시판에서 실제 어질리티 대회로 판별된 항목만 이미지를 보관한다.
- Data Studio는 원본 이미지를 로컬 캐시에 먼저 검증한 뒤 `DALTI_KAU_DRIVE_FOLDER_ID`가 가리키는
  달티 Gmail Drive 폴더에 업로드한다.
- 업로드 파일은 source id와 SHA-256 기반 이름으로 재사용하며 파일별 `anyone/reader` 공개 권한을 확인한다.
- 업로드 전 긴 변 최대 2400px·WebP 품질 88로 재인코딩해 용량을 줄이고, 변환 실패 시 원본 형식으로 대체한다.
- Drive 업로드나 공개 주소 검증이 실패한 항목은 활성 일정에 자동 반영하지 않고 검수 큐에 남긴다.
- 한 번의 수집 후보가 3건 이상인 안전 차단 상태에서는 자동 Drive 업로드와 일정 반영을 모두 수행하지 않는다.

## 검증

스크립트 저장소에서 아래 명령으로 실제 FCM 없이 전체 계약을 확인한다.

```sh
/bin/sh /volume1/work/git/agility-scraper/active_data_check_real
```

검증 항목:

- manifest 필수 key와 모든 `files.*` 존재 여부
- `/ak/vN` JSON-only 규칙과 전체 JSON 문법
- 공지 목록의 모든 `detail_path` 연결
- 일정 13개 core 필드와 선택 필드, ISO 날짜, 중복 대회 식별자
- 오늘 일정 푸시 후보 수와 3건 이상 수동 확인 가드
