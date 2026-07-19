import "server-only";

import { db } from "@/lib/db/admin-client";

/**
 * 회차 데이터 접근.
 *
 * 화면은 여기만 부르고 supabase 클라이언트를 직접 만지지 않습니다. 소프트
 * 삭제 필터(`deleted_at is null`)를 한 군데에 모아 두는 게 목적입니다 —
 * 한 화면에서만 빠뜨려도 지운 회차가 되살아나 보입니다.
 */

export type ClassSession = {
  id: string;
  orderNo: number;
  title: string;
  description: string | null;
  heldOn: string | null;
  isPublished: boolean;
};

type Row = {
  id: string;
  order_no: number;
  title: string;
  description: string | null;
  held_on: string | null;
  is_published: boolean;
};

const COLUMNS = "id, order_no, title, description, held_on, is_published";

function toSession(row: Row): ClassSession {
  return {
    id: row.id,
    orderNo: row.order_no,
    title: row.title,
    description: row.description,
    heldOn: row.held_on,
    isPublished: row.is_published,
  };
}

/**
 * 회차 목록.
 *
 * @param includeUnpublished 관리자에게만 true. 수강생에게 '준비 중' 회차를
 *   보여주면 아직 없는 자료를 찾아 헤매게 됩니다.
 */
export async function listSessions(
  includeUnpublished = false,
): Promise<ClassSession[]> {
  let query = db()
    .from("class_sessions")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("order_no", { ascending: true });

  if (!includeUnpublished) {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`회차 목록을 불러오지 못했습니다: ${error.message}`);

  return (data as Row[]).map(toSession);
}

export type SessionLookup =
  | { status: "found"; session: ClassSession }
  /** 존재했지만 지워진 회차. 404 와 구분해서 안내 문구를 다르게 보여줍니다. */
  | { status: "deleted" }
  /** 아직 공개되지 않은 회차를 비관리자가 연 경우. 존재 여부를 흘리지 않으려 404 와 같게 다룹니다. */
  | { status: "not_found" };

/**
 * 회차 번호로 조회.
 *
 * 번호는 재사용하지 않으므로(0001 마이그레이션) 이 주소는 영구적입니다.
 * 지워진 회차에 접근하면 404 대신 '삭제되었어요'를 보여줍니다 — 단톡방에
 * 뿌린 링크를 누른 사람이 자기가 주소를 잘못 눌렀다고 오해하지 않게.
 */
export async function getSessionByOrderNo(
  orderNo: number,
  includeUnpublished = false,
): Promise<SessionLookup> {
  if (!Number.isInteger(orderNo) || orderNo < 1 || orderNo > 999) {
    return { status: "not_found" };
  }

  const { data, error } = await db()
    .from("class_sessions")
    .select(`${COLUMNS}, deleted_at`)
    .eq("order_no", orderNo)
    .maybeSingle();

  if (error) throw new Error(`회차를 불러오지 못했습니다: ${error.message}`);
  if (!data) return { status: "not_found" };

  const row = data as Row & { deleted_at: string | null };
  if (row.deleted_at) return { status: "deleted" };
  if (!row.is_published && !includeUnpublished) return { status: "not_found" };

  return { status: "found", session: toSession(row) };
}

/**
 * 다음 회차 번호 제안.
 *
 * 지워진 회차까지 포함해 최댓값 + 1 입니다. 번호를 재사용하지 않는다는
 * 규칙이 여기서도 지켜져야 합니다 — 빈 번호를 채워 넣으면 예전에 공유한
 * 링크가 다른 회차를 가리킵니다.
 */
export async function suggestNextOrderNo(): Promise<number> {
  const { data, error } = await db()
    .from("class_sessions")
    .select("order_no")
    .order("order_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`회차 번호를 계산하지 못했습니다: ${error.message}`);

  return ((data as { order_no: number } | null)?.order_no ?? 0) + 1;
}

export type SessionInput = {
  orderNo: number;
  title: string;
  description: string | null;
  heldOn: string | null;
  isPublished: boolean;
};

export async function createSession(input: SessionInput): Promise<void> {
  const { error } = await db().from("class_sessions").insert({
    order_no: input.orderNo,
    title: input.title,
    description: input.description,
    held_on: input.heldOn,
    is_published: input.isPublished,
  });

  if (error) throw new Error(error.message);
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<SessionInput, "orderNo">>,
): Promise<void> {
  const { error } = await db()
    .from("class_sessions")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.heldOn !== undefined ? { held_on: patch.heldOn } : {}),
      ...(patch.isPublished !== undefined
        ? { is_published: patch.isPublished }
        : {}),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
}

/**
 * 소프트 삭제.
 *
 * 물리 삭제는 하지 않습니다. 무료 플랜에 복원 가능한 백업이 없어서 잘못 누른
 * 삭제가 곧 영구 손실이기 때문입니다(docs/REQUIREMENTS.md §2.4).
 * 이 회차의 자료도 함께 지워지지 않습니다 — FK 가 RESTRICT 라 물리 삭제
 * 자체가 막혀 있고, 조회 계층이 회차 기준으로 걸러낼 뿐입니다.
 */
export async function softDeleteSession(id: string): Promise<void> {
  const { error } = await db()
    .from("class_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
}

/** 관리 화면의 표에 쓸 회차별 자료·결과물 개수. */
export async function countsBySession(): Promise<
  Record<string, { materials: number; posts: number }>
> {
  const supabase = db();

  const [materials, posts] = await Promise.all([
    supabase
      .from("materials")
      .select("class_session_id")
      .is("deleted_at", null),
    supabase
      .from("gallery_posts")
      .select("class_session_id")
      .is("deleted_at", null),
  ]);

  const result: Record<string, { materials: number; posts: number }> = {};

  const bump = (id: string | null, key: "materials" | "posts") => {
    if (!id) return;
    result[id] ??= { materials: 0, posts: 0 };
    result[id][key] += 1;
  };

  for (const row of (materials.data ?? []) as { class_session_id: string }[]) {
    bump(row.class_session_id, "materials");
  }
  for (const row of (posts.data ?? []) as {
    class_session_id: string | null;
  }[]) {
    bump(row.class_session_id, "posts");
  }

  return result;
}
