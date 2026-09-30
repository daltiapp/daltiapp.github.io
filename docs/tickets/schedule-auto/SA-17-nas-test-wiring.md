# SA-17 · NAS 테스트 배선

> 2026-09-30 변경: 신규 대회일정은 NAS에서 승인 없이 검증·커밋·푸시한다. 아래 기존 승인 중심 계획은 이 결정으로 대체하며, 현재 기준은 [최종 설계](../2026-09-29-schedule-auto-collection.md)와 스크래퍼 `SCHEDULE_AUTO.md`다. 웹 확인은 후속 기능이다.

- 단계: 1 개발 · 선행: SA-15, SA-16 · 크기: S

## 목적

NAS 테스트 체크아웃에서 테스트 프로필로만 전체 흐름을 예약 실행한다.

## 범위

1. 루트 래퍼 `schedule_auto_test`, `schedule_approve_test`와 `scripts/run_schedule_auto_profile.sh`(기존 `run_schedule_kau_profile.sh` 구조를 따르되 SA-02의 자체 동기화 분리 적용).
2. 비밀파일: `agility.common.env` + `agility.schedule-auto-test.env`. 필요한 변수는 설계 7절. `check` 명령이 격리 가드와 함께 Codex 버전·로그인 상태를 확인한다(SA-03).
3. **운영 오염 가드**(SA-01 7번): 데이터 저장소 origin·Drive 폴더 ID·텔레그램 채팅 ID가 운영 값이면 시작 즉시 종료하고 이유 출력. `_real` 래퍼는 이 단계에서 만들지 않는다.
4. 잠금: `agility_schedule_auto_test.lock`, 데이터 저장소 쓰기 잠금은 테스트 저장소 경로 기준.
5. 실행 로그: 단계별 건수·소요 시간·오류 요약. 비밀값 가림.
6. DSM 예약(테스트): `schedule_auto_test` 매일 06:40(운영 작업과 겹치지 않게), `schedule_approve_test` 5분 간격.

## 완료 조건

- [ ] 가드 테스트: 운영 origin·운영 폴더 ID·운영 채팅 ID 각각으로 실행 시 종료
- [ ] `sh -n` 전체 통과, 기존 운영 래퍼·스크립트 diff 없음
- [ ] NAS에서 수동 1회 실행 성공(테스트 저장소 커밋 또는 “신규 0건” 보고)
