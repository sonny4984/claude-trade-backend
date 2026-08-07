// index.html(아티팩트용 조각) → public/index.html(단독 배포용 완성 문서)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const body = readFileSync("index.html", "utf8");
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
<rect width="192" height="192" rx="42" fill="#e8442e"/>
<text x="96" y="130" font-size="104" text-anchor="middle">🍜</text></svg>`
  );
const MANIFEST = {
  name: "찐맛 — 검증된 맛집만",
  short_name: "찐맛",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#e8442e",
  icons: [{ src: ICON, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" }],
};

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="구글 리뷰 50개 이상, 평점 4.5 이상인 맛집과 명소만 골라 보여주는 앱">
<meta name="theme-color" content="#e8442e" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131416" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="찐맛">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="${ICON}">
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(MANIFEST))}">
</head>
<body>
${body}
</body>
</html>
`;
mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", html);
console.log("built public/index.html (%d KB)", Math.round(html.length / 1024));
