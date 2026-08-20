-- =====================================================================
-- Fix for public.daily_logs
-- Run in Supabase Dashboard → SQL Editor.
--
-- Problems this fixes:
--  1. No user_id column, and `date` is globally unique — every signed-in
--     user was sharing the exact same rows, keyed only by date. Two users
--     logging hours on the same day would collide/overwrite each other.
--  2. The RLS policy was `using (true) with check (true)` — that allows
--     ANY holder of the anon key (i.e. anyone who opens your site) to
--     read, edit, or delete every row belonging to every user. The anon
--     key is public by design, so this was a fully open table.
-- =====================================================================

-- If you have real rows you care about from testing, back them up first —
-- e.g.:  select * from public.daily_logs;
-- If it's just test data, the simplest fix is to wipe it and start clean:
truncate table public.daily_logs;

-- 1. Add per-user ownership.
alter table public.daily_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.daily_logs
  alter column user_id set not null;

-- 2. Replace the global unique-on-date constraint with a per-user one, so
--    each user can have their own row for a given date without colliding
--    with anyone else's.
alter table public.daily_logs
  drop constraint if exists daily_logs_date_key;

alter table public.daily_logs
  add constraint daily_logs_user_date_key unique (user_id, date);

create index if not exists idx_daily_logs_user_date
  on public.daily_logs (user_id, date);

-- 3. Track updates (used by the app, optional but recommended).
alter table public.daily_logs
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

-- 4. Replace the wide-open policy with per-user policies.
drop policy if exists "Allow public read and write access" on public.daily_logs;

create policy "select_own_logs" on public.daily_logs
  for select using (auth.uid() = user_id);

create policy "insert_own_logs" on public.daily_logs
  for insert with check (auth.uid() = user_id);

create policy "update_own_logs" on public.daily_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete_own_logs" on public.daily_logs
  for delete using (auth.uid() = user_id);

-- RLS should already be enabled from your original script, but confirm:
alter table public.daily_logs enable row level security;
