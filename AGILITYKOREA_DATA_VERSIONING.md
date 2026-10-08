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
- `detailStatus`는 세부 경기 정보가 공개·확인됐는지를 나타내며 이미지 존재 여부와 독립적이다. `detail_pending`은 세부 정보가 아직 공개·확정되지 않아 목록에만 표시하는 상태다. `detail_ready`는 일반적으로 세부 정보가 공개·검증된 상태다.
- 어느 상태에서도 이미지가 필수인 것은 아니다. 원문에 이미지가 없으면 `detailImages`를 생략하거나 빈 배열로 둔다. 원문에 이미지가 있으면 일부만 누락하지 말고 전체를 검증해 넣는다.
- 앱에서 상세 화면으로 이동할 수 있는지는 이미지나 `detailStatus`만으로 결정하지 않는다. 현재 목록 목적지는 `url` 등 앱의 탐색 조건에 따른다. 따라서 `detail_ready`와 빈 URL은 KAO 호환 사례처럼 상세로 진입하지 않는 목록 상태일 수 있다.
- 선택 필드를 모르는 구버전 앱은 해당 필드를 무시하므로 이 확장은 같은 v2 schema에서 호환된다.

### 일정 등록 전 이미지·장소 확인

- 신규 일정 게시의 완료 조건은 [AGENTS.md의 대회 일정 등록 필수 확인](AGENTS.md#대회-일정-등록-필수-확인)을 따른다. 원문에 이미지가 있을 때 전체 이미지의 Drive 업로드·공개 접근을 확인하고, 공지된 장소는 장소 JSON 연결을 확인한다. 원문에 이미지가 없을 때 이미지 업로드는 요구하지 않는다.
- 원문에 실제 장소가 공개된 일정의 `location`은 활성 `files.venue`의 `venues[].name` 한 항목과 정확히 연결되어야 하며, 연결 장소의 이름·실제 주소·GPS를 확인한다. 새 장소가 필요하면 기존 스키마로 생성하고 일정과 함께 반영한다. 세부 장소가 공개되지 않은 `detail_pending`과 명시된 KAO 호환 행은 `미정`을 사용할 수 있고 임의의 장소 연결을 만들지 않는다.
- 이미지 링크의 비로그인 실제 응답과 장소 연결 확인은 전수 하네스와 별도로 수행한다. 현재 하네스의 일정 필드·Drive URL 형식 검사만으로 두 조건이 검증됐다고 판단하지 않는다.
- 원문에 이미지가 있는데 업로드·공개 접근이 실패했거나, 공지된 장소 확인이 실패한 일정은 게시하지 않고 기존 활성 데이터를 보존한다.

### `matchTypes` 종목명 정규화

- `eventType`이 `승급전`이고 점핑·어질리티가 한 세트로 운영되면 종목명을 나누지 않고 레벨 세트로 기록한다. 예: `LV1`, `LV2`, `LV3` (실제 운영 레벨만 기록하며 LV1·LV2만 있으면 두 값만 기록).
- 비기너·노비스 승급전(비/노 승급전)은 숫자를 붙이지 않고 `비기너`, `노비스`처럼 종목명만 기록한다. `비기너1`·`노비스2`처럼 번호를 임의로 만들지 않는다.
- 원문에 레벨이 없는 점핑·어질리티 대회는 `점핑`, `어질리티`를 사용한다. 원문에 별도 종목명이 명확히 적힌 경우에만 그 명칭을 그대로 보존한다.
- 이 규칙은 기존 일정의 표기와 다음 Instagram·공식 게시판 수집 결과를 v2·v3에 반영할 때 모두 적용한다.

## 자료실 규칙

- 자료실은 manifest의 `files.library`로 제공하며 앱은 `basePath + files.library`로 로드한다. 최초 경로는 `library/library.json`이다.
- `events`는 대회 정보, `assets`는 이미지별 자료다. 출진표·코스맵·결과는 `kind`로 구분하고, 대회 연결은 `eventIds`, 맵 조회는 `mapCategories`로 판별한다.
- 선택 `channels`는 게시 채널 ID·앱 표시명·제공자·공식 주소의 동적 목록이다. 이미지 `source.channelId`를 `channels[].id`와 연결하고 앱 채널 필터를 이 목록으로 생성한다. 새 채널 때문에 앱의 고정 채널 코드를 추가하지 않는다. 기존 자료실 v1을 유지하는 호환 확장이다.
- 맵 카테고리는 `ranking`, `promotion`, `awc`, `training`이다. 대회 없이 등록하는 코스맵은 `eventIds: []`를 사용한다.
- 원문 이미지의 직접 URL과 출처·첨부 순서를 보존한다. 원문 이미지가 여러 대회의 자료를 포함하면 이미지 내용으로 각각 분류하고, 게시물 제목만으로 전부 같은 대회에 연결하지 않는다.
- 자료실 이미지는 `image.url`과 `image.thumbnailUrl`에서 직접 로드한다. 일정용 `match.json.detailImages`의 Drive URL 계약과 별도인 자료실 계약이다.
- `files.library` 추가는 기존 데이터 형식을 바꾸지 않는 호환 확장이다. manifest의 기존 `schemaVersion`과 `basePath`를 유지하고 `dataVersion`·`forceRefreshKey`를 갱신한다.
- 자료실 내부 `schemaVersion: 1`은 자료실 전용 스키마 버전이다. 데이터 추가 시 자료실 `dataVersion`·`updatedAt`과 manifest를 같은 커밋에서 갱신한다.
- 필드와 타입은 [자료실 JSON Schema](schemas/agility-library-v1.schema.json), 앱 조회와 추가·검증 절차는 [자료실 계약](docs/AGILITY_LIBRARY.md)을 따른다.

## 세미나 규칙

- v1 세미나 JSON은 `/ak/v1/seminar/seminar.json`에 보존한다.
- 대회 이력과 이미지 수는 활성 `files.match`에서 확인한다. 과거 재생성 당시의 건수를 고정 계약으로 사용하지 않는다.
- v3는 v2와 동일한 schemaVersion 2의 호환 가능한 데이터 재생성 버전이며, rollback은 manifest만 되돌린다.
- `listImage`는 목록에 표시할 선수 이미지 URL이다. 등록 전에는 빈 문자열로 둔다.
- `detailImages`는 상세 화면에 표시할 이미지 URL 문자열 배열이다. 이미지가 확인되지 않은 항목은 빈 배열로 둔다.
- Google Drive의 `/app/agilitykorea/seminar/list`에는 선수 목록 이미지를, `/app/agilitykorea/seminar/detail`에는 상세 이미지를 저장한다.
- v3 `seminar.json`의 각 세미나는 선택 필드 `speakerId`로 동일 파일 루트의 `speakers[].id`를 참조할 수 있다. 이 연결은 기존 `speaker` 표시명을 대체하지 않는다.
- `speakers`는 세미나 상세에 재사용하는 선수 프로필 목록이다. `id`, `displayName`, `name`, `nameKo`, `nameEn`, `country`, `instagramUrl`, `summary`, `competitionAchievements`, `judgingExperience`, `profileImageSourceUrl`, `sourceUrls`를 사용한다. `nameKo`는 앱에서 한글 이름을 명시적으로 표시하기 위한 필드이며, 기존 호환용 `name`과 같은 값을 유지한다. 수상 근거가 없는 경우 `competitionAchievements`는 빈 배열로 두고, 출전 이력은 별도 `competitionParticipation`에 기록한다.
- `profileImage`는 선택 필드다. 저장이 완료되면 `/app/agilitykorea/seminar/speakers`의 공개 Google Drive 파일 직접보기 URL을 넣고, 원본 게시물·프로필 주소는 `profileImageSourceUrl`로 보존한다.
- `speakers`와 `speakerId`는 v3에만 추가하는 호환 확장이다. v2 세미나 JSON은 이 구조를 추가하거나 동기화하지 않는다.

## 클럽 데이터 규칙

- 기존 상세 클럽 데이터는 manifest의 `files.club`(`club/club.json`)로 유지한다.
- 통합 전 임시 클럽 디렉터리 데이터는 manifest의 `files.clubs`(`club/clubs.json`)로 별도 제공한다. 두 파일을 합치거나 기존 `club` 파일을 덮어쓰지 않는다.
- `club`과 `clubs`는 모두 v3에서 사용할 수 있으며, 앱은 필요한 화면에 맞는 파일을 선택한다. 통합 시점에만 중복·식별자 충돌을 검토한다.
- 동일 클럽의 복수 지점은 `clubs`에서 지점별 `id`와 `branch`로 분리한다. 현재 RAD는 `rad-daegu`(계명문화대학교)와 `rad-busan`(신라대학교)로 관리한다.

## 대회 이미지 규칙

- 한국어질리티연합 게시판에서 실제 어질리티 대회로 판별된 항목만 이미지를 보관한다.
- Data Studio는 원본 이미지를 로컬 캐시에 먼저 검증한 뒤 `DALTI_KAU_DRIVE_FOLDER_ID`가 가리키는
  달티 Gmail Drive 폴더에 업로드한다.
- 업로드 파일은 source id와 SHA-256 기반 이름으로 재사용하며 파일별 `anyone/reader` 공개 권한을 확인한다.
- 업로드 전 긴 변 최대 2400px·WebP 품질 88로 재인코딩해 용량을 줄이고, 변환 실패 시 원본 형식으로 대체한다.
- Drive 업로드나 공개 주소 검증이 실패한 항목은 활성 일정에 자동 반영하지 않고 검수 큐에 남긴다.
- 한 번의 수집 후보가 3건 이상인 안전 차단 상태에서는 자동 Drive 업로드와 일정 반영을 모두 수행하지 않는다.

## 한국애견협회 공지 규칙

- v3 통합 `notice/notice.json`에는 기존 공지와 함께 `source: "kkc"`인 한국애견협회 항목을 포함하며, 2024년 1월 1일 이후 제목·본문에 어질리티가 명시된 게시물만 추가한다. `files.noticeKkc`의 원본 분리 목록도 호환용으로 유지한다.
- 상세 JSON은 `notice/kkc/`에 저장하고 `body_html`은 원문 HTML을 보존한다. 본문 이미지 경로는 한국애견협회 절대 URL로 변환한다.
- 첨부파일은 다운로드·재업로드하지 않고 `attachments[]`의 `label`, `url`, `file_name`, `file_ext`, `text`를 저장한다. `file_name`은 원문 파일명이고 `url`은 원본 다운로드 주소다. 앱은 `file_name`을 우선 표시한다.
- `image_urls`에는 본문 이미지 URL만 넣고 다운로드 링크를 섞지 않는다.
- 소스의 문자열 원본 키는 `source_seq`, 앱/푸시의 내부 식별자는 공용 레지스트리의 양의 정수 `id`다. 같은 원본의 ID 재발급이나 다른 원본에 ID 재사용은 배포 전에 차단한다.

## 검증

스크립트 저장소에서 아래 명령으로 Git 변경과 실제 FCM 없이 전체 계약을 확인한다 (형제 디렉터리에 데이터 저장소가 있는 경우).

```sh
python3 scripts/active_data_harness.py --data-repo-dir ../daltiapp.github.io --scope all
```

검증 항목:

- manifest 필수 key와 모든 `files.*` 존재 여부
- `/ak/vN` JSON-only 규칙과 전체 JSON 문법
- 공지 목록의 모든 `detail_path` 연결
- 일정 13개 core 필드와 선택 필드, ISO 날짜, 중복 대회 식별자
- 오늘 일정 푸시 후보 수와 3건 이상 수동 확인 가드

`notice` scope는 공지 트리와 모든 manifest `notice*` feed를 검사하며, `schedule` scope는 `files.match`만 검사한다. 각각의 JSON 문법/pretty 형식도 검사한다. 공지 feed 누락 때문에 일정 검사가 실패하지 않지만 전체 배포 전에는 반드시 `all` 검증이 필요하다.

NAS `active_data_check_real` 래퍼는 FCM을 보내지 않지만 실행 전 Git 동기화를 한다. 자세한 절차는 [스크래퍼 하네스 문서](https://github.com/daltiapp/agility-scraper/blob/main/ACTIVE_DATA_HARNESS.md)를 따른다. 검증 통과는 실제 단말 푸시 수신을 보장하지 않는다.
