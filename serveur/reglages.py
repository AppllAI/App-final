"""Réglages du serveur : uniquement des variables d'environnement (aucun secret dans le code ni sur GitHub).

Obligatoires en production (voir deploiement/.env.exemple) :
  SITE_ORIGINE          adresse du site (ex. https://brrrr999.github.io) — seule origine autorisée à appeler l'API
  ANTHROPIC_API_KEY     clé Claude utilisée par les agents
  EMAIL_ADRESSE / EMAIL_MOT_DE_PASSE   la boîte d'envoi du service (codes de connexion, candidatures, notifications)
Facultatifs : GOOGLE_CLIENT_ID, APPLE_CLIENT_ID (boutons de connexion), BUDGET_JOUR_EUR, DONNEES_DIR…"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def env(cle: str, defaut: str | None = None) -> str | None:
    v = os.getenv(cle)
    return v if v not in (None, "") else defaut


def donnees() -> Path:
    d = Path(env("DONNEES_DIR", str(RACINE / "donnees"))).resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


def origines() -> list[str]:
    return [o.strip().rstrip("/") for o in env("SITE_ORIGINE", "http://localhost:8000").split(",") if o.strip()]


def simulation() -> bool:
    """Sans clé Claude ni boîte mail : tout tourne pour de faux (développement, tests)."""
    return env("SIMULATION", "0") == "1" or not env("ANTHROPIC_API_KEY")


def secret() -> bytes:
    """Clé secrète du serveur (signe les codes de connexion). Fournie par SECRET_SERVEUR, sinon créée une fois
    et gardée dans le dossier de données, lisible par le seul propriétaire."""
    if env("SECRET_SERVEUR"):
        return env("SECRET_SERVEUR").encode()
    f = donnees() / ".secret"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
        f.chmod(0o600)
    return f.read_text().strip().encode()


def agents_dir() -> Path:
    return Path(env("AGENTS_DIR", str(RACINE / "agents"))).resolve()
