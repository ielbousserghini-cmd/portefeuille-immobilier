# Tâches automatiques GitHub — à activer une fois

Ces deux fichiers doivent se trouver dans `.github/workflows/` pour que GitHub
les exécute. Ils sont rangés ici parce que le jeton utilisé pour envoyer le code
n'a pas le droit de créer des tâches automatiques (protection normale de GitHub).

- `assistant-daily.yml` : chaque matin à 8 h (heure du Maroc), réveille
  l'extranet sur Render et lance le passage des agents (briefing sur le
  téléphone, rapport PDF et sauvegarde du jour). Sans lui, le briefing ne part
  que si quelqu'un a ouvert l'extranet dans l'heure.
- `ci.yml` : à chaque modification, vérifie que l'app se construit, que le
  serveur se charge, et qu'aucune dépendance n'a de faille grave.

## Activation (2 minutes, depuis le site GitHub)

1. Sur github.com, ouvre le dépôt `portefeuille-immobilier`.
2. **Add file → Create new file**.
3. Nom du fichier : `.github/workflows/assistant-daily.yml`.
4. Colle le contenu de `docs/github-workflows/assistant-daily.yml`, puis
   **Commit changes**.
5. Recommence avec `.github/workflows/ci.yml`.

Optionnel, pour verrouiller le déclencheur quotidien : crée un secret
`CRON_SECRET` (Settings → Secrets and variables → Actions) et la même variable
`CRON_SECRET` sur Render (Environment). Sans eux, la route reste ouverte mais
ne fait rien de plus qu'un passage par jour, après 7 h.
