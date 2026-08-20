-- =====================================================================
-- Adds a "goals" table — persistent projects/aims that are NOT tied to a
-- specific date and don't disappear until the user deletes them (unlike
-- daily_logs.missions, which is per-day). Run in Supabase SQL Editor.
-- =====================================================================

create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_goals_user on public.goals (user_id, created_at);

alter table public.goals enable row level security;

create policy "select_own_goals" on public.goals
  for select using (auth.uid() = user_id);

create policy "insert_own_goals" on public.goals
  for insert with check (auth.uid() = user_id);

create policy "update_own_goals" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete_own_goals" on public.goals
  for delete using (auth.uid() = user_id);
