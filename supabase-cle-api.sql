-- ============================================================
-- À exécuter UNE FOIS dans Supabase : SQL Editor → New query → Run
-- Permet de changer la clé API du fournisseur de tokens (Yonsepo)
-- depuis le tableau de bord, SANS que le navigateur puisse la relire.
--
-- - La table n'a aucune règle d'accès : le navigateur ne peut ni la lire
--   ni l'écrire directement.
-- - Le tableau de bord passe par 3 fonctions qui n'acceptent que
--   l'utilisateur connecté, et qui ne renvoient jamais la clé complète.
-- - Seule la fonction serveur Vercel (avec la clé service_role / secret)
--   peut lire la clé.
-- ============================================================

create table if not exists public.provider_secrets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  api_key    text not null,
  base_url   text,
  key_hint   text,
  updated_at timestamptz not null default now()
);

alter table public.provider_secrets enable row level security;
revoke all on table public.provider_secrets from anon, authenticated;

-- Enregistrer ou remplacer la clé (et éventuellement l'adresse de l'API)
create or replace function public.set_provider_key(p_key text, p_base_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_key is null or length(trim(p_key)) < 8 then raise exception 'Clé trop courte'; end if;
  insert into public.provider_secrets (user_id, api_key, base_url, key_hint, updated_at)
  values (auth.uid(), trim(p_key), nullif(trim(coalesce(p_base_url, '')), ''), right(trim(p_key), 4), now())
  on conflict (user_id) do update
    set api_key    = excluded.api_key,
        base_url   = coalesce(excluded.base_url, public.provider_secrets.base_url),
        key_hint   = excluded.key_hint,
        updated_at = now();
end;
$$;

-- Changer seulement l'adresse de l'API
create or replace function public.set_provider_base_url(p_base_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.provider_secrets
     set base_url = nullif(trim(coalesce(p_base_url, '')), ''), updated_at = now()
   where user_id = auth.uid();
end;
$$;

-- Voir l'état de la clé : 4 derniers caractères seulement, jamais la clé
create or replace function public.get_provider_key_info()
returns table (key_hint text, base_url text, updated_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select s.key_hint, s.base_url, s.updated_at
    from public.provider_secrets s
   where s.user_id = auth.uid();
$$;

-- Supprimer la clé
create or replace function public.delete_provider_key()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.provider_secrets where user_id = auth.uid();
$$;

revoke all on function public.set_provider_key(text, text) from public, anon;
revoke all on function public.set_provider_base_url(text) from public, anon;
revoke all on function public.get_provider_key_info() from public, anon;
revoke all on function public.delete_provider_key() from public, anon;
grant execute on function public.set_provider_key(text, text) to authenticated;
grant execute on function public.set_provider_base_url(text) to authenticated;
grant execute on function public.get_provider_key_info() to authenticated;
grant execute on function public.delete_provider_key() to authenticated;
