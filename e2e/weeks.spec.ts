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

/**
 * 회차 번호 대역을 프로젝트별로 나눕니다.
 *
 * 회차 번호는 전역 유니크이고 재사용하지 않습니다. 폼이 제안하는 기본값은
 * `max(order_no) + 1` 인데, desktop 과 mobile 이 동시에 생성하면 둘 다 같은
 * 번호를 읽어 한쪽이 중복 키로 실패합니다. 앱 동작 자체는 옳지만(중복을
 * 거부하는 게 맞습니다) 테스트가 서로를 방해하면 안 됩니다.
 *
 * 정리(cleanup)가 물리 삭제라 다음 실행에서 같은 번호를 다시 쓸 수 있습니다.
 */
const orderNoBase = () => (test.info().project.name === "desktop" ? 900 : 940);

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

/** 명시적 번호로 회차를 만듭니다. 번호를 지정해야 프로젝트끼리 충돌하지 않습니다. */
async function createSession(
  page: Page,
  options: { orderNo: number; title: string; publish?: boolean; heldOn?: string },
) {
  await page.getByRole("button", { name: "＋ 새 회차" }).click();
  await page.getByLabel("번호").fill(String(options.orderNo));
  await page.getByLabel("제목").fill(options.title);
  if (options.heldOn) await page.getByLabel("날짜").fill(options.heldOn);
  if (options.publish) await page.getByLabel("바로 공개").check();
  await page.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByText(options.title).first()).toBeVisible();
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
    const title = `${prefix()} 생성`;
    await createSession(page, {
      orderNo: orderNoBase() + 1,
      title,
      publish: true,
      heldOn: "2026-08-26",
    });

    // 홈에도 반영. '이번 주차' 카드와 회차 그리드 양쪽에 나오므로 first() 로 좁힙니다.
    await page.goto("/");
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("준비 중 회차는 수강생에게 보이지 않는다", async ({ page, context }) => {
    await login(page);
    const title = `${prefix()} 비공개`;
    await createSession(page, { orderNo: orderNoBase() + 2, title });

    // 로그아웃한 상태(= 수강생)에서는 안 보여야 한다
    await context.clearCookies();
    await page.goto("/");
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByText("새 회차 추가")).toHaveCount(0);
  });

  test("삭제는 제목을 그대로 입력해야만 실행된다", async ({ page }) => {
    await login(page);
    const title = `${prefix()} 삭제대상`;
    await createSession(page, { orderNo: orderNoBase() + 3, title });

    await page.getByRole("button", { name: "삭제" }).first().click();

    const confirm = page.getByRole("button", { name: "삭제", exact: true }).last();
    // 아무것도 입력하지 않았으면 눌리지 않는다
    await expect(confirm).toBeDisabled();

    // 비슷하지만 다른 제목도 통하지 않는다
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
    await createSession(page, {
      orderNo: orderNoBase() + 4,
      title: `${prefix()} 앞A`,
      publish: true,
    });
    await createSession(page, {
      orderNo: orderNoBase() + 5,
      title: `${prefix()} 뒤B`,
      publish: true,
    });

    await page.goto(`/weeks/${orderNoBase() + 4}`);
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
    const orderNo = orderNoBase() + 6;
    const title = `${prefix()} 삭제안내`;
    await createSession(page, { orderNo, title, publish: true });

    await page.getByRole("button", { name: "삭제" }).first().click();
    await page.getByRole("textbox").last().fill(title);
    await page.getByRole("button", { name: "삭제", exact: true }).last().click();
    await expect(page.getByText(title)).toHaveCount(0);

    const response = await page.goto(`/weeks/${orderNo}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "삭제된 회차예요" }),
    ).toBeVisible();
  });
});
