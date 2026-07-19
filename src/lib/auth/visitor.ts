import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 방문자 식별.
 *
 * 로그인이 없으므로 "이 글을 올린 사람이 지금 이 사람인가"를 판단할 근거가
 * 필요합니다. 그 유일한 기준이 이 쿠키입니다 (docs/REQUIREMENTS.md §2.7).
 *
 * 이것으로 하는 일:
 *  - 같은 브라우저에서는 PIN 을 묻지 않고 수정·삭제를 허용
 *  - 이모지 반응 중복 방지 (IP 로 하면 같은 강의실 와이파이 뒤의 수강생끼리
 *    서로의 반응을 막아버립니다)
 *  - 내가 쓴 댓글에만 삭제 버튼 노출
 *
 * **서명이 필수인 이유**: 값이 그대로 노출되는 쿠키라 서명이 없으면 남의
 * visitor_id 를 적어 넣는 것만으로 그 사람 글의 소유권을 주장할 수 있습니다.
 * 서명은 ADMIN_PEPPER 로 하는데, 이 값은 서버에만 있습니다.
 */

const COOKIE_BASE = "ac_visitor";

const INSECURE_COOKIE_OVERRIDE =
  process.env.ALLOW_INSECURE_SESSION_COOKIE === "1" && !process.env.VERCEL;
const SECURE_COOKIES =
  process.env.NODE_ENV === "production" && !INSECURE_COOKIE_OVERRIDE;

export const VISITOR_COOKIE = SECURE_COOKIES
  ? `__Host-${COOKIE_BASE}`
  : COOKIE_BASE;

/** 1년. 한 학기를 넘기고도 남습니다. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function secret(): string {
  const pepper = process.env.ADMIN_PEPPER;
  if (!pepper) {
    throw new Error(
      "환경변수 ADMIN_PEPPER 가 없습니다. 방문자 쿠키에 서명할 수 없습니다.",
    );
  }
  return pepper;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id, "utf8").digest("base64url");
}

function verify(value: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  // uuid 형태가 아니면 볼 것도 없습니다.
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;

  const expected = Buffer.from(sign(id), "utf8");
  const actual = Buffer.from(signature, "utf8");

  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? id : null;
}

/**
 * 현재 방문자 id. 없거나 서명이 깨졌으면 새로 발급합니다.
 *
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로, 읽기 전용으로 쓸 때는
 * `readVisitorId()` 를 쓰세요.
 */
export async function getOrCreateVisitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;

  if (existing) {
    const verified = verify(existing);
    if (verified) return verified;
  }

  const id = randomUUID();
  jar.set(VISITOR_COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return id;
}

/** 발급하지 않고 읽기만 합니다. 서버 컴포넌트용. */
export async function readVisitorId(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  return existing ? verify(existing) : null;
}
