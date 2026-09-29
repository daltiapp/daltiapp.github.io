# SA-31 · 운영 적용 (승인 모드) · 롤백 계획

- 단계: 3 적용 · 선행: SA-30 · 크기: M
- 선행 조건: G4 사용자 승인, SA-30 운영 커밋 완료

## 적용 순서

1. **코드 병합**: `feat/schedule-auto` → main PR. 변경 파일이 `schedule/auto/`, `tests/`, 새 래퍼(`schedule_auto_real|test`, `schedule_approve_real|test`), 새 프로필 스크립트, 문서, SA-10 계약 확장뿐인지 확인한다. main 병합 시 다음 운영 배치 실행 때 NAS 운영 체크아웃에 자동 반영되지만, 새 래퍼는 예약 전이라 실행되지 않는다.
2. **운영 비밀파일**: `agility.schedule-auto-real.env`(권한 600)를 새로 만든다. 공지·일정 알림이 쓰는 `agility.real.env`는 바꾸지 않는다. `AGILITY_SCHEDULE_PUBLISH_MODE=approve`. 운영 전용 `AGILITY_CODEX_HOME`을 새로 정하고 `sh scripts/codex_login_nas.sh real`로 따로 로그인한다(테스트 `CODEX_HOME` 재사용·복사 금지). 이 스크립트와 `run_schedule_auto_profile.sh`의 `real` 차단은 이 단계에서 함께 푼다.
3. **운영 자원**: 운영 Drive 폴더 ID, 운영 텔레그램 채팅, `TELEGRAM_APPROVER_IDS`. 오염 가드는 운영 프로필에서 반대로 “테스트 값이면 종료”하게 동작해야 한다.
4. **문서 갱신**(같은 PR 또는 직후 커밋): 데이터 저장소 `AGENTS.md`·`README.md`·`AGILITYKOREA_DATA_VERSIONING.md`, scraper `README.md`·`SCHEDULE_POLICY.md`·`REVIEW_QUEUE_CONTRACT.md`(v2)·`NAS_SCHEDULER_SCRIPTS.md`·`RUNBOOK.md`·`ENVIRONMENTS.md`, `data-studio/AGENTS.md`의 “신규 수집 중지” 문구를 새 흐름으로 교체. Data Studio 자체 수집은 계속 중지.
5. **첫 실행(수동, 사용자 참관)**: 오전 10시 일정 푸시와 겹치지 않는 시간에 `schedule_auto_real` 1회.
   - 첫 실행은 원본 기준선(`kau_source_state.json`)을 기록한다. 이미 운영에 있는 대회는 후보로 만들지 않고, 운영에 없는 **아직 끝나지 않은** 대회만 승인 요청한다.
   - 승인 → 운영 커밋 → 하네스 → 앱에서 새 `dataVersion` 반영 확인.
6. **다음 날 확인**: `schedule_send_real` 결과가 예상 대상 수와 같은지 확인(3건 가드 동작 포함).
7. **예약 등록**: DSM `schedule_auto_real` 매일 06:30, `schedule_approve_real` 5분 간격. 기존 `SCHEDULE Collect`는 비활성 유지(삭제 여부는 사용자 결정). 테스트 예약은 SA-32 종료 시 끈다.

## 롤백

| 상황 | 조치 | 영향 |
| --- | --- | --- |
| 배치 이상 동작 | DSM 두 작업 비활성 | 즉시 중단, 기존 공지·일정 알림 영향 없음 |
| 잘못된 대회가 운영에 반영됨 | 해당 커밋 revert + manifest `dataVersion` 새로 올려 push. 10:00 일정 푸시 전에 처리 | 앱이 다음 동기화에서 이전 데이터로 복구 |
| 잘못된 푸시가 이미 나감 | 기존 `PUSH_SAFETY_POLICY.md` 절차 | — |
| 코드 문제 | main에서 병합 revert | 새 래퍼만 제거, 기존 배치 코드 불변 |

manifest를 이전 `dataVersion`으로 되돌리지 않는다. 앱 캐시 갱신 판정이 `dataVersion`·`forceRefreshKey` 변화에 의존하므로 되돌릴 때도 새 값으로 올린다.

## 완료 조건

- [ ] 첫 실행 승인 반영 1건 이상 또는 “후보 0건”을 사용자와 확인
- [ ] 예약 첫 자동 실행 성공
- [ ] 기존 공지 배치(13:00, 20:00)·일정 알림(10:00) 정상 동작 1회 이상 확인
- [ ] 롤백 절차가 `RUNBOOK.md`에 기록됨
