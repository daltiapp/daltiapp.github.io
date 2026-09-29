# SA-12 · 포스터 판독기 + 교차검증

- 단계: 1 개발 · 선행: SA-10, SA-11 · 크기: L · 설계: 5.3절

## 목적

본문 이미지에서 대회 N건의 13개 필드와 장소 원문을 뽑고, 코드 규칙으로 오류를 걸러낸다. LLM은 최종 판정을 하지 않는다.

## 근거

상세 본문은 텍스트가 거의 없고 이미지뿐이다(예: `idx=174083985` PNG 15장). 장소·심사위원·접수기간·시간은 이미지에만 있다.

## 범위

1. **제공자 인터페이스**: `extract(post, images, context) -> ExtractionResult`. 구현 1개 + 테스트용 가짜 구현.
2. **스파이크**: SA-00 1번 결정을 위해 후보 제공자를 fixture 3~5건으로 비교(정확도·응답 형식 준수·호출당 비용). 결과를 SA-00에 기록.
3. **출력 schema(엄격)**: `competitions[]`(13개 필드), `evidence[]`(field, competitionIndex, imageIndex, rawText, certainty=`exact|uncertain|missing`), `venue`(nameRaw, addressRaw, imageIndex), `warnings[]`. 기존 `codex-kau-output.schema.json`을 확장한다.
4. **프롬프트 입력**: 제목, 게시일, 신청 페이지 텍스트, 순서 있는 이미지, 활성 JSON에서 만든 정규화표(주최·eventType·matchTypes·장소명), `AGILITYKOREA_DATA_VERSIONING.md`의 `matchTypes` 규칙.
5. **결정적 교차검증(코드)**:
   - 제목에 날짜가 있으면 `startAt` 날짜와 일치
   - `applicationStartAt ≤ applicationEndAt ≤ startAt ≤ endAt`, ISO 초 단위
   - 시간 미기재 시 `00:00:00` + `detailNotice`에 사유(익산 대회 수동 입력 방식)
   - `matchTypes`·`eventType`·`club`은 정규화표 안의 값만 허용, 밖이면 `required` 경고
   - 스키마 위반·응답 파싱 실패는 재시도 1회 후 게시물 전체를 `required` 경고로 남김
6. **비용 통제**: 지문이 같은 게시물은 재판독하지 않는다. 1회 실행 판독 상한(예: 게시물 5건)을 두고 넘으면 경고.

## 완료 조건

- [ ] 가짜 제공자로 교차검증 규칙 단위 테스트(날짜 불일치, 순서 위반, 정규화 밖 값, 파싱 실패)
- [ ] 스파이크 결과표와 제공자 결정 기록
- [ ] API 키·응답 원문이 로그에 남지 않음(요약만 기록)
- [ ] 정확도 판정은 SA-20에서 한다
