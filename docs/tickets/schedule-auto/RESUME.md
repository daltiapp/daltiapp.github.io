# 이어하기 — 대회일정 자동 수집 (schedule-auto)

- 마지막 정리: 2026-09-30 02:00
- 설계: [AK-SCHEDULE-002](../2026-09-29-schedule-auto-collection.md) · 티켓 목록: [README](README.md)

## 1. 지금 상태

| 구분 | 상태 |
| --- | --- |
| 티켓·설계 문서 | 이 저장소 main `ea93837`에 반영 (NAS Codex 트랙, 지도 API 미사용) |
| 코드 | scraper `feat/schedule-auto` `698457f` 원격에 푸시됨. **main 미병합** (운영 NAS는 main만 받음) |
| 테스트 | Mac에서 243개 통과 (`python3 -m unittest discover -s tests`) |
| Mac 로컬 scraper 체크아웃 | `main`으로 되돌려 둠. 개발을 이어갈 때 `git switch feat/schedule-auto` |
| NAS | **변경 없음.** 기능 브랜치 체크아웃·Codex 설치·로그인·환경파일 모두 아직 안 함 |
| 운영 데이터·예약 | 변경 없음. `SCHEDULE Collect` 비활성 유지 |

완료된 티켓: SA-02(Mac 브랜치 분리), SA-10~17 코드와 오프라인 테스트, SA-03 스크립트 작성. 나머지는 [README](README.md)의 단계 순서대로 진행한다.

## 2. 다음에 할 일 (순서대로)

### 2.1 NAS 접속 방법 정하기

2026-09-30 확인: Mac → NAS SSH(`nas`, 포트 3125)는 키가 등록되지 않아 거부된다(`sam`, `root` 모두). 둘 중 하나를 고른다.

- **A. NAS 터미널에서 직접 실행**: 아래 2.2~2.5 명령을 root 터미널에 붙여 넣는다.
- **B. 에이전트가 진행**: NAS root 터미널에서 Mac 공개키(`~/.ssh/id_ed25519.pub`)를 등록한다. 이 Mac에 NAS root SSH 권한을 주는 것이므로 작업이 끝나면 지운다.

```sh
# 등록
mkdir -p /root/.ssh && chmod 700 /root/.ssh && grep -qF 'AAAAC3NzaC1lZDI1NTE5AAAAIFDFdJNejLvGVF++XHnyg6ajbp6RkYnoUdAv0lbwZAR6' /root/.ssh/authorized_keys 2>/dev/null || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFDFdJNejLvGVF++XHnyg6ajbp6RkYnoUdAv0lbwZAR6 nas-github' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys
# 작업 후 제거
sed -i '/nas-github$/d' /root/.ssh/authorized_keys
```

### 2.2 NAS 기능 브랜치 체크아웃 (SA-02)

운영 체크아웃(`/volume1/work/git/agility-scraper`)은 건드리지 않는다. 설치 스크립트는 이 새 체크아웃 안에 있다(2026-09-30 `/`에서 실행해 “No such file” 났던 원인).

```sh
cd /volume1/work/git
git clone /volume1/work/git/agility-scraper agility-scraper-auto
cd agility-scraper-auto
git remote set-url origin "$(git -C /volume1/work/git/agility-scraper remote get-url origin)"
git fetch origin feat/schedule-auto
git switch -c feat/schedule-auto --track origin/feat/schedule-auto \
  || git checkout -b feat/schedule-auto origin/feat/schedule-auto   # git 2.23 미만
git log --oneline -1   # c3e5a64 이후 커밋이어야 함
```

`git fetch`는 NAS에 이미 있는 GitHub 인증을 그대로 쓴다(어떤 방식인지는 미확인). 실패하면 운영 체크아웃의 인증 방식을 먼저 확인한다.

### 2.3 Codex 설치 (SA-03)

```sh
cd /volume1/work/git/agility-scraper-auto
sh scripts/install_codex_nas.sh /volume1/work/bin   # rust-v0.159.0, SHA-256 검증, x86_64/aarch64 자동 선택
```

### 2.4 테스트 환경파일 (SA-01)

```sh
cp examples/agility.schedule-auto-test.env.example /volume1/work/secrets/agility.schedule-auto-test.env
chmod 600 /volume1/work/secrets/agility.schedule-auto-test.env
vi /volume1/work/secrets/agility.schedule-auto-test.env
```

채워야 할 값: 테스트 데이터 저장소 경로, 상태 디렉터리, 운영 텔레그램 채팅 ID·운영 Drive 폴더 ID(격리 가드용), 테스트 봇 토큰·채팅 ID·승인자 ID, 테스트 Drive 폴더 ID·OAuth 파일 경로, `AGILITY_CODEX_HOME`. 테스트 자원이 아직 없으면 Codex 관련 값만 먼저 넣어도 로그인은 할 수 있다.

### 2.5 Codex 로그인과 확인 (SA-03)

1. ChatGPT 보안 설정에서 **디바이스 코드 로그인**을 켠다.
2. NAS에서 실행 후 출력되는 링크·코드를 브라우저에 입력한다.

```sh
sh scripts/codex_login_nas.sh test
sh scripts/run_schedule_auto_profile.sh test check   # ok: true, codex.version, 로그인 상태
```

Mac의 `~/.codex/auth.json`을 NAS로 복사하지 않는다(한 인증 파일을 두 기기가 쓰면 한쪽이 로그아웃될 수 있음).

### 2.6 그 다음

| 순서 | 할 일 | 티켓 |
| --- | --- | --- |
| 1 | 남은 결정 4건: 이미지 상한, Drive 폴더, 실행 시각, 테스트 저장소 위치 | [SA-00](SA-00-decisions.md) |
| 2 | 테스트 데이터 저장소, Drive 테스트 폴더 + OAuth 1회 인증(`python3 -m schedule.auto.drive_auth`), 테스트 텔레그램 봇 | [SA-01](SA-01-test-environment.md), [SA-14](SA-14-drive-uploader.md) |
| 3 | 정답 세트 수집(`python3 -m schedule.auto.pipeline capture-fixtures --out <저장소 밖>`) | [SA-11](SA-11-detector-and-fixtures.md) |
| 4 | NAS Codex로 fixture 3~5건 시험 판독 | [SA-12](SA-12-vision-extractor.md) |
| 5 | 정확도 평가 도구 작성 후 재현 검증(G2) — **평가 도구는 아직 없음** | [SA-20](SA-20-offline-accuracy.md) |
| 6 | NAS 테스트 예약 등록 후 E2E 16개 시나리오(G3), 섀도 운영(G4) | [SA-17](SA-17-nas-test-wiring.md), [SA-21](SA-21-e2e-scenarios.md), [SA-22](SA-22-shadow-run.md) |

## 3. 하지 말 것

- `feat/schedule-auto`를 main에 병합하지 않는다(SA-31 전까지).
- `schedule_collect_real`, `schedule_kau_real`을 실행하거나 재예약하지 않는다.
- 운영 데이터 저장소·운영 Drive 폴더·운영 텔레그램 채팅을 테스트 환경파일에 넣지 않는다(넣으면 격리 가드가 종료시킴).
- NAS에 등록한 Mac 키(2.1 B)를 작업 후 남겨 두지 않는다.

## 4. 참고 위치

| 항목 | 위치 |
| --- | --- |
| 코드·운영 문서 | scraper `feat/schedule-auto`: `schedule/auto/`, `SCHEDULE_AUTO.md`, `scripts/*schedule_auto*`, `scripts/*codex*` |
| 테스트 | scraper `tests/test_schedule_auto_*.py`, `tests/schedule_auto_fakes.py` |
| 환경파일 예시 | scraper `examples/agility.schedule-auto-test.env.example` |
| Mac 저장소 | `/Volumes/Samsung SSD 990 PRO 2TB/appdev/dalti-script/{agility-scraper,daltiapp.github.io}` |
| NAS 운영 체크아웃 | `/volume1/work/git/agility-scraper` (main, 건드리지 않음) |
