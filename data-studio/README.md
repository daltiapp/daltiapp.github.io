# Dalti Data Studio

활성 AgilityKorea JSON을 원본 근거와 함께 분석하고, 사람이 diff를 확인한 뒤에만
커밋·푸시하는 로컬 운영 도구입니다.

## 실행

```sh
cd data-studio
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:4190`을 엽니다. 서버는 외부 인터페이스에
바인딩하지 않습니다.

macOS 실행 아이콘은 `macos/README.md`의 외장하드 권한, 재실행, 로그 안내를
따릅니다.

## 사이드바 구조

앱 진입 시 **검수 큐**가 기본 화면입니다.

| 순번 | 항목 | 설명 |
|---:|---|---|
| 1 | 검수 큐 | 자동 수집 배치가 만든 초안을 검수·승인·반려하는 메인 워크플로우 |
| 2 | 대회 데이터 | 활성 `files.match` 직접 편집 |
| 3 | 장소 | 활성 `files.venue` 편집 |
| 4 | 공지 | 공지 읽기 전용 관리 화면 |
| 5 | 저장소 | Git 상태·커밋 이력 확인 |
| 6 | 문서 | 참조 문서 뷰어 |

## 안전 흐름

1. 루트 `agilitykorea-manifest.json`에서 활성 파일을 해석합니다.
2. 사이트, 공개 Instagram 메타데이터, 붙여넣은 텍스트에서 초안을 만듭니다.
3. 사용자가 필드별 근거와 경고를 수정합니다.
4. `변경 미리보기`가 스키마, 중복, 장소 연결, 저장소 상태를 검사합니다.
5. 두 확인 항목을 모두 체크해야 allowlist 파일만 쓰고 커밋·푸시합니다.

### 검수 큐 워크플로우

배치가 생성한 초안(`REVIEW_QUEUE_CONTRACT.md` 계약)을 사람이 검토하여 활성
`match.json`에 반영하는 흐름입니다.

#### 다중 소스 큐 구조

검수 큐는 **소스별 독립 파일**로 관리됩니다.

| 소스 | 파일 |
|---|---|
| 한국애견연맹 (`thekkf.or.kr`) | `review/schedule/kkf_review_queue.json` |
| 한국어질리티연합 (`agility.co.kr`) | `review/schedule/kau_review_queue.json` |

서버는 큐 디렉터리(`review/schedule/`)에서 `*_review_queue.json` 패턴의 모든
파일을 읽어 하나의 통합 큐로 합쳐 API에 노출합니다. 각 항목에는 `_source`
필드가 붙어 어느 파일에서 왔는지 추적합니다. 항목 수정·상태 전환은 해당
소스 파일에만 기록됩니다.

환경변수 `DALTI_REVIEW_QUEUE_DIR`(저장소 루트 기준 상대경로)로 큐 디렉터리를
변경할 수 있습니다. 기본값은 `review/schedule`입니다.
`npm run test`는 이 값을 테스트 전용 경로로 덮어써서 운영 큐 파일을 건드리지
않습니다.

#### 워크플로우

1. **큐 조회**: `GET /api/review/queue`로 전체 큐를 로드합니다. 응답에는
   `sources` 배열(소스별 key, label, file, generatedAt, counts)이 포함됩니다.
   필터(상태/분류/소스)와 정렬(날짜/신뢰도)로 항목을 탐색합니다.
2. **검수**: 항목을 선택하면 상세 패널에서 13개 필드, `fieldEvidence`, `warnings`,
   이미지를 확인합니다. 소스 배지로 한국애견연맹/한국어질리티연합을 구분합니다.
   `required` 경고가 있으면 수동 보완이 필요합니다.
   `POST /api/review/item`으로 값을 채우면 해당 필드의 경고가 자동으로 해제됩니다.
3. **승인/반려**: 상태를 `approved`/`rejected`로 전환합니다.
   `warnings`에 `required` 레벨이 남아 있으면 승인 반영이 차단됩니다.
4. **미리보기**: `POST /api/review/preview`로 대상 파일 변경 diff를 확인합니다.
   여러 소스의 항목을 한 번에 섞어 반영할 수 있으며, 이 경우 미리보기에
   소스별 건수와 변경되는 큐 파일 목록이 표시됩니다.
   서로 다른 소스의 항목이 같은 URL을 가리키면 미리보기에서 거부됩니다.
5. **반영**: `POST /api/review/apply`로 활성 `match.json` + manifest + 변경된
   큐 파일이 **같은 커밋**에 들어갑니다. 미리보기 이후 대상 파일 해시가
   달라지면 중단합니다.

미리보기는 파일을 쓰지 않습니다. 적용 시에도 미리보기 이후 대상 파일의
SHA-256과 Git 브랜치·clean 상태가 달라지면 중단합니다. 이 도구는 FCM이나
Telegram 발송을 호출하지 않습니다.

## 검수 큐 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/review/queue` | 모든 소스 큐 병합 조회 + 소스별 counts + 활성 데이터 대조 |
| POST | `/api/review/item` | 항목 `draft` 필드 수동 편집 (해당 소스 파일만 갱신) |
| POST | `/api/review/status` | 항목 상태 전환 (해당 소스 파일만 갱신) |
| POST | `/api/review/preview` | 반영 diff 미리보기 (여러 소스 혼합 가능, 파일 미수정) |
| POST | `/api/review/apply` | 승인 항목 활성 match.json + manifest + 큐 파일 반영 (단일 커밋) |

큐 디렉터리는 기본값 `review/schedule`이고 `DALTI_REVIEW_QUEUE_DIR`(저장소
루트 기준 상대경로)로 바꿀 수 있습니다. 디렉터리가 없거나 파일이 하나도
없으면 빈 큐로 200 응답합니다(오류 아님).

## 키보드 단축키

검수 큐 화면에서 입력 필드 외 영역에서 사용합니다.

| 키 | 동작 |
|---|---|
| `j` | 다음 항목 선택 |
| `k` | 이전 항목 선택 |
| `a` | 선택 항목 승인 |
| `r` | 선택 항목 반려 |
| `e` | 상세 패널 첫 입력란 포커스 |
| `?` | 키보드 단축키 도움말 토글 |

## 데이터별 정책

- 대회: 활성 `files.match`의 정확한 13개 필드를 유지합니다.
- 장소: 활성 `files.venue`의 이름·주소·좌표·사진 구조를 유지합니다.
- 공지: 목록과 상세 JSON을 직접 수정하지 않습니다. 공식 수집 스크립트의
  재생성·배포 경로만 허용하는 읽기 전용 관리 화면입니다.
- manifest: 같은 날짜의 `dataVersion` 순번을 올리고 `forceRefreshKey`와
  `updatedAt`을 같은 변경에 포함합니다.

## 디자인 시스템

CSS 변수 기반 토큰 시스템을 사용합니다 (`src/styles.css`).

- **색상**: `--bg`, `--surface`, `--text`, `--blue`, `--green`, `--amber`, `--red`, `--purple` 계열
- **타이포그래피**: `--font-sans` (Pretendard 기반), `--font-mono`, 크기 `--text-xs` ~ `--text-2xl`
- **간격**: `--sp-1` (4px) ~ `--sp-12` (48px)
- **둥글기**: `--radius-sm` (6px) ~ `--radius-xl` (16px)
- **그림자**: `--shadow-sm` ~ `--shadow-xl`
- **다크 모드**: `@media (prefers-color-scheme: dark)` 자동 전환
- **반응형 브레이크포인트**: 900px (모바일 레이아웃), 1280px (중간 레이아웃)

## 근거

- `../AGILITYKOREA_DATA_VERSIONING.md`
- `../agility-scraper/PUSH_SAFETY_POLICY.md`
- `../agility-scraper/NOTICE_SCHEMA.md`
- `../agility-scraper/REVIEW_QUEUE_CONTRACT.md`
- Microsoft Research, *Guidelines for Human-AI Interaction* (CHI 2019)
- W3C PROV-O Recommendation
- GitHub REST API repository contents documentation
