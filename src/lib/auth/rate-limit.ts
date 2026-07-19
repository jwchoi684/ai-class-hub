import "server-only";

import { db } from "@/lib/db/admin-client";

/**
 * 레이트 리밋 — 실제 카운팅은 Postgres 함수가 원자적으로 합니다.
 * (supabase/migrations/0003_rate_limit_function.sql)
 */

export type RateLimitResult = {
  allowed: boolean;
  /** 이번 윈도우에서 지금까지 몇 번째 시도인지 */
  count: number;
  /** 차단됐을 때 얼마나 기다려야 하는지 (초) */
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** 윈도우당 허용 횟수 */
  limit: number;
  /** 윈도우 길이 (초) */
  windowSeconds: number;
};

/**
 * 운영자 로그인 시도 제한.
 *
 * 비밀번호가 충분히 길면 이 값이 방어의 주역은 아닙니다. 하지만 짧은
 * 비밀번호가 설정된 경우 이게 유일한 방어선이 되므로 넉넉하게 조이지 않습니다.
 * 강사 본인이 오타로 몇 번 틀리는 것은 통과해야 하니 분당 5회로 잡았습니다.
 */
export const ADMIN_LOGIN_RULE: RateLimitRule = { limit: 5, windowSeconds: 60 };

/**
 * 게시물 PIN 검증 시도 제한.
 *
 * PIN 은 4자리(1만 가지)라 여기가 진짜 방어선입니다. 게시물별 잠금 카운터와
 * 별개로, IP 단위로도 조입니다 — 공격자가 여러 게시물을 번갈아 시도하면
 * 게시물별 카운터만으로는 무력화되기 때문입니다.
 */
export const PIN_ATTEMPT_RULE: RateLimitRule = { limit: 10, windowSeconds: 300 };

/** 무인증 공개 쓰기(게시물·댓글) 제한. 스팸 도배를 늦춥니다. */
export const PUBLIC_WRITE_RULE: RateLimitRule = { limit: 20, windowSeconds: 600 };

export async function consumeRateLimit(
  bucket: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const { data, error } = await db().rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    /*
     * 레이트 리밋이 고장 났을 때 열어줄지 닫을지.
     *
     * 닫습니다(fail closed). 이 함수가 보호하는 것은 로그인과 PIN 검증인데,
     * DB 장애 중에 그 경로를 무제한으로 열어두면 장애가 곧 공격 창이 됩니다.
     * 강사가 잠깐 못 들어오는 쪽이 낫습니다.
     */
    throw new Error(`레이트 리밋 확인에 실패했습니다: ${error.message}`);
  }

  const count = typeof data === "number" ? data : 0;

  return {
    allowed: count <= rule.limit,
    count,
    retryAfterSeconds: rule.windowSeconds,
  };
}

/**
 * 만료된 카운터 정리. 결과를 기다리지 않고, 실패해도 요청을 막지 않습니다.
 * 이 규모에 크론을 붙일 이유가 없어 로그인 경로에 곁다리로 태웁니다.
 */
export function sweepRateLimitsInBackground(): void {
  // supabase-js 의 빌더는 PromiseLike 라 .catch 가 없습니다. Promise 로 감싸서
  // 실패를 삼킵니다 — 정리 작업이 로그인 응답을 막으면 안 됩니다.
  void Promise.resolve(db().rpc("sweep_rate_limits")).catch(() => undefined);
}
