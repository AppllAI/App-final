# Agents Emploi — le site

> **Tu débutes avec GitHub ?** Lis d'abord [GUIDE.md](GUIDE.md) : où cliquer, quel fichier fait quoi.

Ce dépôt est **public** et ne contient que le site (publié gratuitement par GitHub Pages) :
**https://brrrr999.github.io/App-final/**

Le moteur des agents, les métiers et le serveur sont dans le dépôt **privé** `brrrr999/Agent`.

```
 Téléphone / ordinateur                      Serveur Oracle (dépôt privé « Agent »)
 ┌───────────────────────────┐   HTTPS   ┌─────────────────────────────────────────┐
 │ site/ (GitHub Pages)      │ ────────► │ API : connexion Google, espaces isolés  │
 │ accueil animé + mon espace│ ◄──────── │ un agent par utilisateur (moteur+métier)│ ──► Gmail de l'utilisateur
 └───────────────────────────┘           └─────────────────────────────────────────┘
```

## Ce que vit l'utilisateur
1. **Continuer avec Google** et cocher « Envoyer des e-mails en votre nom » (envoi seulement, jamais de lecture).
2. Choisir son agent, déposer son CV, dire ce qu'il cherche.
3. **Phase de test** : 3 candidatures arrivent sur SON Gmail. Il note sur 20. Au moins 2 tests et 15/20.
4. **Son accord**, puis l'agent postule depuis son Gmail, relance et trie les réponses.

## Fichiers
| Fichier | Rôle |
|---|---|
| `site/index.html` + `site/accueil.js` | Accueil : le parcours animé au défilement, puis chiffres, agents, avis, FAQ |
| `site/app.html` + `site/app.js` | L'espace personnel (connexion Google, discussion, candidatures, test, réglages) |
| `site/styles.css` | Tout le design (accent mauve `--accent` en haut du fichier) |
| `site/config.js` | **L'adresse du serveur** (vide = mode démo) |
| `site/demo.js` | Les fausses réponses du mode démo |
| `site/confidentialite.html` | Politique de confidentialité (exigée par Google) |
