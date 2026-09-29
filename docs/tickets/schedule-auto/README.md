# 대회일정 자동 수집 — 격리 개발·테스트 검증·운영 적용 티켓

- 설계 근거: [AK-SCHEDULE-002](../2026-09-29-schedule-auto-collection.md)
- 작성일: 2026-09-29
- 원칙: **운영과 분리된 환경에서 만들고, 단계별 검증 게이트를 통과한 뒤에만 운영에 적용한다.**

## 격리 규칙 (Phase 3 전까지 항상 적용)

1. 운영 데이터 저장소(`daltiapp.github.io`)의 `match.json`·`venue.json`·manifest를 새 파이프라인이 쓰지 않는다. 테스트 쓰기는 테스트 데이터 저장소에만 한다.
2. 새 코드는 scraper `feat/schedule-auto` 브랜치의 `schedule/auto/`와 `_test` 래퍼에만 둔다. 기존 배치 파일·래퍼·NAS 예약은 수정하지 않는다.
3. 운영 NAS 체크아웃은 매 실행 전에 `origin/main`으로 자동 동기화된다(`scripts/update_scraper_before_run.sh`). 그래서 **운영 적용 전에는 main에 병합하지 않는다.** NAS 테스트는 별도 체크아웃에서 실행한다.
4. 테스트 Drive 폴더, 테스트 텔레그램 봇·채팅, 테스트 프로필 전용 Codex 로그인(`CODEX_HOME`)을 쓴다.
5. 새 파이프라인은 어떤 모드에서도 FCM을 호출하지 않는다.
6. 운영 수동 입력(Data Studio·직접 편집)은 Phase 3 적용 전까지 그대로 계속한다.

## 단계와 티켓

| 단계 | ID | 티켓 | 선행 |
| --- | --- | --- | --- |
| 0 준비 | [SA-00](SA-00-decisions.md) | 결정 사항 확정 | — |
| | [SA-01](SA-01-test-environment.md) | 테스트 환경 구축(데이터 저장소·Drive·텔레그램·키) | SA-00 |
| | [SA-02](SA-02-code-isolation.md) | 개발 브랜치·NAS 테스트 체크아웃 분리 | SA-00 |
| | [SA-03](SA-03-nas-codex.md) | NAS Codex 설치·로그인(API 키 없음) | SA-02 |
| 1 개발 | [SA-10](SA-10-queue-contract-v2.md) | 큐 계약 v2(1게시물→N대회) | SA-02 |
| | [SA-11](SA-11-detector-and-fixtures.md) | 감지기 확장 + 검증용 fixture 수집 | SA-10 |
| | [SA-12](SA-12-vision-extractor.md) | 포스터 판독기 + 교차검증 | SA-10, SA-11 |
| | [SA-13](SA-13-venue-resolver.md) | 장소 해석기(기존 장소·별칭·Codex 제안) | SA-10, SA-03 |
| | [SA-14](SA-14-drive-uploader.md) | 무인 Drive 업로더 | SA-01, SA-02 |
| | [SA-15](SA-15-stage-gate-apply.md) | 스테이징·게이트·반영 | SA-12~14 |
| | [SA-16](SA-16-telegram-approval.md) | 텔레그램 승인 봇 | SA-15 |
| | [SA-17](SA-17-nas-test-wiring.md) | NAS 테스트 배선 | SA-15, SA-16 |
| 2 검증 | [SA-20](SA-20-offline-accuracy.md) | 과거 게시물 재현 정확도 검증 | SA-12, SA-13 |
| | [SA-21](SA-21-e2e-scenarios.md) | 테스트 환경 E2E 시나리오 검증 | SA-17, SA-20 |
| | [SA-22](SA-22-shadow-run.md) | 섀도 운영(실제 사이트 → 테스트 저장소) | SA-21 |
| 3 적용 | [SA-30](SA-30-prod-data-cleanup.md) | 운영 데이터 선행 정리 | SA-22 |
| | [SA-31](SA-31-prod-cutover.md) | 운영 적용(승인 모드)·롤백 계획 | SA-30 |
| | [SA-32](SA-32-stabilize.md) | 안정화·자동 반영 전환 판단 | SA-31 |
| 선택 | [SA-40](SA-40-data-studio-v2.md) | Data Studio 큐 v2 표시 | SA-10 |

## 현재 진행 (2026-09-30)

> 이어서 작업할 때는 [RESUME.md](RESUME.md)부터 본다(상태·다음 명령·주의사항).

- 트랙: 포스터 판독·신규 장소 조회는 NAS Codex(ChatGPT 로그인, API 키 없음). 지도 API(카카오·Google) 미사용. 상세는 설계 문서 “트랙 변경”.
- 코드: scraper `feat/schedule-auto` — `c69be2c`(SA-10~17), `c3e5a64`(Codex·카카오 제거). 테스트 243개 통과. main 미병합.
- 남은 준비: SA-00 결정 4건, SA-01 테스트 자원, SA-03 NAS 설치·로그인(SSH에서 직접 실행).

## 단계 전환 게이트 (Go / No-Go)

| 게이트 | 통과 조건 | 판정 |
| --- | --- | --- |
| G1 개발 → 검증 | scraper 전체 테스트 통과(`python3 -m unittest discover -s tests -v`, `sh tests/test_git_sync_lib.sh`, `py_compile`, `sh -n`), 기존 파일 diff가 SA-10 계약 확장 범위뿐 | 구현자 |
| G2 재현 → E2E | SA-20 기준 충족(**무경고 오류 0건**) | 구현자 + 사용자 확인 |
| G3 E2E → 섀도 | SA-21 시나리오 전부 통과 | 구현자 |
| G4 섀도 → 운영 | SA-22 보고서 기준 충족 + **사용자 명시 승인** | 사용자 |

게이트 하나라도 실패하면 해당 단계 티켓으로 돌아가 수정하고 같은 게이트를 다시 통과해야 한다.

## 용어

- **무경고 오류(silent error)**: 정답과 값이 다른데 `warnings`가 없고 게이트가 자동 반영 가능으로 판정한 경우. 운영 사고로 직결되므로 모든 검증 단계에서 0건이어야 한다.
- **배치(batch)**: 1회 실행이 만든 변경안(`match`·`venue`·manifest diff, 대상 파일 SHA, 게이트 결과). 승인 단위다.
