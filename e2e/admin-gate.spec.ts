import { expect, test } from "@playwright/test";

/*
 * 운영자 게이트 e2e.
 *
 * 이 스펙은 DB 연결(SUPABASE_SECRET_KEY)이 있어야 의미가 있습니다.
 * 키가 없으면 /admin 이 환경변수 에러로 500 을 내므로 건너뜁니다 — 그래도
 * 스펙은 커밋해 둡니다. 키가 있는 환경에서는 그대로 돌아갑니다.
 *
 * 비밀번호까지 실제로 통과시키는 테스트는 ADMIN_TEST_PASSWORD 가 있을 때만
 * 돕니다. 비밀번호를 저장소에 넣지 않기 위해서입니다.
 */
const supabaseUrl = process.env.SUPABASE_URL;
// 새 이름을 먼저 보되 예전 이름도 받습니다 — 앱과 같은 규칙입니다.
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = !!supabaseUrl && !!serviceKey;
const testPassword = process.env.ADMIN_TEST_PASSWORD;

/**
 * 로그인 시도 카운터를 비웁니다.
 *
 * 데스크톱·모바일 프로젝트가 모두 127.0.0.1 에서 오기 때문에 레이트 리밋
 * 버킷을 공유합니다. 로그인하는 테스트가 몇 개만 모여도 분당 5회 제한에
 * 걸려서, 정작 검증하려던 것과 무관한 이유로 빨간불이 뜹니다.
 *
 * 제한값을 느슨하게 푸는 대신 테스트에서 카운터를 지웁니다 — 그 제한은
 * 4자리 PIN 과 짧은 비밀번호를 지키는 실제 방어선이라 건드리면 안 됩니다.
 */
async function clearLoginRateLimit() {
  await fetch(
    `${supabaseUrl}/rest/v1/rate_limits?bucket=like.admin-login%3A*`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
}

test.describe("운영자 게이트", () => {
  test.skip(
    !hasDb,
    "SUPABASE_URL / SUPABASE_SECRET_KEY 가 없어 건너뜁니다",
  );

  test.beforeEach(async () => {
    await clearLoginRateLimit();
  });

  test("로그인 전에는 비밀번호 폼만 보인다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "운영자 확인" })).toBeVisible();
    await expect(page.getByText("관리자 모드 ON")).toHaveCount(0);
  });

  test("강의실 PC 경고가 체크박스 옆에 보인다", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByText("강의실·공용 PC 에서는 체크하지 마세요."),
    ).toBeVisible();
  });

  test("틀린 비밀번호는 거부하고 이유를 더 알려주지 않는다", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("비밀번호").fill("확실히-틀린-비밀번호-9999");
    await page.getByRole("button", { name: "확인" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    // 길이·형식 힌트가 새어 나가면 안 됩니다.
    await expect(alert).not.toContainText("자 이상");
    await expect(page.getByText("관리자 모드 ON")).toHaveCount(0);
  });

  test("빈 비밀번호로는 제출 버튼이 눌리지 않는다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "확인" })).toBeDisabled();
  });

  test("맞는 비밀번호로 들어가면 관리자 모드가 켜지고 기기 목록이 보인다", async ({
    page,
  }) => {
    test.skip(!testPassword, "ADMIN_TEST_PASSWORD 가 없어 건너뜁니다");

    await page.goto("/admin");
    await page.getByLabel("비밀번호").fill(testPassword!);
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page.getByText("관리자 모드 ON")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인된 기기" }),
    ).toBeVisible();

    // 로그아웃하면 다시 게이트로 돌아와야 합니다.
    await page.getByRole("button", { name: "이 기기 로그아웃" }).click();
    await expect(page.getByRole("heading", { name: "운영자 확인" })).toBeVisible();
  });

  test("세션 쿠키는 httpOnly 라 자바스크립트로 읽히지 않는다", async ({ page }) => {
    test.skip(!testPassword, "ADMIN_TEST_PASSWORD 가 없어 건너뜁니다");

    await page.goto("/admin");
    await page.getByLabel("비밀번호").fill(testPassword!);
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText("관리자 모드 ON")).toBeVisible();

    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain("ac_admin");

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name.endsWith("ac_admin"));
    expect(session?.httpOnly).toBe(true);
  });
});

test("관리자 링크가 없는 상태에서 /admin 은 색인되지 않는다", async ({ page }) => {
  const response = await page.goto("/admin");
  // 500(키 없음)이든 200(게이트)이든 색인 차단 헤더는 붙어 있어야 합니다.
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
});
