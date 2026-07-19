-- ============================================================================
-- Storage 버킷
--
-- 왜 staging 버킷이 따로 있는가:
--   Vercel 함수의 요청 본문 상한은 4.5MB 입니다. 30MB PDF 를 Route Handler 로
--   프록시하는 설계는 처음부터 불가능하므로, 서명 URL 로 브라우저가 Storage 에
--   직접 올려야 합니다. 그런데 그러면 서버가 바이트를 못 봅니다.
--   그래서 비공개 staging 에 먼저 올리고, 서버가 앞부분만 읽어 실제 타입을
--   확인한 뒤 공개 버킷으로 옮깁니다. staging 에 있는 동안에는 공개 URL 이
--   존재하지 않습니다.
--
-- 왜 public=true 인가:
--   자료와 결과물 이미지는 어차피 링크를 아는 누구나 보는 것이 요구사항입니다.
--   경로에 uuid 를 써서 추측이 불가능하게 하고, 앱 페이지는 noindex 라
--   크롤러가 경로를 수집하지도 못합니다. 매 조회마다 서명 URL 을 발급하면
--   이미지 20장짜리 갤러리에서 왕복이 20번 늘어납니다.
--
-- SVG 와 HTML 은 어디에도 허용하지 않습니다. 둘 다 스크립트를 실행할 수
-- 있습니다. Storage 가 앱과 다른 오리진(*.supabase.co)이라 실행돼도 우리
-- 쿠키에는 닿지 못하는데, 이 오리진 분리는 유지할 가치가 있는 보안 속성이라
-- 나중에 커스텀 도메인을 붙이더라도 앱 도메인의 서브도메인으로는 붙이지 마세요.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'materials', 'materials', true, 52428800,  -- 50MB
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'application/zip'
    ]
  ),
  (
    'gallery', 'gallery', true, 10485760,      -- 10MB
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'link-previews', 'link-previews', true, 2097152,
    array['image/webp', 'image/jpeg', 'image/png']
  ),
  (
    -- 비공개. 검증 전 파일은 공개 URL 을 가지면 안 됩니다.
    'uploads-staging', 'uploads-staging', false, 52428800, null
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * storage.objects 에는 정책을 만들지 않습니다.
 *
 * RLS 가 켜져 있고 정책이 없으면 anon/authenticated 는 업로드·수정·삭제를
 * 할 수 없습니다. 쓰기는 오직 서버가 service_role 로 발급한 서명 URL 을 통해서만
 * 일어납니다. public=true 버킷의 **읽기**는 RLS 가 아니라 Storage API 의 공개
 * 경로로 처리되므로 정책 없이도 동작합니다.
 *
 * 버킷의 file_size_limit / allowed_mime_types 는 애플리케이션 검증이 뚫렸을
 * 때의 최후 방어선입니다. 앱에서도 같은 검사를 하지만 여기서도 겁니다.
 */
