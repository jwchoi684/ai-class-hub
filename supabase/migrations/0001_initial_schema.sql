-- ============================================================================
-- AI 수업 허브 — 초기 스키마
--
-- 설계 근거는 docs/REQUIREMENTS.md 에 있습니다. 여기서는 "왜 이렇게 됐는지"가
-- 나중에 스키마만 보고도 읽히도록 결정이 갈렸던 지점에만 주석을 답니다.
--
-- 두 가지 전제가 이 파일 전체를 관통합니다.
--   1. 로그인이 없다. 모든 방문자가 동일한 anon role 이라 RLS 로는 "운영자만"
--      이나 "PIN 을 아는 사람만"을 표현할 수 없다. 그래서 RLS 는 전면 거부로
--      두고 모든 접근을 서버(service_role) 뒤에 둔다.
--   2. 무료 플랜에는 복원 가능한 백업이 없다. 그래서 아무것도 물리 삭제하지
--      않는다. 잘못 누른 삭제가 곧 영구 손실이면 아무도 이 도구를 믿지 않는다.
-- ============================================================================

-- ── 공용 헬퍼 ──────────────────────────────────────────────────────────────

-- updated_at 자동 갱신.
--
-- DEFAULT now() 는 INSERT 에만 걸립니다. 트리거가 없으면 모든 UPDATE 문이
-- 손으로 `set updated_at = now()` 를 빠짐없이 써야 하고, 한 곳만 빠뜨리면
-- 갤러리 카드에 '수정됨: (생성 시각)' 이 뜨거나 '비밀번호 마지막 교체 시각'이
-- 틀립니다. 빠뜨렸다는 사실 자체를 눈치채기 어려운 종류의 버그입니다.
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 배열 원소의 최대 길이. CHECK 제약 안에서는 서브쿼리를 쓸 수 없고
-- array_to_string 은 STABLE 이라(확인함) 쓸 수 없어서 IMMUTABLE 함수가 필요합니다.
create function max_element_length(arr text[]) returns integer
  language sql immutable parallel safe as $$
  select coalesce(max(char_length(t)), 0) from unnest(arr) as t
$$;

-- ── 사이트 전역 설정 ────────────────────────────────────────────────────────
-- 클래스명과 QR 기준 주소를 코드에 하드코딩하면 오타 하나에 재배포가 필요합니다.
create table site_settings (
  id           smallint primary key default 1 check (id = 1),
  class_name   text        not null default 'AI 실전 클래스',
  base_url     text,
  -- 수업이 끝나면 켭니다. 켜지면 운영자 세션이 없는 모든 요청이 종료 안내로
  -- 돌아갑니다 — 관리자가 손을 뗀 사이트가 수강생 결과물을 영구 공개한 채로
  -- 남는 것을 막는 스위치입니다.
  archive_mode boolean     not null default false,
  updated_at   timestamptz not null default now(),

  constraint site_settings_class_name_len check (char_length(class_name) between 1 and 60),
  constraint site_settings_base_url_len   check (char_length(coalesce(base_url, '')) <= 2048)
);

create trigger site_settings_set_updated_at before update on site_settings
  for each row execute function set_updated_at();

insert into site_settings (id) values (1);

-- ── 회차 ───────────────────────────────────────────────────────────────────
create table class_sessions (
  id           uuid primary key default gen_random_uuid(),
  order_no     integer     not null,
  title        text        not null,
  description  text,
  held_on      date,
  is_published boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint class_sessions_order_no_range check (order_no between 1 and 999),
  constraint class_sessions_title_len      check (char_length(title) between 1 and 200),
  constraint class_sessions_desc_len       check (char_length(coalesce(description, '')) <= 2000)
);

create trigger class_sessions_set_updated_at before update on class_sessions
  for each row execute function set_updated_at();

-- 번호는 한 번 쓰면 재사용하지 않습니다.
--
-- 주소가 /weeks/3 형태라 단톡방에 뿌린 링크가 오래 살아 있습니다. 삭제된 회차의
-- 번호를 재사용하면 예전에 공유한 '3주차 자료' 링크가 어느 날 전혀 다른 회차를
-- 가리킵니다. 그래서 유니크 범위에서 소프트 삭제분을 빼지 않습니다.
--
-- DEFERRABLE 인 이유: 3주차와 4주차를 맞바꾸는 순간 중간 상태가 유니크를
-- 위반합니다. 트랜잭션 끝에서 검사하게 두면 임시값을 경유하지 않아도 됩니다.
--
-- 다만 기본값은 IMMEDIATE 입니다. INITIALLY DEFERRED 로 두면 평범한 중복 INSERT
-- 도 COMMIT 에서야 터져서 어느 문장이 원인인지 잃고, 사용자에게 친절한 에러를
-- 주기 어렵습니다. DEFERRED 가 실제로 필요한 곳은 순서 맞바꾸기 한 곳뿐이니
-- 거기서만 `set constraints class_sessions_order_no_key deferred` 를 씁니다.
--
-- 주의: DEFERRABLE 인 이상 INITIALLY 상태와 무관하게 이 제약은 ON CONFLICT 의
-- arbiter 로 쓸 수 없습니다. 멱등 INSERT 는 `where not exists` 로 하세요.
alter table class_sessions
  add constraint class_sessions_order_no_key unique (order_no)
  deferrable initially immediate;

create index class_sessions_listing_idx
  on class_sessions (order_no) where deleted_at is null;

-- ── 외부 링크 미리보기 캐시 ────────────────────────────────────────────────
-- URL 당 1행으로 합칩니다. 외부 fetch 횟수(= SSRF 노출 표면)와 Storage 용량이
-- 동시에 줄어듭니다. 가져온 og:image 는 핫링크하지 않고 우리 Storage 로 복사해
-- 두는데, 방문자 IP 가 외부 사이트로 새는 것과 나중에 이미지가 바뀌는 것을
-- 함께 막기 위해서입니다.
create table link_previews (
  id                  uuid primary key default gen_random_uuid(),
  url_hash            text        not null unique,
  normalized_url      text        not null,
  title               text,
  description         text,
  og_image_source_url text,
  og_image_path       text,
  -- pending: 가져오는 중 / ok: 성공 / failed: 실패(폴백 카드로 표시)
  status              text        not null default 'pending'
                        check (status in ('pending', 'ok', 'failed')),
  error_code          text,
  fetched_at          timestamptz,
  expires_at          timestamptz
);

-- ── 강의 자료 ──────────────────────────────────────────────────────────────
-- 파일과 외부 링크를 한 테이블에 둡니다. 따로 쪼개면 회차 안에서의 정렬 순서를
-- 하나의 리스트로 관리할 수 없습니다.
create table materials (
  id               uuid primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT: 콘솔에서 실수로 회차를 DELETE 해도 자료가 딸려
  -- 사라지지 않도록 DB 차원에서 막습니다. 삭제는 항상 deleted_at 으로.
  class_session_id uuid        not null references class_sessions (id) on delete restrict,
  kind             text        not null check (kind in ('file', 'link')),
  title            text        not null,
  description      text,
  external_url     text,
  storage_path     text,
  file_name        text,
  mime_type        text,
  file_size_bytes  bigint,
  link_preview_id  uuid        references link_previews (id) on delete set null,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  -- kind 와 실제 채워진 컬럼이 어긋나면 화면에서 빈 링크나 죽은 다운로드
  -- 버튼으로 드러납니다. 애플리케이션 분기에 맡기지 않고 여기서 막습니다.
  constraint materials_kind_shape check (
    (kind = 'link' and external_url is not null and storage_path is null) or
    (kind = 'file' and storage_path is not null and external_url is null)
  ),
  constraint materials_title_len check (char_length(title) between 1 and 200),
  constraint materials_desc_len  check (char_length(coalesce(description, '')) <= 2000),
  constraint materials_url_len   check (char_length(coalesce(external_url, '')) <= 2048),
  constraint materials_size_sane check (file_size_bytes is null or file_size_bytes between 0 and 52428800)
);

create trigger materials_set_updated_at before update on materials
  for each row execute function set_updated_at();

create index materials_by_session_idx
  on materials (class_session_id, sort_order, created_at, id)
  where deleted_at is null;

-- ── 수강생 결과물 ──────────────────────────────────────────────────────────
create table gallery_posts (
  -- 기본값을 두지 않습니다. 클라이언트가 폼에 진입할 때 uuid 를 만들어 보내고
  -- 서버는 ON CONFLICT DO NOTHING 으로 받습니다. [올리기] 더블 클릭이나
  -- 모바일에서 업로드 지연 중 재시도해도 같은 결과물이 두 개 생기지 않습니다.
  id                  uuid primary key,

  -- 회차가 소프트 삭제돼도 이 값은 건드리지 않습니다. 조회 계층에서 '미분류'로
  -- 표시하고, 회차를 복구하면 그대로 되돌아옵니다.
  class_session_id    uuid        references class_sessions (id) on delete restrict,
  kind                text        not null check (kind in ('link', 'image')),
  title               text        not null,
  description         text,

  author_nickname     text        not null,
  -- 평문 저장 금지. 4자리는 탐색 공간이 1만뿐이라 해시만으로는 부족하고,
  -- 아래 잠금 카운터와 서버의 레이트리밋이 같이 있어야 의미가 있습니다.
  pin_hash            text        not null,
  pin_algo            text        not null default 'argon2id',
  failed_pin_attempts integer     not null default 0,
  pin_locked_until    timestamptz,

  external_url        text,
  -- 대표 이미지 1장만. 카드 그리드는 어차피 썸네일 한 장만 쓰고, 다중 이미지는
  -- 캐러셀·순서 변경·다중 진행률을 전부 끌고 옵니다. 필요해지면 자식 테이블을
  -- 추가하는 마이그레이션으로 옮기면 됩니다.
  image_path          text,
  thumb_path          text,
  image_width         integer,
  image_height        integer,
  image_bytes         bigint,
  -- 소프트 삭제와 별개로 이미지 '파일'은 삭제 요청 시 즉시 물리 삭제합니다.
  -- 화면에서만 사라지고 파일 주소가 살아 있으면 "지워주세요" 요청의 의미가
  -- 없어지기 때문입니다. 이 값이 채워져 있으면 복구해도 썸네일은 못 돌아옵니다.
  media_purged_at     timestamptz,
  link_preview_id     uuid        references link_previews (id) on delete set null,
  -- OG 추출이 실패했을 때 쓰는 사용자 업로드 이미지. 링크 결과물의 절반 이상은
  -- 쓸만한 og:image 가 없다는 전제로 설계했습니다.
  fallback_image_path text,

  tags                text[]      not null default '{}',
  reaction_count      integer     not null default 0,
  comment_count       integer     not null default 0,

  -- 소유권 판정의 단일 기준. 서명된 __Host-visitor 쿠키의 값이며, 같은
  -- 브라우저에서는 이 값만으로 통과시켜 PIN 을 묻지 않습니다.
  visitor_id          uuid        not null,

  -- created_ip_hash 컬럼은 두지 않습니다.
  --
  -- 솔트 없는 IPv4 해시는 익명화가 아닙니다. 공간이 2^32 뿐이라 노트북으로
  -- 몇 분이면 전수 대조가 끝나고, 대상이 20명이면 강의실·집 IP 후보 몇 개만
  -- 넣어봐도 익명 게시물의 작성자가 특정됩니다. 주간 pg_dump 백업이 그 값을
  -- 저장소로 나른다는 점까지 겹칩니다.
  -- 남용 방어는 rate_limits 가 이미 하므로 IP 를 남겨서 얻는 실익이 없습니다.

  is_pinned           boolean     not null default false,
  search_text         text generated always as (
                        title || ' ' || coalesce(description, '') || ' ' || author_nickname
                      ) stored,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  deleted_by          text,

  -- 태그는 최대 5개. 자유 입력이라 제한이 없으면 카드가 태그로 뒤덮입니다.
  constraint gallery_posts_tags_limit check (cardinality(tags) <= 5),
  constraint gallery_posts_kind_shape check (
    (kind = 'link'  and external_url is not null and image_path is null) or
    (kind = 'image' and image_path   is not null and external_url is null)
  ),

  /*
   * 길이 제한 — 이 테이블에서 가장 중요한 제약입니다.
   *
   * 로그인이 없어서 주소만 알면 누구나 이 테이블에 INSERT 하는 라우트를
   * 호출합니다. 길이 제한이 없으면 스크립트로 수 MB 문자열을 반복 POST 해
   * 500MB 무료 DB 를 채울 수 있고, 여기서 세 가지가 겹쳐 되돌리기 어렵습니다:
   * 설계상 아무것도 물리 삭제하지 않아 공간이 회수되지 않고, 복원 가능한
   * 백업이 없으며, search_text 가 STORED 라 본문이 두 번 저장됩니다.
   *
   * 정원이 20명인 것과는 무관합니다 — 쓰기 엔드포인트는 인터넷 전체에
   * 열려 있습니다. 데이터가 들어오기 전인 지금이 제약을 붙이는 유일하게
   * 공짜인 시점입니다. 나중에는 위반 데이터 때문에 ADD CONSTRAINT 가
   * 검증 단계에서 실패합니다.
   */
  constraint gallery_posts_title_len check (char_length(title) between 1 and 120),
  constraint gallery_posts_desc_len  check (char_length(coalesce(description, '')) <= 2000),
  constraint gallery_posts_nick_len  check (char_length(author_nickname) between 1 and 30),
  constraint gallery_posts_url_len   check (char_length(coalesce(external_url, '')) <= 2048),
  constraint gallery_posts_tag_len   check (max_element_length(tags) <= 20),
  constraint gallery_posts_counts_nonneg check (reaction_count >= 0 and comment_count >= 0),
  constraint gallery_posts_bytes_sane    check (image_bytes is null or image_bytes between 0 and 10485760)
);

create trigger gallery_posts_set_updated_at before update on gallery_posts
  for each row execute function set_updated_at();

-- 갤러리 기본 정렬(최신순) + 커서 페이지네이션용. 정렬 키와 타이브레이커를
-- 함께 인덱싱해야 (created_at, id) 커서가 인덱스만으로 처리됩니다.
create index gallery_posts_recent_idx
  on gallery_posts (created_at desc, id desc) where deleted_at is null;

-- 커서 정렬 키에는 항상 id 를 마지막에 붙입니다. 같은 시각에 만들어진 행이
-- 있으면 타이브레이커 없이는 페이지 경계에서 행을 건너뛰거나 중복시킵니다.
create index gallery_posts_by_session_idx
  on gallery_posts (class_session_id, created_at desc, id desc) where deleted_at is null;

create index gallery_posts_hot_idx
  on gallery_posts (reaction_count desc, created_at desc, id desc) where deleted_at is null;

create index gallery_posts_tags_idx on gallery_posts using gin (tags);

-- 검색 인덱스는 두지 않습니다.
--
-- 트라이그램 GIN 을 넣었다가 뺐습니다. 이 규모(100행 안팎)에서는 옵티마이저가
-- 어차피 Seq Scan 을 고르고 — 전체가 몇 페이지뿐이라 그게 실제로 더 빠릅니다 —
-- 게다가 트라이그램은 원리상 3글자 미만을 색인하지 못해 'AI', '웹' 같은 두 글자
-- 검색은 후보에도 들지 못합니다. 이 앱에서 가장 흔할 검색어 길이입니다.
-- 인덱스를 뺀 덕에 pg_trgm 확장 의존성도 함께 사라졌습니다.
--
-- 검색은 `search_text ilike '%' || q || '%'` 로 충분합니다. 결과물이 수백 개를
-- 넘어가면 그때 다시 재는 게 맞습니다(검색 자체가 P2 입니다).

-- 같은 사람이 올린 결과물을 찾을 때. 본인 글 목록에도 씁니다.
create index gallery_posts_visitor_idx on gallery_posts (visitor_id);

-- 읽기 경로는 항상 이 뷰만 조회합니다.
--
-- 'select *' 실수 한 번으로 전원의 PIN 해시가 브라우저로 내려가는 사고가
-- Supabase 에서 가장 흔합니다. 이 뷰는 **읽기 경로의 기본값을 안전하게** 만듭니다.
-- 다만 서버는 service_role 로 기반 테이블도 읽을 수 있으므로, 이 뷰가 우회를
-- 물리적으로 막아주지는 않습니다 — 기반 테이블 직접 조회 금지는 코드 리뷰로
-- 강제해야 합니다. 스키마가 대신해 주는 것으로 착각하지 마세요.
create view gallery_posts_public
  with (security_invoker = true) as
select
  id, class_session_id, kind, title, description, author_nickname,
  external_url, image_path, thumb_path, image_width, image_height,
  link_preview_id, fallback_image_path, tags,
  reaction_count, comment_count, is_pinned,
  created_at, updated_at
from gallery_posts
where deleted_at is null;

-- ── 댓글 ───────────────────────────────────────────────────────────────────
-- 게시물과 달리 PIN 을 받지 않습니다. 댓글은 잃을 것이 적고, 피드백에 마찰을
-- 두는 것이 이 앱에서 가장 아까운 선택입니다. 소유권은 visitor 쿠키로,
-- 쿠키를 지운 사용자는 운영자 삭제로 커버합니다.
create table comments (
  id              uuid primary key default gen_random_uuid(),
  gallery_post_id uuid        not null references gallery_posts (id) on delete restrict,
  author_nickname text        not null,
  body            text        not null,
  visitor_id      uuid        not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      text,

  -- gallery_posts 와 같은 이유. 무인증 공개 쓰기 경로입니다.
  constraint comments_body_len check (char_length(body) between 1 and 1000),
  constraint comments_nick_len check (char_length(author_nickname) between 1 and 30)
);

create index comments_by_post_idx
  on comments (gallery_post_id, created_at, id) where deleted_at is null;

-- ── 이모지 반응 ────────────────────────────────────────────────────────────
-- 유니크의 주체를 무엇으로 잡느냐가 전부입니다. IP 로 잡으면 같은 강의실
-- 와이파이(NAT) 뒤의 수강생끼리 서로의 반응을 막아버립니다. 반드시 서명된
-- visitor 쿠키여야 합니다.
--
-- 4종으로 고정한 이유: 종류가 늘면 모바일에서 44px 터치 타깃을 유지하기 어렵고,
-- 카운트가 흩어져 '반응 많은 순' 정렬이 흐릿해집니다. 추가는 CHECK 한 줄입니다.
--
-- FK 가 RESTRICT 인 이유: 나머지 FK 와 맞춥니다. CASCADE 로 두면 댓글이 0개인
-- 게시물(초기에는 대부분입니다)을 Supabase 콘솔에서 실수로 DELETE 할 때 아무것도
-- 막지 못하고 반응까지 조용히 함께 사라집니다. 복원 백업이 없는 전제 위에서는
-- 그게 곧 영구 손실이고, 정확히 이 스키마가 막겠다고 선언한 사고 유형입니다.
--
-- 반응 취소(하트 다시 누르기)는 이 테이블에서 행을 물리 삭제하는 것이 의도된
-- 동작입니다 — 소프트 삭제 원칙의 명시적 예외입니다.
create table reactions (
  gallery_post_id uuid        not null references gallery_posts (id) on delete restrict,
  visitor_id      uuid        not null,
  emoji_code      text        not null check (emoji_code in ('heart', 'fire', 'clap', 'wow')),
  created_at      timestamptz not null default now(),
  primary key (gallery_post_id, visitor_id, emoji_code)
);

-- ── 카운터 동기화 ──────────────────────────────────────────────────────────
--
-- reaction_count / comment_count 는 비정규화 컬럼입니다. 애플리케이션이 별도
-- 문장으로 증감시키면 한 번만 어긋나도 카드 숫자와 '반응 많은 순' 정렬이 조용히
-- 틀리고, 틀렸다는 사실을 알아챌 방법이 없습니다.
--
-- 그래서 증분이 아니라 재계산합니다. 이 규모에서 COUNT 는 무시할 수 있는
-- 비용이고, 드리프트가 누적되지 않아 자가 치유됩니다.
create function sync_reaction_count() returns trigger language plpgsql as $$
declare
  pid uuid := coalesce(new.gallery_post_id, old.gallery_post_id);
begin
  update gallery_posts
     set reaction_count = (select count(*) from reactions where gallery_post_id = pid)
   where id = pid;
  return null;
end $$;

create trigger reactions_count_sync
  after insert or delete on reactions
  for each row execute function sync_reaction_count();

create function sync_comment_count() returns trigger language plpgsql as $$
declare
  pid uuid := coalesce(new.gallery_post_id, old.gallery_post_id);
begin
  update gallery_posts
     set comment_count = (
           select count(*) from comments
            where gallery_post_id = pid and deleted_at is null
         )
   where id = pid;
  return null;
end $$;

-- 댓글은 소프트 삭제라 deleted_at 변경도 카운트에 반영돼야 합니다.
create trigger comments_count_sync
  after insert or delete or update of deleted_at on comments
  for each row execute function sync_comment_count();

-- ── 공지 배너 ──────────────────────────────────────────────────────────────
-- 단일 행 덮어쓰기 대신 여러 행 + 활성 1건. 지난 공지가 남아 있으면 "지난주에
-- 뭐 가져오라고 했더라"에 답할 수 있습니다.
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  body       text        not null,
  link_url   text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint announcements_body_len check (char_length(body) between 1 and 500),
  constraint announcements_link_len check (char_length(coalesce(link_url, '')) <= 2048)
);

create trigger announcements_set_updated_at before update on announcements
  for each row execute function set_updated_at();

create unique index announcements_single_active_idx
  on announcements ((true)) where is_active;

-- ── 운영자 인증 ────────────────────────────────────────────────────────────
-- 환경변수가 아니라 DB 에 두는 이유: 비밀번호 변경에 재배포가 필요하면 강사는
-- 결국 비밀번호를 바꾸지 않습니다. 수업 10분 전 강의장에서 폰으로 Vercel 을
-- 재배포하는 상황은 현실적이지 않습니다.
create table admin_credential (
  id               smallint primary key default 1 check (id = 1),
  password_hash    text        not null,
  algo             text        not null default 'argon2id',
  -- 비밀번호를 바꾸면 이 값이 올라가고, 값이 다른 기존 세션은 즉시 무효가
  -- 됩니다. 강의실 PC 에 남은 세션을 원격으로 끊는 수단입니다.
  password_version integer     not null default 1,
  updated_at       timestamptz not null default now()
);

create trigger admin_credential_set_updated_at before update on admin_credential
  for each row execute function set_updated_at();

-- 무상태 JWT 가 아니라 서버 저장 불투명 토큰입니다. 강사가 프로젝터에 연결된
-- PC 에서 로그인할 가능성이 높고, 그 세션을 나중에 폐기할 수 있어야 합니다.
-- 20명 규모에서 조회 한 번의 비용은 무시할 수 있습니다.
create table admin_sessions (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text        not null unique,
  password_version integer     not null,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  user_agent       text,
  ip_hash          text
);

create index admin_sessions_expiry_idx on admin_sessions (expires_at);

-- ── 레이트 리밋 ────────────────────────────────────────────────────────────
-- Vercel 은 인스턴스가 여러 개이고 콜드스타트로 사라지므로 인메모리 카운터는
-- 무의미합니다. 반드시 공유 저장소여야 하고, 이 규모면 테이블 하나로 충분합니다.
create table rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  expires_at   timestamptz not null,
  primary key (bucket, window_start)
);

create index rate_limits_expiry_idx on rate_limits (expires_at);

-- ── 감사 로그 ──────────────────────────────────────────────────────────────
-- 로그인이 없는 앱에서 '누가 지웠나'를 사후에 확인할 유일한 수단이고,
-- PIN 무차별 대입 시도를 발견하는 채널입니다.
-- meta 는 크기를 제한합니다. 여기에 요청 본문을 통째로 넣는 실수가 흔하고,
-- 그러면 감사 로그가 무료 DB 를 채우는 경로가 됩니다.
-- ip_hash 를 채운다면 반드시 ADMIN_PEPPER 로 HMAC 한 값이어야 합니다.
-- 솔트 없는 IP 해시는 익명화가 아니라 그냥 IP 입니다.
create table audit_log (
  id          bigint generated always as identity primary key,
  action      text        not null,
  actor       text        not null,
  target_type text,
  target_id   uuid,
  meta        jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now(),

  constraint audit_log_meta_size check (meta is null or octet_length(meta::text) <= 4096)
);

create index audit_log_recent_idx on audit_log (created_at desc);

-- ── 업로드 의도 ────────────────────────────────────────────────────────────
-- Vercel 함수 바디 상한이 4.5MB 라 30MB PDF 를 서버로 프록시하는 설계는 처음부터
-- 불가능합니다. 그래서 서명 URL 로 브라우저가 Storage 에 직접 올리는데, 그러면
-- 서버가 바이트를 못 봅니다. 이 테이블이 '서버가 허가한 경로'를 기록해 두어야
-- 커밋 단계에서 임의 경로를 주장하는 요청을 걸러낼 수 있습니다.
create table upload_intents (
  id            uuid primary key default gen_random_uuid(),
  purpose       text        not null check (purpose in ('material', 'gallery', 'link-preview')),
  staging_path  text        not null,
  declared_mime text,
  declared_size bigint,
  requires_admin boolean    not null default false,
  status        text        not null default 'pending'
                  check (status in ('pending', 'committed', 'rejected', 'expired')),
  reject_reason text,
  visitor_id    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index upload_intents_expiry_idx on upload_intents (expires_at) where status = 'pending';

-- ── RLS: 전면 거부 ─────────────────────────────────────────────────────────
--
-- 정책을 하나도 만들지 않습니다. RLS 를 켜고 정책이 없으면 anon/authenticated
-- 는 아무것도 못 읽고 못 씁니다. service_role 은 RLS 를 우회하므로 서버 코드만
-- 동작합니다.
--
-- 이게 이 앱에서 가장 중요한 한 줄입니다. 수강생은 devtools 여는 법을 배우는
-- 사람들이고, 튜토리얼대로 `using (true)` 정책을 열어두면 콘솔 한 줄로 갤러리
-- 전체가 지워집니다. 나중에 누군가 편의상 클라이언트에서 supabase-js 를 쓰기
-- 시작하더라도 아무것도 읽히지 않는 것이 안전망입니다.
alter table site_settings    enable row level security;
alter table class_sessions   enable row level security;
alter table link_previews    enable row level security;
alter table materials        enable row level security;
alter table gallery_posts    enable row level security;
alter table comments         enable row level security;
alter table reactions        enable row level security;
alter table announcements    enable row level security;
alter table admin_credential enable row level security;
alter table admin_sessions   enable row level security;
alter table rate_limits      enable row level security;
alter table audit_log        enable row level security;
alter table upload_intents   enable row level security;

-- ── 권한 회수: RLS 에만 의존하지 않는다 ────────────────────────────────────
--
-- 이 프로젝트의 실제 기본값을 확인한 결과입니다:
--
--   pg_default_acl → schema public, tables:
--   {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, ...}
--
-- 즉 public 에 만드는 모든 테이블에 anon 과 authenticated 가 자동으로 전권
-- (INSERT/SELECT/UPDATE/DELETE/TRUNCATE)을 받습니다. 위의 RLS 가 실제 접근을
-- 막아주긴 하지만, 그러면 방어선이 RLS 한 겹뿐입니다. 나중에 누군가 편의상
-- `using (true)` 정책을 하나 열거나 RLS 를 잠깐 끄는 순간 갤러리가 통째로
-- 열립니다 — 그 '잠깐'이 이 앱에서 가장 현실적인 사고 시나리오입니다.
--
-- 이 앱은 anon key 를 브라우저에 내려보내지 않으므로 anon 권한이 애초에 필요
-- 없습니다. 필요 없는 권한은 회수합니다.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 앞으로 추가될 테이블에도 같은 규칙이 자동 적용되게 합니다. 이게 없으면
-- 다음 마이그레이션에서 만든 테이블만 조용히 anon 전권으로 돌아갑니다.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 뷰도 같은 이유로 회수합니다. security_invoker = true 라 호출자 권한으로
-- 기반 테이블 RLS 를 거치지만, 권한 자체를 없애는 편이 확실합니다.
revoke all on gallery_posts_public from anon, authenticated;
