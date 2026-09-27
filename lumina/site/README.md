# 공개 사이트용 한 파일 빌드

`npm run build:single`의 결과(`dist-single/index.html`)를 복사해 둔 것입니다.
게임 사이트(GitHub Pages, `gh-pages` 브랜치)에는 이 파일이 `index.html`로 올라갑니다.
초대 링크에 쓰는 사이트 주소는 `.env`의 `VITE_PUBLIC_URL`입니다.
소스를 고치면 `npm run build:single && cp dist-single/index.html site/index.html` 뒤 gh-pages에 다시 올리세요.
