# 공모전 기획안

`과학영상_공모전_기획안_3편.docx` 를 만드는 곳.

## 다시 만들기

```bash
cd proposal
npm install          # docx 패키지 (루트 package.json 과 분리돼 있다)
node build_docx.cjs
```

내용은 `plans.json` 에 있다. 문구만 고칠 때는 이 파일만 손보면 된다.
문서 형식(제목 박스, 1~5번 절, 콘티 타임코드)은 클라이언트가 준 원본
기획서를 그대로 따랐다.

## 주의

- `docx` 라이브러리는 문단 테두리를 top → bottom → left → right 순으로
  내보내는데 워드 스키마는 top → left → bottom → right 를 요구한다.
  네 방향을 다 쓰면 문서가 깨지므로 위아래 선만 쓴다.
- 이 컨테이너에는 LibreOffice 가 동작하지 않아 렌더 확인이 안 된다.
  대신 `validate.py` 로 스키마를 검사했다.
