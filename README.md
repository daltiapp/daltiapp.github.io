# AgilityKorea 정적 데이터 저장소

앱에 배포하는 JSON과 정적 파일을 관리한다. Data Studio 소스는 별도 저장소로 분리했다. [agility-scraper](https://github.com/daltiapp/agility-scraper)의 NAS 공지 자동화와 확정 일정 알림은 기존 운영 기능으로 유지한다. 신규 대회 일정은 2026-09-30 사용자 요청으로 NAS에서 수집·검증 후 승인 없이 JSON을 커밋·푸시하는 흐름으로 전환한다. [현행 설계](docs/tickets/2026-09-29-schedule-auto-collection.md)를 따른다.

일정·장소 JSON 수동 관리, 이미지 URL 반영, 이 저장소의 commit/push는 스크래퍼 최신화와 독립적이다. NAS 운영 코드는 `/Users/sam/Documents/DaltiWeb/agility-scraper`, 검수 도구는 `/Users/sam/Documents/DaltiWeb/data-studio`에서 관리한다. 스크래퍼 연결은 기존 SSD 저장소를 가리키며, Data Studio는 달티웹에 실제 독립 저장소로 있다. Data Studio의 대회 수집은 중지했으며 기존 큐 검수·수동 데이터 편집만 유지한다. 새 수집은 NAS의 `schedule_auto_real`만 담당하며, 별도 웹은 후속 조회·편집 기능이다.

## 구조와 소유권

| 경로 | 역할 | 수정 기준 |
| --- | --- | --- |
| `agilitykorea-manifest.json` | 앱·배치 공통 데이터 진입점 | 실제 데이터 변경과 같은 작업단위로 버전 갱신 |
| `ak/vN/` | 활성 및 rollback용 JSON | JSON-only, 버전 폴더 임의 이동/삭제 금지 |
| manifest의 `files.notice` 디렉터리 | 생성된 공지 목록·상세 | 스크래퍼 재생성만 허용, 수동 편집 금지 |
| manifest의 `files.match`, `files.venue` 등 | 승인된 서비스 데이터 | 기존 필드·이미지·날짜 계약과 pretty JSON 유지 |
| manifest의 `files.library` | 대회 출진표·코스맵·결과 및 독립 코스맵 자료실 | [자료실 계약과 추가 절차](docs/AGILITY_LIBRARY.md)에 따라 이미지별 등록·검증 |
| `schemas/agility-library-v1.schema.json` | 자료실 JSON의 필드·타입 검증 계약 | 자료실 필드 변경과 함께 확인 |
| `review/schedule/` | 수집 후보·검수 상태 | 사람이 승인/거절한 내용과 원문 근거 보존 |
| `review/library/` | 자료실 수집 범위·검증 기록 | 대회별 원문 이미지 수·연결·누락 확인 근거 보존 |
| 외부 `DaltiWeb/data-studio` 저장소 | 로컬 검수·승인 도구 | 데이터 저장소 경로를 설정해 사용; 소스는 이 저장소에 포함하지 않음 |
| `docs/tickets/` | 구조 변경 제안과 구현 티켓 | 제안과 배포 완료 상태를 구분 |

현재 경로는 문서에 적힌 번호가 아니라 manifest의 `basePath`로 결정한다. 구버전 폴더, 푸시 이력, 검수 큐를 불필요한 파일로 간주해 지우지 않는다. 새 스키마/경로 전환은 사용자의 명시적 지시에 따른다.

## 변경 전후 검증

먼저 이 데이터 저장소의 원격 상태와 작업 트리를 확인하고 기존 변경을 보존한다. 스크래퍼 fetch/pull은 수동 데이터 작업의 선행 조건이 아니다. 아래 검증은 기존 로컬 하네스를 사용하며 수집·Git 동기화·푸시를 실행하지 않는다. 두 실제 저장소가 형제 디렉터리에 있을 때 데이터 저장소 루트에서 실행한다.

```sh
python3 ../agility-scraper/scripts/active_data_harness.py --data-repo-dir . --scope all
npm --prefix /Users/sam/Documents/DaltiWeb/data-studio test
git diff --check
```

Python 하네스는 네트워크·Git·푸시 상태를 변경하지 않는다. 부분 장애 점검에는 `--scope notice` 또는 `--scope schedule`을 사용할 수 있지만, 배포 검증은 `all`이 기준이다. NAS `active_data_check_*` 래퍼는 사전 Git 동기화를 포함하므로 읽기 전용 점검과 구분한다.

하네스 구조·회귀 테스트·복구 절차는 [Active Data Harness](https://github.com/daltiapp/agility-scraper/blob/main/ACTIVE_DATA_HARNESS.md), 저장소 간 책임은 [스크래퍼 구조 문서](https://github.com/daltiapp/agility-scraper/blob/main/ARCHITECTURE.md)를 따른다.

## 필수 계약

- [AGENTS.md](AGENTS.md): 보안·푸시 안전·변경 규칙
- [AGILITYKOREA_DATA_VERSIONING.md](AGILITYKOREA_DATA_VERSIONING.md): manifest, JSON, 이미지, 공지 첨부파일 계약
- [docs/AGILITY_LIBRARY.md](docs/AGILITY_LIBRARY.md): 자료실 앱 조회, 맵 카테고리, 자료 추가·검증 절차
- 모든 앱 푸시는 1회 실행의 실제 대상이 3건 이상이면 차단한다. 리팩토링 검증을 위해 실제 발송을 실행하지 않는다.
- 공지의 `source + source_seq → id` 매핑은 보존하며, 충돌 시 수동 JSON 수정이나 레지스트리 초기화로 우회하지 않는다.
