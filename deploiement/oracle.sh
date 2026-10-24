#!/bin/bash
# =====================================================================================================================
#  Installation complète du serveur sur Oracle Cloud (offre « Always Free » : Ampere A1, 2 cœurs, 12 Go, Ubuntu).
#
#  COMMENT L'UTILISER (voir ORACLE.md pour les captures pas à pas) :
#   1. Copie ce fichier dans un bloc-notes et remplis les 4 lignes « À REMPLIR » ci-dessous.
#   2. Oracle → Créer une instance → « Show advanced options » → onglet « Management »
#      → « Paste cloud-init script » → colle TOUT le texte → Créer.
#   3. 10 minutes plus tard, tout tourne. L'adresse de ton API est dans /root/ADRESSE_API.txt
#      (et c'est simplement : https://api.<ton IP avec des tirets>.sslip.io).
#
#  Tes secrets ne passent ni par GitHub ni par Claude : ils vont directement de ton bloc-notes à TON serveur.
# =====================================================================================================================

# ---------------------------- À REMPLIR ----------------------------
ANTHROPIC_API_KEY="colle-ici-ta-cle-claude"           # console.anthropic.com → API Keys
EMAIL_ADRESSE="ton.service@gmail.com"                 # l'adresse Gmail DÉDIÉE au service
EMAIL_MOT_DE_PASSE="abcdefghijklmnop"                 # son mot de passe d'application (16 lettres, sans espaces)
GOOGLE_CLIENT_ID=""                                   # facultatif : bouton « Continuer avec Google »
# --------------------------------------------------------------------

set -euo pipefail
exec > >(tee -a /var/log/agents-emploi.log) 2>&1
echo "=== Installation Agents Emploi : $(date) ==="

# 1. Système à jour + mises à jour de sécurité automatiques
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates unattended-upgrades iptables-persistent
dpkg-reconfigure -f noninteractive unattended-upgrades || true

# 2. Pare-feu de la machine (les images Ubuntu d'Oracle bloquent tout sauf SSH) : on ouvre le web (80, 443)
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
netfilter-persistent save

# 3. Mémoire d'appoint (2 Go) : le serveur ne plante jamais faute de mémoire
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# 4. Docker (version ARM installée automatiquement)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# 5. Le code (dépôt public : rien à fournir). Plus tard, dépôt privé → voir ORACLE.md (jeton en lecture seule)
if [ ! -d /opt/app-final ]; then git clone https://github.com/brrrr999/App-final /opt/app-final; fi
cd /opt/app-final/deploiement

# 6. Réglages : adresse gratuite avec HTTPS (sslip.io), secrets lisibles par root seulement
IP=$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)
DOMAINE="api.${IP//./-}.sslip.io"
umask 077
cat > .env <<EOF
DOMAINE_API=${DOMAINE}
SITE_ORIGINE=https://brrrr999.github.io
SITE_URL=https://brrrr999.github.io/App-final
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
BUDGET_JOUR_EUR=1
EMAIL_ADRESSE=${EMAIL_ADRESSE}
EMAIL_MOT_DE_PASSE=${EMAIL_MOT_DE_PASSE}
SMTP_HOTE=smtp.gmail.com
SMTP_PORT=465
IMAP_HOTE=imap.gmail.com
SECRET_SERVEUR=$(openssl rand -hex 32)
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
APPLE_CLIENT_ID=
MODE_ECONOME=1
MAX_AGENTS=12
TOURNEE_MIN=30
INACTIF_MIN=10
EOF
umask 022

# 7. Lancement (le serveur redémarre tout seul après une coupure ou un redémarrage de la machine)
docker compose up -d --build

# 8. Mise à jour automatique chaque nuit (nouvelle version sur GitHub → appliquée) + sauvegarde quotidienne gardée 7 jours
cat > /etc/cron.d/agents-emploi <<'EOF'
30 3 * * * root cd /opt/app-final && git pull -q && cd deploiement && docker compose up -d --build >> /var/log/agents-emploi.log 2>&1
0 4 * * * root mkdir -p /var/backups/agents && docker run --rm -v deploiement_donnees:/d -v /var/backups/agents:/b alpine tar czf /b/donnees-$(date +\%F).tgz -C /d . && find /var/backups/agents -mtime +7 -delete
EOF

echo "https://${DOMAINE}" > /root/ADRESSE_API.txt
echo "=== Terminé. API : https://${DOMAINE}/api/sante ==="
