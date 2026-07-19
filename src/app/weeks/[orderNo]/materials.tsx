"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addFileMaterialAction,
  addLinkMaterialAction,
  deleteMaterialAction,
  moveMaterialAction,
} from "./actions";
import type { ActionResult } from "@/lib/auth/guard";

export type MaterialView = {
  id: string;
  kind: "file" | "link";
  title: string;
  description: string | null;
  href: string;
  subtitle: string;
};

export function Materials({
  sessionId,
  orderNo,
  materials,
  isAdmin,
}: {
  sessionId: string;
  orderNo: number;
  materials: MaterialView[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"none" | "link" | "file">("none");

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onSuccess?.();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-tight">강의 자료</h2>
        <span className="font-mono text-[11px] text-faint">
          {materials.length}
        </span>
        {isAdmin ? (
          <>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAdding(adding === "file" ? "none" : "file");
              }}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold"
            >
              ＋ 파일
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAdding(adding === "link" ? "none" : "link");
              }}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold"
            >
              ＋ 링크
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {adding === "link" ? (
        <LinkForm
          sessionId={sessionId}
          orderNo={orderNo}
          pending={pending}
          onCancel={() => setAdding("none")}
          onSubmit={(formData) =>
            run(
              () => addLinkMaterialAction(formData),
              () => setAdding("none"),
            )
          }
        />
      ) : null}

      {adding === "file" ? (
        <FileForm
          sessionId={sessionId}
          orderNo={orderNo}
          onDone={() => {
            setAdding("none");
            router.refresh();
          }}
          onError={setError}
        />
      ) : null}

      {materials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-xs text-muted">
            아직 올라온 자료가 없어요.
            {isAdmin ? " 위 버튼으로 추가할 수 있어요." : ""}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line">
          {materials.map((material, index) => (
            <li
              key={material.id}
              className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0"
            >
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-xs"
              >
                {material.kind === "link" ? "🔗" : "📄"}
              </span>

              <a
                href={material.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 flex-col gap-0.5"
              >
                <span className="truncate text-[13px] font-semibold">
                  {material.title}
                </span>
                <span className="truncate font-mono text-[10.5px] text-faint">
                  {material.subtitle}
                </span>
              </a>

              {material.kind === "file" ? (
                <a
                  href={`${material.href}?download=`}
                  className="shrink-0 text-xs text-muted"
                >
                  ⬇
                </a>
              ) : null}

              {isAdmin ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    onClick={() =>
                      run(() => moveMaterialAction(material.id, "up", orderNo))
                    }
                    aria-label="위로"
                    className="text-[11px] text-muted disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === materials.length - 1}
                    onClick={() =>
                      run(() => moveMaterialAction(material.id, "down", orderNo))
                    }
                    aria-label="아래로"
                    className="text-[11px] text-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`'${material.title}' 자료를 삭제할까요?`)) return;
                      run(() => deleteMaterialAction(material.id, orderNo));
                    }}
                    className="text-[11px] text-danger disabled:opacity-50"
                  >
                    삭제
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkForm({
  sessionId,
  orderNo,
  pending,
  onSubmit,
  onCancel,
}: {
  sessionId: string;
  orderNo: number;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3.5"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="orderNo" value={orderNo} />

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">주소</span>
        <input
          name="url"
          type="url"
          required
          placeholder="https://slides-week3.vercel.app"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">표시 이름</span>
        <input
          name="title"
          type="text"
          required
          maxLength={200}
          placeholder="3주차 강의 슬라이드"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        />
      </label>

      <div className="flex items-center gap-2">
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1.5 text-[11px] text-muted"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "추가 중…" : "추가"}
        </button>
      </div>
    </form>
  );
}

/**
 * 파일 업로드.
 *
 * 서버를 거치지 않고 Storage 로 직접 올립니다. Vercel 함수의 요청 본문 상한이
 * 4.5MB 라 30MB PDF 를 프록시하는 방식은 애초에 불가능하기 때문입니다.
 *   1) 서버에 서명 URL 요청  2) Storage 로 직접 PUT  3) 서버에 커밋 요청
 */
function FileForm({
  sessionId,
  orderNo,
  onDone,
  onError,
}: {
  sessionId: string;
  orderNo: number;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const file = fileRef.current?.files?.[0];
    const title = titleRef.current?.value.trim() ?? "";

    if (!file) return onError("파일을 선택해주세요.");
    if (!title) return onError("표시 이름을 입력해주세요.");

    try {
      setPhase("uploading");

      // 1) 서명 URL 발급
      const signResponse = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "material",
          size: file.size,
          mime: file.type || null,
        }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error ?? "업로드 준비 실패");

      // 2) Storage 로 직접 업로드.
      //    supabase-js 를 브라우저에 싣지 않기 위해 서명 URL 로 그냥 PUT 합니다
      //    (이 앱은 클라이언트에 Supabase 키를 내려보내지 않습니다).
      const uploadResponse = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("파일 전송에 실패했어요.");

      // 3) 서버가 실제 바이트를 확인하고 공개 버킷으로 옮김
      setPhase("saving");
      const commitResponse = await fetch("/api/uploads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "material",
          intentId: signed.intentId,
          fileName: file.name,
        }),
      });
      const committed = await commitResponse.json();
      if (!commitResponse.ok) throw new Error(committed.error ?? "업로드 실패");

      const result = await addFileMaterialAction({
        sessionId,
        orderNo,
        title,
        description: null,
        storagePath: committed.storagePath,
        fileName: committed.fileName,
        mime: committed.mime,
        sizeBytes: committed.sizeBytes,
      });

      if (!result.ok) throw new Error(result.message);
      onDone();
    } catch (error) {
      onError(error instanceof Error ? error.message : "업로드에 실패했어요.");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3.5"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">파일</span>
        <input
          ref={fileRef}
          type="file"
          required
          accept=".pdf,.pptx,.ppt,.docx,.png,.jpg,.jpeg,.webp,.gif,.zip"
          onChange={(event) => {
            const name = event.target.files?.[0]?.name;
            if (name && titleRef.current && !titleRef.current.value) {
              titleRef.current.value = name.replace(/\.[^.]+$/, "");
            }
          }}
          className="text-xs"
        />
        <span className="text-[10.5px] text-faint">
          PDF · 오피스 문서 · 이미지, 최대 50MB
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">표시 이름</span>
        <input
          ref={titleRef}
          type="text"
          required
          maxLength={200}
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        />
      </label>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-muted">
          {phase === "uploading"
            ? "파일 전송 중…"
            : phase === "saving"
              ? "확인 중…"
              : ""}
        </span>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent disabled:opacity-50"
        >
          올리기
        </button>
      </div>
    </form>
  );
}
