# Dalti Data Studio

활성 AgilityKorea JSON을 원본 근거와 함께 분석하고, 사람이 diff를 확인한 뒤에만
커밋·푸시하는 로컬 운영 도구입니다.

## 실행

```sh
cd data-studio
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 서버는 외부 인터페이스에
바인딩하지 않습니다.

## 안전 흐름

1. 루트 `agilitykorea-manifest.json`에서 활성 파일을 해석합니다.
2. 사이트, 공개 Instagram 메타데이터, 붙여넣은 텍스트에서 초안을 만듭니다.
3. 사용자가 필드별 근거와 경고를 수정합니다.
4. `변경 미리보기`가 스키마, 중복, 장소 연결, 저장소 상태를 검사합니다.
5. 두 확인 항목을 모두 체크해야 allowlist 파일만 쓰고 커밋·푸시합니다.

미리보기는 파일을 쓰지 않습니다. 적용 시에도 미리보기 이후 대상 파일의
SHA-256과 Git 브랜치·clean 상태가 달라지면 중단합니다. 이 도구는 FCM이나
Telegram 발송을 호출하지 않습니다.

## 데이터별 정책

- 대회: 활성 `files.match`의 정확한 13개 필드를 유지합니다.
- 장소: 활성 `files.venue`의 이름·주소·좌표·사진 구조를 유지합니다.
- 공지: 목록과 상세 JSON을 직접 수정하지 않습니다. 공식 수집 스크립트의
  재생성·배포 경로만 허용하는 읽기 전용 관리 화면입니다.
- manifest: 같은 날짜의 `dataVersion` 순번을 올리고 `forceRefreshKey`와
  `updatedAt`을 같은 변경에 포함합니다.

## 근거

- `../AGILITYKOREA_DATA_VERSIONING.md`
- `../agility-scraper/PUSH_SAFETY_POLICY.md`
- `../agility-scraper/NOTICE_SCHEMA.md`
- Microsoft Research, *Guidelines for Human-AI Interaction* (CHI 2019)
- W3C PROV-O Recommendation
- GitHub REST API repository contents documentation
