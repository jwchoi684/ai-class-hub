"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  createSessionAction,
  deleteSessionAction,
  togglePublishedAction,
  updateSessionAction,
} from "./actions";
import type { ActionResult } from "@/lib/auth/guard";

export type ManagedSession = {
  id: string;
  orderNo: number;
  title: string;
  description: string | null;
  heldOn: string | null;
  isPublished: boolean;
  materialCount: number;
  postCount: number;
};

export function SessionManager({
  sessions,
  suggestedOrderNo,
}: {
  sessions: ManagedSession[];
  suggestedOrderNo: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<
    | { kind: "idle" }
    | { kind: "creating" }
    | { kind: "editing"; id: string }
    | { kind: "deleting"; id: string }
  >({ kind: "idle" });

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
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-tight">회차 관리</h2>
        <span className="font-mono text-[11px] text-faint">
          {sessions.length}
        </span>
        <span className="flex-1" />
        {mode.kind !== "creating" ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode({ kind: "creating" });
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent"
          >
            ＋ 새 회차
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {mode.kind === "creating" ? (
        <SessionForm
          submitLabel="만들기"
          pending={pending}
          defaults={{
            orderNo: suggestedOrderNo,
            title: "",
            description: "",
            heldOn: "",
            isPublished: false,
          }}
          onCancel={() => setMode({ kind: "idle" })}
          onSubmit={(formData) =>
            run(
              () => createSessionAction(formData),
              () => setMode({ kind: "idle" }),
            )
          }
        />
      ) : null}

      {sessions.length === 0 && mode.kind !== "creating" ? (
        <p className="py-6 text-center text-xs text-muted">
          아직 회차가 없어요. 첫 회차를 만들어보세요.
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-col gap-2 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-6 shrink-0 font-mono text-xs text-faint tabular-nums">
                {String(session.orderNo).padStart(2, "0")}
              </span>

              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {session.title}
              </span>

              <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">
                {session.heldOn ?? "날짜 미정"}
              </span>

              <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">
                자료 {session.materialCount} · 결과물 {session.postCount}
              </span>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    togglePublishedAction(session.id, !session.isPublished),
                  )
                }
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50 ${
                  session.isPublished
                    ? "border-transparent bg-soft text-accent"
                    : "border-line text-muted"
                }`}
              >
                {session.isPublished ? "공개" : "준비 중"}
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setMode({ kind: "editing", id: session.id });
                }}
                className="shrink-0 text-[11px] text-muted disabled:opacity-50"
              >
                편집
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setMode({ kind: "deleting", id: session.id });
                }}
                className="shrink-0 text-[11px] text-danger disabled:opacity-50"
              >
                삭제
              </button>
            </div>

            {mode.kind === "editing" && mode.id === session.id ? (
              <SessionForm
                submitLabel="저장"
                pending={pending}
                lockOrderNo
                defaults={{
                  orderNo: session.orderNo,
                  title: session.title,
                  description: session.description ?? "",
                  heldOn: session.heldOn ?? "",
                  isPublished: session.isPublished,
                }}
                hiddenId={session.id}
                onCancel={() => setMode({ kind: "idle" })}
                onSubmit={(formData) =>
                  run(
                    () => updateSessionAction(formData),
                    () => setMode({ kind: "idle" }),
                  )
                }
              />
            ) : null}

            {mode.kind === "deleting" && mode.id === session.id ? (
              <DeleteConfirm
                session={session}
                pending={pending}
                onCancel={() => setMode({ kind: "idle" })}
                onConfirm={(typed) =>
                  run(
                    () => deleteSessionAction(session.id, typed),
                    () => setMode({ kind: "idle" }),
                  )
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionForm({
  submitLabel,
  defaults,
  pending,
  lockOrderNo = false,
  hiddenId,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  lockOrderNo?: boolean;
  hiddenId?: string;
  defaults: {
    orderNo: number;
    title: string;
    description: string;
    heldOn: string;
    isPublished: boolean;
  };
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
      {hiddenId ? <input type="hidden" name="id" value={hiddenId} /> : null}

      <div className="flex flex-wrap gap-2.5">
        <label className="flex w-20 flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted">번호</span>
          <input
            name="orderNo"
            type="number"
            min={1}
            max={999}
            required
            defaultValue={defaults.orderNo}
            readOnly={lockOrderNo}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs tabular-nums read-only:text-faint"
          />
        </label>

        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted">제목</span>
          <input
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={defaults.title}
            placeholder="프롬프트 엔지니어링 기초"
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
          />
        </label>

        <label className="flex w-36 flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted">날짜</span>
          <input
            name="heldOn"
            type="date"
            defaultValue={defaults.heldOn}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">한 줄 설명</span>
        <input
          name="description"
          type="text"
          maxLength={2000}
          defaultValue={defaults.description}
          placeholder="역할 지정, 예시 제공, 단계 분해"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        />
      </label>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            name="isPublished"
            type="checkbox"
            defaultChecked={defaults.isPublished}
            className="accent-accent"
          />
          바로 공개
        </label>

        <span className="flex-1" />

        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "처리 중…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  session,
  pending,
  onConfirm,
  onCancel,
}: {
  session: ManagedSession;
  pending: boolean;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === session.title;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-warn-soft p-3.5">
      <p className="text-[11px] leading-relaxed text-warn">
        <b className="font-semibold">{session.orderNo}주차</b> 를 목록에서 숨깁니다.
        자료 {session.materialCount}개는 함께 지워지지 않고, 결과물{" "}
        {session.postCount}개는 &lsquo;회차 없음&rsquo;으로 표시됩니다.
        <br />
        회차 번호 {session.orderNo}은 다시 쓸 수 없습니다.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-muted">
          확인을 위해 제목을 그대로 입력하세요 — {session.title}
        </span>
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoFocus
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs"
        />
      </label>

      <div className="flex items-center gap-2">
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(typed)}
          disabled={pending || !matches}
          className="rounded-md bg-danger px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "삭제 중…" : "삭제"}
        </button>
      </div>
    </div>
  );
}
