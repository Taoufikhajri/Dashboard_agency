# Tableau de bord — Agence IA

Une application web pour gérer ton agence : projets, temps, finances, juridique, formation, ressources, notes (avec ta reMarkable 2) et banque d'idées d'automatisation.

Elle inclut :
- **une connexion par courriel et mot de passe**, avec « mot de passe oublié » ;
- **une base de données en ligne (Supabase)** : tu retrouves tes données sur ton ordinateur, ton téléphone ou ta tablette.

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'application |
| `config.js` | **Le seul fichier à modifier** : les 2 clés de ta base de données |
| `supabase.sql` | Le code qui crée la table de données (à copier dans Supabase) |

Il n'y a **rien à installer et rien à compiler**.

> Tant que `config.js` est vide, l'application fonctionne en **mode local** : pas de connexion, données sur l'appareil seulement. C'est pratique pour l'essayer tout de suite.

---

## Vue d'ensemble (environ 30 minutes)

1. Créer la base de données sur Supabase
2. Créer ton compte utilisateur
3. Coller les 2 clés dans `config.js`
4. Mettre le code sur GitHub
5. Mettre le site en ligne avec Vercel
6. Donner l'adresse Vercel à Supabase (pour « mot de passe oublié »)

---

## Étape 1 — Créer la base de données (Supabase)

1. Va sur <https://supabase.com> et clique sur **Start your project**. Inscris-toi avec ton compte GitHub, c'est le plus simple.
2. Clique sur **New project** :
   - **Name** : `agence-dashboard`
   - **Database Password** : clique sur **Generate a password**, puis **garde-le dans un endroit sûr**
   - **Region** : choisis **Canada (Central)** si c'est proposé (tes données restent au Canada, c'est mieux pour la Loi 25)
   - Clique sur **Create new project** et attends 1 à 2 minutes.
3. Dans le menu de gauche, ouvre **SQL Editor**, puis clique sur **New query**.
4. Ouvre le fichier `supabase.sql`, copie **tout** son contenu, colle-le dans Supabase, puis clique sur **Run**.
   ✅ Tu dois voir « Success. No rows returned ».

Ce code crée une table protégée : **chaque utilisateur ne peut lire et modifier que ses propres données.**

## Étape 2 — Créer ton compte et bloquer les inscriptions

1. Dans le menu de gauche, va dans **Authentication** puis **Users**.
2. Clique sur **Add user**, puis **Create new user** :
   - ton courriel et un mot de passe solide (12 caractères ou plus)
   - coche **Auto Confirm User**
   - clique sur **Create user**.
3. **Bloque les nouvelles inscriptions**, pour que personne d'autre ne puisse se créer un compte. Dans **Authentication**, ouvre la page des réglages de connexion (selon la version : **Sign In / Providers** ou **Settings**). Désactive **Allow new users to sign up**, puis enregistre.

> **Pour ajouter quelqu'un plus tard** (un associé, un sous-traitant) : refais le point 2 avec son courriel. Attention : chaque personne a **son propre** tableau de bord, séparé du tien. Pour partager les mêmes projets entre plusieurs personnes, il faudra une autre structure de base de données. Ce sera une prochaine étape.

## Étape 3 — Coller les clés dans `config.js`

1. Dans Supabase, va dans **Project Settings** (l'engrenage), puis **API** ou **API Keys**.
2. Copie :
   - **Project URL** (elle ressemble à `https://abcdefgh.supabase.co`)
   - la clé **anon public** ou **publishable**
3. Ouvre `config.js` avec le Bloc-notes et colle-les entre les apostrophes :

```js
window.AGENCE_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...ou...sb_publishable_...'
};
```

4. Enregistre le fichier.

> 🔒 La clé « anon / publishable » **peut** être publique : la protection vient des règles de `supabase.sql` et de la connexion obligatoire.
> ⛔ Ne colle **jamais** la clé **service_role** ou **secret**. Celle-là donne accès à tout.

## Étape 4 — Mettre le code sur GitHub

1. Va sur <https://github.com>. En haut à droite, clique sur **+**, puis **New repository**.
2. Nom : `agence-dashboard`. Choisis **Private**, puis clique sur **Create repository**.
3. Clique sur le lien **uploading an existing file**.
4. Glisse **tous** les fichiers du dossier : `index.html`, `styles.css`, `app.js`, `config.js`, `supabase.sql` et `README.md`.
5. Clique sur **Commit changes**.

*(Si tu as déjà un dépôt, utilise **Add file → Upload files** pour remplacer les anciens fichiers.)*

## Étape 5 — Mettre le site en ligne (Vercel)

1. Va sur <https://vercel.com> et clique sur **Continue with GitHub**.
2. Clique sur **Add New…**, puis **Project**, puis **Import** à côté de `agence-dashboard`.
3. **Framework Preset** : choisis **Other**. Ne change rien d'autre.
4. Clique sur **Deploy**. Après environ 1 minute, tu reçois ton adresse, par exemple `agence-dashboard-xxx.vercel.app`.

*(Si le site est déjà en ligne, Vercel le met à jour tout seul après chaque changement sur GitHub.)*

## Étape 6 — Donner l'adresse du site à Supabase

Sans cette étape, le lien « mot de passe oublié » ne ramènera pas au bon endroit.

1. Dans Supabase, va dans **Authentication** puis **URL Configuration**.
2. **Site URL** : colle ton adresse Vercel complète, par exemple `https://agence-dashboard-xxx.vercel.app`.
3. **Redirect URLs** : clique sur **Add URL** et colle la même adresse. Enregistre.

## ✅ Vérification

1. Ouvre ton adresse Vercel. L'écran **Connexion** doit s'afficher.
2. Connecte-toi. En bas à gauche, tu dois voir **☁ Synchronisé**.
3. Ajoute un projet test, puis ouvre l'adresse sur ton téléphone et connecte-toi. Le projet doit apparaître.

**Si tu avais déjà des données en mode local sur un ordinateur :** connecte-toi d'abord **sur cet ordinateur**. À la première connexion, ses données sont envoyées en ligne.

---

## Bon à savoir

- **Statut en bas à gauche** : ☁ Synchronisé · Enregistrement… · ⚠ Hors ligne. Hors ligne, tes changements restent sur l'appareil et partent dès que la connexion revient.
- **Deux appareils en même temps** : quand tu reviens sur un onglet, il recharge les changements faits ailleurs. Évite quand même de modifier la même chose sur 2 appareils à la même minute, car le dernier enregistrement l'emporte.
- **Déconnexion** : dans **⚙ Paramètres → Compte**. Elle efface la copie locale, ce qui est utile sur un ordinateur partagé.
- **Changer ton mot de passe** : dans **⚙ Paramètres → Compte**.
- **Plan gratuit de Supabase** : un projet qui reste longtemps sans activité peut être mis en pause. Tu le réactives d'un clic dans Supabase. Vérifie les conditions à jour sur leur site.
- **Copie de secours** : une fois par mois, fais **⚙ Paramètres → Exporter une sauvegarde (.json)**.

---

## Utiliser ta reMarkable 2

**Du tableau de bord vers la reMarkable**
1. Va dans **Notes et reMarkable → 🖨 Imprimer pour reMarkable** (fiche de rencontre, plan de la semaine ou banque d'idées). Tu peux aussi imprimer une note avec « PDF pour reMarkable ».
2. Dans la fenêtre d'impression, choisis **Enregistrer en PDF**.
3. Envoie le PDF avec l'application reMarkable, sur ton ordinateur ou ton téléphone.

**De la reMarkable vers le tableau de bord**
1. Sur la tablette, convertis ton écriture en texte.
2. Envoie le texte par courriel ou copie-le, selon les options de ton compte.
3. Va dans **Notes et reMarkable → ⬇ Importer depuis reMarkable**, puis colle le texte ou choisis un fichier `.txt` ou `.md`.

---

## Ce qu'il y a dans chaque section

| Section | Contenu |
|---|---|
| Tableau de bord | Les chiffres clés, les échéances, les prochaines actions, la formation et le temps de la semaine |
| Projets | Un tableau en colonnes : Prospect, En cours, Actif (récurrent), En pause, Terminé |
| Gestion du temps | Un minuteur, l'objectif d'heures par semaine, le temps par jour et par catégorie |
| Finances | Les revenus et dépenses, la trésorerie, un graphique sur 6 mois, le suivi du seuil TPS/TVQ |
| Juridique | Une liste de vérification (Registraire, assurance, contrats, Loi 25, taxes) |
| Formation | Tes cours et ta progression |
| Ressources | Les outils, les organismes, les contacts et les lectures |
| Notes et reMarkable | Les notes, l'import et l'impression pour la tablette |
| Idées d'automatisation | Ta banque de 16 idées, classées par priorité |

> Les rappels juridiques et fiscaux ne sont pas un avis professionnel. Fais-les vérifier par un comptable ou un avocat.
