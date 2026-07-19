import { expect, test, type Page } from "@playwright/test";

/*
 * 갤러리 게시·삭제, 공지 배너, QR 화면 e2e.
 * 로컬 스택 전용입니다 — 데이터를 실제로 만들고 지웁니다.
 */
const supabaseUrl = process.env.SUPABASE_URL;
// 새 이름을 먼저 보되 예전 이름도 받습니다 — 앱과 같은 규칙입니다.
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_TEST_PASSWORD;
const ready = !!supabaseUrl && !!serviceKey && !!password;

const TEST_PREFIX = "E2E결과물";
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
  await rest(`gallery_posts?title=like.${encodeURIComponent(prefix())}*`, {
    method: "DELETE",
  });
  await rest("rate_limits?bucket=neq.__none__", { method: "DELETE" });
}

/** 게시 폼을 채워 올립니다. PIN 확인 대화상자는 자동으로 승인합니다. */
async function submitPost(
  page: Page,
  options: { title: string; url: string; nickname: string; pin: string },
) {
  await page.goto("/gallery/new");
  page.once("dialog", (dialog) => void dialog.accept());

  /*
   * 회차를 일부러 '회차 없음' 으로 둡니다.
   *
   * 폼은 기본으로 '이번 주차' 를 선택하는데, weeks 스펙이 동시에 돌면서
   * 회차를 물리 삭제하면 FK 위반으로 게시가 실패합니다. 프로덕션은 소프트
   * 삭제라 생기지 않는 상황이고(행이 남아 FK 가 유지됩니다), 이 스펙이
   * 검증하려는 것도 회차 연결이 아닙니다. 다른 스펙에 의존하지 않게 끊습니다.
   */
  await page.getByLabel("회차").selectOption("");

  await page.getByLabel("주소").fill(options.url);
  await page.getByLabel("제목").fill(options.title);
  await page.getByRole("textbox", { name: "닉네임" }).fill(options.nickname);
  await page.getByLabel("PIN 4자리").fill(options.pin);
  await page.getByLabel("확인했습니다").check();
  await page.getByRole("button", { name: "올리기" }).click();

  await expect(page).toHaveURL(/\/gallery$/);
}

test.describe("갤러리", () => {
  test.skip(!ready, "DB 자격증명이 없어 건너뜁니다");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("로그인 없이 결과물을 올리고 갤러리에서 볼 수 있다", async ({ page }) => {
    const title = `${prefix()} 게시`;
    await submitPost(page, {
      title,
      url: "https://cafe-pick.vercel.app",
      nickname: "주희",
      pin: "5397",
    });

    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByText("주희").first()).toBeVisible();
    // 썸네일이 없어도 도메인이 카드에 찍혀 무엇인지 알 수 있어야 합니다.
    await expect(page.getByText("cafe-pick.vercel.app").first()).toBeVisible();
  });

  test("위험한 스킴은 거부한다", async ({ page }) => {
    await page.goto("/gallery/new");
    page.once("dialog", (dialog) => void dialog.accept());

    // type=url 의 기본 검증을 우회해 서버까지 보냅니다.
    await page.getByLabel("제목").fill(`${prefix()} 위험`);
    await page.getByRole("textbox", { name: "닉네임" }).fill("공격자");
    await page.getByLabel("PIN 4자리").fill("5397");
    await page.getByLabel("확인했습니다").check();
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="url"]')!;
      input.removeAttribute("type");
      input.value = "javascript:alert(1)";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: "올리기" }).click();

    await expect(page.locator('p[role="alert"], span[role="alert"]')).toContainText("http");
    await expect(page).not.toHaveURL(/\/gallery$/);
  });

  test("흔한 PIN 은 거부한다", async ({ page }) => {
    await page.goto("/gallery/new");
    page.once("dialog", (dialog) => void dialog.accept());

    await page.getByLabel("주소").fill("https://example.com");
    await page.getByLabel("제목").fill(`${prefix()} 약한핀`);
    await page.getByRole("textbox", { name: "닉네임" }).fill("주희");
    await page.getByLabel("PIN 4자리").fill("1234");
    await page.getByLabel("확인했습니다").check();
    await page.getByRole("button", { name: "올리기" }).click();

    await expect(page.locator('p[role="alert"], span[role="alert"]')).toContainText("흔한 번호");
  });

  test("같은 브라우저에서는 PIN 없이 지울 수 있다", async ({ page }) => {
    const title = `${prefix()} 내글`;
    await submitPost(page, {
      title,
      url: "https://mydog-intro.netlify.app",
      nickname: "지연",
      pin: "5397",
    });

    page.once("dialog", (dialog) => void dialog.accept());
    // 다른 프로젝트가 만든 카드를 집지 않도록 제목이 든 카드 안에서 찾습니다.
    await page
      .locator("article")
      .filter({ hasText: title })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("다른 브라우저에서는 PIN 을 요구하고, 틀리면 거부한다", async ({
    page,
    context,
  }) => {
    const title = `${prefix()} 남의글`;
    await submitPost(page, {
      title,
      url: "https://study-timer.vercel.app",
      nickname: "서영",
      pin: "5397",
    });

    // 쿠키를 지워 '다른 사람'이 됩니다.
    await context.clearCookies();
    await page.goto("/gallery");

    const card = page.locator("article").filter({ hasText: title });
    await card.getByRole("button", { name: "삭제" }).click();
    await card.getByLabel("PIN").fill("1111");
    await card.getByRole("button", { name: "삭제", exact: true }).click();

    await expect(page.locator('p[role="alert"], span[role="alert"]')).toContainText("PIN");
    await page.goto("/gallery");
    await expect(page.getByText(title).first()).toBeVisible();
  });
});

/*
 * 공지는 별도 블록입니다.
 *
 * serial 블록 안에서 test.skip() 을 부르면 그 뒤 테스트들이 통째로 실행되지
 * 않습니다. 활성 공지는 스키마상 전역 1건이라(unique index on (true) where
 * is_active) desktop 에서만 검증해야 하는데, 그 skip 이 QR 테스트까지
 * 끌고 내려가 버렸습니다.
 */
test.describe("공지 배너", () => {
  // 기기별 차이가 없는 기능이고, 전역 1건 제약 때문에 한 프로젝트에서만 돕니다.
  test.skip(
    () => !ready || test.info().project.name !== "desktop",
    "활성 공지는 전역 1건이라 desktop 에서만 검증합니다",
  );

  test.afterEach(async () => {
    await rest("announcements?id=neq.00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
    });
    await rest("rate_limits?bucket=neq.__none__", { method: "DELETE" });
  });

  test("공지를 저장하면 홈 위에 뜬다", async ({ page }) => {
    await rest("rate_limits?bucket=neq.__none__", { method: "DELETE" });
    await page.goto("/admin");
    await page.getByLabel("비밀번호").fill(password!);
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText("관리자 모드 ON")).toBeVisible();

    const body = "E2E공지 노트북 필수";
    await page.getByPlaceholder("8/12(수)").fill(body);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("저장했어요")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText(body).first()).toBeVisible();
  });
});

/* QR 은 읽기 전용이라 프로젝트끼리 간섭하지 않습니다. */
test.describe("QR 화면", () => {
  test.skip(!ready, "DB 자격증명이 없어 건너뜁니다");

  test("서버에서 그린 QR 과 주소를 보여준다", async ({ page }) => {
    await page.goto("/qr");

    // 외부 생성 서비스가 아니라 우리가 그린 SVG 여야 합니다.
    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible();
    expect(await svg.locator("path, rect").count()).toBeGreaterThan(0);

    await expect(page.getByText("F 전체화면")).toBeVisible();
  });

  test("대상을 바꾸면 주소가 바뀐다", async ({ page }) => {
    await page.goto("/qr");
    const before = await page.locator("p.font-mono").first().innerText();

    await page.getByRole("link", { name: /결과물 올리기/ }).click();
    await expect(page).toHaveURL(/to=new/);

    const after = await page.locator("p.font-mono").first().innerText();
    expect(after).not.toBe(before);
    expect(after).toContain("/gallery/new");
  });
});
