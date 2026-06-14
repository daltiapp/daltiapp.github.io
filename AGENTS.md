# 필독: 푸시 안전 규칙

## Signing And Keychain Safety Rules

Android release signing in this repo must use the project-local signing path:

- `keystore.properties`
- the `storeFile` path referenced from that file
- Gradle `signingConfigs`

Do not treat macOS keychain inspection as a normal troubleshooting step for this project.

Hard rules:
- never run keychain dump commands
- never run certificate dump/export commands
- never run broad secret-search commands against the whole keychain
- never use keychain inspection when the same check can be done through `keystore.properties`, local JKS file existence, Gradle config, or build output

Explicitly forbidden examples:
- `security dump-keychain`
- `security export`
- `security find-certificate -p`
- broad `security find-generic-password` scans
- broad `security find-internet-password` scans
- any command intended to dump or enumerate the full keychain contents

Allowed baseline for Android signing work:
- verify `keystore.properties`
- verify the referenced local JKS file path exists
- verify Gradle `signingConfigs`
- run `:app:bundleRelease` or `:app:assembleRelease`

Exception rule:
- only run `security find-identity -p codesigning -v` when the user explicitly requests that exact command
- do not expand from that command into any additional keychain dump/export/search step without explicit user approval

If release signing fails, debug in this order:
1. `keystore.properties`
2. referenced JKS file path
3. Gradle signing config
4. release build output


- 이 저장소의 `match.json` 수정은 앱 푸시 대상 계산에 직접 영향을 준다.
- `notice_send_*`, `schedule_send_*` 를 포함한 모든 앱 푸시 배치 스크립트는 **스크립트 하나의 1회 실행 기준**으로 발송 대상이 `3건 이상`이면 앱 푸시를 보내지 않고 운영자 텔레그램 확인 요청만 보내야 한다.
- 최근 실제 사고는 `수집 신규 0건인데 푸시 발송 대상이 대량으로 잡힌 상태 오염`이었다. 이런 패턴을 만들 수 있는 수동 데이터 수정은 매우 보수적으로 다룬다.
- 상세 기준 문서는 `/Users/sam/Documents/dalti-script/agility-scraper/PUSH_SAFETY_POLICY.md` 이다.

# 출력 저장소 작업 규칙

- 이 저장소는 서비스에 배포되는 정적 데이터/파일 저장소로 취급한다.
- 수동 작업 전에는 관련 스크립트 저장소에서 먼저 최신 코드를 반영한 뒤 작업을 시작한다.
- 공지 산출물(`agilitykorea/notice/**`)은 가능하면 수동 수정하지 않고 스크립트 재생성 결과로만 갱신한다.
- `match.json`, `venue.json` 같이 사람이 직접 수정하는 JSON은 pretty JSON(`ensure_ascii=False`, `indent=2`, 마지막 개행 포함) 형식으로 유지한다.
- 일정 판별 기준으로 쓰는 `match.json.url` 은 제목 추정 링크가 아니라 실제 상세에서 복사한 주소를 유지한다.
- 공지 푸시 후보는 로컬에 새로 들어온 시점이 아니라 게시판 `published_at` 기준 최근 2일만 인정한다. 이 값은 운영에서 바꾸지 않는 고정 규칙이며, 오래된 게시글이 새로 수집돼도 자동 푸시 후보는 아니다.
- 공지/일정 스키마, 파일명, 경로 규칙을 바꾸는 작업은 앱/스크립트/문서를 한 세트로 보고 같이 확인한다.

# AgilityKorea JSON 강제 업데이트 규칙

- 기존 `/agilitykorea` 경로는 레거시/기존 앱용으로 유지하고 덮어쓰지 않는다.
- JSON 구조가 바뀌는 강제 업데이트는 `/ak/vN` 폴더를 새로 만들고 `/agilitykorea-manifest.json` 의 `basePath` 를 전환한다.
- 배포 전 현재 활성 신규 경로는 `/ak/v1` 이며, 다음 강제 전환은 사용자가 명시할 때 `/ak/v2` 로 올린다.
- 버전 폴더에는 JSON만 포함한다. HTML, `.DS_Store`, `@eaDir`, `.gitkeep` 는 넣지 않는다.
- `schemaVersion` 은 breaking schema 변경 때만 올리고, 일반 데이터 갱신은 `dataVersion` 과 `forceRefreshKey` 만 올린다.
- 앱은 `/agilitykorea-manifest.json` 을 먼저 읽고 `basePath` 기준으로 `files` 하위 JSON을 로드한다.
- `notice.json` 의 `detail_path` 는 기존처럼 `notice/notice.json` 파일 위치 기준 상대 경로(`./kkf/129.json` 등)를 유지한다.
- 앱은 manifest의 `basePath` 와 `files.notice` 의 디렉터리를 합친 위치를 기준으로 상세 JSON을 찾는다.
- rollback은 이전 schema 폴더를 삭제하지 않고 manifest를 이전 `basePath`/`forceRefreshKey` 로 되돌린다.
- 상세 운영 규칙은 [AGILITYKOREA_DATA_VERSIONING.md](/Users/sam/Documents/daltiapp/daltiapp.github.io/AGILITYKOREA_DATA_VERSIONING.md) 를 따른다.
