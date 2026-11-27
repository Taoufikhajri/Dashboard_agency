-- =========================================================
-- Stony Automation — Demandes reçues par le site web (landing page)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → Run
-- Les visiteurs peuvent seulement ENVOYER une demande (pas lire).
-- Seul toi (connecté au tableau de bord) peux lire et traiter.
-- =========================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  entreprise text not null,
  courriel text not null,
  telephone text,
  secteur text,
  employes text,
  besoin text,
  consentement boolean not null,
  source text default 'Site web',
  traite boolean not null default false
);

alter table public.leads enable row level security;

drop policy if exists "leads_insert_public" on public.leads;
create policy "leads_insert_public" on public.leads
  for insert to anon, authenticated
  with check (
    consentement = true
    and traite = false
    and length(nom) between 1 and 120
    and length(entreprise) between 1 and 160
    and courriel ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(courriel) <= 200
    and coalesce(length(telephone), 0) <= 40
    and coalesce(length(secteur), 0) <= 80
    and coalesce(length(employes), 0) <= 40
    and coalesce(length(besoin), 0) <= 2000
  );

drop policy if exists "leads_owner_read" on public.leads;
create policy "leads_owner_read" on public.leads
  for select to authenticated using (true);

drop policy if exists "leads_owner_update" on public.leads;
create policy "leads_owner_update" on public.leads
  for update to authenticated using (true) with check (true);

drop policy if exists "leads_owner_delete" on public.leads;
create policy "leads_owner_delete" on public.leads
  for delete to authenticated using (true);

-- Les visiteurs ne doivent jamais pouvoir lire la table
revoke select, update, delete on public.leads from anon;
grant insert on public.leads to anon;
grant select, insert, update, delete on public.leads to authenticated;
