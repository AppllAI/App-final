# Notes pour Claude

- Projet en français (code, commentaires, messages). Site en HTML/CSS/JS sans outil de build, publié tel quel sur
  GitHub Pages depuis `site/`.
- Ce dépôt est PUBLIC : rien d'autre que le site. Le serveur, le moteur et les métiers sont dans `brrrr999/Agent`
  (privé) ; l'API qu'appelle le site y est décrite dans `serveur/principal.py`.
- Tout texte venant du serveur s'insère avec `textContent`, jamais `innerHTML` ; pas de script ni de style en ligne
  (CSP stricte dans chaque page) — les styles dynamiques passent par `element.style.setProperty`.
- Connexion : Google uniquement (flux « code d'autorisation » + portée gmail.send). Le mode démo (`config.js` vide)
  doit toujours fonctionner : chaque route de l'API a sa réponse dans `demo.js`.
- Mobile d'abord ; respecter `prefers-reduced-motion` ; jamais d'avis ou de chiffres inventés.
- Avant de livrer : vérifier les pages dans un navigateur (téléphone 390 px et grand écran), sans erreur console.
