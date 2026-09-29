# AK-SCHEDULE-002 · agility.co.kr 대회일정 자동 수집·장소·이미지 반영 설계

- 상태: 격리 개발 진행 중 (scraper `feat/schedule-auto`, 테스트 프로필 전용)
- 작성·자료 확인일: 2026-09-29, 트랙 변경 2026-09-30
- 대상: `agility-scraper`(주 구현, NAS 배치), 이 데이터 저장소(계약 문서·데이터), `data-studio`(선택: 큐 표시 호환)
- 운영 데이터·NAS 운영 예약·manifest는 운영 적용(SA-31) 전까지 바꾸지 않는다.

### 트랙 변경 (2026-09-30)

| 항목 | 처음 설계 | 현재 트랙 |
| --- | --- | --- |
| 포스터 판독 | 외부 LLM API 키(제공자 선택) | **NAS Codex CLI**, ChatGPT 로그인, API 키 없음 |
| 신규 장소 주소·좌표 | 카카오 로컬 API | **Codex 웹검색 제안 + 사람 승인**. 지도 API(카카오·Google) 미사용 |
| 승인 메시지 지도 링크 | 카카오맵 | Google Maps URL(키 불필요한 링크) |
| 큐·배치·캐시 위치 | 데이터 저장소 `review/schedule/` | 저장소 밖 상태 디렉터리 |
| Drive 파일명 | `kau-<idx>-<순번>-<sha16>` | `kau-<idx>-<원본 sha16>`(순서가 바뀌어도 중복 없음) |

Google 좌표 변환(Maps JavaScript Geocoder 포함)을 쓰지 않는 이유: 결제 등록된 API 키가 필요하고, Google Maps Platform 약관(Geocoding API 6.3)은 위도·경도 저장을 최대 30일로 제한한다. 모든 앱 사용자가 쓰는 `venue.json`에 좌표를 계속 저장하는 용도와 맞지 않는다.

## 1. 결론

NAS 일 1회 배치 `schedule_auto_real` 하나가 수동으로 하던 작업 전체를 대신한다.

```text
agility.co.kr/17 확인 → 신규·변경 대회글 감지 → 포스터 이미지 판독(NAS Codex)
→ 장소 매칭 / 없으면 Codex 웹검색으로 주소·좌표 제안(근거 URL 필수, 승인 필요)
→ 이미지 Google Drive 업로드 → detailImages 공개 URL
→ match.json + venue.json + manifest 변경안 → 하네스 검증 → 텔레그램 승인 → 반영
```

- 목표 산출물은 최근 수동 커밋 `da2d7b8`과 같은 형태다: `match.json` 대회 추가 + `venue.json` 신규 장소 + manifest `dataVersion` 갱신을 한 커밋으로.
- 새로 만드는 것은 4개(1게시물→N대회 판독기, 장소 해석기, 무인 Drive 업로더, 스테이징·승인·반영 단계)이고, 게시판 감지·검증·manifest 갱신·텔레그램은 기존 코드를 재사용한다.
- **반영 방식은 결정이 필요하다(5.1).** 권장: 텔레그램 승인 1탭 모드로 시작하고, 섀도 운영으로 정확도를 확인한 뒤 엄격 게이트를 통과한 신규 건만 자동 반영으로 전환한다.
- 이 배치는 FCM을 보내지 않는다. 앱 푸시는 기존 `schedule_send_real`(10:00)이 반영된 `match.json` 기준으로 보내며 3건 가드를 그대로 따른다.

## 2. 현황 (확인한 사실)

로컬 SSD 저장소와 원본 사이트 기준이다. NAS에 배포된 코드·예약 상태는 이번에 직접 확인하지 않았고 문서(`NAS_SCHEDULER_SCRIPTS.md`, 2026-09-28 기록) 기준이다.

### 2.1 운영 상태와 기존 요구

- 2026-09-28 사용자 요청으로 신규 대회 수집 중지: NAS `SCHEDULE Collect`(06:30) 비활성, Data Studio 수집 API 409.
- 문서에 “신규 대회는 자동 수집하더라도 운영자 확인·승인 후에만 활성 `match.json`에 반영” 요구가 명시돼 있다 (`data-studio/AGENTS.md`, `agility-scraper/REVIEW_QUEUE_CONTRACT.md`). 이번 요청의 “자동 처리”와 충돌할 수 있어 5.1에서 결정한다.
- 유지 중: 공지 자동화(13:00, 20:00), `AgilityScheduleSend`(10:00).

### 2.2 재사용 가능한 코드

| 위치 | 재사용 대상 | 한계 |
| --- | --- | --- |
| scraper `schedule/schedule_detect_kau.py` | 목록 파싱, 대회글 판별(어질리티+대회 근거), 제목 날짜 파싱, 본문 이미지(`cdn.imweb.me`) 추출, 신청 링크, URL idx 정규화, `kau_source_state.json` 지문, 큐 병합 | 게시물당 draft 1개, 장소·심사위원 등은 비어 있음 |
| scraper `shared/active_data_validation.py`, `scripts/active_data_harness.py` | 13개 core 필드·선택 필드·중복 식별자 `(name, startAt, url)` 검증 | — |
| scraper `shared/publish_active_data.py` | `next_data_version`, `bump_manifest` | — |
| scraper `push/push_template.py`, `shared/push_guard.py`, `scripts/git_sync_lib.sh` | 텔레그램 발송, 3건 가드, Git 동기화 | 텔레그램 수신(승인 버튼)은 없음 |
| data-studio `kau-automation.mjs`, `codex-kau-output.schema.json` | 판독 프롬프트, 근거 병합, 기존 자동반영 9개 조건 | Node + Mac의 Codex CLI 로그인 의존 → NAS 무인 실행 불가 |
| data-studio `google-drive-upload.mjs` | SHA 기반 멱등 파일명, WebP(긴 변 2400px, q88), `anyone/reader`, `uc?export=view` URL | Mac `gcloud` 사용자 로그인 의존 → NAS 무인 실행 불가 |

### 2.3 원본 사이트 (2026-09-29 조회)

- 목록 `https://www.agility.co.kr/17`, 상세 `/17/?bmode=view&idx=<idx>&t=board`. `robots.txt`는 `/17` 허용.
- 상세 본문은 텍스트가 거의 없고 이미지뿐이다. 예: `idx=174083985`(10/04 승급전)는 PNG 15장 + “대회신청 바로가기”(`/24`) 링크. **장소·심사위원·접수기간·시간은 이미지 판독이 필수**다. 기존 이미지 상한은 12장.

### 2.4 데이터 격차 (현재 v3 `match.json` 75건)

- **1게시물 → N대회**: `idx=171569089` → 점/어 승급전 + 비/노 승급전, `idx=171129201` → 5/16·5/17 두 건. 기존 큐 계약(게시물당 draft 1개)으로 표현 불가.
- **상세 idx가 아닌 URL 6건**: `https://www.agility.co.kr` 4건, `https://www.agility.co.kr/17` 2건(10/04 코리아어질리티클럽 두 건 포함). idx 기준 중복 판정으로는 이 대회들을 신규로 오인해 **이중 등록**한다.
- `venue.json`(18곳)에 없는 `location`: `발트바우`, `초록미소마을` (`미정`은 의도된 값).

## 3. 목표와 비목표

목표

- 매일 1회 agility.co.kr/17을 확인해 신규·변경 대회를 `match.json` 계약 형식으로 만든다.
- 장소가 `venue.json`에 없으면 이름·도로명 주소·좌표를 찾아 추가한다.
- 포스터 이미지를 Drive에 올리고 공개 URL을 `detailImages`에 넣는다.
- 사람 개입을 “승인 1탭” 또는 “예외 건 검수”로 줄인다.

비목표

- KKF·waldbow·Instagram 등 다른 소스 자동화 (KKF 참고 수집은 기존대로)
- `schedule_send_*`/FCM 로직, schemaVersion, `/ak/vN` 변경
- `venue.photos` 자동 수집, 과거 대회 재생성

## 4. 전체 구조

```text
[NAS 06:30] schedule_auto_real   (기존 비활성 SCHEDULE Collect 슬롯 재사용)
  1 sync      scraper·데이터 저장소 동기화, 배치 잠금
  2 detect    /17 목록 N페이지 → 대회글 판별 → source_state 지문 비교 → new/changed 게시물
  3 fetch     상세 HTML·이미지(최대 12장)·신청 페이지 텍스트 → 로컬 캐시(SHA-256)
  4 extract   NAS Codex 구조화 출력(웹검색 끔) → competitions[] + 필드별 근거 + 장소 원문(이름/주소)
  5 normalize 정규화표(주최·eventType·matchTypes·장소 별칭) + 결정적 교차검증
  6 venue     venue.json 매칭(이름·별칭·도로명 주소) → 없으면 Codex 웹검색 → 신규 venue 제안
  7 images    Drive 멱등 업로드 → 비로그인 공개 접근 검증 → detailImages
  8 stage     배치(batch) 생성: match/venue/manifest 변경안 + 큐·상태 파일
  9 gate      임시 사본에 적용 → 하네스 --scope all → 게이트 판정
 10 publish   approve: 텔레그램 승인 요청 / auto: 게이트 통과 건만 커밋·푸시
 11 report    텔레그램 요약 (신규·변경·제외·오류 건수)

[NAS 5분 간격] schedule_approve_real   (승인 버튼 처리 → 재검증 → 커밋·푸시)
[NAS 10:00]    schedule_send_real      (기존, 변경 없음)
```

- 코드 위치: scraper `schedule/auto/` (`pipeline.py`, `vision_extract.py`, `venue_resolver.py`, `drive_upload.py`, `stage_apply.py`, `approval_bot.py`), 루트 래퍼 `schedule_auto_real|test`, `schedule_approve_real|test`.
- 실행 위치를 NAS로 하는 이유: 일일 배치·비밀값·Git push·텔레그램 운영이 이미 NAS에 있고, Mac 실행은 SSD 마운트와 로그인 상태에 의존한다.
- 기존 `schedule_collect_real`, `schedule_kau_real`은 삭제하지 않고 비활성 유지한다(호환 진입점 보존 규칙). 새 배치와 동시 실행하지 않도록 같은 잠금을 쓴다.

## 5. 핵심 설계

### 5.1 반영 모드 — 결정 필요

`AGILITY_SCHEDULE_PUBLISH_MODE`로 전환한다.

| 모드 | 동작 | 비고 |
| --- | --- | --- |
| `approve` (권장 시작값) | 모든 준비는 자동. 텔레그램에 요약·포스터·[반영][보류] 버튼. 누르면 재검증 후 커밋·푸시 | 2026-09-28 요구와 일치 |
| `auto` | 5.6 게이트를 모두 통과한 신규 건만 자동 반영, 나머지는 `approve`와 동일 | 채택 시 AGENTS.md·REVIEW_QUEUE_CONTRACT·SCHEDULE_POLICY 갱신 필요 |
| `queue` | 큐만 생성, Data Studio에서 검수 | 현재 문서 정책과 같은 최소안 |

권장 절차: `approve`로 2~4주 운영하며 “게이트 판정 vs 사람 판정”을 기록 → 불일치 0건이면 `auto` 전환. `changed`, 신규 장소, 1회 3건 이상은 `auto`에서도 항상 승인 필요.

승인 채널 비교: GitHub PR(브랜치 → PR → merge)도 검토했지만, 공지 배치가 하루 두 번 manifest를 올려 PR이 자주 충돌하므로 텔레그램을 권장한다.

텔레그램 승인 방식

- 메시지에 inline keyboard `callback_data = sa:<batchId>:approve|hold`.
- `schedule_approve_real`이 5분 간격으로 `getUpdates`를 폴링한다. webhook·인바운드 포트 불필요.
- `chat.id`와 `from.id`가 허용 목록(`TELEGRAM_APPROVER_IDS`)에 있을 때만 처리하고 `answerCallbackQuery`로 결과를 알려준다.
- 배치 파일에 대상 파일 SHA-256·원본 지문을 저장한다. 승인 시점에 하나라도 다르면 적용하지 않고 재생성한다. 48시간이 지나면 만료되고 다음 실행에서 다시 알린다.
- `getUpdates`는 봇당 한 소비자만 안전하다. 기존 봇이 webhook이나 `getUpdates`를 쓰면 승인 전용 봇을 분리한다.

### 5.2 1게시물 → N대회 (큐 계약 v2)

- 큐 item은 게시물 단위(`id=kau-<idx>`)를 유지하고 `draft` → `drafts[]`(각각 정확히 13개 필드)로 바꾼다. `schemaVersion: 2`.
- `detailImages`는 item 최상위에 두고 같은 게시물의 모든 대회가 공유한다(현재 데이터도 같은 12장을 공유).
- 기존 일정과의 대응: ① 정규화 URL idx + `startAt` 날짜 일치 → 같은 대회, ② 없으면 퍼지 검사(같은 날짜 + 같은 장소 또는 이름 유사) → `possibleDuplicate` 경고, 항상 승인 필요.
- `changed`: 기존 항목의 필드별 이전/새 값을 배치에 기록한다. 이미지 SHA가 같으면 기존 `detailImages`를 유지한다.

### 5.3 비전 판독

- 입력: 제목, 게시일, 신청 페이지 텍스트(접근 가능 시), 순서가 있는 이미지, 활성 JSON에서 만든 정규화표, `AGILITYKOREA_DATA_VERSIONING.md`의 `matchTypes` 규칙.
- 출력(엄격 JSON schema): `competitions[]`(13개 필드), `evidence[]`(field, competitionIndex, imageIndex, rawText, certainty=`exact|uncertain|missing`), `venue`(nameRaw, addressRaw, imageIndex), `warnings[]`.
- 판독기는 **NAS Codex CLI**(`codex exec`, ChatGPT 로그인)다. API 키가 필요 없다. 인터페이스로 분리해 두어 필요하면 OpenAI 호환 API로 바꿀 수 있다.
  - 호출마다 `--ephemeral --ignore-user-config --sandbox read-only`, `features.shell_tool=false`, `features.apps=false`, `web_search="disabled"`, `--output-schema`(엄격 JSON). 명령 실행·외부 연동·웹 접근이 없어 포스터 속 문구로 인한 지시 주입 영향이 JSON 출력으로 한정된다.
  - 최소 환경변수로 실행한다(텔레그램·Drive 비밀값 미전달). 로그인 정보는 프로필 전용 `CODEX_HOME`에만 있다.
  - 사용량은 ChatGPT 요금제 한도에 포함된다. 신규·변경 게시물에서만 호출한다.
- 판독 결과는 코드로 교차검증한다(Codex가 최종 판정하지 않음).
  - 제목에 날짜가 있으면 `startAt` 날짜와 일치해야 한다.
  - `applicationStartAt ≤ applicationEndAt ≤ startAt ≤ endAt`, ISO 초 단위 형식.
  - 시간이 원문에 없으면 `00:00:00` + `detailNotice`에 사유 기록(익산 대회 수동 입력 방식과 동일).
  - `matchTypes`는 정규화 규칙표 안의 값만 허용한다(승급전 `LV1~3`, `비기너`/`노비스` 등).
- 이미지 상한: 계약대로 12장, 본문 순서 앞에서부터. 잘리면 `check` 경고를 남긴다(예: 15장 게시물). 상한 변경은 5.9 결정 사항.

### 5.4 장소 해석

1. 판독한 장소명을 정규화(공백·괄호 제거)해 `venue.json`의 `name`과 비교 → 별칭표 `review/venue/venue_aliases.json`(예: 골프장 정식 명칭 → `소노골프장`) → 포스터 도로명 주소가 기존 장소 주소와 같으면 그 장소. 찾으면 기존 이름을 `location`에 쓰고 외부 호출은 하지 않는다.
2. 없으면 **Codex 웹검색**(`web_search="live"`)으로 정식 명칭·도로명 주소·좌표를 찾는다.
   - 좌표는 공식 홈페이지·공공기관 페이지·위키백과처럼 글로 적힌 공개 페이지에서만 가져오고, 좌표 근거 URL과 주소 근거 URL이 필수다. 지도 앱 화면을 추정하지 않는다.
   - `certainty=exact`가 아니거나, 근거 URL이 없거나, 포스터 주소(도로명+번호, 시·군·구)와 다르거나, 좌표가 국내 범위(위도 33~39, 경도 124~132) 밖이면 `required`로 막는다.
3. 신규 venue: `{name, location: {name, address(도로명 우선, 없으면 지번), latitude, longitude}, photos: []}`.
4. 좌표를 코드로 다시 확인할 수단이 없으므로 신규 장소는 모드와 관계없이 승인 필요. 텔레그램에 주소, 근거 URL, Google Maps URL(`https://www.google.com/maps/search/?api=1&query=<위도>,<경도>`)을 붙인다. 틀리면 보류하고 `venue.json`에 직접 넣는다.
5. `미정`은 venue를 만들지 않는다(기존 관행).

- 지도 API(카카오 로컬, Google Geocoding)는 쓰지 않는다. 이유는 문서 앞 “트랙 변경” 참고.
- `AGILITY_VENUE_LOOKUP=none`이면 신규 장소 게시물은 “venue.json에 직접 추가” 경고로 막히고, 추가 후 다음 실행에서 기존 장소로 연결된다.

### 5.5 Drive 업로드 (무인)

- 서비스 계정은 저장 용량이 없어 개인 Gmail Drive에 업로드할 수 없다(403 `storageQuotaExceeded`). → `dalti.app@gmail.com` OAuth refresh token 방식.
- OAuth 클라이언트는 데스크톱 앱 유형, 범위는 최소 권한 `drive.file`. Mac에서 1회 동의 후 refresh token을 NAS 비밀파일(권한 600)에 저장한다. 토큰·access token은 로그·Git에 남기지 않는다.
- OAuth 동의 화면이 “테스트” 상태면 refresh token이 7일 후 만료된다 → “프로덕션”으로 게시해야 한다.
- `drive.file`은 앱이 만든 파일·폴더만 접근하므로 기존 수동 폴더(`DALTI_KAU_DRIVE_FOLDER_ID`)에 쓰지 못할 수 있다. 스파이크에서 확인하고, 안 되면 앱이 만든 전용 폴더(예: `app/agilitykorea/match/<연도>`)를 쓴다.
- 파일명 `kau-<idx>-<원본 이미지 sha256 앞 16자>.<확장자>`. 같은 이름이 있으면 재사용(멱등). 원본 SHA 기준이라 이미지 순서가 바뀌거나 재인코딩돼도 중복 업로드하지 않는다. WebP 변환은 Pillow가 있을 때만(긴 변 2400px, q88), 없으면 원본 형식.
- 파일별 `anyone/reader` 권한 → 비로그인 요청으로 이미지 응답 확인 → `https://drive.google.com/uc?export=view&id=<fileId>`.
- 실행 초기에 토큰 헬스체크. 업로드·검증 실패 시 해당 게시물은 반영하지 않고 경고와 함께 남긴다.

### 5.6 게이트

`auto` 모드에서 자동 반영하려면 모두 만족해야 한다. 하나라도 어긋나면 승인 요청으로 보낸다.

1. `diffKind=new`, 1회 실행 신규 대회 합계 ≤ 2 (푸시 3건 가드와 정렬).
2. 13개 필드 계약 통과, `startAt`·`endAt`·`location`·`judge`·접수 기간 근거가 모두 `exact`.
3. 5.3 결정적 교차검증 통과(제목 날짜 일치 포함).
4. `location`이 기존 `venue.json`에 있음(신규 장소 아님).
5. `club`·`eventType`·`matchTypes`가 기존 정규화표 안의 값.
6. `detailImages` 1개 이상, 전부 공개 접근 검증 완료.
7. `possibleDuplicate` 없음, URL이 정규 상세 idx 주소.
8. 임시 사본 적용 후 하네스 `--scope all` 통과.

### 5.7 반영 (커밋)

- 데이터 저장소에 한 커밋: `match.json`(+`venue.json`) + manifest(`dataVersion` 같은 날 순번, `forceRefreshKey`, `updatedAt`)만. 메시지 예: `data(schedule): <대회명> 반영 (kau-<idx>)`.
- 큐·배치·원본 지문·이미지 캐시·텔레그램 offset은 데이터 저장소 밖 상태 디렉터리(`AGILITY_SCHEDULE_AUTO_STATE_DIR`)에 둔다. 실패한 실행이 저장소에 파일을 남겨 다른 배치 커밋에 섞이는 일(2026-09-28 `b42a6e9` 사례)을 막는다.
- pretty JSON(`ensure_ascii=False`, `indent=2`, 마지막 개행). 삽입 위치는 구현 시 기존 파일의 정렬 방식을 확인해 맞춘다.
- push 전 `pull --rebase`. manifest 충돌(공지 배치와 겹침)이면 manifest만 다시 올리고 1회 재시도, 그래도 실패하면 중단하고 텔레그램 경보.
- 데이터 저장소 쓰기 잠금을 공지 배치와 공유해 동시 커밋을 막는다.

### 5.8 텔레그램 보고 예시

```text
[일정 자동수집] 09-29 06:31  신규 2 · 변경 0 · 제외 5 · 오류 0
1) 제81회 KKF 코리아어질리티클럽 점/어 승급전
   10/04(일) · 소노골프장 · 심사 박선영 · 접수 09/15~09/28 · LV1 LV2 LV3
   이미지 12 · 근거 exact 6/6 · 원문 https://www.agility.co.kr/17/?bmode=view&idx=174083985&t=board
[반영] [보류]
```

게시판 목록 항목이 0건이면 “게시물 없음”이 아니라 파서 장애로 경보한다.

### 5.9 결정 사항

- 2026-09-29 사용자 동의: 격리 개발 → 테스트 검증 → 운영 적용 순서, 운영 초기 반영 모드 `approve`.
- 2026-09-30 사용자 결정: 포스터 판독·신규 장소 조회는 NAS Codex, 카카오 사용 안 함. Google 좌표 변환도 약관상 저장 제한으로 쓰지 않는다.
- 남은 결정(이미지 상한, Drive 폴더, 실행 시각, 테스트 저장소 위치)은 [SA-00](schedule-auto/SA-00-decisions.md)에서 확정한다.

## 6. 구현 티켓

격리 개발 → 테스트 검증 → 운영 적용 단계로 나눈 티켓은 [schedule-auto/README.md](schedule-auto/README.md)에 있다.

| 단계 | 티켓 | 요지 |
| --- | --- | --- |
| 0 준비 | SA-00~03 | 결정 확정, 테스트 데이터 저장소·Drive·텔레그램 분리, 기능 브랜치·NAS 테스트 체크아웃 분리, NAS Codex 설치·로그인 |
| 1 개발 | SA-10~17 | 큐 v2, 감지기·fixture, 판독기, 장소 해석기, Drive 업로더, 스테이징·게이트·반영, 승인 봇, NAS 테스트 배선 |
| 2 검증 | SA-20~22 | 과거 게시물 재현 정확도(G2), E2E 16개 시나리오(G3), 섀도 운영 최소 2주(G4, 사용자 승인) |
| 3 적용 | SA-30~32 | 운영 데이터 선행 정리, 승인 모드 운영 적용·롤백, 안정화·`auto` 전환 판단 |

## 7. NAS 비밀값·설정 (Git 제외)

| 변수 | 용도 |
| --- | --- |
| `AGILITY_SCHEDULE_PUBLISH_MODE` | `approve` / `auto` / `queue` |
| `AGILITY_SCHEDULE_AUTO_MAX_ITEMS` | 자동 반영 상한(기본 2) |
| `AGILITY_VISION_PROVIDER` | `codex-cli`(기본) / `openai-compatible`(대안) |
| `AGILITY_VENUE_LOOKUP` | `codex`(기본) / `none` |
| `AGILITY_CODEX_BIN`, `AGILITY_CODEX_HOME` | Codex 실행 파일, 프로필 전용 로그인 폴더(700, `auth.json` 600) |
| `AGILITY_CODEX_MODEL`, `AGILITY_CODEX_REASONING_EFFORT`, `AGILITY_CODEX_TIMEOUT` | 선택. 비우면 Codex 기본값 |
| `AGILITY_SCHEDULE_AUTO_STATE_DIR` | 큐·배치·캐시 상태 디렉터리(데이터 저장소 밖) |
| `AGILITY_PROD_TELEGRAM_CHAT_IDS`, `AGILITY_PROD_DRIVE_FOLDER_IDS` | 테스트 프로필 격리 가드용 운영 값 목록 |
| `AGILITY_GDRIVE_OAUTH_FILE`, `AGILITY_KAU_DRIVE_FOLDER_ID` | Drive 업로드(refresh token 파일 권한 600) |
| `TELEGRAM_APPROVER_IDS` | 승인 허용 사용자 |

## 8. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 포스터 오판독 → 잘못된 날짜로 푸시 | 제목 날짜 교차검증, `exact` 근거 필수, `approve` 모드로 시작, 기존 3건 가드 |
| 기존 대회 이중 등록 | SA-30 선행, 퍼지 중복 검사 → 승인 필요 |
| 사이트 구조 변경(아임웹) | 목록 0건 = 장애 경보, fixture 회귀 테스트 |
| Drive 토큰 만료·권한 오류 | 실행 초기 헬스체크, 실패 시 반영 중단·경보 |
| 공지 배치와 manifest 충돌 | 공용 쓰기 잠금 + rebase·재bump 1회 |
| 승인 버튼 오남용 | chat/user 허용 목록, 배치 SHA 검증, 48시간 만료 |
| 판독 사용량 증가 | 신규·변경 게시물만 호출, 지문 같으면 재판독 없음, 1회 최대 5게시물 |
| Codex 로그인 만료·토큰 충돌 | 실행 시작 시 `codex login status`, 실패하면 판독 건너뛰고 경보·다음 실행 재시도. 프로필별 전용 `CODEX_HOME`, Mac `auth.json` 복사 금지, 같은 `CODEX_HOME` 동시 실행 금지(배치 잠금) |
| Codex 신규 장소 좌표 오류 | 근거 URL·포스터 주소 대조 필수, 신규 장소는 항상 승인, Google Maps 링크로 사람이 확인 |
| 포스터 속 지시 주입 | 판독 시 웹검색·명령 실행·외부 연동 끔, 엄격 schema, 코드 교차검증 |

## 9. 검증 계획

- 단위·회귀: scraper `tests/`에 fixture(HTML·이미지 스냅샷)와 가짜 서비스(Drive·텔레그램·가짜 `codex` 실행 파일)로 작성. 실제 수집·Drive·FCM·텔레그램·Codex는 호출하지 않는다(ARCHITECTURE.md의 `tests/` 경계).
- 정확도: [SA-20](schedule-auto/SA-20-offline-accuracy.md) 과거 게시물 재현.
- 통합: [SA-21](schedule-auto/SA-21-e2e-scenarios.md) 테스트 환경 E2E 시나리오.
- 운영 전: [SA-22](schedule-auto/SA-22-shadow-run.md) 섀도 운영.
- 배포 전 매번: 하네스 `--scope all`, `git diff --check`.
