import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig 의 "@/*" 경로 별칭을 그대로 씁니다 (Vite 네이티브 지원).
    tsconfigPaths: true,
    /*
     * `server-only` 는 클라이언트 번들에 섞이면 던지도록 만들어진 마커 패키지라,
     * 서버 전용 모듈을 테스트에서 import 하는 순간 죽습니다.
     *
     * 패키지의 exports 맵은 "react-server" 조건에서 빈 모듈을 내주지만 "." 만
     * 노출해서 그 파일을 직접 가리킬 수 없고, vitest 는 node_modules 를 Node
     * 해석에 맡기므로 resolve.conditions 로도 걸리지 않습니다. 그래서 로컬
     * 스텁으로 바꿔치기합니다 — Next 가 서버 빌드에서 하는 것과 결과가 같습니다.
     *
     * 서버/클라이언트 경계 검사 자체는 `next build` 가 그대로 수행합니다.
     */
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
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
