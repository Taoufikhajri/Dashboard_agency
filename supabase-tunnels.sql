-- =====================================================================
-- Stony Automation — 🧲 Tunnels de vente et courriels automatiques
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → Run
--
-- Sécurité :
--  - Toutes les tables sont privées : seul toi (connecté) peux les lire.
--  - Les pages publiques des tunnels passent par la fonction serveur
--    Vercel /api/funnel (clé secrète côté serveur), jamais directement.
--  - La clé Brevo ne peut pas être relue par le navigateur.
-- On peut relancer ce fichier sans danger (il ne supprime aucune donnée).
-- =====================================================================

-- ---------- Tunnels ----------
create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  nom text not null,
  actif boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  sequence_id uuid,
  vers_prospection boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funnel_events (
  id bigserial primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  type text not null check (type in ('vue', 'inscription', 'clic')),
  created_at timestamptz not null default now()
);
create index if not exists funnel_events_f_idx on public.funnel_events (funnel_id, created_at);

-- ---------- Contacts (liste de courriels) ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  courriel text not null,
  prenom text, nom text, telephone text, entreprise text,
  etiquettes text[] not null default '{}',
  source text,
  funnel_id uuid references public.funnels (id) on delete set null,
  consentement boolean not null default false,
  consentement_date timestamptz,
  desabonne boolean not null default false,
  desabonne_date timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, courriel)
);

-- ---------- Séquences de courriels ----------
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  etapes jsonb not null default '[]'::jsonb,   -- [{id, delai_jours, sujet, corps}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  etape int not null default 0,
  prochain_envoi timestamptz,
  statut text not null default 'actif' check (statut in ('actif', 'termine', 'arrete')),
  created_at timestamptz not null default now(),
  unique (contact_id, sequence_id)
);
create index if not exists enrollments_due_idx on public.enrollments (statut, prochain_envoi);

create table if not exists public.email_log (
  id bigserial primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  courriel text,
  sujet text,
  type text,            -- sequence / diffusion / test
  statut text,          -- envoye / erreur
  erreur text,
  created_at timestamptz not null default now()
);

-- ---------- Réglages d'envoi ----------
create table if not exists public.email_settings (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  expediteur_nom text,
  expediteur_courriel text,
  adresse_postale text,
  updated_at timestamptz not null default now()
);

create table if not exists public.brevo_secrets (
  owner uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  key_hint text,
  updated_at timestamptz not null default now()
);

-- ---------- Règles d'accès : seulement le propriétaire connecté ----------
do $$
declare t text;
begin
  foreach t in array array['funnels','funnel_events','contacts','sequences','enrollments','email_log','email_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
grant usage, select on sequence public.funnel_events_id_seq, public.email_log_id_seq to authenticated;

alter table public.brevo_secrets enable row level security;
revoke all on table public.brevo_secrets from anon, authenticated;

create or replace function public.set_brevo_key(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_key is null or length(trim(p_key)) < 20 then raise exception 'Clé Brevo trop courte'; end if;
  insert into public.brevo_secrets (owner, api_key, key_hint, updated_at)
  values (auth.uid(), trim(p_key), right(trim(p_key), 4), now())
  on conflict (owner) do update set api_key = excluded.api_key, key_hint = excluded.key_hint, updated_at = now();
end; $$;

create or replace function public.get_brevo_key_info()
returns table (key_hint text, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select s.key_hint, s.updated_at from public.brevo_secrets s where s.owner = auth.uid();
$$;

create or replace function public.delete_brevo_key()
returns void language sql security definer set search_path = '' as $$
  delete from public.brevo_secrets where owner = auth.uid();
$$;

revoke execute on function public.set_brevo_key(text), public.get_brevo_key_info(), public.delete_brevo_key() from public, anon;
grant execute on function public.set_brevo_key(text), public.get_brevo_key_info(), public.delete_brevo_key() to authenticated;
