# 이어하기 — 신규 대회일정 자동 반영

최종 사용자 지시(2026-09-30): 공지처럼 새 대회가 생기면 승인 없이 수집·검증·JSON 커밋/푸시. 기존 검수 전용 수집은 교체한다. [설계](../2026-09-29-schedule-auto-collection.md), 스크래퍼 `SCHEDULE_AUTO.md`를 따른다.

## 구현·검증

- 신규 어질리티 일정 자동 반영, 기존 장소 우선 사용, 미등록 장소만 주소→GPS 조회.
- 필수 오류·중복은 개별 제외. 기존 일정은 자동 덮어쓰지 않는다. Drive 미설정이어도 핵심 일정+원문 링크를 반영한다.
- 운영 프로필과 origin 검사, 테스트 격리, 안전 Git 동기화, push 경쟁 복구, 재실행 중복 방지를 구현했다.
- 최종 전체 Python 테스트 244개(50.188초), Git 동기화 shell 6개 통과. NAS 권한 차이 회귀를 포함한 단계 테스트 22개 통과.
- 활성 데이터 `--scope all` 통과: 147 JSON, 일정 75건, 공지 135건. 서비스 JSON은 이 작업의 로컬 수동 수정 대상이 아니다.

## NAS 실측(2026-09-30)

- Chrome에서 DSM 연결 확인. 기존 `SCHEDULE Collect`는 비활성, 공지13:00/20:00와 일정 알림10:00는 활성 상태였다.
- `prepare_manual_real` 정상 완료. NAS Python 3.8.15, 스크래퍼 main 98af87a 확인. 기존 산출물 변경은 안전 동기화 과정에서 보존됐다.
- 공식 Codex CLI 0.159.0 Linux musl 바이너리 SHA-256 검증·설치 완료(12:32:22 KST). NAS 전용 ChatGPT 로그인 완료. 운영 점검에서 `Logged in using ChatGPT` 확인.
- Drive·Geoapify 키 미설정. 기존 장소 일정 자동 반영에는 두 설정이 필수가 아니다. 미등록 장소 자동 GPS는 키 설정 후 실주소 검증이 필요하다.
- 기존 `SCHEDULE Collect`를 `AgilityScheduleAuto`로 교체하고 매일 09:00 예약을 활성화·저장했다(NAS 전원 켜짐 07:55 이후). 새로 고침 후 활성 체크와 다음 실행 2026-10-01 09:00을 확인했다.
- 초기 실행에서 NAS가 숨김 파일 두 개의 실행 비트를 변경하는 현상을 확인했다. 데이터 전용 체크아웃의 `core.fileMode=false`로 내용 변경 차단을 유지하면서 해결했다.
- 코드 배포: `634b873` 자동 반영, `2d80137` 오류 경로 진단, `5b75ad5` NAS 권한 차이 보완, `2b36543` 운영 문서.
- 실제 수집 12:48:13~12:50:42 KST 정상 종료(0). 게시글 15개 중 대회글 11개, 기존 기준선 9개, 지난 대회 1개, 신규 후보 1개를 판독했다. Codex 로그인·포스터 판독·기존 장소 연결이 동작했다.
- 후보 `kau-174083985`의 10월 4일 두 대회는 이미 등록된 일정과 중복이므로 배치 `20260930T124821-74f937`에서 차단했다. 기존 일정의 URL이 상세 주소가 아닌 게시판 주소여서 신규 후보로 발견됐지만 중복 검사가 추가 등록을 방지했다.
- 반복 실행 12:54:38~12:55:13 KST 정상 종료(0): 신규 후보 0개, 변화 없음 10개, 지난 대회 1개, 오류 0개. 같은 글을 다시 판독·등록하지 않는 것을 확인했다.
- 실제 자동 등록은 0건이며 서비스 JSON 변경·커밋은 발생하지 않았다. 새 일정 Git 반영 및 push 경쟁 처리는 격리된 bare Git 테스트에서 검증했다. 실제 신규 일정의 운영 push 성공으로 혼동하지 않는다.

## 경로

- 코드: `/Users/sam/Documents/DaltiWeb/agility-scraper`
- NAS 코드: `/volume1/work/git/agility-scraper`
- 새 일정 전용 데이터 체크아웃: `/volume1/work/git/daltiapp-schedule-data`
- NAS 상태: `/volume1/work/state/schedule-auto-real`
- 설정: `/volume1/work/secrets/agility.schedule-auto-real.env`
- 후속 웹: `/Users/sam/Documents/DaltiWeb/data-studio`. 아직 변경 없음. 수집 버튼으로 중복 수집하지 않는다.
