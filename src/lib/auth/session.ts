import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db/admin-client";
import { verifySecret } from "@/lib/auth/hash";
import {
  ADMIN_LOGIN_RULE,
  consumeRateLimit,
  sweepRateLimitsInBackground,
} from "@/lib/auth/rate-limit";

/**
 * 운영자 세션.
 *
 * 무상태 JWT 가 아니라 **서버 저장 불투명 토큰**입니다. 이 앱에서 가장 현실적인
 * 유출 경로는 해킹이 아니라 강사가 강의실·프로젝터 PC 에서 로그인하는 순간이고,
 * 그때 필요한 건 "남은 세션을 지금 끊는" 능력입니다. JWT 는 만료 전까지 회수할
 * 방법이 없어서 이 요구를 만족시키지 못합니다.
 * (docs/REQUIREMENTS.md §2.3)
 */

/** 기본 세션. 수업 한 번 동안 유지되면 충분합니다. */
const SESSION_HOURS = 12;
/** '이 기기를 기억' 체크 시. 주 1회 수업에서 매번 재입력하지 않도록. */
const REMEMBERED_DAYS = 30;

/**
 * `__Host-` 접두사는 Secure + Path=/ + Domain 없음을 브라우저가 강제하게
 * 만듭니다. 서브도메인에서 쿠키를 덮어쓰는 공격을 원천 차단합니다.
 *
 * 다만 Secure 를 요구하므로 http 인 로컬 개발에서는 쓸 수 없습니다.
 * 그래서 환경에 따라 이름이 달라집니다 — 프로덕션에서만 강한 쪽을 씁니다.
 */
const IS_PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = IS_PROD ? "__Host-ac_admin" : "ac_admin";

/** 토큰은 DB 에 평문으로 두지 않습니다. DB 가 유출돼도 세션을 못 훔치게. */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type LoginOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "not_configured" };

/**
 * 비밀번호를 검증하고 세션 쿠키를 심습니다.
 *
 * @param clientKey 레이트 리밋 버킷 키. IP 등 요청자를 구분할 수 있는 값.
 */
export async function login(
  password: string,
  options: { remember?: boolean; clientKey: string; userAgent?: string },
): Promise<LoginOutcome> {
  // 1) 레이트 리밋을 **검증보다 먼저** 확인합니다. 순서가 바뀌면 공격자가
  //    차단당하기 전까지 매 시도마다 argon2 비용을 우리 서버에 물립니다.
  const limit = await consumeRateLimit(
    `admin-login:${clientKey(options.clientKey)}`,
    ADMIN_LOGIN_RULE,
  );

  if (!limit.allowed) {
    await recordAudit("admin.login.rate_limited", { count: limit.count });
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const supabase = db();

  const { data: credential } = await supabase
    .from("admin_credential")
    .select("password_hash, password_version")
    .eq("id", 1)
    .maybeSingle();

  /*
   * 자격증명이 없어도 검증 비용을 치릅니다. verifySecret 이 더미 해시로
   * 같은 양의 KDF 작업을 하므로, "아직 설정 안 됨"과 "비밀번호 틀림"이
   * 응답 시간으로 구분되지 않습니다.
   */
  const matched = await verifySecret(credential?.password_hash, password);

  if (!credential) {
    return { ok: false, reason: "not_configured" };
  }

  if (!matched) {
    await recordAudit("admin.login.failed", { count: limit.count });
    return { ok: false, reason: "invalid" };
  }

  // 2) 세션 발급
  const token = randomBytes(32).toString("base64url");
  const maxAgeSeconds = options.remember
    ? REMEMBERED_DAYS * 24 * 60 * 60
    : SESSION_HOURS * 60 * 60;

  const { error: insertError } = await supabase.from("admin_sessions").insert({
    token_hash: hashToken(token),
    password_version: credential.password_version,
    expires_at: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    user_agent: options.userAgent?.slice(0, 500) ?? null,
  });

  if (insertError) {
    throw new Error(`세션 생성에 실패했습니다: ${insertError.message}`);
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });

  await recordAudit("admin.login.success", { remember: !!options.remember });
  sweepRateLimitsInBackground();

  return { ok: true };
}

/**
 * 현재 요청이 운영자 세션을 갖고 있는지.
 *
 * 매 요청 DB 를 한 번 읽습니다. 20명 규모에서 이 비용은 무시할 수 있고,
 * 그 대가로 '모든 기기 로그아웃'과 '비밀번호 변경 시 즉시 무효화'를 얻습니다.
 */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const supabase = db();

  const { data: session } = await supabase
    .from("admin_sessions")
    .select("id, password_version, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!session) return false;
  if (session.revoked_at) return false;
  if (new Date(session.expires_at) <= new Date()) return false;

  /*
   * 비밀번호가 바뀌었으면 이 세션은 죽습니다.
   *
   * 강의실 PC 에 로그인을 남겨두고 왔을 때, 강사가 할 수 있는 일이
   * "비밀번호 바꾸기" 하나뿐이어도 그게 곧 원격 로그아웃이 되게 만드는 장치입니다.
   */
  const { data: credential } = await supabase
    .from("admin_credential")
    .select("password_version")
    .eq("id", 1)
    .maybeSingle();

  if (!credential || credential.password_version !== session.password_version) {
    return false;
  }

  // 마지막 접속 시각 갱신 — 관리 화면의 기기 목록에 쓰입니다.
  // 실패해도 인증 결과에 영향을 주지 않으므로 기다리지 않습니다.
  void supabase
    .from("admin_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(() => undefined);

  return true;
}

/** 이 기기만 로그아웃. */
export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await db()
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token))
      .is("revoked_at", null);
  }

  jar.delete(SESSION_COOKIE);
  await recordAudit("admin.logout", {});
}

/** 모든 기기 로그아웃. 강의실 PC 에 남은 세션을 끊는 수단입니다. */
export async function logoutEverywhere(): Promise<number> {
  const { data } = await db()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null)
    .select("id");

  const jar = await cookies();
  jar.delete(SESSION_COOKIE);

  const count = data?.length ?? 0;
  await recordAudit("admin.logout_everywhere", { revoked: count });
  return count;
}

/**
 * 레이트 리밋 버킷 키를 정규화합니다.
 *
 * 원본 IP 를 그대로 키로 쓰면 rate_limits 테이블이 IP 로그가 됩니다.
 * 해시해서 넣으면 같은 요청자를 구분하는 목적은 그대로 달성하면서
 * 테이블에는 IP 가 남지 않습니다.
 */
function clientKey(raw: string): string {
  return createHash("sha256")
    .update(`${process.env.ADMIN_PEPPER ?? ""}:${raw}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

async function recordAudit(
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  // 감사 로그 실패가 로그인 자체를 막으면 안 됩니다.
  try {
    await db().from("audit_log").insert({
      action,
      actor: "admin",
      meta,
    });
  } catch {
    // 삼킵니다 — 여기서 던지면 로그인 경로가 통째로 죽습니다.
  }
}
