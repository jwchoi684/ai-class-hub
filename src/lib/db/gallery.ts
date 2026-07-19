import "server-only";

import { db } from "@/lib/db/admin-client";
import { publicUrl, removeStoredFile } from "@/lib/storage/uploads";

export type GalleryPost = {
  id: string;
  kind: "link" | "image";
  title: string;
  description: string | null;
  authorNickname: string;
  externalUrl: string | null;
  /** 카드에 띄울 이미지. 없으면 그라데이션 폴백을 씁니다. */
  imageUrl: string | null;
  tags: string[];
  reactionCount: number;
  commentCount: number;
  sessionOrderNo: number | null;
  createdAt: string;
  /** 이 방문자가 올린 글인가 — 수정·삭제 버튼 노출 판단에만 씁니다. */
  isMine: boolean;
};

type Row = {
  id: string;
  kind: "link" | "image";
  title: string;
  description: string | null;
  author_nickname: string;
  external_url: string | null;
  image_path: string | null;
  thumb_path: string | null;
  fallback_image_path: string | null;
  tags: string[];
  reaction_count: number;
  comment_count: number;
  created_at: string;
  class_session_id: string | null;
};

/*
 * 읽기는 항상 공개 뷰만 봅니다. 기반 테이블을 직접 조회하면 pin_hash 와
 * visitor_id 가 딸려올 수 있습니다 (docs/REQUIREMENTS.md §4).
 */
const PUBLIC_VIEW = "gallery_posts_public";
const COLUMNS =
  "id, kind, title, description, author_nickname, external_url, image_path, thumb_path, fallback_image_path, tags, reaction_count, comment_count, created_at, class_session_id";

export type GalleryPage = {
  posts: GalleryPost[];
  /** 다음 페이지 커서. null 이면 끝입니다. */
  nextCursor: string | null;
};

const PAGE_SIZE = 24;

function toPost(
  row: Row,
  sessionOrderNo: number | null,
  mine: boolean,
): GalleryPost {
  const path = row.thumb_path ?? row.image_path ?? row.fallback_image_path;

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    authorNickname: row.author_nickname,
    externalUrl: row.external_url,
    imageUrl: path ? publicUrl("gallery", path) : null,
    tags: row.tags ?? [],
    reactionCount: row.reaction_count,
    commentCount: row.comment_count,
    sessionOrderNo,
    createdAt: row.created_at,
    isMine: mine,
  };
}

/**
 * 갤러리 목록. 커서 페이지네이션.
 *
 * offset 이 아니라 커서인 이유: 목록을 보는 중에 새 글이 올라오면 offset 은
 * 같은 글을 두 번 보여주거나 건너뜁니다. `(created_at, id)` 커서는 그 문제가
 * 없고, 인덱스가 그대로 seek 합니다.
 */
export async function listGalleryPosts(options: {
  cursor?: string | null;
  sessionId?: string | null;
  visitorId: string | null;
}): Promise<GalleryPage> {
  const supabase = db();

  let query = supabase
    .from(PUBLIC_VIEW)
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (options.sessionId) {
    query = query.eq("class_session_id", options.sessionId);
  }

  if (options.cursor) {
    const parsed = parseCursor(options.cursor);
    if (parsed) {
      // (created_at, id) < (커서) — 복합 비교를 or 로 풀어씁니다.
      query = query.or(
        `created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`결과물을 불러오지 못했습니다: ${error.message}`);

  const rows = data as Row[];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const orderNos = await orderNoMap(page.map((row) => row.class_session_id));
  const mine = await myPostIds(
    options.visitorId,
    page.map((row) => row.id),
  );

  return {
    posts: page.map((row) =>
      toPost(
        row,
        row.class_session_id ? (orderNos[row.class_session_id] ?? null) : null,
        mine.has(row.id),
      ),
    ),
    nextCursor: hasMore
      ? makeCursor(page[page.length - 1]!.created_at, page[page.length - 1]!.id)
      : null,
  };
}

export async function getGalleryPost(
  id: string,
  visitorId: string | null,
): Promise<GalleryPost | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;

  const { data, error } = await db()
    .from(PUBLIC_VIEW)
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Row;
  const orderNos = await orderNoMap([row.class_session_id]);
  const mine = await myPostIds(visitorId, [row.id]);

  return toPost(
    row,
    row.class_session_id ? (orderNos[row.class_session_id] ?? null) : null,
    mine.has(row.id),
  );
}

/**
 * 소유권 조회.
 *
 * 공개 뷰에는 visitor_id 가 없으므로(일부러 뺐습니다) 기반 테이블에 따로
 * 물어봅니다. id 목록으로 좁혀 조회하므로 다른 사람의 값은 읽지 않습니다.
 */
async function myPostIds(
  visitorId: string | null,
  ids: string[],
): Promise<Set<string>> {
  if (!visitorId || ids.length === 0) return new Set();

  const { data } = await db()
    .from("gallery_posts")
    .select("id")
    .eq("visitor_id", visitorId)
    .in("id", ids);

  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}

async function orderNoMap(
  sessionIds: (string | null)[],
): Promise<Record<string, number>> {
  const ids = [...new Set(sessionIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return {};

  const { data } = await db()
    .from("class_sessions")
    .select("id, order_no, deleted_at")
    .in("id", ids);

  const map: Record<string, number> = {};
  for (const row of (data ?? []) as {
    id: string;
    order_no: number;
    deleted_at: string | null;
  }[]) {
    // 회차가 지워졌으면 '미분류'로 보이도록 번호를 주지 않습니다.
    // 회차를 복구하면 그대로 되돌아옵니다.
    if (!row.deleted_at) map[row.id] = row.order_no;
  }
  return map;
}

function makeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

function parseCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("|");
    if (!createdAt || !id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export type CreatePostInput = {
  id: string;
  kind: "link" | "image";
  title: string;
  description: string | null;
  authorNickname: string;
  pinHash: string;
  visitorId: string;
  sessionId: string | null;
  tags: string[];
  externalUrl: string | null;
  imagePath: string | null;
  imageBytes: number | null;
};

export async function createGalleryPost(input: CreatePostInput): Promise<void> {
  /*
   * id 를 클라이언트가 만들어 보내고 여기서 그대로 씁니다.
   * [올리기] 더블 클릭이나 모바일에서 업로드 지연 중 재시도해도 같은 결과물이
   * 두 개 생기지 않게 하는 멱등키입니다.
   */
  const { error } = await db()
    .from("gallery_posts")
    .upsert(
      {
        id: input.id,
        kind: input.kind,
        title: input.title,
        description: input.description,
        author_nickname: input.authorNickname,
        pin_hash: input.pinHash,
        visitor_id: input.visitorId,
        class_session_id: input.sessionId,
        tags: input.tags,
        external_url: input.externalUrl,
        image_path: input.imagePath,
        thumb_path: input.imagePath,
        image_bytes: input.imageBytes,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (error) throw new Error(error.message);
}

/** 삭제 검증에 필요한 최소 정보. 공개 뷰에는 없는 값들입니다. */
export async function getPostSecrets(id: string): Promise<{
  pinHash: string;
  visitorId: string;
  failedAttempts: number;
  lockedUntil: string | null;
  imagePath: string | null;
} | null> {
  const { data } = await db()
    .from("gallery_posts")
    .select(
      "pin_hash, visitor_id, failed_pin_attempts, pin_locked_until, image_path",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    pin_hash: string;
    visitor_id: string;
    failed_pin_attempts: number;
    pin_locked_until: string | null;
    image_path: string | null;
  };

  return {
    pinHash: row.pin_hash,
    visitorId: row.visitor_id,
    failedAttempts: row.failed_pin_attempts,
    lockedUntil: row.pin_locked_until,
    imagePath: row.image_path,
  };
}

export async function recordPinFailure(
  id: string,
  attempts: number,
): Promise<void> {
  // 5회 실패하면 15분 잠급니다. 4자리는 1만 가지뿐이라 이 잠금이 실제 방어선입니다.
  const locked = attempts + 1 >= 5;
  await db()
    .from("gallery_posts")
    .update({
      failed_pin_attempts: attempts + 1,
      pin_locked_until: locked
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null,
    })
    .eq("id", id);
}

export async function clearPinFailures(id: string): Promise<void> {
  await db()
    .from("gallery_posts")
    .update({ failed_pin_attempts: 0, pin_locked_until: null })
    .eq("id", id);
}

/**
 * 결과물 삭제.
 *
 * 행은 소프트 삭제하되 **이미지 파일은 실제로 지웁니다**. 화면에서만 사라지고
 * 파일 주소가 살아 있으면 '지워주세요' 요청의 의미가 없습니다
 * (docs/REQUIREMENTS.md §2.4).
 */
export async function deleteGalleryPost(
  id: string,
  deletedBy: "owner" | "admin",
): Promise<void> {
  const supabase = db();
  const secrets = await getPostSecrets(id);

  const { error } = await supabase
    .from("gallery_posts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      media_purged_at: secrets?.imagePath ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (secrets?.imagePath) {
    await removeStoredFile("gallery", secrets.imagePath);
  }
}
