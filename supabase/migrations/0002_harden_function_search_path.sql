-- ============================================================================
-- 함수 search_path 고정
--
-- Supabase 보안 린터(function_search_path_mutable, WARN)가 잡아낸 것입니다.
--
-- search_path 를 고정하지 않은 함수는 호출자의 search_path 를 그대로 씁니다.
-- 트리거 함수는 테이블 소유자 권한 맥락에서 도는데, 공격자가 search_path 앞쪽
-- 스키마에 같은 이름의 객체(예: gallery_posts 뷰나 count 함수)를 만들 수 있으면
-- 함수 본문이 그쪽을 참조하게 만들 수 있습니다.
--
-- 이 프로젝트에서 당장 악용 경로가 있는 건 아닙니다 — anon 은 public 에 객체를
-- 만들 권한이 없습니다. 다만 비용이 한 줄이고, 나중에 스키마 권한을 한 번
-- 느슨하게 푸는 순간 조용히 뚫리는 종류라 지금 닫아둡니다.
--
-- search_path = '' 로 두면 pg_catalog 만 암묵적으로 남습니다. 따라서 본문의
-- 애플리케이션 테이블 참조는 전부 스키마 수식이 필요하고, now()/count()/unnest()
-- 같은 내장 함수는 그대로 쓸 수 있습니다.
-- ============================================================================

-- 본문이 내장 함수만 쓰므로 search_path 만 고정하면 됩니다.
alter function public.set_updated_at() set search_path = '';
alter function public.max_element_length(text[]) set search_path = '';

-- 아래 둘은 애플리케이션 테이블을 참조하므로 본문에 스키마 수식이 필요합니다.
create or replace function public.sync_reaction_count()
  returns trigger language plpgsql
  set search_path = ''
as $$
declare
  pid uuid := coalesce(new.gallery_post_id, old.gallery_post_id);
begin
  update public.gallery_posts
     set reaction_count = (
           select count(*) from public.reactions where gallery_post_id = pid
         )
   where id = pid;
  return null;
end $$;

create or replace function public.sync_comment_count()
  returns trigger language plpgsql
  set search_path = ''
as $$
declare
  pid uuid := coalesce(new.gallery_post_id, old.gallery_post_id);
begin
  update public.gallery_posts
     set comment_count = (
           select count(*) from public.comments
            where gallery_post_id = pid and deleted_at is null
         )
   where id = pid;
  return null;
end $$;

-- CREATE OR REPLACE 는 기존 권한을 유지하므로 0001 의 revoke 가 그대로 살아
-- 있지만, 새로 만들어졌을 가능성에 대비해 한 번 더 회수합니다.
revoke all on all functions in schema public from anon, authenticated;
