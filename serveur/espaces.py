"""Un espace par utilisateur, et SON agent qui y travaille.

  donnees/espaces/<id>/          ← tout ce qui appartient à cette personne, et rien d'autre
      canal.db                   ← la conversation avec son agent (entrée / sortie)
      donnees/agent.db           ← ses offres, lettres, mémoire (base de l'agent)
      profil/, config/, boite/   ← son CV, son objectif, les réponses des recruteurs qui lui sont adressées
      agent.log

Chaque agent tourne dans un processus séparé, lancé avec :
  • AGENT_RACINE = son dossier (il ne peut rien lire d'autre par erreur de code) ;
  • un environnement MINIMAL (pas les secrets du serveur dont il n'a pas besoin : pas de SECRET_SERVEUR,
    pas de GOOGLE/APPLE…) ;
  • les règles de la plateforme : phase de test obligatoire, budget IA par jour, email de test = son compte.

Ajouter un métier = ajouter un agent au catalogue (catalogue.yaml) : le serveur sait déjà le faire tourner."""
from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

from contextlib import contextmanager

import yaml

from . import base, courrier, reglages

CATALOGUE = Path(__file__).resolve().parent / "catalogue.yaml"
RE_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SCHEMA_CANAL = """
CREATE TABLE IF NOT EXISTS entree (
    id INTEGER PRIMARY KEY, texte TEXT, fichier TEXT, nom_fichier TEXT,
    traite INTEGER DEFAULT 0, le TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sortie (
    id INTEGER PRIMARY KEY, genre TEXT DEFAULT 'texte', texte TEXT, boutons TEXT, fichier TEXT, legende TEXT,
    lu INTEGER DEFAULT 0, notifie INTEGER DEFAULT 0, le TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS etat (cle TEXT PRIMARY KEY, valeur TEXT);
"""


# ---------- Catalogue des agents ----------
def catalogue() -> dict:
    with open(CATALOGUE, encoding="utf-8") as f:
        return (yaml.safe_load(f) or {}).get("agents", {})


def catalogue_public() -> list[dict]:
    return [{"id": k, **{c: v.get(c) for c in ("nom", "titre", "description", "emoji", "couleur", "exemples",
                                               "disponible")}} for k, v in catalogue().items()]


# ---------- Dossiers ----------
def dossier(utilisateur_id: str) -> Path:
    if not RE_ID.match(utilisateur_id or ""):
        raise ValueError("identifiant invalide")
    d = reglages.donnees() / "espaces" / utilisateur_id
    d.mkdir(parents=True, exist_ok=True, mode=0o700)
    return d


@contextmanager
def canal(utilisateur_id: str):
    """La conversation de cet utilisateur (ouverte, validée, refermée à chaque usage)."""
    c = sqlite3.connect(dossier(utilisateur_id) / "canal.db", timeout=30)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA_CANAL)
        yield c
        c.commit()
    finally:
        c.close()


def dans_l_espace(utilisateur_id: str, chemin: str | Path) -> Path | None:
    """Un chemin n'est servi que s'il est À L'INTÉRIEUR de l'espace de cet utilisateur (pas de « ../ »)."""
    racine = dossier(utilisateur_id).resolve()
    p = Path(chemin).resolve()
    return p if p.is_file() and p.is_relative_to(racine) else None


# ---------- Conversation ----------
def ecrire(utilisateur_id: str, texte: str = "", fichier: Path | None = None, nom_fichier: str = ""):
    with canal(utilisateur_id) as c:
        c.execute("INSERT INTO entree (texte, fichier, nom_fichier) VALUES (?,?,?)",
                  (texte, str(fichier) if fichier else None, nom_fichier))


def conversation(utilisateur_id: str, apres_moi: int = 0, apres_agent: int = 0, limite: int = 200) -> dict:
    with canal(utilisateur_id) as c:
        moi = c.execute("SELECT id, texte, nom_fichier, le FROM entree WHERE id>? ORDER BY id DESC LIMIT ?",
                        (apres_moi, limite)).fetchall()
        agent = c.execute("SELECT id, genre, texte, boutons, fichier, legende, le FROM sortie WHERE id>? "
                          "ORDER BY id DESC LIMIT ?", (apres_agent, limite)).fetchall()
        if agent:
            c.execute("UPDATE sortie SET lu=1 WHERE id<=? AND lu=0", (agent[0]["id"],))
        occupe = c.execute("SELECT valeur FROM etat WHERE cle='occupe'").fetchone()
    return {
        "moi": [{"id": r["id"], "texte": r["texte"], "fichier": r["nom_fichier"] or None, "le": r["le"]}
                for r in reversed(moi)],
        "agent": [{"id": r["id"], "genre": r["genre"], "texte": r["texte"],
                   "boutons": json.loads(r["boutons"]) if r["boutons"] else None,
                   "fichier": bool(r["fichier"]), "nom_fichier": Path(r["fichier"]).name if r["fichier"] else None,
                   "legende": r["legende"], "le": r["le"]} for r in reversed(agent)],
        "occupe": bool(occupe and time.time() - float(occupe["valeur"]) < 20),
    }


def fichier_sortie(utilisateur_id: str, message_id: int) -> Path | None:
    with canal(utilisateur_id) as c:
        r = c.execute("SELECT fichier FROM sortie WHERE id=?", (message_id,)).fetchone()
    return dans_l_espace(utilisateur_id, r["fichier"]) if r and r["fichier"] else None


def a_notifier(utilisateur_id: str, delai_minutes: int) -> list[dict]:
    with canal(utilisateur_id) as c:
        rows = c.execute("SELECT id, texte, fichier FROM sortie WHERE lu=0 AND notifie=0 "
                         "AND le <= datetime('now', ?) ORDER BY id LIMIT 30", (f"-{int(delai_minutes)} minutes",))
        return [{"id": r["id"], "texte": r["texte"],
                 "fichier": str(dans_l_espace(utilisateur_id, r["fichier"]) or "") if r["fichier"] else None}
                for r in rows.fetchall()]


def marquer_notifies(utilisateur_id: str, ids: list[int]):
    with canal(utilisateur_id) as c:
        c.executemany("UPDATE sortie SET notifie=1 WHERE id=?", [(i,) for i in ids])


# ---------- Ce que l'agent sait (lecture seule de SA base) ----------
def _base_agent(utilisateur_id: str):
    f = dossier(utilisateur_id) / "donnees" / "agent.db"
    if not f.exists():
        return None
    c = sqlite3.connect(f"file:{f}?mode=ro", uri=True, timeout=10)
    c.row_factory = sqlite3.Row
    return c


@contextmanager
def _lecture(utilisateur_id: str):
    c = _base_agent(utilisateur_id)
    try:
        yield c
    finally:
        if c is not None:
            c.close()


def candidatures(utilisateur_id: str) -> list[dict]:
    with _lecture(utilisateur_id) as c:
        if c is None:
            return []
        rows = c.execute("SELECT id, titre, entreprise, ville, statut, score, note_lettre, url, maj_le FROM offres "
                         "WHERE statut NOT IN ('decouverte','enrichie','ecartee','erreur') "
                         "ORDER BY maj_le DESC LIMIT 100").fetchall()
    return [dict(r) for r in rows]


def phase_test(utilisateur_id: str) -> dict:
    defaut = {"tour": 1, "statut": "en_cours", "ids": [], "notes": []}
    with _lecture(utilisateur_id) as c:
        if c is None:
            return defaut
        r = c.execute("SELECT valeur FROM kv WHERE cle='phase_test'").fetchone()
    e = json.loads(r["valeur"]) if r and r["valeur"] not in (None, "null") else {}
    return {**defaut, **{k: e[k] for k in ("tour", "statut", "ids", "notes") if k in e}}


# ---------- Processus des agents ----------
_processus: dict[str, subprocess.Popen] = {}
_verrou = threading.Lock()


def _environnement(u: dict, agent: dict) -> dict:
    """Le strict nécessaire pour cet agent, et rien d'autre (les secrets du serveur ne sont pas transmis)."""
    d = dossier(u["id"])
    env = {k: os.environ[k] for k in ("PATH", "LANG", "LC_ALL", "TZ", "SYSTEMROOT", "TMPDIR", "SSL_CERT_FILE",
                                      "REQUESTS_CA_BUNDLE", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY") if k in os.environ}
    env.update({
        "AGENT_RACINE": str(d), "CANAL": "app", "PYTHONUNBUFFERED": "1", "PYTHONPATH": str(agent["chemin"]),
        "HOME": str(d),
        "EMAIL_TEST": u["email"],                                   # mode test : tout arrive sur SON email
        "REPONSE_A": courrier.adresse_reponse(u["jeton_reponse"]),  # les réponses des recruteurs reviennent ici
        "BOITE_DOSSIER": str(d / "boite"),                          # … et seulement les siennes
        "TEST_OBLIGATOIRE": "1",
        "BUDGET_JOUR_EUR": reglages.env("BUDGET_JOUR_EUR", "1"),
        "SIMULATION": "1" if reglages.simulation() else "0",
        "TRANSCRIPTION": "aucun",
    })
    for k in ("ANTHROPIC_API_KEY", "EMAIL_ADRESSE", "EMAIL_MOT_DE_PASSE", "SMTP_HOTE", "SMTP_PORT", "IMAP_HOTE",
              "MODELE_RAPIDE", "MODELE_QUALITE"):
        if reglages.env(k):
            env[k] = reglages.env(k)
    return env


def _chemin_agent(agent: dict) -> Path:
    p = Path(agent["dossier"])
    return p if p.is_absolute() else reglages.agents_dir() / p


def demarrer(utilisateur_id: str) -> bool:
    """Lance (ou relance) l'agent de cet utilisateur. Sans effet s'il tourne déjà."""
    u = base.q1("SELECT * FROM utilisateurs WHERE id=?", utilisateur_id)
    if not u or not u["agent"]:
        return False
    agent = catalogue().get(u["agent"])
    if not agent or not agent.get("disponible", True):
        return False
    with _verrou:
        p = _processus.get(utilisateur_id)
        if p and p.poll() is None:
            return True
        d = dossier(utilisateur_id)
        with canal(utilisateur_id):
            pass
        (d / "boite").mkdir(exist_ok=True)
        journal = d / "agent.log"
        if journal.exists() and journal.stat().st_size > 5_000_000:
            journal.replace(d / "agent.log.1")
        chemin = _chemin_agent(agent)
        env = _environnement(dict(u), {**agent, "chemin": chemin})
        with open(journal, "ab") as sortie:          # le processus garde sa propre copie du fichier
            _processus[utilisateur_id] = subprocess.Popen(
                [sys.executable, "-m", agent["module"], "--canal", "app"], cwd=chemin, env=env,
                stdin=subprocess.DEVNULL, stdout=sortie, stderr=subprocess.STDOUT)
        base.evenement(f"agent {u['agent']} démarré", utilisateur_id)
        return True


def arreter(utilisateur_id: str):
    with _verrou:
        p = _processus.pop(utilisateur_id, None)
    if p and p.poll() is None:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()


def en_marche(utilisateur_id: str) -> bool:
    p = _processus.get(utilisateur_id)
    return bool(p and p.poll() is None)


def arreter_tout():
    for uid in list(_processus):
        arreter(uid)


def surveiller():
    """Toutes les minutes : chaque utilisateur qui a choisi un agent a son agent en marche (relancé s'il s'est arrêté)."""
    for u in base.q("SELECT id FROM utilisateurs WHERE agent IS NOT NULL"):
        if not en_marche(u["id"]):
            try:
                demarrer(u["id"])
            except Exception as e:
                base.evenement(f"agent impossible à démarrer : {type(e).__name__}", u["id"])


def choisir_agent(utilisateur_id: str, agent_id: str):
    if agent_id not in catalogue() or not catalogue()[agent_id].get("disponible", True):
        raise KeyError(agent_id)
    ancien = base.q1("SELECT agent FROM utilisateurs WHERE id=?", utilisateur_id)["agent"]
    if ancien and ancien != agent_id:
        arreter(utilisateur_id)          # changer de métier = repartir d'un espace propre (pas de mélange)
        supprimer_donnees(utilisateur_id)
    with base.tx() as c:
        c.execute("UPDATE utilisateurs SET agent=? WHERE id=?", (agent_id, utilisateur_id))
    demarrer(utilisateur_id)


def supprimer_donnees(utilisateur_id: str):
    if not RE_ID.match(utilisateur_id or ""):
        raise ValueError("identifiant invalide")
    arreter(utilisateur_id)
    shutil.rmtree(reglages.donnees() / "espaces" / utilisateur_id, ignore_errors=True)
