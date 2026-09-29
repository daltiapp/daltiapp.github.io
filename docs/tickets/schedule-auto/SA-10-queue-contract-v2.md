# SA-10 · 큐 계약 v2 (1게시물 → N대회)

- 단계: 1 개발 · 선행: SA-02 · 크기: M · 설계: 5.2절

## 목적

한 게시물에서 여러 대회(점/어 + 비/노, 1일차 + 2일차)를 표현하고, 장소 해석·근거·배치 정보를 담을 수 있게 검수 큐 형식을 확장한다.

## 근거

현재 v3 `match.json`에서 `idx=171569089`(점/어 + 비/노), `idx=171129201`(5/16 + 5/17)은 게시물 하나가 대회 2건이다. 현재 계약은 item당 `draft` 1개다.

## 범위

- `schemaVersion: 2`, item의 `draft` → `drafts[]`(각각 정확히 13개 core 필드).
- `fieldEvidence`에 `competitionIndex` 추가.
- item 최상위: `detailImages`(게시물 공유), `venueResolution`(matched/new, 원문 이름·주소, 카카오 후보·거리), `possibleDuplicate`, `batchId`.
- 기존 대회 대응 키: 정규화 URL idx + `startAt` 날짜. 검증기 식별자 `(name, startAt, url)`와 충돌하지 않아야 한다.
- v1 파일 읽기 호환: 단일 `draft` → 길이 1 `drafts`.
- `shared/review_queue.py` 병합: 사람이 처리한 `status`·`review`·수정한 draft 보존, 원본 지문이 바뀐 경우에만 `pending_review`로 되돌림(기존 규칙 유지).

## 제외

- 운영 `review/schedule/*.json` 파일 변환(Phase 3에서 처리). 활성 `match.json` 스키마 변경 없음.

## 완료 조건

- [ ] 계약 문서 초안: 기능 브랜치의 `REVIEW_QUEUE_CONTRACT.md` v2 절 (운영 문서 반영은 SA-31)
- [ ] 스키마 검증 함수와 테스트: 필드 수 13개 초과/부족, 잘못된 `competitionIndex`, 중복 대회 키
- [ ] v1 → v2 읽기, v2 병합 보존 규칙 회귀 테스트
- [ ] 기존 테스트(`tests/test_schedule_detect_kau.py` 등) 모두 통과
