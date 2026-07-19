"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { setAnnouncementAction } from "./actions";

/**
 * 공지 배너 편집.
 *
 * 실제 배너와 같은 모양으로 미리보기를 함께 보여줍니다 — 프로젝터에 띄웠을 때
 * 한 줄에 들어가는지 여기서 확인할 수 있어야 합니다.
 */
export function AnnouncementEditor({
  initialBody,
  initialLink,
}: {
  initialBody: string;
  initialLink: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setAnnouncementAction(formData);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold tracking-tight">공지 배너</h2>
        <p className="text-xs text-muted">
          모든 화면 맨 위에 고정됩니다. 다음 수업 일정이나 준비물처럼 안 보면
          곤란한 내용에만 쓰세요. 비우면 배너가 사라집니다.
        </p>
      </div>

      <textarea
        name="body"
        rows={2}
        maxLength={500}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="8/12(수) 3주차 — 노트북·크롬 설치 필수"
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      />

      <input
        name="linkUrl"
        type="url"
        defaultValue={initialLink}
        placeholder="자세히 보기 링크 (선택)"
        className="rounded-lg border border-line bg-surface px-3 py-2 text-xs"
      />

      {body.trim() ? (
        <div className="flex items-center gap-2.5 rounded-lg bg-soft px-3 py-2 text-[13px]">
          <span aria-hidden className="text-accent">📌</span>
          <span className="min-w-0 flex-1">{body}</span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">{error}</p>
      ) : null}

      <div className="flex items-center gap-2">
        {saved ? (
          <span className="text-[11px] text-accent">저장했어요</span>
        ) : null}
        <span className="flex-1" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
