import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth/session";
import {
  commitUpload,
  createUploadIntent,
  type UploadPurpose,
} from "@/lib/storage/uploads";
import { consumeRateLimit, PUBLIC_WRITE_RULE } from "@/lib/auth/rate-limit";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 업로드 준비(POST) 와 마무리(PUT).
 *
 * 한 파일에 둔 이유: 두 단계가 반드시 짝으로 쓰이고, 권한 규칙이 같습니다.
 * 나뉘어 있으면 한쪽에만 가드를 거는 실수가 나옵니다.
 */

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw = forwarded
    ? forwarded.split(",")[0]!.trim()
    : (request.headers.get("x-real-ip") ?? "unknown");

  // 원본 IP 를 레이트 리밋 키로 그대로 쓰면 rate_limits 가 IP 로그가 됩니다.
  return createHash("sha256")
    .update(`${process.env.ADMIN_PEPPER ?? ""}:${raw}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/** 자료 업로드는 운영자만. 갤러리 이미지는 누구나(레이트 리밋 적용). */
async function authorize(
  request: NextRequest,
  purpose: UploadPurpose,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (purpose === "material") {
    if (!(await isAdmin())) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "권한이 없어요. 다시 로그인해주세요." },
          { status: 401 },
        ),
      };
    }
    return { ok: true };
  }

  const limit = await consumeRateLimit(
    `upload:${clientKey(request)}`,
    PUBLIC_WRITE_RULE,
  );

  if (!limit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "업로드가 너무 잦아요. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      ),
    };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  let body: {
    purpose?: unknown;
    size?: unknown;
    mime?: unknown;
    visitorId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const purpose = body.purpose;
  if (purpose !== "material" && purpose !== "gallery") {
    return NextResponse.json({ error: "알 수 없는 업로드 종류예요." }, { status: 400 });
  }

  const auth = await authorize(request, purpose);
  if (!auth.ok) return auth.response;

  try {
    const signed = await createUploadIntent({
      purpose,
      declaredSize: Number(body.size),
      declaredMime: typeof body.mime === "string" ? body.mime.slice(0, 200) : null,
      visitorId: typeof body.visitorId === "string" ? body.visitorId : null,
    });

    return NextResponse.json(signed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 준비에 실패했어요." },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: { intentId?: unknown; fileName?: unknown; purpose?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const purpose = body.purpose;
  if (purpose !== "material" && purpose !== "gallery") {
    return NextResponse.json({ error: "알 수 없는 업로드 종류예요." }, { status: 400 });
  }

  // 커밋에도 같은 권한 검사를 겁니다. 여기가 뚫리면 남이 올린 staging 파일을
  // 공개 버킷으로 승격시킬 수 있습니다.
  if (purpose === "material" && !(await isAdmin())) {
    return NextResponse.json(
      { error: "권한이 없어요. 다시 로그인해주세요." },
      { status: 401 },
    );
  }

  if (typeof body.intentId !== "string") {
    return NextResponse.json({ error: "업로드 요청이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const result = await commitUpload({
      intentId: body.intentId,
      fileName: typeof body.fileName === "string" ? body.fileName : "파일",
      imagesOnly: purpose === "gallery",
    });

    return NextResponse.json({
      storagePath: result.storagePath,
      mime: result.mime,
      sizeBytes: result.sizeBytes,
      fileName: result.fileName,
      label: result.detected.label,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드에 실패했어요." },
      { status: 400 },
    );
  }
}
