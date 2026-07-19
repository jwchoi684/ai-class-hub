"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { hashSecret, validatePin, verifySecret } from "@/lib/auth/hash";
import { isAdmin } from "@/lib/auth/session";
import { getOrCreateVisitorId, readVisitorId } from "@/lib/auth/visitor";
import { consumeRateLimit, PIN_ATTEMPT_RULE, PUBLIC_WRITE_RULE } from "@/lib/auth/rate-limit";
import { toActionError, type ActionResult } from "@/lib/auth/guard";
import {
  clearPinFailures,
  createGalleryPost,
  deleteGalleryPost,
  getPostSecrets,
  recordPinFailure,
} from "@/lib/db/gallery";
import { isSafeExternalUrl } from "@/lib/net/url-safety";

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_NICKNAME = 30;
const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const raw = forwarded
    ? forwarded.split(",")[0]!.trim()
    : (headerList.get("x-real-ip") ?? "unknown");

  return createHash("sha256")
    .update(`${process.env.ADMIN_PEPPER ?? ""}:${raw}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function text(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 태그 정리 — 소문자화·중복 제거·개수·길이 제한. DB 제약과 같은 규칙입니다. */
function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH),
    ),
  ].slice(0, MAX_TAGS);
}

export async function createPostAction(
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  try {
    /*
     * 허니팟. 사람에게는 보이지 않는 필드라 값이 차 있으면 봇입니다.
     * 성공한 것처럼 응답해서 봇이 재시도하지 않게 합니다.
     */
    if (text(formData.get("website"), 100).length > 0) {
      return { ok: true };
    }

    const limit = await consumeRateLimit(
      `gallery-post:${await clientKey()}`,
      PUBLIC_WRITE_RULE,
    );
    if (!limit.allowed) {
      return {
        ok: false,
        message: "게시가 너무 잦아요. 잠시 후 다시 시도해주세요.",
      };
    }

    const id = text(formData.get("id"), 36);
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return { ok: false, message: "요청이 올바르지 않아요. 새로고침 후 다시 시도해주세요." };
    }

    const kind = formData.get("kind") === "image" ? "image" : "link";
    const title = text(formData.get("title"), MAX_TITLE);
    const nickname = text(formData.get("nickname"), MAX_NICKNAME);
    const pin = text(formData.get("pin"), 10);

    if (!title) return { ok: false, message: "제목을 입력해주세요." };
    if (!nickname) return { ok: false, message: "닉네임을 입력해주세요." };
    if (formData.get("consent") !== "on") {
      return { ok: false, message: "공개 안내를 확인해주세요." };
    }

    const pinCheck = validatePin(pin);
    if (!pinCheck.ok) return { ok: false, message: pinCheck.reason };

    let externalUrl: string | null = null;
    let imagePath: string | null = null;
    let imageBytes: number | null = null;

    if (kind === "link") {
      const verdict = isSafeExternalUrl(text(formData.get("url"), 2048));
      if (!verdict.ok) return { ok: false, message: verdict.reason };
      externalUrl = verdict.normalized;
    } else {
      imagePath = text(formData.get("imagePath"), 200);
      // 우리가 만드는 경로 형태만 허용합니다. 임의 경로 주장 방지.
      if (!/^\d{4}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(imagePath)) {
        return { ok: false, message: "이미지를 다시 올려주세요." };
      }
      const bytes = Number(formData.get("imageBytes"));
      imageBytes = Number.isFinite(bytes) ? bytes : null;
    }

    const sessionIdRaw = text(formData.get("sessionId"), 36);
    const sessionId = /^[0-9a-f-]{36}$/.test(sessionIdRaw) ? sessionIdRaw : null;

    await createGalleryPost({
      id,
      kind,
      title,
      description: text(formData.get("description"), MAX_DESCRIPTION) || null,
      authorNickname: nickname,
      pinHash: await hashSecret(pin),
      visitorId: await getOrCreateVisitorId(),
      sessionId,
      tags: parseTags(formData.get("tags")),
      externalUrl,
      imagePath,
      imageBytes,
    });

    revalidatePath("/gallery");
    revalidatePath("/");
    return { ok: true, id };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * 결과물 삭제.
 *
 * 세 가지 경로가 있습니다:
 *  - 운영자: PIN 없이 삭제 (모더레이션)
 *  - 같은 브라우저: PIN 없이 삭제 (대부분의 실제 수정은 '올린 직후 오타 고치기')
 *  - 그 외: PIN 일치 필요
 */
export async function deletePostAction(
  id: string,
  pin: string,
): Promise<ActionResult> {
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return { ok: false, message: "결과물을 찾을 수 없어요." };
    }

    if (await isAdmin()) {
      await deleteGalleryPost(id, "admin");
      revalidatePath("/gallery");
      return { ok: true };
    }

    const secrets = await getPostSecrets(id);
    if (!secrets) return { ok: false, message: "이미 삭제된 결과물이에요." };

    // 같은 브라우저면 PIN 을 묻지 않습니다.
    const visitorId = await readVisitorId();
    if (visitorId && visitorId === secrets.visitorId) {
      await deleteGalleryPost(id, "owner");
      revalidatePath("/gallery");
      return { ok: true };
    }

    if (secrets.lockedUntil && new Date(secrets.lockedUntil) > new Date()) {
      return {
        ok: false,
        message: "시도가 많아 잠시 잠겼어요. 15분 뒤에 다시 해주세요.",
      };
    }

    /*
     * 게시물별 잠금만으로는 부족합니다. 공격자가 여러 게시물을 번갈아 시도하면
     * 각 게시물의 카운터는 천천히 오르니까요. IP 단위로도 함께 조입니다.
     */
    const limit = await consumeRateLimit(
      `pin:${await clientKey()}`,
      PIN_ATTEMPT_RULE,
    );
    if (!limit.allowed) {
      return { ok: false, message: "시도가 너무 많아요. 잠시 후 다시 해주세요." };
    }

    if (!(await verifySecret(secrets.pinHash, pin))) {
      await recordPinFailure(id, secrets.failedAttempts);
      return { ok: false, message: "PIN 이 맞지 않아요." };
    }

    await clearPinFailures(id);
    await deleteGalleryPost(id, "owner");
    revalidatePath("/gallery");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
