#!/bin/sh
# Télécharge chaque agent « disponible » du catalogue dans $1 (un dossier par dépôt).
set -e
DEST="$1"; mkdir -p "$DEST"
python - "$DEST" <<'PY'
import subprocess, sys, yaml
dest = sys.argv[1]
for nom, a in yaml.safe_load(open("serveur/catalogue.yaml"))["agents"].items():
    if not a.get("disponible", True) or not a.get("depot"):
        continue
    cmd = ["git", "clone", "--depth", "1", "-b", a.get("branche", "main"), a["depot"], f"{dest}/{a['dossier']}"]
    print("→", nom, " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)
PY
