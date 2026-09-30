-- LIVE launch dashboard (/admin/live/) — applied to project duogqviqgmbaynfrhrmq on 2026-09-30
-- as migration admin_live_stats.
-- One SECURITY DEFINER function returns every number the dashboard shows in ONE round trip.
-- Callable ONLY by service_role (the admin-stats edge function); it re-checks public.admins itself
-- and returns NULL for anyone who isn't an admin. Aggregates only: no emails, no user ids.
-- "Today" = America/Los_Angeles calendar day. /admin* page views are excluded (the dashboard itself).

create index if not exists purchases_slug_created on public.purchases (game_slug, created_at desc);
create index if not exists scores_created on public.scores (created_at desc);

create or replace function public.admin_live_stats(p_uid uuid, p_slug text default 'save-lost-angeles')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz constant text := 'America/Los_Angeles';
  t_now timestamptz := now();
  t_day timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  t_h0  timestamptz := date_trunc('hour', now()) - interval '23 hours';
  t_from timestamptz;
  res jsonb;
begin
  if p_uid is null or not exists (select 1 from public.admins a where a.user_id = p_uid) then
    return null;
  end if;
  t_from := least(t_day, t_h0);

  with pv as materialized (
    select v.created_at, v.path, v.device,
           case
             when v.referrer is null or v.referrer = '' then 'direct'
             else lower(regexp_replace(split_part(regexp_replace(v.referrer, '^[a-zA-Z]+://', ''), '/', 1), '^www\.', ''))
           end as ref
      from public.page_views v
     where v.created_at >= t_from
       and v.path !~ '^/admin'
  ),
  pv_today as (select * from pv where created_at >= t_day),
  hours as (select generate_series(t_h0, date_trunc('hour', t_now), interval '1 hour') as h),
  u24 as (select date_trunc('hour', u.created_at) h, count(*) n from auth.users u where u.created_at >= t_h0 group by 1),
  s24 as (select date_trunc('hour', p.created_at) h, count(*) n from public.purchases p
           where p.game_slug = p_slug and p.created_at >= t_h0 group by 1),
  v24 as (select date_trunc('hour', created_at) h, count(*) n from pv where created_at >= t_h0 group by 1)
  select jsonb_build_object(
    'now', t_now,
    'tz', tz,
    'day_start', t_day,
    'views', jsonb_build_object(
      'm5',    (select count(*) from pv where created_at >= t_now - interval '5 minutes'),
      'h1',    (select count(*) from pv where created_at >= t_now - interval '1 hour'),
      'today', (select count(*) from pv_today),
      'mobile_today', (select count(*) from pv_today where device = 'mobile'),
      'desktop_today', (select count(*) from pv_today where device = 'desktop'),
      'sla_page_today', (select count(*) from pv_today where path like '/games/' || p_slug || '%'),
      'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc, path), '[]'::jsonb)
                      from (select path, count(*) n from pv_today group by path order by count(*) desc, path limit 5) t),
      'top_refs',  (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'n', n) order by n desc, ref), '[]'::jsonb)
                      from (select ref, count(*) n from pv_today
                             where ref !~ '(^|\.)outpostboyz\.com$'
                             group by ref order by count(*) desc, ref limit 6) t)
    ),
    'signups', jsonb_build_object(
      'today', (select count(*) from auth.users u where u.created_at >= t_day),
      'h1',    (select count(*) from auth.users u where u.created_at >= t_now - interval '1 hour'),
      'total', (select count(*) from auth.users),
      'gamertags', (select count(*) from public.profiles),
      'subscribers_today', (select count(*) from public.subscribers s where s.created_at >= t_day),
      'subscribers_total', (select count(*) from public.subscribers)
    ),
    'sales', (
      select jsonb_build_object(
        'today', count(*) filter (where p.created_at >= t_day),
        'h1', count(*) filter (where p.created_at >= t_now - interval '1 hour'),
        'total', count(*),
        'cents_today', coalesce(sum(p.amount_cents) filter (where p.created_at >= t_day), 0),
        'cents_total', coalesce(sum(p.amount_cents), 0),
        'last_id', max(p.id),
        'latest', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'tag', l.gamertag, 'cents', l.amount_cents) order by l.created_at desc), '[]'::jsonb)
                     from (select q.created_at, q.amount_cents, pr.gamertag
                             from public.purchases q left join public.profiles pr on pr.id = q.user_id
                            where q.game_slug = p_slug
                            order by q.created_at desc limit 10) l)
      )
      from public.purchases p where p.game_slug = p_slug
    ),
    'plays', jsonb_build_object(
      'games', (select coalesce(jsonb_agg(jsonb_build_object('slug', g.slug, 'plays', g.plays) order by g.plays desc, g.slug), '[]'::jsonb) from public.game_plays g),
      'sla_boots', coalesce((select g.plays from public.game_plays g where g.slug = p_slug), 0),
      'scores_today', (select count(*) from public.scores s where s.created_at >= t_day)
    ),
    'bounty', jsonb_build_object(
      'entries', (select count(*) from public.bounty_entries e where e.game_slug = p_slug),
      'pending_claims', (select count(*) from public.bounty_claims c where c.game_slug = p_slug and c.status = 'pending'),
      'notify', (select count(*) from public.bounty_notify n where n.game_slug = p_slug)
    ),
    'series', jsonb_build_object(
      'hours',   (select jsonb_agg(h order by h) from hours),
      'views',   (select jsonb_agg(coalesce(v24.n, 0) order by hours.h) from hours left join v24 on v24.h = hours.h),
      'signups', (select jsonb_agg(coalesce(u24.n, 0) order by hours.h) from hours left join u24 on u24.h = hours.h),
      'sales',   (select jsonb_agg(coalesce(s24.n, 0) order by hours.h) from hours left join s24 on s24.h = hours.h)
    )
  ) into res;
  return res;
end;
$$;

revoke execute on function public.admin_live_stats(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_live_stats(uuid, text) to service_role;
