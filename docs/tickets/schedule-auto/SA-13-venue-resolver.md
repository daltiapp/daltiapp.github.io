# SA-13 · 장소 해석기 (기존 장소·별칭·Codex 제안)

- 단계: 1 개발 · 선행: SA-10, SA-03 · 크기: M · 설계: 5.4절
- 구현: scraper `feat/schedule-auto` `c3e5a64` — `schedule/auto/venue_resolver.py`

## 목적

판독한 장소를 기존 `venue.json`에 연결하고, 없으면 이름·도로명 주소·좌표를 갖춘 새 venue 제안을 만든다. 지도 API(카카오·Google)는 쓰지 않는다.

## 범위

1. **기존 매칭(외부 호출 없음)**: 정규화(공백·괄호·“일원” 제거) 후 `venue.json`의 `name` → 별칭표 `review/venue/venue_aliases.json` → 포스터 도로명 주소(도로명+번호)가 같은 기존 장소.
2. **신규 제안(Codex 웹검색)**: 정식 명칭, 도로명 주소, 좌표, 좌표 근거 URL, 주소 근거 URL, `certainty`를 엄격 schema로 받는다. 좌표는 글로 적힌 공개 페이지에서만 가져오게 한다.
3. **검증(코드)**: `exact`가 아님, 근거 URL 없음, 포스터 주소와 도로명+번호 또는 시·군·구 불일치, 국내 범위(위도 33~39, 경도 124~132) 밖이면 `required`로 막는다. Codex 실행 실패는 `transient`로 표시해 다음 실행에서 다시 시도한다.
4. **venue 제안**: `{name, location: {name, address, latitude, longitude}, photos: []}`. 신규 장소는 게이트에서 항상 승인 대상이고, 텔레그램에 Google Maps URL(`https://www.google.com/maps/search/?api=1&query=<위도>,<경도>`)과 근거 URL을 붙인다.
5. `미정`은 venue를 만들지 않는다. `AGILITY_VENUE_LOOKUP=none`이면 신규 장소는 “venue.json에 직접 추가” 경고로 막는다.

## 제외

- 카카오 로컬 API, Google Geocoding(JavaScript Geocoder 포함). Google 약관은 위도·경도 저장을 최대 30일로 제한해 공용 `venue.json`에 계속 저장하는 용도에 맞지 않는다.

## 완료 조건

- [x] 현재 v3 `venue.json` 18곳 이름으로 실행 시 신규 생성 0건, Codex 호출 0건(단위 테스트)
- [x] 가짜 Codex로 신규 제안·거절 7가지·실패 재시도 테스트, 실제 subprocess 경로 테스트
- [ ] 누락 장소 `발트바우`, `초록미소마을`을 NAS Codex로 1회 조회한 결과를 SA-30 입력으로 저장(운영 반영은 SA-30, 틀리면 직접 입력)
