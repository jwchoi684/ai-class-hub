import { expect, test, type Page } from "@playwright/test";

/*
 * 회차 목록·상세·관리 e2e.
 *
 * DB 가 필요하므로 자격증명이 없으면 통째로 건너뜁니다(스펙은 커밋해 둡니다).
 * 데이터를 실제로 만들고 지우므로 로컬 스택 전용입니다 — 프로덕션 URL 을
 * 가리킨 채로 돌리지 마세요.
 */
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_TEST_PASSWORD;
const ready = !!supabaseUrl && !!serviceKey && !!password;

/**
 * 테스트가 만든 회차만 골라 물리 삭제합니다. 로컬 DB 라 안전합니다.
 *
 * 프로젝트 이름을 접두사에 넣는 이유: describe 의 serial 모드는 **한 프로젝트
 * 안에서만** 순서를 보장합니다. desktop 과 mobile 은 여전히 동시에 돌면서 같은
 * DB 를 공유하므로, 접두사가 같으면 한쪽의 정리가 다른 쪽이 방금 만든 회차를
 * 지워버립니다. 어쩌다 통과하는 테스트는 없느니만 못합니다.
 */
const TEST_PREFIX = "E2E테스트회차";
const prefix = () => `${TEST_PREFIX}-${test.info().project.name}`;

function rest(path: string, init?: RequestInit) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function cleanup() {
  await rest(`class_sessions?title=like.${encodeURIComponent(prefix())}*`, {
    method: "DELETE",
  });
  await rest("rate_limits?bucket=like.admin-login%3A*", { method: "DELETE" });
}

async function login(page: Page) {
  await rest("rate_limits?bucket=like.admin-login%3A*", { method: "DELETE" });
  await page.goto("/admin");
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText("관리자 모드 ON")).toBeVisible();
}

test.describe("회차", () => {
  test.skip(!ready, "DB 자격증명이 없어 건너뜁니다");

  /*
   * 반드시 직렬로 돌립니다.
   *
   * 이 블록의 테스트들은 같은 DB 를 공유하면서 각자 회차를 만들고 지웁니다.
   * 병렬로 두면 한 테스트의 beforeEach 정리가 다른 테스트가 방금 만든 회차를
   * 지워버려서, 실제 코드와 무관한 이유로 빨간불이 뜹니다.
   * 로그인 레이트 리밋(같은 IP 버킷)도 직렬 쪽이 안정적입니다.
   */
  test.describe.configure({ mode: "serial" });

  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("관리자가 회차를 만들면 목록과 홈에 나타난다", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "＋ 새 회차" }).click();
    const title = `${prefix()} 생성`;
    await page.getByLabel("제목").fill(title);
    await page.getByLabel("날짜").fill("2026-08-26");
    await page.getByLabel("바로 공개").check();
    await page.getByRole("button", { name: "만들기" }).click();

    // 관리 표에 반영
    await expect(page.getByText(title)).toBeVisible();

    // 홈에도 반영. '이번 주차' 카드와 회차 그리드 양쪽에 나오므로 first() 로 좁힙니다.
    await page.goto("/");
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("준비 중 회차는 수강생에게 보이지 않는다", async ({ page, context }) => {
    await login(page);

    await page.getByRole("button", { name: "＋ 새 회차" }).click();
    const title = `${prefix()} 비공개`;
    await page.getByLabel("제목").fill(title);
    // '바로 공개'를 체크하지 않음
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByText(title)).toBeVisible();

    // 로그아웃한 상태(= 수강생)에서는 안 보여야 한다
    await context.clearCookies();
    await page.goto("/");
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByText("새 회차 추가")).toHaveCount(0);
  });

  test("삭제는 제목을 그대로 입력해야만 실행된다", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "＋ 새 회차" }).click();
    const title = `${prefix()} 삭제대상`;
    await page.getByLabel("제목").fill(title);
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: "삭제" }).first().click();

    const confirm = page.getByRole("button", { name: "삭제", exact: true }).last();
    // 아무것도 입력하지 않았으면 눌리지 않는다
    await expect(confirm).toBeDisabled();

    // 비슷하지만 다른 제목도 통하지 않는다
    await page.getByRole("textbox").last().fill(`${title} `);
    await page.getByRole("textbox").last().fill(`${title}x`);
    await expect(confirm).toBeDisabled();

    // 정확히 일치해야 활성화
    await page.getByRole("textbox").last().fill(title);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("회차 상세와 이전·다음 이동", async ({ page }) => {
    await login(page);

    for (const [n, suffix] of [["앞", "A"], ["뒤", "B"]] as const) {
      await page.getByRole("button", { name: "＋ 새 회차" }).click();
      await page.getByLabel("제목").fill(`${prefix()} ${n}${suffix}`);
      await page.getByLabel("바로 공개").check();
      await page.getByRole("button", { name: "만들기" }).click();
      await expect(
        page.getByText(`${prefix()} ${n}${suffix}`).first(),
      ).toBeVisible();
    }

    await page.goto("/");
    await page.getByText(`${prefix()} 앞A`).last().click();

    await expect(
      page.getByRole("heading", { name: new RegExp(`${prefix()} 앞A`) }),
    ).toBeVisible();
    await expect(page.getByText(`${prefix()} 뒤B →`)).toBeVisible();
  });

  test("없는 회차·정규형이 아닌 주소는 404", async ({ page }) => {
    for (const path of ["/weeks/998", "/weeks/0", "/weeks/abc", "/weeks/03"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} 는 404 여야 함`).toBe(404);
    }
  });

  test("삭제된 회차는 404 가 아니라 안내를 보여준다", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "＋ 새 회차" }).click();
    const title = `${prefix()} 삭제안내`;
    await page.getByLabel("제목").fill(title);
    await page.getByLabel("바로 공개").check();
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByText(title)).toBeVisible();

    // 방금 만든 회차의 번호를 표에서 읽어온다
    const row = page.locator("li").filter({ hasText: title }).first();
    const orderNo = (await row.locator("span").first().innerText()).trim();

    await page.getByRole("button", { name: "삭제" }).first().click();
    await page.getByRole("textbox").last().fill(title);
    await page.getByRole("button", { name: "삭제", exact: true }).last().click();
    await expect(page.getByText(title)).toHaveCount(0);

    const response = await page.goto(`/weeks/${Number(orderNo)}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "삭제된 회차예요" }),
    ).toBeVisible();
  });
});
