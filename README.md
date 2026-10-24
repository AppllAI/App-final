# Agents Emploi — l'application

Le site (GitHub Pages, gratuit) + le serveur qui fait tourner **un agent par utilisateur** (Agent Avocat,
Agent Student… et tous ceux qu'on ajoutera).

```
 Téléphone / ordinateur                 Serveur (Docker)                           Dépôts d'agents
 ┌──────────────────────┐   HTTPS   ┌──────────────────────────────┐          ┌──────────────────┐
 │ site/ (GitHub Pages) │ ────────► │ API (connexion, conversation)│          │ Agent-avocat     │
 │ accueil + mon espace │ ◄──────── │ espaces/<utilisateur>/       │ ◄─────── │ agent-student-   │
 └──────────────────────┘           │   └─ son agent (processus)   │  catalogue│ (demain : santé…)│
                                     │ boîte mail du service        │          └──────────────────┘
                                     └──────────────────────────────┘
```

## Ce que vit l'utilisateur

1. Il ouvre le site → **Créer mon espace** → Google, Apple ou un code reçu par email (aucun mot de passe).
2. Il choisit son agent, dépose son CV (PDF) et dit ce qu'il cherche, dans la discussion.
3. **Phase de test obligatoire** : l'agent lui envoie 3 candidatures sur SON email, exactement comme un recruteur les
   recevrait. Il note sur 20 et explique ce qu'il aime ou pas → l'agent retient, réécrit, refait un test.
   Après **2 tests et au moins 15/20**, l'agent demande son **accord** ; s'il dit oui, il écrit aux recruteurs.
4. Il suit tout dans son espace (Discussion, Candidatures, Phase de test, Réglages) et, s'il coche
   « Recevoir par email », reçoit un récapitulatif (lettres en PDF jointes) dès que son agent a besoin de lui.
5. « Supprimer mon compte » efface tout, définitivement.

## Ajouter un nouvel agent (un nouveau métier)

Oui : on garde **un dépôt par agent**, et on les branche tous au même serveur. Pour un nouveau métier :
1. copier un agent existant (même moteur) et adapter ce qui est propre au métier : `prompts/`, `agents/sources.py`,
   `agents/garde.py`, `objectif_exemple.yaml` ;
2. ajouter un bloc dans `serveur/catalogue.yaml` (nom, emoji, dépôt, branche) ;
3. redéployer le serveur. Le site l'affiche tout seul.

## Sécurité (résumé)

| Risque | Protection |
|---|---|
| Vol de mot de passe | Aucun mot de passe : Google / Apple (signature vérifiée) ou code email à usage unique (10 min, 5 essais, empreinte HMAC) |
| Force brute, spam | Limites par IP, par email et par utilisateur |
| Vol de session | Jeton aléatoire 256 bits, gardé en empreinte SHA-256 côté serveur, 30 jours, révocable |
| Un utilisateur lit les données d'un autre | Un dossier et un processus d'agent par personne ; chaque fichier servi est vérifié « à l'intérieur de SON espace » ; les réponses des recruteurs sont routées par un jeton personnel |
| Injection dans le site | CSP stricte (aucun script en ligne), tout texte inséré en `textContent` |
| Autres sites qui appellent l'API | CORS limité à l'adresse du site ; en-têtes de sécurité sur toutes les réponses |
| Fuite de secrets | Secrets uniquement en variables d'environnement sur le serveur ; les agents ne reçoivent que ce qui leur sert |
| Fichiers piégés | CV : PDF uniquement, 10 Mo max, nom choisi par le serveur |
| Droit à l'oubli | Suppression complète du compte et des données en un clic |

## Mise en ligne, pas à pas

### 1. Le site (GitHub Pages, gratuit) — 2 minutes

1. Fusionne cette branche dans `main` (ou demande-le à Claude).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le site apparaît à **https://brrrr999.github.io/App-final/** (onglet *Actions* pour suivre).
   Tant que le serveur n'existe pas, l'espace fonctionne en **mode démo** (réponses fictives).

### 2. Le serveur (~4 €/mois) — 20 minutes

GitHub Pages n'héberge que des pages : les agents, eux, doivent tourner jour et nuit sur un vrai serveur.
Le moins cher et le plus simple : un petit serveur Hetzner (CX22, ~4 €/mois, en Allemagne = données dans l'UE).

1. Crée un compte sur hetzner.com → *Cloud* → *Add server* : Ubuntu 24.04, CX22, image « Docker CE » (App).
2. Note l'adresse IP (ex. `203.0.113.7`). L'adresse de ton API sera `api.203-0-113-7.sslip.io`
   (sslip.io est gratuit : pas de nom de domaine à acheter, HTTPS automatique).
3. Connecte-toi (`ssh root@203.0.113.7`) puis :
   ```
   git clone -b claude/optimize-agents-pdf-files-szofvc https://github.com/brrrr999/App-final
   cd App-final/deploiement && cp .env.exemple .env && nano .env      # remplis les valeurs
   docker compose up -d --build
   ```
4. Vérifie : `https://api.203-0-113-7.sslip.io/api/sante` doit répondre `{"ok":true,…}`.
5. Dans `site/config.js`, mets `API: "https://api.203-0-113-7.sslip.io"` et pousse sur `main` : le site est branché.

Mettre à jour le serveur plus tard : `git pull && docker compose up -d --build`.
Sauvegarde : le volume Docker `donnees` contient toutes les données des utilisateurs.

### 3. La boîte mail du service

Crée une adresse Gmail dédiée (ex. `agents.emploi.be@gmail.com`), active la validation en 2 étapes, puis
*Mot de passe des applications* → colle-le dans `EMAIL_MOT_DE_PASSE`. Elle envoie les codes de connexion,
les candidatures (« De : Prénom Nom ») et reçoit les réponses des recruteurs (adresse `…+jeton@gmail.com`
propre à chaque utilisateur). Limite Gmail : ~500 emails/jour — largement assez pour la bêta ; ensuite, un nom de
domaine et un service d'envoi (Brevo, Amazon SES) pour une adresse plus professionnelle.

### 4. Connexion Google (gratuit) et Apple (99 $/an)

- **Google** : console.cloud.google.com → *API et services → Identifiants → Créer un ID client OAuth* →
  « Application Web » → *Origines JavaScript autorisées* : `https://brrrr999.github.io` → copie l'ID dans
  `GOOGLE_CLIENT_ID`. Le bouton apparaît tout seul.
- **Apple** : nécessite un compte Apple Developer (99 $/an). Crée un *Services ID* avec « Sign in with Apple »,
  domaine `brrrr999.github.io`, puis mets-le dans `APPLE_CLIENT_ID`. Sans lui, le bouton reste caché.
- La connexion par **code email** marche toujours, sans rien configurer.

### Plus tard : les stores

Le site est déjà une application installable (icône sur l'écran d'accueil, plein écran). Pour l'App Store et le
Play Store, on emballera **le même site** avec Capacitor : pas de réécriture.

## Développement

```
pip install -r requirements.txt httpx
sh deploiement/agents.sh agents                 # télécharge les agents du catalogue
python -m unittest discover tests -v            # 12 tests, dont un vrai agent de bout en bout
SIMULATION=1 SITE_ORIGINE=http://localhost:8080 python -m serveur     # API sur :8000
cd site && python -m http.server 8080            # site sur :8080 (config.js → API http://localhost:8000)
```
