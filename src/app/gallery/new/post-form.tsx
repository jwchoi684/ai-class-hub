"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPostAction } from "../actions";
import { resizeImage } from "@/lib/gallery/resize-image";
import { gradientCss } from "@/lib/gallery/thumbnail";

type SessionOption = { id: string; orderNo: number; title: string };

const NICKNAME_KEY = "ac.nickname";

export function PostForm({
  sessions,
  defaultSessionId,
}: {
  sessions: SessionOption[];
  defaultSessionId: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [kind, setKind] = useState<"link" | "image">("link");
  const [url, setUrl] = useState("");
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; bytes: number } | null>(null);
  const [phase, setPhase] = useState<"idle" | "image" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  /*
   * 폼에 들어올 때 id 를 만들어 둡니다. 이 값이 그대로 PK 가 되어
   * [올리기] 를 두 번 눌러도 결과물이 두 개 생기지 않습니다(멱등키).
   */
  const [postId] = useState(() => crypto.randomUUID());

  /*
   * 두 번째 게시부터는 닉네임을 다시 치지 않게 합니다.
   *
   * 상태로 들고 있지 않고 DOM 에 직접 채웁니다. localStorage 는 서버에 없어서
   * 초기 상태로 읽을 수 없고, 이펙트에서 setState 를 하면 렌더가 한 번 더
   * 도는데 이 값은 렌더에 영향을 주지 않으므로 그럴 이유가 없습니다.
   */
  const nicknameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (saved && nicknameRef.current && !nicknameRef.current.value) {
      nicknameRef.current.value = saved;
    }
  }, []);

  async function handleImageChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPhase("image");

    try {
      // 브라우저에서 다시 인코딩 — 위치정보 제거 + HEIC 변환 + 용량 축소
      const resized = await resizeImage(file);

      const signResponse = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "gallery",
          size: resized.blob.size,
          mime: "image/jpeg",
        }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error ?? "업로드 준비 실패");

      const putResponse = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: resized.blob,
      });
      if (!putResponse.ok) throw new Error("이미지 전송에 실패했어요.");

      const commitResponse = await fetch("/api/uploads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "gallery",
          intentId: signed.intentId,
          fileName: file.name,
        }),
      });
      const committed = await commitResponse.json();
      if (!commitResponse.ok) throw new Error(committed.error ?? "업로드 실패");

      setUploaded({ path: committed.storagePath, bytes: committed.sizeBytes });
      setImagePreview(URL.createObjectURL(resized.blob));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이미지 업로드에 실패했어요.");
    } finally {
      setPhase("idle");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "idle") return;

    if (kind === "image" && !uploaded) {
      setError("이미지를 먼저 올려주세요.");
      return;
    }

    /*
     * PIN 오타 방어. 4칸을 두 번 받는 대신 마스킹을 풀어 한 번 확인시킵니다.
     * 오타로 게시하면 그 글은 같은 브라우저를 벗어나는 순간 영구히 잠깁니다.
     */
    if (!confirm(`PIN ${pin} 으로 등록됩니다. 맞나요?`)) return;

    setError(null);
    setPhase("submitting");

    const formData = new FormData(event.currentTarget);
    formData.set("id", postId);
    formData.set("kind", kind);
    if (uploaded) {
      formData.set("imagePath", uploaded.path);
      formData.set("imageBytes", String(uploaded.bytes));
    }

    const result = await createPostAction(formData);

    if (result.ok) {
      const nickname = String(formData.get("nickname") ?? "");
      if (remember && nickname) localStorage.setItem(NICKNAME_KEY, nickname);
      router.push("/gallery");
      router.refresh();
      return;
    }

    setError(result.message);
    setPhase("idle");
  }

  const busy = phase !== "idle";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 사람에게는 보이지 않는 허니팟. 봇이 채우면 조용히 무시합니다. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute size-0 opacity-0"
      />

      <div className="flex overflow-hidden rounded-lg border border-line">
        {(["link", "image"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`flex-1 px-4 py-2 text-xs font-semibold ${
              kind === value ? "bg-accent text-on-accent" : "text-muted"
            }`}
          >
            {value === "link" ? "🔗 웹사이트 링크" : "🖼 이미지"}
          </button>
        ))}
      </div>

      {kind === "link" ? (
        <>
          <Field label="주소">
            <input
              name="url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://my-site.vercel.app"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          {/*
            썸네일이 없는 것이 기본 상태입니다. 주소를 넣는 순간 어떤 카드가
            될지 미리 보여줘서, 회색 빈 박스를 보게 되는 일이 없게 합니다.
          */}
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
            <span
              className="size-16 shrink-0 rounded-md"
              style={{ background: gradientCss(url || "preview") }}
            />
            <span className="flex flex-col gap-0.5 text-xs">
              <b className="font-semibold">이렇게 보여요</b>
              <span className="text-muted">
                사이트에서 미리보기 이미지를 못 가져오면 이 색 카드로 표시됩니다.
                직접 보여주고 싶은 화면이 있다면 이미지로 올려주세요.
              </span>
            </span>
          </div>
        </>
      ) : (
        <Field label="이미지">
          <input
            type="file"
            accept="image/*"
            required={!uploaded}
            onChange={(event) => handleImageChange(event.target.files?.[0])}
            className="text-xs"
          />
          <span className="text-[10.5px] text-faint">
            올릴 때 자동으로 크기를 줄이고 위치정보를 지웁니다.
          </span>
          {phase === "image" ? (
            <span className="text-[11px] text-muted">이미지 처리 중…</span>
          ) : null}
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="올린 이미지 미리보기"
              className="mt-1 max-h-40 rounded-lg border border-line object-contain"
            />
          ) : null}
        </Field>
      )}

      <Field label="제목">
        <input
          name="title"
          type="text"
          required
          maxLength={120}
          placeholder="카페 메뉴 추천 사이트"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label="한 줄 설명">
        <input
          name="description"
          type="text"
          maxLength={2000}
          placeholder="어떤 걸 만들었는지 짧게 적어주세요"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <div className="flex gap-3">
        <Field label="회차" className="flex-1">
          <select
            name="sessionId"
            defaultValue={defaultSessionId ?? ""}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">회차 없음</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.orderNo}주차 · {session.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="태그" className="flex-1">
          <input
            name="tags"
            type="text"
            placeholder="랜딩페이지 반응형"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <span className="text-[10.5px] text-faint">띄어쓰기로 구분, 최대 5개</span>
        </Field>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-warn-soft p-3">
        <p className="text-[11px] leading-relaxed text-warn">
          이 결과물은 링크를 아는 누구나 볼 수 있어요. 타인의 얼굴이나 개인정보,
          API 키가 찍힌 화면은 올리지 말아주세요.
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="consent" required className="accent-accent" />
          확인했습니다
        </label>
      </div>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold text-muted">내 정보</span>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[130px] flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted">닉네임</span>
            <input
              ref={nicknameRef}
              name="nickname"
              type="text"
              required
              maxLength={30}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">PIN 4자리</span>
            <input
              name="pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-center font-mono text-base tracking-[0.4em]"
            />
          </label>
        </div>

        <p className="text-[10.5px] leading-relaxed text-faint">
          나중에 수정·삭제할 때 필요해요. 휴대폰 잠금번호와 다른 번호를 써주세요.
          잊었다면 강사에게 문의하세요.
        </p>

        <label className="flex items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="accent-accent"
          />
          이 기기에 닉네임 기억하기
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {phase === "submitting" ? "올리는 중…" : "올리기"}
      </button>
    </form>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
