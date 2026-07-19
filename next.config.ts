import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /*
         * 전역 검색엔진 색인 차단 (docs/REQUIREMENTS.md §2.1).
         *
         * layout.tsx 의 robots 메타태그와 이중으로 겁니다. 메타태그는 HTML
         * 문서에만 붙어서 업로드된 PDF·이미지를 덮지 못하는데, 헤더는 모든
         * 응답에 붙습니다.
         *
         * proxy(구 middleware)가 아니라 여기에 둔 이유: 요청마다 함수가 실행될
         * 필요가 없는 정적인 규칙이고, Next 문서도 proxy 는 최후 수단으로
         * 쓰라고 안내합니다.
         *
         * 수업이 끝난 뒤 공개 홍보를 원하면 이 블록과 layout.tsx 의 robots 를
         * 함께 지우면 됩니다. 그 전에는 켜 두는 게 기본값입니다.
         */
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
