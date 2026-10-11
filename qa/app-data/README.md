# 일반 QA 앱의 KKF 자료실

현재 스냅샷: [kkf-19729a266f55ceac/agilitykorea-manifest.json](kkf-19729a266f55ceac/agilitykorea-manifest.json)

일반 앱의 `lib/main.dart`, manifest 다운로드, Drift 캐시, 자료실 목록·상세·이미지 뷰어를 그대로 사용하는 QA APK 전용 데이터다. 별도 검수 뷰어가 아니다. 활성 운영 manifest와 JSON은 변경하지 않는다.

- 기존 활성 JSON을 복사하고 자료실에만 KKF 공지 23건을 추가했다.
- 이미지 207장: 원본 48장, 원본 혼합표의 부문별 절단 3장, PDF 7장, 실제 웹 표 이미지 149장.
- 실제 HTML 표 12건·1,295행만 `recordPath`로 연결했다.
- 이미지/PDF 원문 11건은 이미지 전용이다. 11007의 판독 대기 165행은 제외하고 원본 9장만 제공한다.
- 사용자 승인에 따라 저장된 공식 HTML·이미지 제목, 로컬 Apple Vision OCR, 육안 판독 및 KKF 승급 기준 공지를 근거로 분류했다. 종목은 직접 제목으로 확인하고, 승급/랭킹은 공지 맥락으로 추론한 항목을 검수 기록에 명시한다.
- 점어승급전 15개 대회·119장, 점어랭킹전 8개·27장, 비노랭킹전 8개·61장. 대회 수는 혼합 부문으로 중복된다. 비노승급전의 직접 근거는 없어 0건이며 기존 채널 분류는 유지한다.
- AWC 표제의 11699·10715는 첨부의 실제 한국대표 선발전 제목과 합산 선발 방식을 확인해 점어랭킹전으로 분류했다. AWC 본선으로 연결하지 않는다.
- 제70회 마지막 혼합 시상표는 점핑 릴레이·노비스 통합우승·AG 통합우승으로 원본 픽셀을 잘랐다. 노비스/AG 표 머리글은 원본에서 반복하며 기록을 다시 쓰지 않는다. 날짜별 보기에도 중복 원본 없이 3개 조각만 표시한다.
- 2019년 9410·9532의 노비스/비기너 시상은 비노랭킹전, 공식 점핑·어질리티는 점어승급전으로 분리한다. `recordSelections.groupIndexes`도 해당 부문의 행만 참조한다.
- 이미지 URL은 검증된 `/qa/kkf-results/e5abb94c88302669/` 파일을 재사용한다.
- 앱 저장소 `tool/prepare_kkf_app_data.py`로 생성한다. 원문 재접속·유료 API·수집·푸시를 실행하지 않는다.
- 재생성 입력 [분류 검수 원본](kkf-classification-review.json), 스냅샷에 고정한 [원문 해시·제목·OCR 좌표·절단 범위·추론 근거](kkf-19729a266f55ceac/classification-review.json)를 보존한다. 스크래퍼의 `competition-mode-overrides.json`은 위 두 혼합 대회의 비노 시상만 예외로 처리한다.

일반 QA 빌드에 `DALTI_QA_DATA_ROOT=https://daltiapp.github.io/qa/app-data/kkf-19729a266f55ceac`를 지정한다. `DALTI_KKF_REVIEW_*`는 함께 지정하지 않는다. QA APK만 허용하며 production과 스토어 bundle은 거부한다. 이 override를 생략하면 기존 운영 데이터 주소를 사용한다. 이전 미분류 스냅샷은 그대로 보존한다.

검증: QA/운영 각각 `active_data_harness.py --scope all`, 자료실 JSON schema·정렬·분류별/날짜별 자료·기록표 인덱스 검사 통과. 앱 전체 데이터 파서·캐시 검증과 실제 기기 결과는 앱 저장소 QA 문서 및 실행 증적으로 관리한다.
