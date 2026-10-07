# Portefeuille — Gestion locative (version en ligne, multi-utilisateurs)

Version web de l'application, avec comptes utilisateurs, rôles (admin / employé)
et une vraie base de données partagée — accessible depuis n'importe où avec un
navigateur, par toi et les employés à qui tu donnes un accès.

## Ce qui a changé par rapport à la version locale

- Les données ne sont plus dans un fichier sur ton Mac : elles vivent dans une
  base PostgreSQL partagée, accessible à tous les comptes autorisés.
- Chaque personne se connecte avec son propre identifiant/mot de passe.
- Deux rôles :
  - **Admin** : accès complet (ajouter/modifier/supprimer biens, locaux,
    charges, marquer les loyers payés, voir la fiscalité et les valeurs
    estimées, gérer les comptes utilisateurs).
  - **Employé** : accès en lecture seule aux biens et au suivi des loyers.
    Il ne voit ni le Tableau de bord, ni la Fiscalité, ni la valeur estimée
    des biens (ces informations sont retirées côté serveur, pas seulement
    cachées dans l'interface). Il ne peut pas gérer les utilisateurs.

Tu peux ajuster ces règles plus tard si besoin (ex. donner accès à la
Fiscalité à certains employés) — dis-le moi.

## Vue d'ensemble du déploiement

Deux services gratuits, séparés :

1. **Neon** (neon.tech) — héberge la base de données PostgreSQL, gratuite et
   persistante (pas de date d'expiration), avec mise en veille automatique
   entre les connexions.
2. **Render** (render.com) — héberge le serveur de l'application (le code de
   ce projet), gratuit lui aussi (750h/mois gratuites, largement suffisant
   pour une seule appli), avec une mise en veille après 15 minutes sans
   visite (le premier chargement après une pause prend 30-60 secondes le
   temps que ça redémarre — normal, pas un bug).

Ni l'un ni l'autre ne demande de carte bancaire pour ce niveau d'usage.

## Étape 1 — Créer la base de données (Neon)

1. Va sur https://neon.tech et crée un compte gratuit.
2. Crée un nouveau projet (n'importe quel nom, ex. "portefeuille-immobilier").
3. Une fois le projet créé, copie la **chaîne de connexion** ("Connection
   string") — elle ressemble à
   `postgres://user:password@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Garde-la de côté, elle servira de valeur pour `DATABASE_URL`.

## Étape 2 — Mettre le code sur GitHub

Render déploie à partir d'un dépôt GitHub. Depuis ce dossier :

```bash
git init
git add .
git commit -m "Version initiale"
```

Puis crée un nouveau dépôt (vide) sur https://github.com/new, et suis les
instructions de GitHub pour y pousser ce commit (quelque chose comme) :

```bash
git remote add origin https://github.com/<ton-compte>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

## Étape 3 — Déployer sur Render

1. Va sur https://render.com, crée un compte gratuit (tu peux te connecter
   avec ton compte GitHub directement).
2. Crée un nouveau **Web Service**, et sélectionne le dépôt GitHub que tu
   viens de créer.
3. Configure :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `node server/index.js`
   - **Plan** : Free
4. Dans la section **Environment** (variables d'environnement), ajoute :
   - `DATABASE_URL` → la chaîne de connexion copiée depuis Neon
   - `JWT_SECRET` → une longue chaîne aléatoire secrète. Tu peux en générer
     une en local avec :
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `ADMIN_USERNAME` → l'identifiant que tu veux pour ton propre compte admin
   - `ADMIN_PASSWORD` → le mot de passe de ce compte (change-le après la
     première connexion si tu veux)
   - `ADMIN_NAME` → ton nom affiché dans l'app
   - `NODE_ENV` → `production`
5. Lance le déploiement. Au premier démarrage, le serveur crée
   automatiquement les tables et ton compte admin à partir de ces variables.
6. Une fois déployé, Render te donne une URL du type
   `https://portefeuille-immobilier.onrender.com` — c'est le lien à partager
   avec tes employés (chacun avec son propre compte, créé depuis l'onglet
   "Utilisateurs" une fois connecté en admin).

## Créer les comptes employés

Une fois connecté en admin, va dans l'onglet **Utilisateurs** : tu peux y
créer un compte par employé (nom, identifiant, mot de passe temporaire,
rôle), désactiver un accès, réinitialiser un mot de passe, ou promouvoir
quelqu'un admin.

## Développement / test en local

1. Copie `.env.example` en `.env` et remplis les valeurs (tu peux réutiliser
   la même base Neon pour développer en local).
2. `npm install`
3. `npm start` — construit l'interface et lance le serveur sur
   `http://localhost:3000`.

## Sauvegardes

En plus de la base de données (déjà persistante), le bouton "Exporter une
sauvegarde" (visible par l'admin, dans l'onglet "Suivi loyers") télécharge un
fichier `.json` de toutes les données du module Loyers à un instant donné —
utile à garder de côté de temps en temps.

## Module "Suivi chantiers"

En plus du suivi des loyers, l'extranet inclut désormais un second module
indépendant : le suivi de chantiers (avancement par lot, planning, budget
prévisionnel vs réel, photos et documents de chantier). Même connexion, même
URL, mêmes comptes — c'est une extension du service déjà déployé, pas une
nouvelle application. **Rien n'est retiré ni modifié dans le module Loyers
existant** ; toutes les tables ajoutées en base le sont de façon additive
(`CREATE TABLE IF NOT EXISTS`), donc redéployer ne touche ni aux comptes ni
aux données déjà en place — c'est un `git push` normal, sans étape spéciale.

### Rôles du module Chantiers

Ce module a son propre système de rôles, indépendant du rôle Loyers
(admin/employé) de chaque compte :

- **Admin** (un administrateur global l'est toujours automatiquement) : accès
  complet — crée les chantiers/lots, gère budget/planning, voit tout.
- **Direction** : voit tous les chantiers en lecture seule (y compris le budget).
- **Chef de chantier** : voit et modifie le(s) chantier(s) qui lui sont
  affectés (avancement, planning, documents ; budget en lecture seule).
- **Sous-traitant** : voit et modifie uniquement le(s) lot(s) précis qui lui
  sont affectés ; ne voit jamais le budget.

Un compte "employé" n'a par défaut **aucun accès** au module Chantiers : c'est
un administrateur global qui lui attribue un rôle Chantiers (ou "Aucun" pour
le retirer) depuis l'onglet **Utilisateurs**, colonne "Accès Chantiers". Une
fois un rôle "Chef de chantier" ou "Sous-traitant" attribué, le bouton
"Affectations" permet de choisir quel(s) chantier(s)/lot(s) cette personne
voit. Si un compte n'a aucun accès, la section "Suivi chantiers" n'apparaît
simplement pas dans son menu — pas de message d'erreur, elle est juste absente.

### Nouvelles variables d'environnement à ajouter sur Render

Le module Chantiers stocke ses photos et documents sur **Cloudinary**
(gratuit), pour la même raison que la base de données est sur Neon : le
disque du service Render est effacé à chaque redémarrage. Il faut créer un
compte Cloudinary et ajouter deux nouvelles variables d'environnement au
service Render **existant** (Dashboard Render → ton service → Environment) :

1. Va sur https://cloudinary.com et crée un compte gratuit.
2. Une fois connecté, note ton **Cloud name** (visible en haut du tableau de
   bord) → variable `VITE_CLOUDINARY_CLOUD_NAME`.
3. Va dans **Settings** (roue crantée) → **Upload** → section **Upload
   presets** → **Add upload preset**.
4. Mets **Signing Mode** sur **Unsigned** (essentiel : c'est ce qui permet au
   navigateur d'envoyer un fichier sans mot de passe secret). Donne-lui un nom
   simple (ex. `chantiers`), enregistre → variable `VITE_CLOUDINARY_UPLOAD_PRESET`.
5. Ajoute ces deux variables au service Render existant, puis redéploie
   (un simple `git push` déclenche déjà un redéploiement si l'auto-deploy est
   actif). Toutes les autres variables (`DATABASE_URL`, `JWT_SECRET`,
   `ADMIN_USERNAME`, etc.), l'URL du service et les comptes existants restent
   inchangés.

Au premier démarrage après ce déploiement, le serveur crée automatiquement
les nouvelles tables du module Chantiers (elles n'existent pas encore dans la
base) sans toucher aux tables `users`/`portfolio` existantes ni à leur contenu.

## Fonctionnalités IA

Le module Loyers inclut deux outils assistés par IA (Claude, d'Anthropic) :

- **Import Excel (IA)** — bouton en haut de la page "Mes biens". Dépose
  n'importe quel tableau Excel/CSV (peu importe la mise en page) : l'IA
  repère les colonnes (local, locataire, loyer, dates de bail…) et propose un
  aperçu modifiable. Rien n'est enregistré tant que tu n'as pas relu et cliqué
  sur "Importer".
- **Analyser un contrat (IA)** — bouton dans la fiche d'un local (ajout ou
  modification). Dépose un contrat de bail en PDF ou Word (.docx) : l'IA en
  extrait le locataire, le loyer, les dates de bail et la date de révision,
  et pré-remplit le formulaire — à vérifier avant d'enregistrer.

Ces deux outils ont besoin d'une clé API Anthropic pour fonctionner :

1. Va sur https://console.anthropic.com, crée un compte si besoin, puis dans
   **API Keys** crée une nouvelle clé.
2. Sur Render (Dashboard → ton service → Environment), ajoute la variable
   `ANTHROPIC_API_KEY` avec cette valeur, puis redéploie (ou attends le
   redéploiement automatique après un `git push`).
3. Optionnel : `ANTHROPIC_MODEL` permet de choisir un autre modèle Claude que
   celui utilisé par défaut (utile si le modèle par défaut venait à être
   retiré — voir https://docs.claude.com/en/docs/about-claude/models pour la
   liste à jour).

Tant que `ANTHROPIC_API_KEY` n'est pas définie, ces deux boutons affichent un
message clair expliquant quoi faire — le reste de l'app fonctionne normalement.
Chaque fichier envoyé est analysé à la volée (jamais stocké sur le serveur).

## Alertes par email

En plus des rappels déjà visibles dans le Tableau de bord ("Fins de bail à
venir" et locaux éligibles à une révision de loyer), le serveur peut envoyer
un email récapitulatif dès qu'une nouvelle échéance entre dans la fenêtre des
30 prochains jours (fin de bail, ou révision triennale de loyer possible).
Chaque alerte n'est envoyée qu'une seule fois.

Pour l'activer, ajoute ces variables sur Render (Environment) :

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — les
  identifiants d'un compte email capable d'envoyer via SMTP (ex. un compte
  Gmail avec un "mot de passe d'application", ou un service comme Brevo/
  SendGrid, qui ont un plan gratuit).
- `ALERT_EMAIL_TO` — l'adresse qui doit recevoir ces alertes (la tienne).

Sans ces variables, les alertes restent visibles dans le Tableau de bord mais
aucun email n'est envoyé (c'est journalisé côté serveur, visible dans les
logs Render).

À noter : le plan gratuit Render met le service en veille après 15 minutes
d'inactivité, donc cette vérification ne tourne que pendant que le service
est éveillé (au démarrage, puis toutes les 12h, plus une vérification
immédiate à chaque ouverture du Tableau de bord par un admin — ce qui couvre
l'usage normal). Pour une vérification fiable à heure fixe même quand
personne ne visite le site, il faudrait soit passer à un plan Render payant,
soit faire "pinguer" le site régulièrement par un service externe gratuit
comme UptimeRobot (facultatif, non nécessaire pour un usage normal).
