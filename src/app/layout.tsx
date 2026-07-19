import type { Metadata } from "next";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
  /*
   * 검색엔진 색인 차단 — docs/REQUIREMENTS.md §2.1.
   *
   * 로그인이 없는 사이트라 주소가 단톡방을 거쳐 퍼지는 건 시간 문제이고,
   * 한 번 색인되면 사이트에서 지워도 캐시와 아카이브에 남습니다. 공개로
   * 바꾸는 건 나중에 언제든 가능하지만 반대는 되돌릴 수 없어서 기본값을
   * 차단으로 둡니다. middleware 의 X-Robots-Tag 헤더와 이중으로 겁니다.
   */
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
