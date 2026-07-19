import "server-only";

import { db } from "@/lib/db/admin-client";

export type Announcement = {
  id: string;
  body: string;
  linkUrl: string | null;
};

/**
 * 활성 공지 1건.
 *
 * 스키마에 `unique index ... on announcements((true)) where is_active` 가 있어
 * 활성 공지는 언제나 최대 하나입니다. 지난 공지는 지우지 않고 비활성으로만
 * 두므로 "지난주에 뭐 가져오라고 했더라"에 답할 수 있습니다.
 */
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await db()
    .from("announcements")
    .select("id, body, link_url")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`공지를 불러오지 못했습니다: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; body: string; link_url: string | null };
  return { id: row.id, body: row.body, linkUrl: row.link_url };
}

/**
 * 공지 교체.
 *
 * 기존 활성 공지를 먼저 내리고 새로 만듭니다. 순서가 반대면 유니크 인덱스에
 * 걸립니다 — 활성 공지는 하나뿐이어야 하니까요.
 */
export async function setAnnouncement(
  body: string,
  linkUrl: string | null,
): Promise<void> {
  const supabase = db();

  const { error: deactivateError } = await supabase
    .from("announcements")
    .update({ is_active: false })
    .eq("is_active", true);

  if (deactivateError) throw new Error(deactivateError.message);

  if (body.trim().length === 0) return; // 빈 값이면 공지를 내리기만 합니다.

  const { error } = await supabase
    .from("announcements")
    .insert({ body: body.trim(), link_url: linkUrl, is_active: true });

  if (error) throw new Error(error.message);
}
