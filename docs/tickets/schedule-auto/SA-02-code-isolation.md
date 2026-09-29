# SA-02 · 개발 브랜치·NAS 테스트 체크아웃 분리

- 단계: 0 준비 · 선행: SA-00 · 크기: S

## 목적

개발 중인 코드가 운영 NAS 배치에 섞이지 않게 한다.

## 근거

`scripts/update_scraper_before_run.sh`는 매 실행 전 `git fetch origin main` 후 뒤처졌으면 `git_sync_repo`(`scripts/git_sync_lib.sh`)로 `git pull --rebase --autostash origin main`을 실행한다. 그래서 main에 병합한 코드는 다음 운영 배치 실행 때 NAS에 바로 반영된다. 기능 브랜치 체크아웃에서 이 스크립트를 그대로 쓰면 main이 기능 브랜치 위로 rebase되고, 작업 트리 변경이 정리(checkout/stash)될 수 있다.

## 작업

1. scraper에 `feat/schedule-auto` 브랜치를 만든다. 새 코드는 `schedule/auto/`, `tests/schedule_auto/`, 루트 `schedule_auto_test`·`schedule_approve_test`에만 추가한다.
2. NAS에 별도 체크아웃 `/volume1/work/git/agility-scraper-auto`(기능 브랜치)를 만든다. 운영 체크아웃 `/volume1/work/git/agility-scraper`는 건드리지 않는다.
3. 테스트 래퍼는 `AGILITY_SKIP_SELF_UPDATE=1`로 자동 main 동기화를 끄고, 대신 현재 브랜치 기준으로 fast-forward만 하는 사전 단계(또는 수동 `git pull --ff-only`)를 쓴다.
4. 잠금 디렉터리 이름을 운영과 분리한다(예: `agility_schedule_auto_test.lock`). 운영 잠금(`agility_scraper_update.lock`, `agility_schedule_detect_nas.lock`)을 잡지 않는다.
5. 기능 브랜치의 PR은 SA-31 전까지 병합하지 않는다(Draft PR 유지).

## 완료 조건

- [ ] NAS 테스트 체크아웃에서 `schedule_auto_test --help`가 기능 브랜치 코드로 실행되고 main으로 바뀌지 않음
- [ ] 운영 체크아웃의 `git status`, 브랜치, HEAD가 작업 전과 같음
- [ ] 기존 루트 래퍼·`*_nas.sh`·`scripts/*.sh`에 diff 없음
