import "server-only";

import { db } from "@/lib/db/admin-client";
import { publicUrl, removeStoredFile } from "@/lib/storage/uploads";

export type Material = {
  id: string;
  kind: "file" | "link";
  title: string;
  description: string | null;
  /** kind === 'link' 일 때 외부 주소, 'file' 일 때 Storage 공개 주소 */
  href: string;
  /** 'file' 일 때만: 다운로드 버튼에 쓸 정보 */
  file: { name: string; sizeBytes: number | null; mime: string | null } | null;
  sortOrder: number;
};

type Row = {
  id: string;
  kind: "file" | "link";
  title: string;
  description: string | null;
  external_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  sort_order: number;
};

const COLUMNS =
  "id, kind, title, description, external_url, storage_path, file_name, mime_type, file_size_bytes, sort_order";

function toMaterial(row: Row): Material {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    href:
      row.kind === "link"
        ? (row.external_url ?? "#")
        : publicUrl("materials", row.storage_path ?? ""),
    file:
      row.kind === "file"
        ? {
            name: row.file_name ?? "파일",
            sizeBytes: row.file_size_bytes,
            mime: row.mime_type,
          }
        : null,
    sortOrder: row.sort_order,
  };
}

export async function listMaterials(sessionId: string): Promise<Material[]> {
  const { data, error } = await db()
    .from("materials")
    .select(COLUMNS)
    .eq("class_session_id", sessionId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`자료를 불러오지 못했습니다: ${error.message}`);
  return (data as Row[]).map(toMaterial);
}

/** 새 자료는 항상 맨 뒤에 붙습니다. */
async function nextSortOrder(sessionId: string): Promise<number> {
  const { data } = await db()
    .from("materials")
    .select("sort_order")
    .eq("class_session_id", sessionId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data as { sort_order: number } | null)?.sort_order ?? -1) + 1;
}

export async function addLinkMaterial(input: {
  sessionId: string;
  title: string;
  description: string | null;
  url: string;
}): Promise<void> {
  const { error } = await db().from("materials").insert({
    class_session_id: input.sessionId,
    kind: "link",
    title: input.title,
    description: input.description,
    external_url: input.url,
    sort_order: await nextSortOrder(input.sessionId),
  });

  if (error) throw new Error(error.message);
}

export async function addFileMaterial(input: {
  sessionId: string;
  title: string;
  description: string | null;
  storagePath: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
}): Promise<void> {
  const { error } = await db().from("materials").insert({
    class_session_id: input.sessionId,
    kind: "file",
    title: input.title,
    description: input.description,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mime,
    file_size_bytes: input.sizeBytes,
    sort_order: await nextSortOrder(input.sessionId),
  });

  if (error) throw new Error(error.message);
}

/**
 * 자료 삭제.
 *
 * 행은 소프트 삭제하고 **파일은 실제로 지웁니다**. 화면에서만 사라지고 공개
 * 주소가 살아 있으면 지운 의미가 없습니다. 링크 자료는 지울 파일이 없습니다.
 */
export async function deleteMaterial(id: string): Promise<void> {
  const supabase = db();

  const { data, error } = await supabase
    .from("materials")
    .select("kind, storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return;

  const row = data as { kind: string; storage_path: string | null };

  const { error: updateError } = await supabase
    .from("materials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) throw new Error(updateError.message);

  if (row.kind === "file" && row.storage_path) {
    await removeStoredFile("materials", row.storage_path);
  }
}

/** 위·아래 이동. 인접한 두 행의 sort_order 를 맞바꿉니다. */
export async function moveMaterial(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const supabase = db();

  const { data: current } = await supabase
    .from("materials")
    .select("id, class_session_id, sort_order")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!current) return;
  const me = current as {
    id: string;
    class_session_id: string;
    sort_order: number;
  };

  const { data: neighbourRow } = await supabase
    .from("materials")
    .select("id, sort_order")
    .eq("class_session_id", me.class_session_id)
    .is("deleted_at", null)
    [direction === "up" ? "lt" : "gt"]("sort_order", me.sort_order)
    .order("sort_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();

  if (!neighbourRow) return; // 이미 끝
  const neighbour = neighbourRow as { id: string; sort_order: number };

  // sort_order 에는 유니크 제약이 없으므로 임시값을 경유할 필요가 없습니다.
  await supabase
    .from("materials")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", me.id);
  await supabase
    .from("materials")
    .update({ sort_order: me.sort_order })
    .eq("id", neighbour.id);
}

/** 사람이 읽는 파일 크기. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
