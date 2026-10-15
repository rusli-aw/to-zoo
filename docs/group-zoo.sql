-- To-Zoo — group zoos on Supabase.
--
-- Run this once in Supabase → SQL Editor, then put the project URL and anon
-- key in js/config.js.
--
-- Security model: the invite link IS the key. Zoo ids are 12 random
-- characters (~71 bits), so they cannot be guessed, and the public key can
-- only reach the data through functions that take the exact zoo id. Anyone you send the
-- link to can read and edit that zoo's tasks; nobody else can find it. There
-- are no accounts. If you later add Supabase Auth, tighten these policies to
-- a members table.
--
-- Note: Realtime broadcast channels are not access-controlled here; someone
-- who knows a zoo id could listen for "changed" pings (which carry no task
-- data). Enable Realtime Authorization if that matters.

create table if not exists public.zoos (
  id          text primary key check (char_length(id) between 6 and 32),
  name        text not null check (char_length(name) <= 60),
  created_at  timestamptz not null default now()
);

create table if not exists public.zoo_tasks (
  id          text primary key,
  zoo_id      text not null references public.zoos(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists zoo_tasks_zoo_id on public.zoo_tasks (zoo_id);

alter table public.zoos enable row level security;
alter table public.zoo_tasks enable row level security;

-- No direct table access for the public key at all: with RLS on and no
-- policies, anon can neither list nor read rows. Everything goes through the
-- functions below, each of which needs the exact zoo id.
revoke all on public.zoos from anon, authenticated;
revoke all on public.zoo_tasks from anon, authenticated;

create or replace function public.create_zoo(p_id text, p_name text)
returns void language sql security definer set search_path = public as $$
  insert into zoos (id, name) values (p_id, left(p_name, 60));
$$;

create or replace function public.get_zoo(p_id text)
returns table (name text, tasks jsonb) language sql stable security definer set search_path = public as $$
  select z.name,
         coalesce((select jsonb_agg(t.data) from zoo_tasks t where t.zoo_id = z.id), '[]'::jsonb)
  from zoos z where z.id = p_id;
$$;

create or replace function public.put_zoo_task(p_zoo text, p_id text, p_data jsonb, p_updated timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into zoo_tasks (id, zoo_id, data, updated_at)
  select p_id, p_zoo, p_data, p_updated where exists (select 1 from zoos where id = p_zoo)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at
  where zoo_tasks.zoo_id = p_zoo and zoo_tasks.updated_at <= excluded.updated_at;
$$;

create or replace function public.delete_zoo_task(p_zoo text, p_id text)
returns void language sql security definer set search_path = public as $$
  delete from zoo_tasks where zoo_id = p_zoo and id = p_id;
$$;

grant execute on function public.create_zoo(text, text),
  public.get_zoo(text),
  public.put_zoo_task(text, text, jsonb, timestamptz),
  public.delete_zoo_task(text, text)
  to anon, authenticated;

-- Live updates use Realtime Broadcast and Presence on the channel
-- "zoo:<id>" (no table subscription needed): after each write a client
-- broadcasts "changed" and the others refetch with get_zoo().
