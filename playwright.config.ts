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
    env: {
      /*
       * 프로덕션 빌드인데 접속은 http 라, 그대로 두면 Secure 쿠키가 심기지
       * 않습니다. Chrome 은 localhost 를 예외로 봐주지만 WebKit 은 버려서
       * iPhone 프로젝트의 로그인 테스트만 실패합니다.
       *
       * 이 스위치는 Vercel 에서 무시됩니다(session.ts 에서 VERCEL 환경변수로
       * 막습니다). 배포본의 쿠키 보안이 약해질 경로는 없습니다.
       */
      ALLOW_INSECURE_SESSION_COOKIE: "1",
    },
  },
});
