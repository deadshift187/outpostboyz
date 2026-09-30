-- RUN THE BOARD: player category requests ("Suggest a category" on the category-pick screen).
-- Applied to project duogqviqgmbaynfrhrmq on 2026-09-30 as migration trivia_requests.
--
-- Anyone (anon or signed in) may INSERT a request: category (2-60 chars), optional note (<=280), optional email (<=120).
-- Nobody but the database owner / service_role can READ: no select policy, no select grant.
-- Rate limit (BEFORE INSERT trigger): max 5 per client per hour, 300 per hour site-wide. The client is identified by a
-- salted md5 of the request IP (PostgREST x-forwarded-for) -- the raw IP is never stored.
--
-- Saint reads them in the Supabase SQL editor:
--   select * from public.trivia_requests_admin;          -- newest first
--   select * from public.trivia_request_counts;          -- most-requested categories
--   update public.trivia_requests set handled = true where id = 123;   -- mark one done

create table if not exists public.trivia_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  game        text not null default 'run-the-board',
  category    text not null,
  note        text,
  email       text,
  client_hash text,
  handled     boolean not null default false,
  constraint trivia_requests_category_len check (char_length(btrim(category)) between 2 and 60),
  constraint trivia_requests_note_len     check (note is null or char_length(note) <= 280),
  constraint trivia_requests_email_len    check (email is null or (char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  constraint trivia_requests_game_len     check (char_length(game) <= 40)
);
create index if not exists trivia_requests_created on public.trivia_requests (created_at desc);
create index if not exists trivia_requests_client  on public.trivia_requests (client_hash, created_at desc);

alter table public.trivia_requests enable row level security;

-- Column-level grants: the public can only ever write these three fields (id/created_at/handled/client_hash are server-set).
revoke all on public.trivia_requests from anon, authenticated;
grant insert (category, note, email) on public.trivia_requests to anon, authenticated;

drop policy if exists trivia_requests_insert_anyone on public.trivia_requests;
create policy trivia_requests_insert_anyone on public.trivia_requests
  for insert to anon, authenticated
  with check (
    char_length(btrim(category)) between 2 and 60
    and (note is null or char_length(note) <= 280)
    and (email is null or char_length(email) <= 120)
    and handled = false
  );

create or replace function public.trivia_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hdrs jsonb;
  ip text;
begin
  begin
    hdrs := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    hdrs := '{}'::jsonb;
  end;
  ip := btrim(split_part(coalesce(hdrs->>'x-forwarded-for', hdrs->>'x-real-ip', ''), ',', 1));

  -- server-set fields (the client can't choose these)
  new.created_at  := now();
  new.handled     := false;
  new.game        := 'run-the-board';
  new.category    := btrim(regexp_replace(new.category, '\s+', ' ', 'g'));
  new.note        := nullif(btrim(new.note), '');
  new.email       := nullif(lower(btrim(new.email)), '');
  new.client_hash := case when ip = '' then null else md5('rtb-requests:' || ip) end;

  if new.client_hash is not null and (
       select count(*) from public.trivia_requests r
        where r.client_hash = new.client_hash and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.trivia_requests r where r.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.trivia_requests_guard() from public, anon, authenticated;

drop trigger if exists trivia_requests_guard on public.trivia_requests;
create trigger trivia_requests_guard
  before insert on public.trivia_requests
  for each row execute function public.trivia_requests_guard();

-- Admin reading views (security_invoker + no grants to anon/authenticated = invisible to the public API).
create or replace view public.trivia_requests_admin with (security_invoker = on) as
  select id, created_at at time zone 'America/Los_Angeles' as created_la, category, note, email, handled
    from public.trivia_requests
   order by created_at desc;

create or replace view public.trivia_request_counts with (security_invoker = on) as
  select lower(category) as category, count(*) as requests, max(created_at) as last_requested,
         count(*) filter (where not handled) as open
    from public.trivia_requests
   group by lower(category)
   order by count(*) desc, max(created_at) desc;

revoke all on public.trivia_requests_admin from anon, authenticated;
revoke all on public.trivia_request_counts from anon, authenticated;
