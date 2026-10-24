# Guide pas à pas (pour débuter avec GitHub)

## 1. Les 5 mots à connaître

| Mot | En clair |
|---|---|
| **Dépôt** (*repository*) | Un dossier de projet sur GitHub. Tu en as 3 : `App-final` (l'application), `Agent-avocat`, `agent-student-`. |
| **Branche** (*branch*) | Une version parallèle du dossier. `main` = la version officielle. Claude travaille sur une autre branche (`claude/optimize-agents-pdf-files-szofvc`) pour ne rien casser sans ton accord. |
| **Pull Request (PR)** | Une demande : « voici mes changements, tu veux les mettre dans `main` ? ». On peut tout relire avant. |
| **Merge** (fusionner) | Tu acceptes la PR : les changements entrent dans `main`. |
| **Actions** | Les robots de GitHub : ils testent le code et publient le site tout seuls. Onglet **Actions** du dépôt. |

## 2. Voir le travail de Claude

Sur la page d'un dépôt, le bouton **`main`** en haut à gauche (au-dessus des fichiers) → choisis
**`claude/optimize-agents-pdf-files-szofvc`**. Ou plus simple : onglet **Pull requests**, ouvre la PR, onglet
**Files changed** (vert = ajouté, rouge = retiré).

## 3. Fusionner une Pull Request (à faire 3 fois, une par dépôt)

1. Va sur le dépôt (ex. https://github.com/brrrr999/Agent-avocat).
2. Clique sur l'onglet **Pull requests** (en haut, entre *Issues* et *Actions*).
3. Clique sur la PR ouverte par Claude.
4. Descends en bas de la page : bouton vert **Merge pull request** → puis **Confirm merge**.
5. (Facultatif) **Delete branch** : tu peux, c'est sans risque.

**Ordre conseillé : `Agent-avocat`, puis `agent-student-`, puis `App-final`.** (Ce n'est pas obligatoire : le serveur
sait prendre la bonne version dans tous les cas.)

## 4. Mettre le site en ligne (GitHub Pages, gratuit)

À faire **une seule fois**, de préférence **avant** de fusionner la PR d'`App-final` :

1. Va sur https://github.com/brrrr999/App-final
2. Clique sur **Settings** (l'onglet avec une roue dentée, tout à droite des onglets).
3. Dans le menu de gauche, section *Code and automation*, clique sur **Pages**.
4. Sous **Build and deployment**, dans la liste **Source**, choisis **GitHub Actions**. (C'est enregistré tout seul.)
5. Fusionne la PR d'`App-final` (étape 3). Le robot publie le site en ~1 minute.
6. Onglet **Actions** : une ligne « Site (GitHub Pages) » avec une **coche verte** = c'est en ligne.
   Si tu avais fusionné avant l'étape 4 : clique sur « Site (GitHub Pages) » à gauche → **Run workflow** → **Run workflow**.
7. Ton site : **https://brrrr999.github.io/App-final/**

Tant que le serveur n'est pas en ligne, l'espace personnel fonctionne en **mode démo** (réponses fictives).

## 5. Les accès de Claude

Claude passe par l'application GitHub « Claude » : elle a déjà accès à tes 3 dépôts. Pour un **nouveau** dépôt
(ex. le futur agent Santé) :
1. Sur GitHub : ta photo en haut à droite → **Settings** → menu de gauche **Applications** → onglet
   **Installed GitHub Apps** → **Claude** → **Configure**.
2. Sous **Repository access** : coche *All repositories*, ou *Only select repositories* et ajoute le dépôt.
3. **Save**.
Si un jour Claude dit ne plus avoir accès : https://claude.ai/connect-github pour reconnecter ton compte.

Claude ne peut PAS cliquer à ta place dans **Settings** (Pages, accès) : c'est volontaire, ce sont tes réglages.

## 6. Quel fichier fait quoi

### App-final (l'application)
| Fichier | Rôle |
|---|---|
| `site/index.html` | La page d'accueil (ce que voient les visiteurs) |
| `site/app.html` + `site/app.js` | L'espace personnel : connexion, discussion, candidatures, phase de test, réglages |
| `site/styles.css` | Tout le design (couleurs, polices, animations) — l'accent mauve est `--accent` en haut du fichier |
| `site/config.js` | **L'adresse du serveur** : à remplir quand il sera en ligne (vide = mode démo) |
| `site/demo.js` | Les fausses réponses du mode démo |
| `serveur/principal.py` | Le serveur : toutes les adresses de l'API |
| `serveur/identite.py` | Connexion (Google, Apple, code email) et sécurité des sessions |
| `serveur/espaces.py` | Un espace isolé par utilisateur et le lancement de SON agent |
| `serveur/courrier.py` | Emails : codes de connexion, notifications, réponses des recruteurs |
| `serveur/catalogue.yaml` | **La liste des agents** : ajouter un métier = ajouter un bloc ici |
| `deploiement/` | Tout pour installer le serveur (Docker, HTTPS, modèle de réglages `.env.exemple`) |
| `tests/` | Les tests automatiques |
| `.github/workflows/` | Les robots : publication du site, tests |

### Agent-avocat / agent-student- (les agents)
| Fichier | Rôle |
|---|---|
| `metier.py` | **Ce qui est propre au métier** (sources spécialisées…) |
| `prompts/*.md` | Les consignes données à l'IA, en français (le « savoir-faire » du métier) |
| `agents/connecteurs.py` | **Le moteur commun** : EURES, Forem, pages carrières, alertes email |
| `agents/sources.py` | Organise toutes les sources et la recherche web |
| `agents/redacteur.py` | Écrit les lettres et les fait vérifier par le Juge |
| `agents/phase_test.py` | La phase de test (note sur 20, 2 tests, ton accord) |
| `memoire.py` | La mémoire longue (carnet de bord, souvenirs) |
| `pdf.py` | La mise en page des lettres et rapports en PDF |
| `canaux/app.py` | Le branchement de l'agent sur l'application |

## 7. Créer l'agent d'un nouveau métier

1. Demande à Claude : « crée l'agent Santé à partir d'Agent-avocat ». Il créera le dépôt (ou te dira de le créer :
   bouton **+** en haut à droite de GitHub → **New repository**), changera `metier.py`, les `prompts/`, les mots de la
   Garde et l'exemple d'objectif.
2. Il ajoutera le bloc dans `serveur/catalogue.yaml`. Après le redéploiement du serveur, l'agent apparaît sur le site.
