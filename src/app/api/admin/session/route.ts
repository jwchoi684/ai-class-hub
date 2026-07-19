import { NextResponse, type NextRequest } from "next/server";
import { login, logout, logoutEverywhere } from "@/lib/auth/session";

/**
 * argon2 는 네이티브 애드온이라 Node 런타임이 필요합니다.
 * Edge 로 떨어지면 런타임에야 터집니다.
 */
export const runtime = "nodejs";

/** 로그인 결과를 응답 시간으로도 추측하지 못하게 캐시를 끕니다. */
export const dynamic = "force-dynamic";

function clientAddress(request: NextRequest): string {
  // Vercel 은 x-forwarded-for 맨 앞에 실제 클라이언트 IP 를 넣습니다.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }

  const { password, remember } = (body ?? {}) as {
    password?: unknown;
    remember?: unknown;
  };

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { error: "비밀번호를 입력해주세요." },
      { status: 400 },
    );
  }

  // 길이 상한 — 없으면 수 MB 문자열로 argon2 를 돌리게 만들 수 있습니다.
  if (password.length > 200) {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않아요." },
      { status: 401 },
    );
  }

  const result = await login(password, {
    remember: remember === true,
    clientKey: clientAddress(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }

  if (result.reason === "rate_limited") {
    return NextResponse.json(
      {
        error: `시도가 너무 많아요. ${Math.ceil(result.retryAfterSeconds / 60)}분 뒤에 다시 해주세요.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      },
    );
  }

  if (result.reason === "not_configured") {
    return NextResponse.json(
      { error: "운영자 비밀번호가 아직 설정되지 않았어요. `pnpm seed:admin` 을 먼저 실행하세요." },
      { status: 503 },
    );
  }

  /*
   * 틀린 비밀번호에는 그 이상을 알려주지 않습니다. "비밀번호가 5자 이상이어야
   * 합니다" 같은 힌트는 공격자에게만 유용합니다.
   */
  return NextResponse.json(
    { error: "비밀번호가 맞지 않아요." },
    { status: 401 },
  );
}

export async function DELETE(request: NextRequest) {
  const everywhere =
    new URL(request.url).searchParams.get("scope") === "everywhere";

  if (everywhere) {
    const revoked = await logoutEverywhere();
    return NextResponse.json({ ok: true, revoked });
  }

  await logout();
  return NextResponse.json({ ok: true });
}
