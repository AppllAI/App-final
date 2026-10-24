# Notes pour Claude

- Projet en français (code, commentaires, messages). Python 3.11+ pour le serveur, site en HTML/CSS/JS sans outil de build.
- `serveur/` : API FastAPI. Chaque utilisateur a un espace isolé (`espaces.py`) et SON processus d'agent.
  Les agents sont des dépôts séparés listés dans `serveur/catalogue.yaml` (contrat d'agent décrit en tête du fichier).
- `site/` : publié tel quel sur GitHub Pages. Tout texte venant du serveur s'insère avec `textContent`, jamais
  `innerHTML` ; pas de script ni de style en ligne (CSP stricte dans chaque page).
- Sécurité : aucun secret dans le dépôt (variables d'environnement seulement), aucun chemin de fichier venant du
  client, tout accès à un fichier vérifié par `espaces.dans_l_espace`.
- Avant de livrer : `python -m unittest discover tests -v` doit passer (avec `AGENTS_DIR` contenant Agent-avocat pour
  le test de bout en bout).
