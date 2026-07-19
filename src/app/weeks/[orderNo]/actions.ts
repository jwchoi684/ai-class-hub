"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, toActionError, type ActionResult } from "@/lib/auth/guard";
import {
  addFileMaterial,
  addLinkMaterial,
  deleteMaterial,
  moveMaterial,
} from "@/lib/db/materials";
import { isSafeExternalUrl } from "@/lib/net/url-safety";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function addLinkMaterialAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const sessionId = String(formData.get("sessionId") ?? "");
    const title = clean(formData.get("title"), MAX_TITLE);
    const url = clean(formData.get("url"), 2048);

    if (!sessionId) return { ok: false, message: "회차를 찾을 수 없어요." };
    if (!title) return { ok: false, message: "자료 이름을 입력해주세요." };

    const verdict = isSafeExternalUrl(url);
    if (!verdict.ok) return { ok: false, message: verdict.reason };

    await addLinkMaterial({
      sessionId,
      title,
      description: clean(formData.get("description"), MAX_DESCRIPTION) || null,
      url: verdict.normalized,
    });

    revalidatePath(`/weeks/${formData.get("orderNo")}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addFileMaterialAction(input: {
  sessionId: string;
  orderNo: number;
  title: string;
  description: string | null;
  storagePath: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
}): Promise<ActionResult> {
  try {
    await requireAdmin();

    const title = input.title.trim().slice(0, MAX_TITLE);
    if (!title) return { ok: false, message: "자료 이름을 입력해주세요." };

    /*
     * storagePath 를 클라이언트가 보냅니다. 임의 경로를 주장하지 못하도록
     * 우리가 만드는 경로 형태(연도/uuid.확장자)만 허용합니다.
     * 실제 파일 검증은 이미 커밋 단계에서 끝났습니다.
     */
    if (!/^\d{4}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(input.storagePath)) {
      return { ok: false, message: "업로드 정보가 올바르지 않아요." };
    }

    await addFileMaterial({
      sessionId: input.sessionId,
      title,
      description: input.description?.trim().slice(0, MAX_DESCRIPTION) || null,
      storagePath: input.storagePath,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
    });

    revalidatePath(`/weeks/${input.orderNo}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMaterialAction(
  id: string,
  orderNo: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await deleteMaterial(id);
    revalidatePath(`/weeks/${orderNo}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveMaterialAction(
  id: string,
  direction: "up" | "down",
  orderNo: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await moveMaterial(id, direction);
    revalidatePath(`/weeks/${orderNo}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
