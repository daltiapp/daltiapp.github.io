# SA-12 · 포스터 판독기 + 교차검증

> 2026-09-30 변경: 신규 대회일정은 NAS에서 승인 없이 검증·커밋·푸시한다. 아래 기존 승인 중심 계획은 이 결정으로 대체하며, 현재 기준은 [최종 설계](../2026-09-29-schedule-auto-collection.md)와 스크래퍼 `SCHEDULE_AUTO.md`다. 웹 확인은 후속 기능이다.

- 단계: 1 개발 · 선행: SA-10, SA-11, SA-03 · 크기: L · 설계: 3절
- 구현: scraper `feat/schedule-auto` — `schedule/auto/extractor.py`, `schedule/auto/codex_cli.py`

## 목적

이 프로젝트의 중심 기능이다. 본문 이미지에서 대회 N건의 13개 일정 필드와 장소명을 뽑고, 코드 규칙으로 오류를 걸러낸다. Codex는 값을 제안만 하고 최종 판정은 코드와 사람이 한다.

## 근거

상세 본문은 텍스트가 거의 없고 이미지뿐이다(예: `idx=174083985` PNG 15장). 장소·심사위원·접수기간·시간은 이미지에만 있다.

## 범위

1. **판독기**: 기본은 NAS Codex CLI(`CodexCliProvider`, ChatGPT 로그인, API 키 없음). 인터페이스로 분리해 OpenAI 호환 API(`OpenAICompatibleProvider`)로 바꿀 수 있다. 테스트용 가짜 판독기 포함.
2. **Codex 호출 제한**: `--ephemeral --ignore-user-config --sandbox read-only`, 명령 실행·외부 연동 끔, `web_search="disabled"`(첨부 이미지만 근거), `--output-schema`, 최소 환경변수, 시간 제한(기본 300초).
3. **출력 schema(엄격)**: `competitions[]`(13개 필드), `evidence[]`(field, competitionIndex, imageIndex, rawText, certainty=`exact|uncertain|missing`), `venue`(nameRaw, addressRaw, imageIndex), `warnings[]`.
4. **프롬프트 입력**: 제목, 게시일, 신청 페이지 텍스트, 순서 있는 이미지, 활성 JSON에서 만든 정규화표(주최·eventType·matchTypes·장소명), `AGILITYKOREA_DATA_VERSIONING.md`의 `matchTypes` 규칙. 이미지·웹 안의 지시문은 데이터로만 취급하라고 명시.
5. **결정적 교차검증(코드)**:
   - `required`(반영 불가): 제목 날짜와 `startAt` 불일치, 날짜 순서·ISO 형식 오류, 접수 시작·마감 짝 불일치, 시작·종료 누락, 번호 붙은 `비기너1`·`노비스2`, 대회 0건, 응답 형식 오류(재시도 1회 후)
   - `check`(승인 가능, 일정 검수 화면에 표시): 정규화표에 없는 새 주최·대회종류·종목, 근거 `uncertain`, 시각 미기재인데 `detailNotice` 사유 없음, 승급전 점핑·어질리티를 LV로 쓰지 않음, 이미지 12장 초과로 잘림
   - 일정 초안은 검수 화면에 남기고 필요한 필드를 보완한다. 기존 장소의 일정 생성에는 주소·GPS 조회가 필요 없다.
6. **사용량 통제**: 지문이 같은 게시물은 재판독하지 않는다. 1회 실행 최대 5게시물(`AGILITY_SCHEDULE_AUTO_MAX_POSTS`), 넘으면 다음 실행으로 미룬다. 사용량은 ChatGPT 요금제 한도에 포함된다.

## 완료 조건

- [x] 가짜 판독기로 교차검증 규칙 단위 테스트
- [x] 가짜 `codex` 실행 파일로 호출 인자·표준입력 프롬프트·최소 환경변수·시간 제한·오류 가림 테스트
- [x] 비밀값·응답 원문이 로그에 남지 않음(요약만 기록)
- [ ] NAS Codex로 SA-11 fixture 3~5건 시험 판독(모델·추론 강도 설정 확인). 정확도 판정은 SA-20
