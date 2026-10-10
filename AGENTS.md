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
- `notice_auto_*`, `notice_manual_push_*`, `schedule_send_*` 를 포함한 모든 앱 푸시 배치 스크립트는 **스크립트 하나의 1회 실행 기준**으로 발송 대상이 `3건 이상`이면 앱 푸시를 보내지 않고 운영자 텔레그램 확인 요청만 보내야 한다.
- 최근 실제 사고는 `수집 신규 0건인데 푸시 발송 대상이 대량으로 잡힌 상태 오염`이었다. 이런 패턴을 만들 수 있는 수동 데이터 수정은 매우 보수적으로 다룬다.
- 공지 전체재생성 또는 구스키마 자동 전환에서는 이전 활성 공지 queue를 종료하고 앱 푸시를 보내지 않는다.
- 상세 기준 문서는 [PUSH_SAFETY_POLICY.md](../agility-scraper/PUSH_SAFETY_POLICY.md) 이다.

# 프로젝트 작업 범위 분리

- 이 저장소의 어질리티 일정·장소 JSON 수동 관리와 앱 데이터 작업은 스크래퍼 개발과 독립적으로 진행한다.
- `agility-scraper`의 NAS 공지 자동 수집·반영과 확정 일정 알림은 기존 운영 기능이다. 2026-09-30 사용자 지시로 신규 대회 일정은 NAS에서 승인 없이 검증·자동 반영하도록 전환한다. 달티웹 작업 진입점은 `/Users/sam/Documents/DaltiWeb/agility-scraper`이며 기존 외장 SSD 저장소를 가리킨다.
- Data Studio는 달티웹의 사전 검수 도구이며 독립 저장소는 `/Users/sam/Documents/DaltiWeb/data-studio`다. 이 데이터 저장소에 도구 소스를 다시 넣지 않는다. NAS 신규 일정 수집은 `schedule_auto_real`에서 담당한다. Data Studio 앱 시작·수집 버튼·API에서는 중복 수집을 재개하지 않는다. 기존 큐 검수와 일정·장소 수동 편집은 유지한다.
- 수동 일정·장소 수정, 이미지 URL 반영, 데이터 검증, 데이터 저장소 commit/push의 선행 조건으로 스크래퍼 fetch/pull 또는 개발 재개를 요구하지 않는다.
- 스크래퍼·NAS 배치·자동 수집 코드를 수정하거나 재개하는 작업은 사용자가 명시적으로 요청할 때 달티웹 범위에서 진행하고 해당 저장소 지침을 따른다.
- 로컬 Python 데이터 하네스는 수집·Git 동기화·푸시 없이 데이터 계약을 확인하는 검증 도구로 사용할 수 있다. 하네스 사용은 스크래퍼 개발 재개를 뜻하지 않는다.

# 출력 저장소 작업 규칙

- 이 저장소는 서비스에 배포되는 정적 데이터/파일 저장소로 취급한다.
- 수동 작업 전에는 이 데이터 저장소의 원격 상태와 작업 트리를 확인하고 기존 사용자 변경을 보존한다. 스크래퍼 원격 동기화는 수동 데이터 작업의 선행 조건이 아니다.
- 공지 산출물(`manifest basePath + files.notice`)은 수동 수정하지 않고 스크립트 재생성 결과로만 갱신한다.
- `match.json`, `venue.json` 같이 사람이 직접 수정하는 JSON은 pretty JSON(`ensure_ascii=False`, `indent=2`, 마지막 개행 포함) 형식으로 유지한다.
- 일정 판별 기준으로 쓰는 `match.json.url` 은 제목 추정 링크가 아니라 실제 상세에서 복사한 주소를 유지한다.
- 공지 푸시 후보는 로컬에 새로 들어온 시점이 아니라 게시판 `published_at` 기준 최근 2일만 인정한다. 이 값은 운영에서 바꾸지 않는 고정 규칙이며, 오래된 게시글이 새로 수집돼도 자동 푸시 후보는 아니다.
- 공지/일정 스키마, 파일명, 경로 규칙을 바꾸는 작업은 앱/스크립트/문서를 한 세트로 보고 같이 확인한다.

# 대회 일정 등록 필수 확인

- 2026-10-03 사용자 지시: 확정된 대회 일정을 등록할 때 장소 JSON 연결을 확인한 뒤 commit/push한다. 대회 이미지가 원문에 있을 때만 Google Drive 업로드와 공개 검증을 완료 기준에 포함한다. 수동 등록과 자동 반영 모두 같은 기준을 적용한다.
- `detailImages`는 선택 필드이며 `detail_ready`와 `detail_pending` 어느 상태에서도 이미지가 반드시 있어야 하는 것은 아니다. 원문에 이미지가 있으면 전체 파일의 수·내용·순서가 원문과 대응하도록 Drive에 업로드하고 각 파일의 `anyone/reader` 권한, 비로그인 HTTP GET 성공, 이미지 MIME·실제 내용을 확인한 뒤 파일별 직접보기 URL을 넣는다. 원문에 이미지가 없으면 `detailImages`를 생략하거나 빈 배열로 둔다. 업로드 화면, 파일 ID 또는 URL 형식만으로 공개 성공 처리하지 않는다.
- `detailStatus`는 세부 경기 정보의 공개·확인 상태이고 이미지 존재 여부와 독립적이다. `detail_pending`은 세부 정보가 아직 공개·확정되지 않은 상태다. 확인되지 않은 종목·접수·장소를 추정하지 않고, 이미지가 없으면 `detailImages`를 생략하거나 빈 배열로, `location`은 `미정`으로 둘 수 있다. 이 상태를 나타내기 위한 가짜 장소를 만들지 않는다. 세부 정보가 공개·검증된 뒤에만 일반 일정은 `detail_ready`로 전환한다.
- 일반 `detail_ready`는 세부 정보가 공개되어 검증됐다는 뜻이며, 이미지가 있다는 뜻은 아니다. 이미지 필드는 선택 사항이다. 원문 이미지가 있으면 전부 공개 검증해 포함하고, 원문 이미지가 없으면 이미지 없이 등록할 수 있다. 장소가 원문에 공개되지 않은 일정은 아래 KAO 호환 예외가 아닌 한 `detail_ready`로 등록하지 않는다.
- `detail_pending`은 수정된 앱에서 목록 전용이며, 행을 눌러도 앱 상세·웹 상세로 이동하지 않는다. `detail_ready`의 상세 진입은 이미지 유무가 아니라 실제 URL 등 앱의 상세 목적지 조건에 따른다. 앱 목적지 판정과 탭 동작 회귀 테스트는 이 구분을 지켜야 한다.
- 현재 설치 앱과 맞춰 목록만 보여야 하는 신규 FCI 일정은 사용자가 지정한 KAO 호환 예외를 적용한다: 기존 `2026 Korea Agility Open (KAO)` 행처럼 `detailStatus: "detail_ready"`, 빈 `url`로 둔다. 이는 세부 정보가 확인됐다는 뜻이 아니므로 장소·심판·접수 정보·이미지를 채우거나 링크를 만들지 않는다. 상세 목적지는 빈 URL로 차단한다. 일반 일정의 `detail_ready` 의미를 바꾸는 선례로 확대하지 않는다.
- 장소가 공지된 일정은 manifest의 `basePath + files.venue`를 읽고 일정의 `location`이 기존 `venues[].name` 한 항목과 정확히 일치하는지 확인한다. 연결된 장소의 `location.name`, 실제 주소, 출처와 대조한 GPS 좌표가 올바른지도 확인한다. 기존 장소는 확인된 정식 이름으로 재사용하고, 없으면 기존 장소 스키마에 맞춰 `venue.json`에 먼저 생성하여 일정과 같은 커밋에 반영한다.
- 원문에 이미지가 있는 일정은 공개 접근 실패·이미지 누락·순서 불일치가 있으면 완료하지 않는다. 원문에 이미지가 없는 경우는 `detail_ready`여도 이미지 검증 대상이 아니며 게시를 막지 않는다. 기존 활성 데이터를 보존하고 미확인 항목과 원인을 명시한다.
- 전수 하네스 `--scope all` 통과와 별개로 원문 이미지가 있을 때 실제 공개 접근과 내용을, 장소가 공지됐을 때 장소 연결을 직접 점검한다. 완료 보고에는 검증한 이미지 수(없으면 0)와 장소(미정이면 그 사실)를 포함한다.

# AgilityKorea 활성 JSON 규칙

- 자료실의 `events`·`eventGroups`·`courseMapGroups`는 채널·사이트·AWC 모두 확인된 개최일 최신순, 개최일 미확인은 대회명에 명시된 연도 최신순, 둘 다 없으면 마지막으로 제공한다. 동률은 ID 오름차순이며 가짜 개최일을 만들지 않는다. 상세 정렬·첨부 순서와 NAS 검증 기준은 [자료실 계약](docs/AGILITY_LIBRARY.md)의 최신순 정렬 기준을 따른다.

- 구버전 `/agilitykorea` JSON 경로는 사용하지 않는다. 앱과 모든 배치는 `/agilitykorea-manifest.json`만 진입점으로 사용한다.
- JSON 구조가 바뀌는 강제 업데이트는 `/ak/vN` 폴더를 새로 만들고 manifest의 `basePath`를 전환한다.
- 현재 활성 경로는 manifest의 `basePath`를 기준으로 한다 (2026-09-20 확인값 `/ak/v3`). 다음 버전 전환은 사용자가 명시할 때만 진행한다.
- 버전 폴더에는 JSON만 포함한다. HTML, `.DS_Store`, `@eaDir`, `.gitkeep` 는 넣지 않는다.
- `schemaVersion` 은 breaking schema 변경 때만 올리고, 일반 데이터 갱신은 `dataVersion` 과 `forceRefreshKey` 만 올린다.
- 앱과 배치는 manifest를 먼저 읽고 `basePath + files.<key>`로 JSON을 로드한다. manifest 오류 시 구경로 fallback하지 않는다.
- `notice.json` 의 `detail_path` 는 기존처럼 `notice/notice.json` 파일 위치 기준 상대 경로(`./kkf/129.json` 등)를 유지한다.
- 앱은 manifest의 `basePath` 와 `files.notice` 의 디렉터리를 합친 위치를 기준으로 상세 JSON을 찾는다.
- 공지 배치는 `files.notice` 디렉터리에 직접 배포하고, 일정 배치는 `files.match`만 읽는다.
- `/ak/vN`을 앱 코드·배치 코드·NAS env에 직접 고정하지 않는다.
- rollback은 이전 버전 폴더를 삭제하지 않고 manifest를 이전 `basePath`/`forceRefreshKey`로 되돌린다.
- 상세 운영 규칙은 [AGILITYKOREA_DATA_VERSIONING.md](AGILITYKOREA_DATA_VERSIONING.md), 저장소 구조와 검증 진입점은 [README.md](README.md)를 따른다.
- 배포 전 스크래퍼의 Python 하네스를 `--scope all`로 실행한다. 개별 공지/일정 scope 통과는 전수 검증의 대체물이 아니다.
- 공지 숫자 ID는 같은 `source + source_seq`에 대해 보존한다. ID 충돌을 수동 JSON 수정으로 우회하지 않는다.

# 외부 에이전트 지침 통합

아래 두 프로젝트는 목적이 겹치지 않도록 다음 범위에서만 적용한다.

- [OpenWiki](https://github.com/langchain-ai/openwiki): 저장소 문서화 전용이다. 코드·테스트·운영 문서를 근거로 `openwiki/` 문서와 Claims를 생성·갱신할 때만 사용한다. 이 프로젝트의 보안·데이터·푸시 규칙을 대체하거나 자동으로 파일을 재생성하지 않는다.
- [Andrej Karpathy Skills](https://github.com/multica-ai/andrej-karpathy-skills): 작업 수행 방식 전용이다. 구현 전 가정과 성공 기준을 명시하고, 가장 단순한 해법을 선택하며, 요청과 무관한 변경을 하지 않고, 테스트·검증으로 완료를 확인한다.

우선순위는 이 파일의 프로젝트·보안 규칙이 가장 높다. Karpathy 원칙은 모든 변경 작업의 실행 기준으로 적용하고, OpenWiki는 문서화 요청 또는 문서 동기화 작업에서만 적용한다. 두 지침을 중복된 문서 생성 규칙으로 합치지 않는다.
