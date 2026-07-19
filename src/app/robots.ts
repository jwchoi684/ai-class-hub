import type { MetadataRoute } from "next";

/**
 * 크롤러 전면 차단 (docs/REQUIREMENTS.md §2.1).
 * sitemap 은 의도적으로 만들지 않습니다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
