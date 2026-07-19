import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig 의 "@/*" 경로 별칭을 그대로 씁니다 (Vite 네이티브 지원).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    /*
     * 서버 런타임(Vercel)이 UTC 라는 사실이 테스트에서도 재현돼야 합니다.
     * 개발자 노트북은 KST 라, 로컬 시간대로 테스트하면 시간대 버그가
     * 테스트를 통과해 버립니다.
     */
    env: { TZ: "UTC" },
  },
});
