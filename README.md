# AgilityKorea 정적 데이터 저장소

앱에 배포하는 JSON과 정적 파일, 로컬 검수 도구 Data Studio를 관리한다. 수집·NAS 배치·푸시 구현은 [agility-scraper](https://github.com/daltiapp/agility-scraper)에서 관리한다.

## 구조와 소유권

| 경로 | 역할 | 수정 기준 |
| --- | --- | --- |
| `agilitykorea-manifest.json` | 앱·배치 공통 데이터 진입점 | 실제 데이터 변경과 같은 작업단위로 버전 갱신 |
| `ak/vN/` | 활성 및 rollback용 JSON | JSON-only, 버전 폴더 임의 이동/삭제 금지 |
| manifest의 `files.notice` 디렉터리 | 생성된 공지 목록·상세 | 스크래퍼 재생성만 허용, 수동 편집 금지 |
| manifest의 `files.match`, `files.venue` 등 | 승인된 서비스 데이터 | 기존 필드·이미지·날짜 계약과 pretty JSON 유지 |
| `review/schedule/` | 수집 후보·검수 상태 | 사람이 승인/거절한 내용과 원문 근거 보존 |
| `data-studio/` | 로컬 수집·검수·승인 도구 | [도구 설명](data-studio/README.md) 참고 |
| `docs/tickets/` | 구조 변경 제안과 구현 티켓 | 제안과 배포 완료 상태를 구분 |

현재 경로는 문서에 적힌 번호가 아니라 manifest의 `basePath`로 결정한다. 구버전 폴더, 푸시 이력, 검수 큐를 불필요한 파일로 간주해 지우지 않는다. 새 스키마/경로 전환은 사용자의 명시적 지시에 따른다.

## 변경 전후 검증

먼저 스크래퍼 최신 코드를 확인한다. 아래 명령은 두 저장소가 형제 디렉터리에 있을 때 데이터 저장소 루트에서 실행한다.

```sh
python3 ../agility-scraper/scripts/active_data_harness.py --data-repo-dir . --scope all
npm --prefix data-studio test
git diff --check
```

Python 하네스는 네트워크·Git·푸시 상태를 변경하지 않는다. 부분 장애 점검에는 `--scope notice` 또는 `--scope schedule`을 사용할 수 있지만, 배포 검증은 `all`이 기준이다. NAS `active_data_check_*` 래퍼는 사전 Git 동기화를 포함하므로 읽기 전용 점검과 구분한다.

하네스 구조·회귀 테스트·복구 절차는 [Active Data Harness](https://github.com/daltiapp/agility-scraper/blob/main/ACTIVE_DATA_HARNESS.md), 저장소 간 책임은 [스크래퍼 구조 문서](https://github.com/daltiapp/agility-scraper/blob/main/ARCHITECTURE.md)를 따른다.

## 필수 계약

- [AGENTS.md](AGENTS.md): 보안·푸시 안전·변경 규칙
- [AGILITYKOREA_DATA_VERSIONING.md](AGILITYKOREA_DATA_VERSIONING.md): manifest, JSON, 이미지, 공지 첨부파일 계약
- 모든 앱 푸시는 1회 실행의 실제 대상이 3건 이상이면 차단한다. 리팩토링 검증을 위해 실제 발송을 실행하지 않는다.
- 공지의 `source + source_seq → id` 매핑은 보존하며, 충돌 시 수동 JSON 수정이나 레지스트리 초기화로 우회하지 않는다.
