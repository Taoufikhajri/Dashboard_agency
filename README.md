# Tableau de bord — Agence IA

Une application web pour gérer ton agence : projets, temps, finances, juridique, formation, ressources, notes (avec ta reMarkable 2) et banque d'idées d'automatisation.

Elle se compose de 3 fichiers seulement (`index.html`, `styles.css`, `app.js`). Il n'y a **rien à installer et rien à compiler**.

---

## 1. Essayer sur ton ordinateur (2 minutes)

1. Décompresse le dossier.
2. Double-clique sur `index.html`. Ça s'ouvre dans ton navigateur et ça marche déjà.

---

## 2. Mettre le code sur GitHub

1. Va sur <https://github.com> et connecte-toi.
2. En haut à droite, clique sur **+**, puis **New repository**.
3. Nom : `agence-dashboard`. Choisis **Private**, puis clique sur **Create repository**.
4. Sur la page qui s'affiche, clique sur le lien **uploading an existing file**.
5. Glisse les 4 fichiers : `index.html`, `styles.css`, `app.js` et `README.md`.
6. En bas, clique sur **Commit changes**.

---

## 3. Mettre le site en ligne avec Vercel

1. Va sur <https://vercel.com>, puis clique sur **Sign Up** (ou **Log In**) et choisis **Continue with GitHub**.
2. Clique sur **Add New…**, puis **Project**.
3. Trouve `agence-dashboard` dans la liste et clique sur **Import**. Si le dépôt n'apparaît pas, clique sur le lien pour donner à Vercel l'accès à ce dépôt GitHub.
4. **Framework Preset** : choisis **Other**. Ne change rien d'autre.
5. Clique sur **Deploy**.
6. Après environ 1 minute, Vercel te donne une adresse du genre `agence-dashboard-xxx.vercel.app`. Ajoute-la à tes favoris, sur ton ordinateur et sur ton téléphone.

**Pour faire une mise à jour plus tard :** remplace le fichier modifié sur GitHub (**Add file → Upload files**). Vercel remet le site à jour tout seul.

---

## 4. ⚠️ Où sont tes données ? (important)

- Tes données sont enregistrées **dans le navigateur de l'appareil que tu utilises**. Elles ne sont envoyées sur aucun serveur.
- Ton ordinateur et ton téléphone ont donc **chacun leurs propres données**.
- Si tu vides les données de ton navigateur, tu les perds.

**La solution :** une fois par semaine, va dans **⚙ Paramètres et sauvegarde → Exporter une sauvegarde**, et garde le fichier `.json` (dans Google Drive, par exemple). Pour retrouver tes données sur un autre appareil, utilise **Importer une sauvegarde**.

**Ce que voit quelqu'un d'autre :** une personne qui ouvre ton adresse Vercel ne voit jamais **tes** données. Elle voit seulement les données de départ, celles qui sont écrites dans `app.js` (la fonction `seed`). Si tu ne veux pas que ces exemples soient visibles, modifie-les avant de déployer.

---

## 5. Utiliser ta reMarkable 2

**Du tableau de bord vers la reMarkable**
1. Va dans **Notes et reMarkable → 🖨 Imprimer pour reMarkable**. Tu peux choisir une fiche de rencontre découverte, le plan de la semaine ou la banque d'idées. Tu peux aussi imprimer une note seule avec le bouton « PDF pour reMarkable ».
2. Dans la fenêtre d'impression, choisis **Enregistrer en PDF**.
3. Envoie le PDF dans ta reMarkable avec l'application reMarkable, sur ton ordinateur ou ton téléphone.

Le format est A5, avec de grosses lettres et des lignes pour écrire à la main.

**De la reMarkable vers le tableau de bord**
1. Sur la tablette, convertis ton écriture en texte.
2. Envoie le texte par courriel ou copie-le, selon les options de ton compte reMarkable.
3. Va dans **Notes et reMarkable → ⬇ Importer depuis reMarkable**, puis colle le texte ou choisis un fichier `.txt` ou `.md`.

---

## 6. Ce qu'il y a dans chaque section

| Section | Contenu |
|---|---|
| Tableau de bord | Les chiffres clés, les échéances, les prochaines actions, la formation et le temps de la semaine |
| Projets | Un tableau en colonnes : Prospect, En cours, Actif (récurrent), En pause, Terminé. Tu peux glisser les cartes d'une colonne à l'autre |
| Gestion du temps | Un minuteur, l'objectif d'heures par semaine, le temps par jour et par catégorie |
| Finances | Les revenus et dépenses, la trésorerie, un graphique sur 6 mois, le suivi du seuil TPS/TVQ |
| Juridique | Une liste de vérification (Registraire, assurance, contrats, Loi 25, taxes) avec des échéances |
| Formation | Tes cours et ta progression |
| Ressources | Les outils, les organismes, les contacts et les lectures |
| Notes et reMarkable | Les notes, l'import et l'impression pour la tablette |
| Idées d'automatisation | Ta banque de 16 idées, classées par priorité |

Les montants sont en dollars canadiens. Le budget de départ (4 100 $ CA, soit environ 3 000 $ US) se change dans **Paramètres**.

> Les rappels juridiques et fiscaux ne sont pas un avis professionnel. Fais-les vérifier par un comptable ou un avocat.
