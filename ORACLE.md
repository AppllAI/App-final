# Installer le serveur sur Oracle Cloud (gratuit pour toujours)

On utilise l'offre **Always Free** d'Oracle : une machine Ampere A1 de **2 cœurs et 12 Go de mémoire**, gratuite sans
limite de durée. Les 300 € d'essai ne sont pas nécessaires : on n'utilise que des éléments marqués « Always Free »,
donc rien ne change ni ne se paie à la fin des 30 jours d'essai.

Ce qu'il te faut avant de commencer :
- ta **clé Claude** (console.anthropic.com → *API Keys*) ;
- une **adresse Gmail dédiée** au service et son **mot de passe d'application** (Google → Sécurité → validation en
  2 étapes → *Mots de passe des applications*) ;
- le fichier [`deploiement/oracle.sh`](deploiement/oracle.sh), copié dans un bloc-notes, avec les 4 lignes
  « À REMPLIR » complétées. **Ne l'envoie à personne** (ni à Claude) : il contient tes secrets.

## 1. Créer la machine (10 minutes)

1. Connecte-toi sur https://cloud.oracle.com → menu **☰** en haut à gauche → **Compute** → **Instances**.
2. Bouton **Create instance**.
3. **Name** : `agents-emploi`.
4. **Image and shape** → **Edit** :
   - **Change image** → **Canonical Ubuntu** → version **24.04** → *Select image* ;
   - **Change shape** → **Ampere** → coche **VM.Standard.A1.Flex** → **2** OCPUs, **12** GB memory →
     *Select shape*. Vérifie l'étiquette **« Always Free-eligible »**.
5. **Networking** : laisse *Create new virtual cloud network* et *Create new public subnet* ;
   vérifie que **Assign a public IPv4 address** est coché.
6. **Add SSH keys** : *Generate a key pair for me* → **Save private key** (garde ce fichier, c'est la clé de la
   machine ; tu n'en auras normalement pas besoin).
7. Tout en bas, **Show advanced options** → onglet **Management** → **Paste cloud-init script** →
   colle **tout** le contenu de ton `oracle.sh` complété.
8. **Create**. Si Oracle répond *Out of capacity* : change d'*Availability domain* (étape 4, AD-2 ou AD-3) ou
   réessaie un peu plus tard (la machine gratuite est très demandée).

## 2. Ouvrir le web (2 minutes)

Par défaut, Oracle ne laisse entrer que la connexion d'administration. On ouvre les ports web :
1. Sur la page de ton instance : section **Primary VNIC** → clique sur le lien du **Subnet**.
2. Onglet **Security** (ou *Security Lists*) → **Default Security List for …**.
3. **Add Ingress Rules** : *Source CIDR* `0.0.0.0/0` · *IP Protocol* **TCP** · *Destination Port Range* `80,443`
   → **Add Ingress Rules**.

## 3. Vérifier

1. Sur la page de l'instance, note l'**adresse IP publique** (ex. `141.145.12.34`).
2. Attends ~10 minutes après la création, puis ouvre :
   `https://api.141-145-12-34.sslip.io/api/sante` (ton IP, avec des tirets à la place des points).
   Tu dois voir `{"ok":true, …}`.
3. **Envoie l'adresse IP à Claude** (ce n'est pas un secret) : il branche le site dessus (`site/config.js`).

## 4. Ne jamais payer (2 minutes, recommandé)

- **Oracle** : menu ☰ → **Billing & Cost Management** → **Budgets** → *Create Budget* : montant **1 €**,
  alerte à 1 % → ton email. Tant que tu ne cliques pas sur « Upgrade to Pay As You Go », Oracle ne peut rien te
  facturer ; le budget te prévient si quelque chose n'est pas « Always Free ».
- **Claude** : console.anthropic.com → **Settings → Limits** → fixe une **limite de dépense mensuelle**
  (ex. 20 €). Le serveur limite déjà chaque utilisateur à 1 € par jour (`BUDGET_JOUR_EUR`).

## À savoir

- **Machine « inactive »** : Oracle peut récupérer une machine gratuite qui travaille trop peu pendant 7 jours
  (processeur, réseau et mémoire sous 20 %). Avec quelques utilisateurs actifs, ça n'arrive pas ; sans aucun
  utilisateur, ça peut. Les données restent sur le disque, il suffit de redémarrer l'instance (bouton *Start*).
  Passer le compte en « Pay As You Go » supprime ce risque, sans frais tant qu'on reste dans « Always Free »
  (garde alors le budget d'alerte).
- **Mises à jour** : chaque nuit à 3h30, le serveur récupère la dernière version sur GitHub et redémarre seul.
- **Sauvegardes** : chaque nuit à 4h, une copie des données dans `/var/backups/agents` (7 jours gardés).
- **Journal d'installation** : `/var/log/agents-emploi.log` sur la machine.
