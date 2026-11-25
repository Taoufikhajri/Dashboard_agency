-- ============================================================
-- À copier dans Supabase : SQL Editor → New query → Run
-- Crée la table qui garde les données du tableau de bord.
-- Chaque utilisateur ne peut voir et modifier QUE ses propres données
-- (règles de sécurité « RLS »).
-- ============================================================

create table if not exists public.agence_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.agence_data enable row level security;

drop policy if exists "lire mes données" on public.agence_data;
drop policy if exists "créer mes données" on public.agence_data;
drop policy if exists "modifier mes données" on public.agence_data;
drop policy if exists "supprimer mes données" on public.agence_data;

create policy "lire mes données" on public.agence_data
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "créer mes données" on public.agence_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "modifier mes données" on public.agence_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "supprimer mes données" on public.agence_data
  for delete to authenticated using ((select auth.uid()) = user_id);
