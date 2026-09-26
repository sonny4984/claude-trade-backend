import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * E2E 스모크 테스트 — 빌드한 앱을 vite preview로 띄워 실제 브라우저로 한 판을 둔다.
 * 샌드박스처럼 미리 깔린 Chromium이 있으면 그걸 쓰고(PW_CHROMIUM으로 바꿀 수 있음),
 * 없으면 Playwright 기본 브라우저를 쓴다. WebGL(3D 무대)은 SwiftShader로 소프트웨어 렌더링.
 */
const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      executablePath,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
