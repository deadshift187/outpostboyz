-- $100 BOUNTY (SAVE LOST ANGELES) — record of what was applied to project duogqviqgmbaynfrhrmq on 2026-09-29
-- via three migrations: bounty_entries_claims, bounty_claims_rate_limit, bounty_wins_revoke_truncate.
-- Every write goes through edge functions (service role): bounty-enter, bounty-claim, bounty-admin.
-- Clients can only READ their own rows (bounty_winners is public). No insert/update/delete policies on purpose.

create table public.bounty_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text not null check (game_slug ~ '^[a-z0-9-]{1,40}$'),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  attest_adult boolean not null check (attest_adult),
  attest_resident boolean not null check (attest_resident),
  rules_version text not null check (char_length(rules_version) between 1 and 40),
  entered_at timestamptz not null default now(),
  unique (user_id, game_slug)
);

create table public.bounty_claims (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.bounty_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text not null check (game_slug ~ '^[a-z0-9-]{1,40}$'),
  video_url text not null check (char_length(video_url) between 12 and 500 and video_url ~ '^https://'),
  run_time text check (run_time is null or char_length(run_time) <= 20),
  notes text check (notes is null or char_length(notes) <= 1000),
  attest_run boolean not null check (attest_run),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index bounty_claims_one_winner on public.bounty_claims (game_slug) where status = 'approved';
create index bounty_claims_user_created on public.bounty_claims (user_id, created_at desc);
create index bounty_claims_entry on public.bounty_claims (entry_id);
create index bounty_claims_reviewed_by on public.bounty_claims (reviewed_by);
create index bounty_claims_slug_status on public.bounty_claims (game_slug, status, created_at);

create table public.bounty_winners (
  game_slug text primary key check (game_slug ~ '^[a-z0-9-]{1,40}$'),
  gamertag text not null check (char_length(gamertag) between 1 and 40),
  claim_id bigint unique references public.bounty_claims(id) on delete set null,
  won_at timestamptz not null default now()
);

create table public.bounty_notify (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text not null check (game_slug ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

alter table public.bounty_entries enable row level security;
alter table public.bounty_claims  enable row level security;
alter table public.bounty_winners enable row level security;
alter table public.bounty_notify  enable row level security;

create policy bounty_entries_read_own on public.bounty_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy bounty_claims_read_own  on public.bounty_claims  for select to authenticated using ((select auth.uid()) = user_id);
create policy bounty_notify_read_own  on public.bounty_notify  for select to authenticated using ((select auth.uid()) = user_id);
create policy bounty_winners_public_read on public.bounty_winners for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.bounty_entries, public.bounty_claims, public.bounty_winners, public.bounty_notify from anon, authenticated;
revoke all on public.bounty_entries, public.bounty_claims, public.bounty_notify from anon;

-- 'ok' | 'crew' (admin) | 'comped' (any access grant) | 'not_owner' | 'no_gamertag'. Server-side only.
create or replace function public.bounty_eligibility(p_user uuid, p_slug text)
returns text language sql stable set search_path = '' as $$
  select case
    when exists (select 1 from public.admins where user_id = p_user) then 'crew'
    when exists (select 1 from public.access_grants where user_id = p_user) then 'comped'
    when not exists (select 1 from public.purchases where user_id = p_user and game_slug = p_slug) then 'not_owner'
    when not exists (select 1 from public.profiles where id = p_user) then 'no_gamertag'
    else 'ok'
  end;
$$;
revoke execute on function public.bounty_eligibility(uuid, text) from public, anon, authenticated;
grant execute on function public.bounty_eligibility(uuid, text) to service_role;

-- Hard cap: 3 claims per user per 24h, serialized per user.
create or replace function public.guard_bounty_claim_rate()
returns trigger language plpgsql set search_path = '' as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('bounty_claim:' || new.user_id::text));
  select count(*) into n from public.bounty_claims
   where user_id = new.user_id and created_at > now() - interval '24 hours';
  if n >= 3 then raise exception 'bounty_claim_rate' using errcode = 'P0001'; end if;
  return new;
end;
$$;
revoke execute on function public.guard_bounty_claim_rate() from public, anon, authenticated;
create trigger bounty_claims_rate before insert on public.bounty_claims
  for each row execute function public.guard_bounty_claim_rate();

-- Legacy claim table: clients keep read-own only.
revoke insert, update, delete, truncate on public.bounty_wins from anon, authenticated;
comment on table public.bounty_wins is 'LEGACY (pre-2026-09-29). Real claims live in bounty_claims via the bounty-claim edge function.';
