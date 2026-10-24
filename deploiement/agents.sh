#!/bin/sh
# Télécharge chaque agent « disponible » du catalogue dans $1 (un dossier par dépôt).
# Branche principale d'abord ; si elle n'a pas encore la version « app » (canaux/app.py), la branche de dev.
set -e
DEST="$1"; mkdir -p "$DEST"
python - "$DEST" <<'PY'
import os, shutil, subprocess, sys, yaml
dest = sys.argv[1]
for nom, a in yaml.safe_load(open("serveur/catalogue.yaml"))["agents"].items():
    if not a.get("disponible", True) or not a.get("depot"):
        continue
    cible = f"{dest}/{a['dossier']}"
    for branche in [a.get("branche", "main"), a.get("branche_dev")]:
        if not branche:
            continue
        shutil.rmtree(cible, ignore_errors=True)
        print("→", nom, branche, flush=True)
        if subprocess.run(["git", "clone", "-q", "--depth", "1", "-b", branche, a["depot"], cible]).returncode == 0 \
                and os.path.exists(f"{cible}/{a['module']}/canaux/app.py"):
            break
    else:
        sys.exit(f"Agent {nom} : aucune branche utilisable")
PY
