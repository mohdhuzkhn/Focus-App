-- =====================================================================
-- Logbook — Supabase schema (daily_logs table)
-- Run this once in your project's SQL Editor for a FRESH project.
-- If you already ran the old version of this script and have a
-- daily_logs table, run fix_daily_logs.sql instead — don't run both.
--
-- Security model: Row Level Security (RLS) is enabled and every policy
-- checks auth.uid() = user_id — the user id Supabase extracts from the
-- caller's verified JWT. This is enforced by Postgres itself on every
-- read/write, no matter what the client sends.
-- =====================================================================

create table if not exists public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        text not null,                      -- 'YYYY-MM-DD'
  work_hours  numeric not null default 0 check (work_hours >= 0 and work_hours <= 24),
  missions    jsonb not null default '[]'::jsonb,  -- [{id, text, ts}, ...]
  created_at  timestamptz not null default timezone('utc'::text, now()),
  updated_at  timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, date)
);

create index if not exists idx_daily_logs_user_date on public.daily_logs (user_id, date);

alter table public.daily_logs enable row level security;

drop policy if exists "Allow public read and write access" on public.daily_logs;

create policy "select_own_logs" on public.daily_logs
  for select using (auth.uid() = user_id);

create policy "insert_own_logs" on public.daily_logs
  for insert with check (auth.uid() = user_id);

create policy "update_own_logs" on public.daily_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete_own_logs" on public.daily_logs
  for delete using (auth.uid() = user_id);
