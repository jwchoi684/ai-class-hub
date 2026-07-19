import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/admin-client";
import {
  detectFileType,
  detectImageType,
  sanitizeFileName,
  type DetectedType,
} from "@/lib/storage/file-type";

/**
 * 2단계 업로드.
 *
 * Vercel 함수의 요청 본문 상한은 4.5MB 입니다. 30MB PDF 를 서버로 프록시하는
 * 설계는 **처음부터 불가능**하므로 서명 URL 로 브라우저가 Storage 에 직접
 * 올려야 합니다. 그런데 그러면 서버가 바이트를 못 봅니다.
 *
 *   1) sign   — 서버가 경로를 정하고 upload_intents 에 기록. 비공개 staging 행
 *   2) PUT    — 브라우저가 staging 으로 직접 업로드 (공개 URL 없음)
 *   3) commit — 서버가 앞 4KB 만 읽어 실제 타입 확인 후 공개 버킷으로 이동
 *
 * upload_intents 가 없으면 3단계에서 "이 경로를 커밋해줘"라는 요청이 정말
 * 우리가 허가한 경로인지 확인할 방법이 없습니다.
 */

const STAGING_BUCKET = "uploads-staging";

export type UploadPurpose = "material" | "gallery";

const LIMITS: Record<UploadPurpose, { bucket: string; maxBytes: number }> = {
  material: { bucket: "materials", maxBytes: 50 * 1024 * 1024 },
  gallery: { bucket: "gallery", maxBytes: 10 * 1024 * 1024 },
};

export type SignedUpload = {
  intentId: string;
  path: string;
  /** 브라우저가 여기로 직접 PUT 합니다. 토큰이 쿼리에 포함돼 있습니다. */
  uploadUrl: string;
};

export async function createUploadIntent(options: {
  purpose: UploadPurpose;
  declaredSize: number;
  declaredMime: string | null;
  visitorId: string | null;
}): Promise<SignedUpload> {
  const limit = LIMITS[options.purpose];

  if (
    !Number.isFinite(options.declaredSize) ||
    options.declaredSize <= 0 ||
    options.declaredSize > limit.maxBytes
  ) {
    throw new Error(
      `파일 크기는 1바이트 이상 ${Math.floor(limit.maxBytes / 1024 / 1024)}MB 이하여야 해요.`,
    );
  }

  const intentId = randomUUID();
  const stagingPath = `staging/${intentId}.bin`;

  const supabase = db();

  const { data, error } = await supabase.storage
    .from(STAGING_BUCKET)
    .createSignedUploadUrl(stagingPath);

  if (error || !data) {
    throw new Error(`업로드 준비에 실패했습니다: ${error?.message ?? "unknown"}`);
  }

  const { error: insertError } = await supabase.from("upload_intents").insert({
    id: intentId,
    purpose: options.purpose,
    staging_path: stagingPath,
    declared_mime: options.declaredMime,
    declared_size: options.declaredSize,
    requires_admin: options.purpose === "material",
    visitor_id: options.visitorId,
    // 30분 안에 커밋하지 않으면 만료. 브라우저를 닫고 간 업로드가 staging 에
    // 영원히 남지 않게 합니다.
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  if (insertError) {
    throw new Error(`업로드 준비에 실패했습니다: ${insertError.message}`);
  }

  return { intentId, path: stagingPath, uploadUrl: data.signedUrl };
}

export type CommittedUpload = {
  storagePath: string;
  mime: string;
  sizeBytes: number;
  fileName: string;
  detected: DetectedType;
};

export async function commitUpload(options: {
  intentId: string;
  fileName: string;
  /** 갤러리 이미지처럼 이미지만 받아야 하는 경로 */
  imagesOnly?: boolean;
}): Promise<CommittedUpload> {
  const supabase = db();

  const { data: intentRow, error: intentError } = await supabase
    .from("upload_intents")
    .select("id, purpose, staging_path, declared_size, status, expires_at")
    .eq("id", options.intentId)
    .maybeSingle();

  if (intentError) throw new Error(intentError.message);
  if (!intentRow) throw new Error("업로드 요청을 찾을 수 없어요.");

  const intent = intentRow as {
    id: string;
    purpose: UploadPurpose;
    staging_path: string;
    declared_size: number;
    status: string;
    expires_at: string;
  };

  if (intent.status !== "pending") {
    throw new Error("이미 처리된 업로드예요.");
  }
  if (new Date(intent.expires_at) < new Date()) {
    await reject(intent.id, "expired");
    throw new Error("업로드 시간이 지났어요. 다시 시도해주세요.");
  }

  const limit = LIMITS[intent.purpose];

  // 1) 실제 크기를 Storage 에 물어봅니다. 클라이언트가 신고한 값은 믿지 않습니다.
  const actualSize = await headSize(intent.staging_path);
  if (actualSize === null) {
    throw new Error("업로드된 파일을 찾을 수 없어요.");
  }
  if (actualSize > limit.maxBytes) {
    await reject(intent.id, "too_large");
    await removeStaging(intent.staging_path);
    throw new Error("파일이 너무 커요.");
  }

  // 2) 앞부분만 읽어 실제 타입을 판별합니다.
  //    50MB 를 통째로 함수 메모리에 올릴 이유가 없습니다.
  const head = await readHead(intent.staging_path, 4096);
  const detected = options.imagesOnly
    ? detectImageType(head)
    : detectFileType(head);

  if (!detected) {
    await reject(intent.id, "unsupported_type");
    await removeStaging(intent.staging_path);
    throw new Error(
      options.imagesOnly
        ? "이미지 파일만 올릴 수 있어요. (JPG, PNG, WebP)"
        : "올릴 수 없는 형식이에요. PDF, 오피스 문서, 이미지만 가능해요.",
    );
  }

  // 3) 공개 버킷으로 이동. 여기서부터 공개 URL 이 생깁니다.
  const fileName = sanitizeFileName(options.fileName);
  const finalPath = `${new Date().getUTCFullYear()}/${intent.id}.${detected.extension}`;

  const { error: moveError } = await supabase.storage
    .from(STAGING_BUCKET)
    .move(intent.staging_path, finalPath, { destinationBucket: limit.bucket });

  if (moveError) {
    throw new Error(`업로드 마무리에 실패했습니다: ${moveError.message}`);
  }

  await supabase
    .from("upload_intents")
    .update({ status: "committed" })
    .eq("id", intent.id);

  return {
    storagePath: finalPath,
    mime: detected.mime,
    sizeBytes: actualSize,
    fileName,
    detected,
  };
}

/** 공개 버킷의 파일에 접근할 수 있는 주소. */
export function publicUrl(bucket: string, path: string): string {
  return db().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function headSize(path: string): Promise<number | null> {
  const folder = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop()!;

  const { data, error } = await db()
    .storage.from(STAGING_BUCKET)
    .list(folder, { search: name, limit: 1 });

  if (error || !data || data.length === 0) return null;
  const size = (data[0]?.metadata as { size?: number } | null)?.size;
  return typeof size === "number" ? size : null;
}

/**
 * 파일 앞부분만 내려받습니다.
 *
 * Range 요청을 쓰는 이유: 50MB PDF 를 통째로 받으면 함수 메모리를 다 쓰고,
 * 타입 판별에는 앞 몇 바이트면 충분합니다.
 */
async function readHead(path: string, bytes: number): Promise<Uint8Array> {
  const { data, error } = await db()
    .storage.from(STAGING_BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data) {
    throw new Error("업로드된 파일을 읽지 못했어요.");
  }

  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=0-${bytes - 1}` },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error("업로드된 파일을 읽지 못했어요.");
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function reject(intentId: string, reason: string): Promise<void> {
  await db()
    .from("upload_intents")
    .update({ status: "rejected", reject_reason: reason })
    .eq("id", intentId);
}

async function removeStaging(path: string): Promise<void> {
  await db().storage.from(STAGING_BUCKET).remove([path]);
}

/** 소유자가 삭제를 요청했을 때 실제 파일을 지웁니다. */
export async function removeStoredFile(
  bucket: string,
  path: string,
): Promise<void> {
  await db().storage.from(bucket).remove([path]);
}
