# AgilityKorea 자료실 JSON 계약

자료실은 대회 출진표·코스맵·결과 이미지를 앱에 제공한다. 코스맵은 대회에 연결하거나 독립 자료로 등록할 수 있으며, 같은 이미지를 대회 상세와 맵 카테고리 화면에서 함께 사용한다. 결과표의 참가 기록을 OCR로 구조화하는 작업과 독립적으로 추가·배포할 수 있다.

## 앱 진입점과 파일

앱은 [agilitykorea-manifest.json](https://daltiapp.github.io/agilitykorea-manifest.json)을 먼저 읽고 사이트 origin에 `basePath + files.library`를 붙여 자료실을 요청한다. 버전 폴더를 앱에 고정하지 않는다. `files.library`가 없는 이전 manifest를 받으면 자료실 미제공 상태로 처리하고, 구버전 경로를 추측해 요청하지 않는다.

최초 배포 경로는 `ak/v3/library/library.json`이다. 구조는 [library.json](../ak/v3/library/library.json), 필드·타입 계약은 [agility-library-v1.schema.json](../schemas/agility-library-v1.schema.json)을 참고한다. 버전 폴더에는 JSON만 두고 문서는 `docs/`, 검증 계약은 `schemas/`에서 관리한다.

## 최상위 구조

| 필드 | 의미 |
| --- | --- |
| `schemaVersion` | 자료실 전용 구조 버전. 현재 `1`이며 manifest의 서비스 스키마 버전과 별도다. |
| `dataVersion` | 자료실 데이터 수정 버전. `YYYYMMDD.N` 형식이다. |
| `updatedAt` | 시간대가 포함된 ISO 8601 수정 시각. |
| `mapCategories` | 맵 카테고리 ID와 앱 표시명. 자료가 없는 카테고리도 유지한다. |
| `events` | 대회 정보 목록. 전체 대회 이력의 전수 목록을 의미하지 않는다. |
| `assets` | 이미지 한 장을 한 항목으로 등록하는 자료 목록. |

## 대회와 자료 연결

`events`의 필수 필드는 `id`, `name`, `startDate`, `endDate`, `competitionGroup`, `organizer`다. 개최일은 원문에서 확인한 `YYYY-MM-DD`로 기록한다. 게시일을 개최일로 대신하지 않으며, 날짜·주최자가 미확인이면 해당 필드는 `null`로 둔다.

| `competitionGroup` | 의미 |
| --- | --- |
| `OFFICIAL_PROMOTION` | 일반 승급전 |
| `UNOFFICIAL_PROMOTION_EVENT` | 비노승급전 |
| `RANKING_EVENT` | 랭킹전·이벤트전 |
| `INTERNATIONAL_EVENT` | 국제 대회 |
| `OTHER_EVENT` | 위 분류 외에 확인된 대회 |

`assets`의 필수 필드는 `id`, `kind`, `title`, `eventIds`, `mapCategories`, `notice`, `image`, `source`다. `eventIds`에는 연결할 `events[].id`를 넣는다. 실제로 공용인 이미지는 여러 대회에 연결할 수 있다. 출진표·결과는 대회 연결이 필요하며, 독립 코스맵은 `eventIds: []`로 등록한다. 연결을 위해 가짜 대회를 만들지 않는다.

| `kind` | 자료 종류 |
| --- | --- |
| `entry_list` | 출진표 |
| `course_map` | 코스맵 |
| `result` | 대회결과 |

`notice`는 원문의 주의사항을 표시하는 문자열이며, 없으면 `null`이다. 최종 확정본이 아닌 공개용 출진표 등 원문의 안내를 보존하고 앱 상세에서 표시한다. 출진표가 결과표와 비슷한 모양이어도 `result`로 바꾸지 않는다.

ID는 한 번 발급하면 제목·날짜·분류·URL을 수정해도 유지한다. 현재 카카오 이미지 ID는 `asset-kakao-채널코드-첨부ID` 형식이다. 같은 원문 이미지를 새 항목으로 중복 등록하지 않고 기존 항목의 연결과 분류를 갱신한다.

## 맵 카테고리

| ID | 표시명 | 기준 |
| --- | --- | --- |
| `ranking` | 랭킹전 | 실제 랭킹전·이벤트전 코스 |
| `promotion` | 승급전 | 일반 승급전 또는 비노승급전 코스 |
| `awc` | AWC | 실제 AWC 대회 코스 |
| `training` | 트레이닝맵 | 연습용으로 작성·공개된 코스 |

`course_map`은 `mapCategories`에 한 개 이상의 카테고리를 갖는다. 출진표·결과의 `mapCategories`는 `[]`다. 카테고리는 이미지 내용에 근거해 등록하며, AWC 코스를 응용해 만든 연습맵은 `training`으로 분류한다. 여러 대회에 연결했다고 모든 대회 종류를 자동으로 카테고리에 추가하지 않는다.

한 게시물 안에 여러 대회의 이미지가 섞일 수 있다. 최초 자료의 `114414029` 게시물에서는 세 번째 이미지가 랭킹전 코스이며 다른 이미지는 비노승급전 코스다. 게시물 제목 전체를 복사해 일괄 분류하지 않는다.

## 이미지와 출처

| 필드 | 의미 |
| --- | --- |
| `image.url` | 로그인 없이 열리는 실제 이미지의 HTTPS 직접 URL. 앱 상세 이미지 뷰어에서 사용한다. |
| `image.thumbnailUrl` | 목록용 HTTPS 썸네일 URL. 없으면 `null`이며 앱은 `image.url`을 사용할 수 있다. |
| `image.width`, `image.height` | 실제 이미지의 가로·세로 픽셀. 미확인이면 `null`. |
| `image.mimeType` | 실제 응답의 이미지 MIME 타입. |
| `source.provider` | `kakao` 또는 `manual`. 수동 등록도 원문이 있으면 출처를 남긴다. |
| `source.postUrl` | 실제 원문 게시물 URL. 원문 게시물이 없는 수동 자료는 `null`. 이미지 표시 목적지와 구분한다. |
| `source.channelId`, `source.channelName` | 카카오 채널의 원문 ID와 이름. |
| `source.postId`, `source.mediaId` | 원문 게시물 ID와 첨부 이미지 ID. 문자열로 보존한다. |
| `source.postTitle` | 원문 게시물 제목. 앱 표시용 `title`과 별도로 보존한다. |
| `source.publishedAt` | 원문 게시 시각. 개최일과 구분한다. |
| `source.imageOrder` | 원문 게시물 안의 첨부 순서. 1부터 시작하며 일부 이미지만 연결해도 다시 번호를 매기지 않는다. |

`kakao` 출처는 위 출처 필드를 모두 포함한다. `manual`은 `provider`와 `postUrl`을 포함하고, 실제 확인한 출처 필드를 추가할 수 있다. 카카오 썸네일·큰 이미지 URL은 응답에서 받은 값을 사용하며 파일명을 추측해 URL을 만들지 않는다. 주소가 바뀌거나 공개 접근이 실패하면 원문을 재확인하고, 같은 자료 ID에서 검증된 주소로 갱신한다.

## 앱 조회 규칙

- 대회 상세: `asset.eventIds`에 대회 ID가 있는 항목을 찾고 `kind`로 출진표·코스맵·결과를 나눈다.
- 전체 맵: `kind == "course_map"`인 항목을 사용한다. 대회 연결이 없는 맵도 포함한다.
- 카테고리별 맵: 전체 맵 중 `mapCategories`에 선택한 카테고리 ID가 있는 항목을 사용한다.
- 같은 게시물의 자료는 `source.imageOrder` 오름차순으로 보여준다. 게시물이 여러 개면 `source.publishedAt`으로 묶어 정렬하고 게시물별 첨부 순서를 유지한다.
- 자료 목록이 비어 있으면 자료 없음 상태를 표시한다. 배열이 비었다는 이유만으로 원문에 자료가 게시되지 않았다고 단정하지 않는다.

앱은 새로운 선택 필드를 무시할 수 있어야 한다. 자료실 `schemaVersion`이 지원 범위를 벗어나면 지원하지 않는 데이터 상태로 처리하고 다른 버전 경로로 fallback하지 않는다.

## 자료 추가와 배포

1. 데이터 저장소의 원격 상태와 작업 트리를 확인하고 manifest에서 활성 자료실 경로를 구한다.
2. 실제 원문에서 대회명·개최일과 이미지별 자료 종류를 확인한다. 기존 대회가 있으면 같은 ID를 재사용하고, 독립 맵이면 대회를 만들지 않는다.
3. 이미지별 `assets` 항목을 추가한다. 해당 대회의 자료를 일부 생략하지 않도록 원문 이미지의 수·내용·순서를 대조하고, 다른 대회의 자료는 섞지 않는다. 아직 미확인인 항목은 배포 자료에 임의로 추가하지 않는다.
4. 로그인·쿠키 없이 이미지와 썸네일을 HTTP GET으로 요청해 성공 상태, 이미지 MIME 타입, 실제 디코딩·내용을 확인한다. 미확인 종목·레벨·심판을 추정해 넣지 않는다.
5. 자료실의 `dataVersion`·`updatedAt`을 갱신하고 manifest의 `dataVersion`·`forceRefreshKey`·`updatedAt`을 같은 작업 단위에서 갱신한다. ID는 재발급하지 않는다.
6. JSON Schema, 대회 참조, ID 중복, 카테고리 중복·연결, 날짜 순서와 이미지 원문 순서를 확인한다. 이어서 로컬 Python 데이터 하네스를 `--scope all`로 실행한다. 하네스는 자료실의 참조·분류 검증을 대체하지 않는다.
7. 관련 데이터·스키마·문서를 한 커밋으로 배포하고 공개 manifest에서 찾은 자료실 응답이 커밋 내용과 일치하는지 확인한다.

구조를 유지한 자료 추가는 자료실 `schemaVersion`을 올리지 않는다. 기존 필드의 타입·의미를 바꾸는 작업은 앱과 계약을 함께 검토하고 저장소의 버전 전환 규칙을 따른다. 자료실 추가 작업은 일정 등록이나 앱 푸시 발송을 뜻하지 않는다.
