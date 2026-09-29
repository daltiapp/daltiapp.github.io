# SA-01 · 테스트 환경 구축

- 단계: 0 준비 · 선행: SA-00 · 크기: M

## 목적

운영 앱·데이터·푸시에 영향이 없는 곳에서 전체 흐름(쓰기·업로드·승인·push 포함)을 실제로 돌릴 수 있게 한다.

## 현황

- `ENVIRONMENTS.md`는 테스트 데이터 저장소 `/volume1/work/git/daltiapp.github.io-test`를 전제로 하지만, 이 Mac과 `gh repo list daltiapp`에서는 확인되지 않았다(NAS는 미확인). 새로 만든다고 가정한다.
- `examples/agility.test.env.example`에 테스트 텔레그램·데이터 저장소 변수가 있다.

## 작업

1. **테스트 데이터 저장소**: SA-00 결정에 따라 비공개 저장소 생성. 운영 저장소의 `agilitykorea-manifest.json`, `ak/`, `review/`를 복사해 초기 커밋(운영 커밋 해시를 커밋 메시지에 기록). GitHub Pages는 켜지 않는다.
2. **기준선 규칙**: 테스트 저장소의 `match.json`·`venue.json`·manifest는 운영 스냅샷을 기준선으로 쓰고, 자동화가 더한 것만 diff로 남긴다. 기준선 갱신은 커밋 메시지 `baseline: sync from prod <hash>`로 남긴다.
   - E2E(SA-21): 시나리오마다 기준선 커밋으로 되돌린다.
   - 섀도 운영(SA-22): 시작 시점 운영 스냅샷으로 고정하고 기간 중 갱신하지 않는다.
3. **테스트 Drive 폴더**: `dalti.app@gmail.com` Drive에 테스트 전용 폴더. 검증이 끝나면 비울 수 있다.
4. **테스트 텔레그램**: 테스트 봇·채팅. 이 봇을 `getUpdates`·webhook으로 쓰는 다른 프로그램이 없는지 확인한다.
5. **Codex**: 테스트 프로필 전용 `CODEX_HOME`에 NAS에서 따로 로그인(SA-03). 지도 API 키·LLM API 키는 필요 없다.
6. **NAS 비밀파일**: `/volume1/work/secrets/agility.schedule-auto-test.env`(권한 600). 기존 `agility.test.env`는 건드리지 않는다.
7. **운영 오염 방지 가드**(SA-17에서 구현, 여기서는 규칙 확정): 테스트 프로필은 아래 중 하나라도 해당하면 즉시 종료한다.
   - `AGILITY_DATA_REPO_DIR`의 `origin`이 운영 저장소(`daltiapp/daltiapp.github.io`)
   - Drive 폴더 ID가 운영 폴더 ID
   - 텔레그램 채팅 ID가 운영 채팅 ID

## 완료 조건

- [ ] 테스트 데이터 저장소에서 하네스 `--scope all` 통과
- [ ] 테스트 Drive 폴더에 수동 업로드한 파일 1개가 비로그인 브라우저에서 `uc?export=view` 주소로 열림
- [ ] 테스트 봇이 테스트 채팅에 메시지 전송 성공
- [ ] 비밀값은 NAS 비밀파일에만 있고 Git·로그에 없음
