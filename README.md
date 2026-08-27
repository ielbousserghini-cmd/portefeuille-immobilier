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
sauvegarde" (visible par l'admin) télécharge un fichier `.json` de toutes
les données à un instant donné — utile à garder de côté de temps en temps.
