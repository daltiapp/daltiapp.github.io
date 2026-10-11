# 일반 QA 앱의 KKF 자료실

현재 스냅샷: [kkf-60daf9b097a8f5f7/agilitykorea-manifest.json](kkf-60daf9b097a8f5f7/agilitykorea-manifest.json)

일반 앱의 `lib/main.dart`, manifest 다운로드, Drift 캐시, 자료실 목록·상세·이미지 뷰어를 그대로 사용하는 QA APK 전용 데이터다. 별도 검수 뷰어가 아니다. 활성 운영 manifest와 JSON은 변경하지 않는다.

- 기존 활성 JSON을 복사하고 자료실에만 KKF 공지 23건을 추가했다.
- 이미지 205장: 원본 49장, PDF 7장, 실제 웹 표 이미지 149장.
- 실제 HTML 표 12건·1,295행만 `recordPath`로 연결했다.
- 이미지/PDF 원문 11건은 이미지 전용이다. 11007의 판독 대기 165행은 제외하고 원본 9장만 제공한다.
- 부문 미확정 자료는 분류를 추정하지 않고 날짜별 보기의 미분류 자료로 제공한다.
- 이미지 URL은 검증된 `/qa/kkf-results/e5abb94c88302669/` 파일을 재사용한다.
- 앱 저장소 `tool/prepare_kkf_app_data.py`로 생성한다. 원문 재접속·유료 API·수집·푸시를 실행하지 않는다.

일반 QA 빌드에 `DALTI_QA_DATA_ROOT=https://daltiapp.github.io/qa/app-data/kkf-60daf9b097a8f5f7`를 지정한다. `DALTI_KKF_REVIEW_*`는 함께 지정하지 않는다. QA APK만 허용하며 production과 스토어 bundle은 거부한다. 이 override를 생략하면 기존 운영 데이터 주소를 사용한다.

검증: QA/운영 각각 `active_data_harness.py --scope all`, 자료실 JSON schema·정렬·분류별/날짜별 자료·기록표 인덱스 검사 통과. 앱 전체 데이터 파서·캐시 검증과 실제 기기 결과는 앱 저장소 QA 문서 및 실행 증적으로 관리한다.
