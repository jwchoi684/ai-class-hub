import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { isAdmin } from "@/lib/auth/session";
import { readVisitorId } from "@/lib/auth/visitor";
import { listGalleryPosts, type GalleryPost } from "@/lib/db/gallery";
import { gradientCss } from "@/lib/gallery/thumbnail";
import { displayHost } from "@/lib/net/url-safety";
import { PostActions } from "./post-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const [admin, visitorId] = await Promise.all([isAdmin(), readVisitorId()]);

  const { posts, nextCursor } = await listGalleryPosts({
    cursor: cursor ?? null,
    visitorId,
  });

  return (
    <>
      <SiteHeader isAdmin={admin} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-tight">결과물 갤러리</h1>
          <span className="flex-1" />
          <Link
            href="/gallery/new"
            className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent"
          >
            ＋ 결과물 올리기
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm font-semibold">아직 올라온 결과물이 없어요</p>
            <p className="max-w-xs text-xs text-muted">
              첫 번째로 만든 걸 공유해보세요. 링크나 이미지 모두 올릴 수 있어요.
            </p>
            <Link
              href="/gallery/new"
              className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
            >
              결과물 올리기
            </Link>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.id}>
                  <Card post={post} isAdmin={admin} />
                </li>
              ))}
            </ul>

            {nextCursor ? (
              <div className="flex justify-center pt-2">
                <Link
                  href={`/gallery?cursor=${encodeURIComponent(nextCursor)}`}
                  className="rounded-lg border border-line-strong px-4 py-2 text-xs font-semibold"
                >
                  더 보기
                </Link>
              </div>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function Card({ post, isAdmin }: { post: GalleryPost; isAdmin: boolean }) {
  const host = post.externalUrl ? displayHost(post.externalUrl) : null;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <a
        href={post.externalUrl ?? `/gallery/${post.id}`}
        target={post.externalUrl ? "_blank" : undefined}
        rel={post.externalUrl ? "noopener noreferrer" : undefined}
        className="relative flex aspect-[16/10] items-end p-2"
        style={
          post.imageUrl
            ? undefined
            : // 썸네일이 없는 것이 기본 상태입니다. 주소를 해시해 색을 정하므로
              // 같은 사이트는 언제나 같은 색이고, 회색 빈 박스가 되지 않습니다.
              { background: gradientCss(post.externalUrl ?? post.title) }
        }
      >
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}

        {host ? (
          <span className="relative truncate rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
            {host}
          </span>
        ) : null}

        {post.externalUrl ? (
          <span className="absolute top-1.5 right-1.5 rounded bg-black/35 px-1.5 text-[10px] text-white backdrop-blur-sm">
            ↗
          </span>
        ) : null}
      </a>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <Link
          href={`/gallery/${post.id}`}
          className="line-clamp-2 text-[12.5px] leading-snug font-semibold tracking-tight"
        >
          {post.title}
        </Link>

        <span className="font-mono text-[10.5px] text-faint">
          {post.authorNickname}
          {post.sessionOrderNo ? ` · ${post.sessionOrderNo}주차` : ""}
        </span>

        {post.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {post.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded border border-line bg-surface-2 px-1.5 text-[10px] text-muted"
              >
                {tag}
              </span>
            ))}
            {post.tags.length > 2 ? (
              <span className="text-[10px] text-faint">
                +{post.tags.length - 2}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-auto pt-1.5">
          <PostActions
            postId={post.id}
            title={post.title}
            canDeleteWithoutPin={post.isMine || isAdmin}
          />
        </span>
      </div>
    </article>
  );
}
