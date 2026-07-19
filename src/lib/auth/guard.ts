import "server-only";

import { isAdmin } from "@/lib/auth/session";

/**
 * 쓰기 경로 공통 가드.
 *
 * 서버 액션은 클라이언트에서 직접 호출할 수 있는 엔드포인트입니다. 화면에서
 * 버튼을 숨기는 것은 UI 편의일 뿐 권한 검사가 아니므로, **모든 액션이 첫 줄에서
 * 이 함수를 부릅니다**. 하나라도 빠지면 그 액션은 사실상 공개 API 입니다.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("UNAUTHORIZED");
  }
}

/** 액션 결과의 공통 형태. 화면은 이걸 보고 에러 문구를 띄웁니다. */
export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 액션에서 던져진 예외를 사용자에게 보여줄 문구로 바꿉니다.
 *
 * 원본 메시지를 그대로 노출하지 않습니다 — DB 제약 이름이나 스택이 화면에
 * 뜨면 사용자는 무엇을 해야 할지 알 수 없고, 공격자에게는 정보가 됩니다.
 */
export function toActionError(error: unknown): ActionResult {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw === "UNAUTHORIZED") {
    return { ok: false, message: "권한이 없어요. 다시 로그인해주세요." };
  }

  // 회차 번호 중복 (23505). 사용자가 고칠 수 있는 문제라 구체적으로 알려줍니다.
  if (raw.includes("class_sessions_order_no_key") || raw.includes("23505")) {
    return {
      ok: false,
      message: "이미 쓴 회차 번호예요. 지운 회차의 번호도 다시 쓸 수 없어요.",
    };
  }

  console.error("[action]", error);
  return { ok: false, message: "처리하지 못했어요. 잠시 후 다시 시도해주세요." };
}
