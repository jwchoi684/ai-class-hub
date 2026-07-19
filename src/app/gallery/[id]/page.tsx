import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { isAdmin } from "@/lib/auth/session";
import { readVisitorId } from "@/lib/auth/visitor";
import { getGalleryPost } from "@/lib/db/gallery";
import { gradientCss } from "@/lib/gallery/thumbnail";
import { displayHost } from "@/lib/net/url-safety";
import { formatRelative } from "@/lib/datetime";
import { PostActions } from "../post-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [admin, visitorId] = await Promise.all([isAdmin(), readVisitorId()]);
  const post = await getGalleryPost(id, visitorId);

  if (!post) notFound();

  return (
    <>
      <SiteHeader isAdmin={admin} />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-6 py-8">
        <Link href="/gallery" className="font-mono text-[11px] text-faint">
          ← 갤러리
        </Link>

        <div
          className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-line"
          style={
            post.imageUrl
              ? undefined
              : { background: gradientCss(post.externalUrl ?? post.title) }
          }
        >
          {post.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.imageUrl}
              alt={post.title}
              className="size-full object-contain"
            />
          ) : post.externalUrl ? (
            <span className="flex flex-col items-center gap-3">
              <span className="font-mono text-xs text-white/85">
                {displayHost(post.externalUrl)}
              </span>
              <a
                href={post.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white/95 px-4 py-2 text-xs font-semibold text-ink"
              >
                사이트 열기 ↗
              </a>
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-bold tracking-tight">{post.title}</h1>

          <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-faint">
            <span className="text-muted">{post.authorNickname}</span>
            <span>{formatRelative(new Date(post.createdAt))}</span>
            {post.sessionOrderNo ? <span>{post.sessionOrderNo}주차</span> : null}
          </p>

          {post.tags.length > 0 ? (
            <p className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted"
                >
                  {tag}
                </span>
              ))}
            </p>
          ) : null}

          {post.description ? (
            <p className="text-sm leading-relaxed text-muted">
              {post.description}
            </p>
          ) : null}
        </div>

        <div className="border-t border-line pt-3">
          <PostActions
            postId={post.id}
            title={post.title}
            canDeleteWithoutPin={post.isMine || admin}
          />
        </div>
      </main>
    </>
  );
}
