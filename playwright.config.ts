import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // 수업 중 주 사용 환경이라 처음부터 같이 돌립니다.
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    // 프로덕션 빌드를 대상으로 돌립니다 — dev 서버에서만 통과하는 e2e 는
    // 배포 후 처음 깨지는 종류라 신뢰할 수 없습니다.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
