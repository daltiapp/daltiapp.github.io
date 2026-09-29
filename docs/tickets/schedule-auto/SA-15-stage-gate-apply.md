# SA-15 · 스테이징·게이트·반영

- 단계: 1 개발 · 선행: SA-12, SA-13, SA-14 · 크기: L · 설계: 5.6, 5.7절

## 목적

판독·장소·이미지 결과를 하나의 배치로 묶고, 임시 사본에서 검증한 뒤 데이터 저장소에 한 커밋으로 반영한다.

## 범위

1. **배치 파일** `review/schedule/batches/<batchId>.json`: 대회별 변경안(추가/수정, 이전 값·새 값), 신규 venue, manifest 변경안, 대상 파일 SHA-256, 원본 지문, 게이트 결과, 생성·만료 시각(48시간).
2. **임시 사본 검증**: 데이터 저장소를 임시 디렉터리로 복사 → 변경 적용 → `scripts/active_data_harness.py --scope all`. 원본 저장소는 반영 단계 전까지 쓰지 않는다.
3. **게이트**(설계 5.6절 8개 조건): 결과를 대회별로 기록. 이 단계에서는 `approve` 모드만 구현하고 `auto` 경로는 플래그 뒤에 두되 기본 비활성.
4. **중복 방지**: URL idx + 날짜 매칭, 퍼지 검사(같은 날짜 + 같은 장소 또는 이름 유사) → `possibleDuplicate`.
5. **반영**: `match.json`(+`venue.json`) + manifest(`shared/publish_active_data.py`의 `next_data_version`·`bump_manifest` 재사용) + 큐·배치 상태를 한 커밋. pretty JSON 형식. 삽입 위치는 기존 파일 정렬 방식을 확인해 맞춘다.
6. **push**: `pull --rebase` → manifest 충돌이면 manifest만 다시 계산해 1회 재시도 → 실패 시 중단·경보. 데이터 저장소 쓰기 잠금 사용.
7. **FCM 금지**: 이 모듈은 `push/`의 발송 함수를 import하지 않는다(테스트로 확인).

## 완료 조건

- [ ] 로컬 Git 저장소(임시 bare remote) 테스트: 신규 1건, 1게시물 2건, 변경, 신규 venue, 1회 3건 이상, 하네스 실패, manifest 충돌, 대상 파일 SHA 불일치, 만료 배치
- [ ] 반영 커밋에 허용 파일(`match.json`, `venue.json`, manifest, `review/` 하위)만 포함
- [ ] FCM·텔레그램 발송 코드 미사용 확인 테스트
