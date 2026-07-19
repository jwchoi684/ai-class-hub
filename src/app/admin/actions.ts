"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, toActionError, type ActionResult } from "@/lib/auth/guard";
import { db } from "@/lib/db/admin-client";
import {
  createSession,
  getSessionByOrderNo,
  softDeleteSession,
  updateSession,
} from "@/lib/db/sessions";

/*
 * 서버 액션은 클라이언트가 직접 호출할 수 있는 엔드포인트입니다.
 * 화면에서 버튼을 감추는 것은 권한 검사가 아니므로 모든 액션이 첫 줄에서
 * requireAdmin() 을 부릅니다.
 */

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;

/** 값 정리 — DB 의 CHECK 제약과 같은 한계를 화면에서 먼저 걸러 친절한 문구를 줍니다. */
function cleanText(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value === "") return null;
  // <input type="date"> 는 항상 YYYY-MM-DD 를 주지만, 액션은 직접 호출될 수도
  // 있으므로 형식을 다시 확인합니다.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function createSessionAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const orderNo = Number(formData.get("orderNo"));
    const title = cleanText(formData.get("title"), MAX_TITLE);

    if (!Number.isInteger(orderNo) || orderNo < 1 || orderNo > 999) {
      return { ok: false, message: "회차 번호는 1~999 사이 숫자여야 해요." };
    }
    if (title.length === 0) {
      return { ok: false, message: "회차 제목을 입력해주세요." };
    }

    await createSession({
      orderNo,
      title,
      description: cleanText(formData.get("description"), MAX_DESCRIPTION) || null,
      heldOn: cleanDate(formData.get("heldOn")),
      isPublished: formData.get("isPublished") === "on",
    });

    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSessionAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const id = String(formData.get("id") ?? "");
    const title = cleanText(formData.get("title"), MAX_TITLE);

    if (!id) return { ok: false, message: "회차를 찾을 수 없어요." };
    if (title.length === 0) {
      return { ok: false, message: "회차 제목을 입력해주세요." };
    }

    await updateSession(id, {
      title,
      description: cleanText(formData.get("description"), MAX_DESCRIPTION) || null,
      heldOn: cleanDate(formData.get("heldOn")),
      isPublished: formData.get("isPublished") === "on",
    });

    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** 공개/비공개 토글만 따로. 표에서 한 번에 누를 수 있어야 해서입니다. */
export async function togglePublishedAction(
  id: string,
  next: boolean,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await updateSession(id, { isPublished: next });

    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * 회차 삭제.
 *
 * 제목을 그대로 타이핑해야 실행됩니다. 그 검사를 **서버에서** 합니다 —
 * 클라이언트 확인 대화상자는 실수를 줄이는 장치일 뿐 우회할 수 있고,
 * 무료 플랜에는 복원 가능한 백업이 없어서 잘못 누른 삭제가 곧 영구 손실입니다.
 *
 * 소프트 삭제라 되살릴 수는 있지만, 그건 DB 를 직접 만져야 하는 일이라
 * 강사가 수업 중에 할 수 있는 복구가 아닙니다.
 */
export async function deleteSessionAction(
  id: string,
  confirmTitle: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const { data, error } = await db()
      .from("class_sessions")
      .select("title, order_no")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: false, message: "이미 삭제된 회차예요." };

    const row = data as { title: string; order_no: number };

    if (confirmTitle.trim() !== row.title) {
      return {
        ok: false,
        message: "제목이 일치하지 않아요. 삭제하지 않았습니다.",
      };
    }

    await softDeleteSession(id);

    await db()
      .from("audit_log")
      .insert({
        action: "session.deleted",
        actor: "admin",
        target_type: "class_session",
        target_id: id,
        meta: { order_no: row.order_no, title: row.title },
      });

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/weeks/${row.order_no}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** 새 회차 폼의 번호 기본값. 지운 번호는 건너뜁니다. */
export async function suggestOrderNoAction(): Promise<number | null> {
  try {
    await requireAdmin();
    const { suggestNextOrderNo } = await import("@/lib/db/sessions");
    return await suggestNextOrderNo();
  } catch {
    return null;
  }
}

/** 회차 번호가 이미 쓰였는지 미리 알려줍니다 (지운 것 포함). */
export async function checkOrderNoAction(orderNo: number): Promise<boolean> {
  try {
    await requireAdmin();
    const lookup = await getSessionByOrderNo(orderNo, true);
    return lookup.status === "not_found";
  } catch {
    return false;
  }
}

/** 공지 배너 교체. 빈 값이면 배너를 내립니다. */
export async function setAnnouncementAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const body = cleanText(formData.get("body"), 500);
    const linkRaw = cleanText(formData.get("linkUrl"), 2048);

    let linkUrl: string | null = null;
    if (linkRaw) {
      const { isSafeExternalUrl } = await import("@/lib/net/url-safety");
      const verdict = isSafeExternalUrl(linkRaw);
      if (!verdict.ok) return { ok: false, message: verdict.reason };
      linkUrl = verdict.normalized;
    }

    const { setAnnouncement } = await import("@/lib/db/announcements");
    await setAnnouncement(body, linkUrl);

    // 배너는 모든 화면 위에 있으므로 전부 다시 그려야 합니다.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
