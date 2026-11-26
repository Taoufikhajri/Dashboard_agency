-- ============================================================
-- À exécuter UNE FOIS dans Supabase : SQL Editor → New query → Run
-- Crée l'espace de stockage PRIVÉ « documents » pour les pièces
-- jointes des projets et des actions.
--
-- Chaque fichier est rangé dans un dossier au nom de l'utilisateur :
--   documents/<id utilisateur>/<projets|actions>/<id>/<fichier>
-- Les règles ci-dessous permettent à chaque utilisateur connecté de lire,
-- ajouter et supprimer SEULEMENT les fichiers de son propre dossier.
-- Taille maximale d'un fichier : 20 Mo.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "documents : lire les miens" on storage.objects;
drop policy if exists "documents : ajouter les miens" on storage.objects;
drop policy if exists "documents : modifier les miens" on storage.objects;
drop policy if exists "documents : supprimer les miens" on storage.objects;

create policy "documents : lire les miens" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents : ajouter les miens" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents : modifier les miens" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents : supprimer les miens" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
