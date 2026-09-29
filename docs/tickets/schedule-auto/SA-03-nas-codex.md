# SA-03 · NAS Codex 설치·로그인

- 단계: 0 준비 · 선행: SA-02 · 크기: S
- 구현: scraper `feat/schedule-auto` `c3e5a64` — `scripts/install_codex_nas.sh`, `scripts/codex_login_nas.sh`, `schedule/auto/codex_cli.py`

## 목적

API 키 없이 NAS에서 Codex CLI(ChatGPT 로그인)로 포스터 판독과 신규 장소 조회를 무인 실행할 수 있게 한다.

## 근거 (2026-09-30 OpenAI 문서 확인)

- `codex exec`는 비대화형 실행용이며 `--image`, `--output-schema`, `--output-last-message`, `--ephemeral`, `--ignore-user-config`, `--sandbox read-only`를 지원한다.
- 헤드리스 기기는 `codex login --device-auth`(디바이스 코드, ChatGPT 보안 설정에서 먼저 켜야 함)로 로그인한다.
- ChatGPT 로그인 세션은 사용 중 자동 갱신된다(약 8일 경과 시 갱신 후 `auth.json`에 다시 기록). **한 `auth.json`을 여러 기기·동시 작업이 같이 쓰면 안 된다.** 한쪽 갱신이 다른 쪽을 무효화할 수 있다.
- OpenAI는 자동화에 API 키 방식을 기본 권장한다. ChatGPT 로그인 방식은 신뢰할 수 있는 비공개 환경에서 한 기기·순차 실행일 때만 쓰는 고급 방식이다. NAS 배치가 이 조건에 맞도록 잠금으로 순차 실행한다.

## 작업

1. NAS SSH에서 설치: `sh scripts/install_codex_nas.sh /volume1/work/bin`
   - `rust-v0.159.0`(2026-09-29 배포) 고정. CPU(x86_64/aarch64)별 musl 빌드를 받고 GitHub 공개 SHA-256과 대조한 뒤 설치한다.
2. ChatGPT 보안 설정에서 디바이스 코드 로그인을 켠다.
3. NAS SSH에서 로그인: `sh scripts/codex_login_nas.sh test`
   - 프로필 전용 `AGILITY_CODEX_HOME`(700), `auth.json`(600), 파일 저장 방식.
   - Mac의 `~/.codex/auth.json`을 복사하지 않는다. 운영 프로필(SA-31)은 별도 `CODEX_HOME`으로 다시 로그인한다.
4. 확인: `sh scripts/run_schedule_auto_profile.sh test check` → Codex 버전·로그인 상태·격리 가드 결과가 `ok: true`.
5. 런북 기록: 로그인 만료 시 3번 재실행, Codex 업데이트 시 설치 스크립트의 버전·SHA-256을 함께 올리고 SA-20 재현 검증을 다시 돌린다.

## 호출 제한 (코드로 강제)

- 명령 실행(`features.shell_tool=false`)·외부 연동(`features.apps=false`) 끔, 빈 임시 작업 폴더, 결과는 `--output-schema` JSON만.
- 포스터 판독은 `web_search="disabled"`, 신규 장소 조회만 `web_search="live"`.
- 텔레그램·Drive 비밀값은 Codex 프로세스 환경에 넘기지 않는다.

## 완료 조건

- [ ] NAS에서 `check` 결과 `ok: true`, `codex.version`이 `codex-cli 0.159.0`
- [ ] `auth.json` 권한 600, `CODEX_HOME` 권한 700, 데이터 저장소 밖
- [ ] SA-11 fixture 1건으로 `schedule_auto_test` 수동 실행 시 판독 결과가 큐에 기록됨
- [ ] 7일 이상 지난 뒤에도 로그인 유지(SA-22 기간 중 확인)
