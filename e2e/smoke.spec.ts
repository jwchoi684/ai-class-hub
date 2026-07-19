import { expect, test } from "@playwright/test";

/*
 * 구현 1단계의 합격 기준: 프로덕션 빌드가 실제로 뜨고, 색인 차단이 걸려 있고,
 * 에러 화면이 한국어로 나온다. 기능은 아직 없지만 이 셋은 나중에 붙이면
 * 되돌리기 어려운 것들이라 처음부터 회귀를 막습니다.
 */

test("홈이 뜬다", async ({ page }) => {
  await page.goto("/");
  // 헤더의 클래스명 링크는 회차가 있든 없든 항상 있습니다.
  await expect(
    page.getByRole("link", { name: "AI 실전 클래스" }).first(),
  ).toBeVisible();
  await expect(page).toHaveTitle(/AI 실전 클래스/);
});

test("페이지 언어가 한국어다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});

test("검색엔진 색인이 차단돼 있다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();

  // 헤더 (next.config headers) — 업로드된 파일까지 덮는 쪽
  const header = response!.headers()["x-robots-tag"];
  expect(header).toContain("noindex");
  expect(header).toContain("nofollow");

  // 메타태그 (layout) — 이중 방어
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("robots.txt 가 전면 차단이다", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Disallow: /");
});

test("없는 주소는 한국어 404 화면을 보여준다", async ({ page }) => {
  const response = await page.goto("/이런-주소는-없어요");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "페이지를 찾을 수 없어요" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "홈으로" })).toBeVisible();
});

test("모바일 폭에서 가로 스크롤이 생기지 않는다", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
});
