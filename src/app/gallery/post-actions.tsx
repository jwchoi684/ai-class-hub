"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePostAction } from "./actions";

/**
 * 결과물 삭제 버튼.
 *
 * 같은 브라우저에서 올렸거나 운영자면 PIN 을 묻지 않습니다. 3주 전에 정한
 * 4자리를 기억하는 사람은 거의 없고, 실제 수정의 대부분은 '올린 직후 오타
 * 고치기'라 그 경우 PIN 을 쓸 일 자체가 없습니다 (docs/REQUIREMENTS.md §2.7).
 */
export function PostActions({
  postId,
  title,
  canDeleteWithoutPin,
}: {
  postId: string;
  title: string;
  canDeleteWithoutPin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function remove(withPin: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePostAction(postId, withPin);
      if (result.ok) {
        setAsking(false);
        setPin("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (asking) {
    return (
      <span className="flex flex-col gap-1">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          placeholder="PIN 4자리"
          aria-label="PIN"
          autoFocus
          className="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px]"
        />
        {error ? (
          <span role="alert" className="text-[10px] text-danger">
            {error}
          </span>
        ) : null}
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              setError(null);
            }}
            className="text-[10.5px] text-muted"
          >
            취소
          </button>
          <button
            type="button"
            disabled={pending || pin.length !== 4}
            onClick={() => remove(pin)}
            className="text-[10.5px] font-semibold text-danger disabled:opacity-40"
          >
            {pending ? "삭제 중…" : "삭제"}
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-[10px] text-danger">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (canDeleteWithoutPin) {
            if (!confirm(`'${title}' 을 삭제할까요?`)) return;
            remove("");
          } else {
            setAsking(true);
          }
        }}
        className="text-[10.5px] text-faint disabled:opacity-50"
      >
        삭제
      </button>
    </span>
  );
}
