# SA-14 · 무인 Drive 업로더

- 단계: 1 개발 · 선행: SA-01, SA-02 · 크기: M · 설계: 5.5절

## 목적

NAS에서 사람 로그인 없이 포스터 이미지를 `dalti.app@gmail.com` Drive에 올리고 공개 직접보기 URL을 만든다.

## 근거

- 기존 `data-studio/google-drive-upload.mjs`는 Mac의 `gcloud` 사용자 로그인에서 access token을 받는다. NAS 무인 실행에 쓸 수 없다.
- 서비스 계정은 저장 용량이 없어 개인 Gmail Drive 업로드가 403 `storageQuotaExceeded`로 실패한다. → OAuth refresh token 방식.

## 범위

1. **OAuth 설정(1회, 수동)**: Google Cloud에서 데스크톱 앱 OAuth 클라이언트 생성, 범위 `drive.file`. 동의 화면을 “프로덕션”으로 게시한다(“테스트” 상태의 refresh token은 7일 후 만료). Mac에서 1회 동의 후 refresh token을 NAS 비밀파일(권한 600)에 저장. 절차를 런북에 기록.
2. **스파이크**: `drive.file`로 기존 수동 폴더에 파일을 만들 수 있는지 확인. 불가하면 앱이 만든 폴더를 쓴다. 결과를 SA-00 3번에 기록.
3. **Python 포팅**(`google-drive-upload.mjs` 규칙 유지):
   - 파일명 `kau-<idx>-<순번>-<sha256 앞 16자>.webp`, 같은 이름이 폴더에 있으면 재사용(멱등)
   - Pillow로 긴 변 2400px·WebP q88, 실패 시 원본 형식
   - 파일별 `anyone/reader` 권한 확인·생성
   - 비로그인 GET으로 이미지 응답 확인
   - URL `https://drive.google.com/uc?export=view&id=<fileId>`
4. **헬스체크**: 실행 시작 시 token 갱신·폴더 접근 확인. 실패 시 이미지 단계와 반영을 중단하고 경보.
5. 토큰·access token·Authorization 헤더는 로그·예외 메시지에서 가린다.

## 완료 조건

- [ ] HTTP mock 테스트: 재업로드 시 같은 fileId, 권한 누락 복구, 공개 확인 실패 시 반영 차단, 토큰 갱신 실패
- [ ] 테스트 Drive 폴더에 실제 업로드 1회 → 비로그인 브라우저에서 열림
- [ ] 7일 이상 지난 뒤 같은 refresh token으로 헬스체크 성공(SA-22 기간 중 확인)
