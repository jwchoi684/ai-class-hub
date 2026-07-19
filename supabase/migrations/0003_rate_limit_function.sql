-- ============================================================================
-- 레이트 리밋 카운터
--
-- 왜 DB 함수인가: 읽고-더하고-쓰기를 애플리케이션에서 하면 동시 요청 사이에
-- 경합이 생겨 카운트가 새어 나갑니다. 무차별 대입을 막겠다는 장치가 정작
-- 무차별 대입(=동시 요청 폭주) 상황에서 헐거워지는 셈입니다.
-- INSERT ... ON CONFLICT DO UPDATE 는 원자적이라 그 창이 없습니다.
--
-- 왜 Postgres 인가: Vercel 은 인스턴스가 여러 개이고 콜드스타트로 사라지므로
-- 인메모리 카운터는 무의미합니다. Upstash Redis 를 붙이면 무료 티어를 벗어나고,
-- 이 규모에서는 테이블 하나로 충분합니다.
--
-- 고정 윈도우 방식입니다. 경계에서 최대 2배까지 통과할 수 있다는 약점이 있지만,
-- 슬라이딩 윈도우의 복잡도를 짊어질 이유가 없습니다 — 여기서 막으려는 것은
-- 정교한 공격자가 아니라 스크립트와 반복 시도이고, 그건 고정 윈도우로도
-- 충분히 느려집니다.
-- ============================================================================

create function public.consume_rate_limit(
  p_bucket         text,
  p_window_seconds integer
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  -- 현재 시각을 윈도우 크기로 내림해서 같은 윈도우의 요청이 한 행에 모이게 합니다.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, count, expires_at)
  values (
    p_bucket,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end $$;

-- 만료된 카운터 정리. 놔두면 이 테이블만 계속 자랍니다.
-- 호출은 애플리케이션이 가끔(로그인 시도 등) 곁다리로 합니다 — 이 규모에
-- 크론을 따로 붙일 이유가 없습니다.
create function public.sweep_rate_limits() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- security definer 함수는 소유자 권한으로 돌므로 실행 권한을 반드시 좁혀야
-- 합니다. 이 앱은 anon key 를 브라우저에 내려보내지 않으므로 service_role 만
-- 있으면 됩니다.
revoke all on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
revoke all on function public.sweep_rate_limits() from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer) to service_role;
grant execute on function public.sweep_rate_limits() to service_role;
