# Stony Automation — Tableau de bord

*L’automatisation solide pour les PME du Québec.*

Une application web pour gérer ton agence : projets, temps, finances, juridique, formation, ressources, notes (avec ta reMarkable 2) et banque d'idées d'automatisation.

Elle inclut :
- **une connexion par courriel et mot de passe**, avec « mot de passe oublié » ;
- **une base de données en ligne (Supabase)** : tu retrouves tes données sur ton ordinateur, ton téléphone ou ta tablette.

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'application |
| `config.js` | **Le seul fichier à modifier** : les 2 clés de ta base de données |
| `supabase.sql` | Le code qui crée la table de données (à copier dans Supabase) |
| `agents.js` | Les agents IA et le fournisseur de tokens |
| `api/agent.js` | La fonction serveur qui parle au fournisseur de tokens (garde ta clé secrète) |
| `reunions.js` | Réunions d'équipe, actions à approuver, rapports clients |
| `brand.js` | Marque Stony Automation : logo, charte graphique, mise en page des PDF |
| `documents.js` | Pièces jointes des projets et des actions (Supabase Storage) |
| `supabase-documents.sql` | Crée l'espace de stockage privé des pièces jointes |
| `theme.js` | Mode nuit (Jour / Nuit / Auto) |
| `vercel.json` | Un réglage de Vercel pour la fonction serveur |
| `supabase-cle-api.sql` | Le code qui permet de gérer la clé API depuis le tableau de bord |

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
4. Glisse **tout le contenu** du dossier, **y compris le dossier `api`** (avec `agent.js` dedans). Si GitHub n'accepte pas le dossier, voir l'encadré plus bas.
5. Clique sur **Commit changes**.

*(Si tu as déjà un dépôt, utilise **Add file → Upload files** pour remplacer les anciens fichiers.)*

> **Le dossier `api` n'apparaît pas sur GitHub ?** Sur la page du dépôt, clique sur **Add file → Create new file**. Dans le nom, tape `api/agent.js` : la barre oblique crée le dossier. Colle le contenu du fichier `api/agent.js`, puis clique sur **Commit changes**.

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

## Étape 7 — Agents IA et fournisseur de tokens (Yonsepo)

Les 4 agents (marketing, finances Québec, technique, rapports) passent par la fonction serveur `api/agent.js`.
**Ta clé Yonsepo se change directement dans le tableau de bord** (🔑 Fournisseur de tokens). Elle est gardée dans ta base Supabase, dans une table que le navigateur ne peut **pas** relire. Seule la fonction serveur l'utilise, et seulement pour une personne connectée.

### A. Dans Supabase (une seule fois)
1. **SQL Editor → New query**. Colle **tout** le fichier `supabase-cle-api.sql`, puis clique sur **Run**. Tu dois voir « Success ».
2. Va dans **Project Settings → API Keys** (ou **API**) et copie la clé **`service_role`** ou **`secret`** (elle commence souvent par `sb_secret_…` ou `eyJ…`).
   ⛔ Cette clé donne tous les droits : elle va **seulement dans Vercel**, jamais dans `config.js` ni sur GitHub.

### B. Dans Vercel (une seule fois)
Ouvre ton projet, puis **Settings → Environment Variables**. Ajoute ces variables, en cliquant sur **Save** après chacune :

| Nom (Key) | Valeur (Value) |
|---|---|
| `SUPABASE_URL` | la même adresse que `supabaseUrl` dans `config.js` |
| `SUPABASE_ANON_KEY` | la même clé que `supabaseAnonKey` dans `config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé `service_role` ou `secret` copiée au point A.2 |

Ensuite, **redéploie** : onglet **Deployments**, bouton **⋯** sur le dernier déploiement, puis **Redeploy**.

*(Facultatif : `PROVIDER_API_KEY` et `PROVIDER_BASE_URL` servent de clé et d'adresse de secours si aucune clé n'est enregistrée dans le tableau de bord.)*

### C. Dans le tableau de bord (chaque fois que tu changes de clé)
1. Ouvre **🔑 Fournisseur de tokens**.
2. Vérifie l'**Adresse de l'API**. Par défaut, c'est `https://yonsepo.tech/v1`. Je n'ai pas trouvé de documentation publique pour Yonsepo : **confirme cette adresse dans ton compte Yonsepo**. Clique sur **Enregistrer**.
3. Dans la carte **🔒 Clé API**, colle ta clé Yonsepo, puis clique sur **Enregistrer la clé**. Tu dois voir « ✅ Clé enregistrée : ••••xxxx ».
4. Clique sur **🔌 Tester la connexion et charger les modèles**, puis choisis un **modèle par défaut**.
5. Ouvre **🤖 Agents IA** et pose ta première question.

**Pour changer de clé plus tard :** recommence seulement le point C.3, puis C.4. Pas besoin de toucher à Vercel ni à GitHub.

**La mémoire des agents :**
- Chaque agent garde **toutes ses discussions**, enregistrées dans ta base de données.
- Sa **mémoire** est relue au début de chaque discussion. Tu l'alimentes avec **📌 Mémoire** sur une réponse, **🧠 Résumer en mémoire** à la fin d'une discussion, ou à la main dans l'onglet Mémoire.
- Sur chaque réponse : **📝 Note** l'enregistre dans tes notes, **🖨 PDF** crée un rapport avec ta marque, imprimable ou à envoyer vers la reMarkable.
- Le **Rédacteur de rapports** utilise ton **profil de marque**, que tu remplis dans son onglet Réglages.
- Tu peux modifier les instructions de chaque agent (onglet Réglages) et créer d'autres agents.

> ⚠️ Les messages et le contexte (projets, chiffres) sont envoyés au fournisseur de tokens. Ne colle pas de renseignements personnels de tes clients (Loi 25). L'agent finances ne remplace pas un comptable.

> Les agents ne marchent qu'en ligne (sur ton adresse Vercel, connecté). Ils ne fonctionnent pas en ouvrant `index.html` directement sur ton ordinateur.

---

## 🎯 Prospection et 🩺 Diagnostics clients

Aucune configuration : ces deux sections apparaissent dans le menu après la mise à jour.

**Prospection** (ton objectif : 10 contacts par semaine)
1. Ajoute tes contacts avec **+ Prospect**, ou importe un fichier **CSV** (export Excel ou Google Sheets). Seule la colonne « Entreprise » est obligatoire.
2. Glisse les cartes d'une étape à l'autre : À contacter → Contacté → Rendez-vous prévu → Diagnostic proposé → Client.
3. Clique sur une carte pour ouvrir sa fiche :
   - note chaque appel ou message dans l'**historique** (la relance est réglée automatiquement à +7 jours) ;
   - demande à **Yahya** d'écrire le message (premier contact, relance, proposition de diagnostic…) puis copie-le ou ouvre-le dans ton courriel. **Tu l'envoies toi-même**, puis clique « Marquer comme envoyé » ;
   - **Convertir en client** crée automatiquement le projet.
4. Les relances du jour apparaissent sur le tableau de bord et dans une pastille du menu.

⚠️ Loi anti-pourriel (LCAP) : n'envoie un courriel ou un SMS commercial que si tu as une relation d'affaires existante ou un consentement. Le champ « Consentement » de la fiche te le rappelle. Le courriel et le téléphone du prospect ne sont jamais envoyés à l'IA.

**Diagnostics clients** (ton produit d'entrée)
1. Depuis la fiche d'un prospect : **🩺 Faire un diagnostic**, ou **+ Nouveau diagnostic**.
2. Pendant la rencontre, remplis : l'entreprise, les tâches répétitives (fois par semaine, minutes, personnes, taux horaire, % automatisable), les occasions perdues et ton offre.
3. Le **retour sur investissement** se calcule en direct : heures récupérées, gain par année, coût la première année, ROI et nombre de mois pour rentabiliser.
4. **Générer le rapport** : Yaman rédige un rapport professionnel avec uniquement tes chiffres ([À COMPLÉTER] quand il manque une info). Tu peux modifier le texte, puis **🖨 PDF à ma marque** (page couverture Stony Automation).

Les chiffres sont des estimations : valide-les toujours avec le client.

## 🧲 Tunnels et courriels automatiques (comme systeme.io)

**Une seule fois :**
1. Supabase → **SQL Editor** → New query → colle **`supabase-tunnels.sql`** → **Run**.
2. Tableau de bord → **🧲 Tunnels & courriels** → onglet **⚙️ Courriels Brevo** : suis les 4 étapes (compte Brevo gratuit, expéditeur confirmé, clé API, adresse postale), puis « M'envoyer un essai ».

**Créer un tunnel :**
1. **+ Nouveau tunnel** → choisis un modèle (📘 Guide gratuit ou 🩺 Diagnostic gratuit). La page et la séquence de courriels sont préremplies.
2. Modifie les textes à gauche : l'aperçu à droite change en direct (bouton 📱 pour la version mobile).
3. Ajoute ton lien de guide (Google Drive) ou de réservation (Calendly) dans la page merci.
4. Onglet **✉️ Séquences** : relis les courriels et remplace « COLLE-ICI-LE-LIEN-DU-GUIDE ».
5. **🚀 Publier**, puis partage le lien : `https://TON-SITE/f/nom-du-tunnel`.

**Ce qui se passe ensuite :** chaque inscrit devient un **contact** (avec étiquettes), reçoit le 1er courriel tout de suite, puis les suivants selon les délais (envoi chaque matin vers 8 h et quand tu ouvres le tableau de bord). Il est aussi copié dans 🎯 Prospection si l'option est cochée.
Chaque courriel contient ton adresse postale et un lien de désabonnement (Loi anti-pourriel). Les statistiques (visites, inscrits, taux de conversion) sont sur chaque carte de tunnel.

## 🌐 Site web (landing page)

Ton site public est à l'adresse **`https://TON-SITE.vercel.app/site/`** (bouton « 🌐 Mon site » dans Prospection).
Les demandes envoyées par le formulaire arrivent directement dans **🎯 Prospection** (carte « 📥 Nouvelles demandes du site »).

À faire une seule fois :
1. Supabase → **SQL Editor** → New query → colle le contenu de **`supabase-leads.sql`** → **Run**.
2. Dans **`site/index.html`**, en bas du fichier, remplis `CONTACT` (ton courriel et ton téléphone).
   Mets le même courriel dans **`site/confidentialite.html`** (`COURRIEL`). Sauvegarde, puis envoie sur GitHub : Vercel met le site à jour tout seul.
3. Fais un test : remplis le formulaire du site, puis ouvre Prospection dans le tableau de bord.

Les visiteurs peuvent seulement **envoyer** une demande : personne ne peut lire la liste à part toi (connecté).
Le formulaire demande le consentement (Loi 25), et la politique de confidentialité est sur `/site/confidentialite.html` (relis-la et adapte-la au besoin).

## Pièces jointes (projets et actions)

**À faire une seule fois :** dans Supabase, **SQL Editor → New query**, colle tout le fichier `supabase-documents.sql`, puis clique sur **Run**. Cela crée un espace de stockage **privé** nommé `documents` : chaque utilisateur ne voit que ses propres fichiers.

**Ensuite :** ouvre un projet ou une action, puis, dans la section **📎 Documents**, clique ou glisse tes fichiers (20 Mo maximum chacun).
- Pour ouvrir un fichier, clique sur son nom : un lien temporaire de 5 minutes s'ouvre.
- Pour supprimer un fichier, clique deux fois sur ✕. Quand tu supprimes un projet ou une action, ses fichiers sont supprimés aussi.
- Les fichiers **texte** (`.txt`, `.md`, `.csv`, `.json`) sont **lus par les agents** quand ils travaillent sur l'action ou discutent du projet en réunion. Pour les PDF, les images et les fichiers Word ou Excel, les agents ne voient que le nom.

---

## Mode nuit

En bas du menu, choisis **☀️ Jour**, **🌙 Nuit** ou **🖥 Auto**. Le mode Auto suit le réglage de ton ordinateur ou de ton téléphone. Le raccourci **Alt + N** passe du jour à la nuit. Le choix est gardé sur chaque appareil. Les PDF restent toujours en version claire.

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
| Agents IA | 4 agents spécialisés avec leurs discussions et leur mémoire |
| Fournisseur de tokens | La configuration de Yonsepo, le test de connexion et la consommation de tokens par agent |
| Actions à faire | Les actions approuvées après les réunions (responsable, échéance, statut) |
| Réunions d'équipe | Yahya, Ines, Jouri et Yaman discutent d'un projet posé sur la table, puis remettent un compte rendu |
| Rapports clients | Les rapports officiels aux couleurs de Stony Automation, avec page couverture, en PDF format Lettre |
| Charte graphique | Le logo (un cairn), la palette « Pierre », les polices et le ton de la marque |

> Les rappels juridiques et fiscaux ne sont pas un avis professionnel. Fais-les vérifier par un comptable ou un avocat.
