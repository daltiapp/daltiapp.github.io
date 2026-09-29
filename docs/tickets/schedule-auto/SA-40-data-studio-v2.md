# SA-40 · (선택) Data Studio 큐 v2 표시

- 단계: 선택 · 선행: SA-10 · 크기: M · 저장소: `/Users/sam/Documents/DaltiWeb/data-studio`

## 목적

텔레그램 대신 Mac에서 자세히 검수하고 싶을 때 v2 큐(`drafts[]`, 장소 해석 근거)를 Data Studio에서 보고 고칠 수 있게 한다.

## 범위

- v2 큐 읽기·`drafts[]` 편집·장소 해석 근거 표시. v1 파일 계속 읽기.
- 승인 반영은 기존 미리보기·SHA 검사·단일 커밋 흐름을 그대로 쓴다.
- 수집·이미지 업로드·자동 반영 기능은 재개하지 않는다(수집은 NAS 전담).
- 운영 큐 파일을 쓰는 기능은 SA-31 이후에만 운영 저장소에 연결한다. 그 전에는 테스트 저장소로 설정해 검증한다(`DALTI_DATA_REPO_DIR`).

## 완료 조건

- [ ] `npm test` 통과, v1·v2 fixture 표시 확인
- [ ] 텔레그램 승인과 Data Studio 승인이 같은 배치에 겹칠 때 SHA 검사로 한쪽만 적용됨
