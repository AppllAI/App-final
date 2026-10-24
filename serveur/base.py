"""Base du serveur (SQLite) : comptes, sessions, codes de connexion, journal de sécurité.
Les données de chaque utilisateur (CV, offres, lettres, mémoire) ne sont PAS ici : elles vivent dans son propre
dossier, géré par son agent (voir espaces.py)."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager

from . import reglages

SCHEMA = """
CREATE TABLE IF NOT EXISTS utilisateurs (
    id TEXT PRIMARY KEY,                 -- identifiant aléatoire (uuid4), jamais l'email
    email TEXT UNIQUE NOT NULL,
    nom TEXT,
    fournisseur TEXT,                    -- google | apple | email
    agent TEXT,                          -- agent choisi (catalogue.yaml)
    notif_email INTEGER DEFAULT 1,       -- recevoir les messages de l'agent par email
    jeton_reponse TEXT UNIQUE,           -- adresse de réponse propre à l'utilisateur (+jeton)
    cree_le TEXT DEFAULT CURRENT_TIMESTAMP,
    vu_le REAL
);
CREATE TABLE IF NOT EXISTS sessions (
    jeton_hash TEXT PRIMARY KEY,         -- seule l'empreinte SHA-256 est gardée : une fuite de la base ne donne rien
    utilisateur_id TEXT NOT NULL,
    expire_le REAL NOT NULL,
    cree_le TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS codes (
    email_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expire_le REAL NOT NULL, essais INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS securite (
    id INTEGER PRIMARY KEY, evenement TEXT, utilisateur_id TEXT, ip TEXT, le TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS kv (cle TEXT PRIMARY KEY, valeur TEXT);
"""

_c: sqlite3.Connection | None = None
_verrou = threading.RLock()


def connexion() -> sqlite3.Connection:
    global _c
    with _verrou:
        if _c is None:
            _c = sqlite3.connect(reglages.donnees() / "serveur.db", timeout=30, check_same_thread=False)
            _c.row_factory = sqlite3.Row
            _c.execute("PRAGMA journal_mode=WAL")
            _c.execute("PRAGMA foreign_keys=ON")
            _c.executescript(SCHEMA)
        return _c


def fermer():
    global _c
    with _verrou:
        if _c is not None:
            _c.close()
            _c = None


@contextmanager
def tx():
    with _verrou:
        c = connexion()
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise


def q(sql, *p):
    with _verrou:
        return connexion().execute(sql, p).fetchall()


def q1(sql, *p):
    with _verrou:
        return connexion().execute(sql, p).fetchone()


def kv_get(cle, defaut=None):
    r = q1("SELECT valeur FROM kv WHERE cle=?", cle)
    return r["valeur"] if r else defaut


def kv_set(cle, valeur):
    with tx() as c:
        c.execute("INSERT OR REPLACE INTO kv (cle, valeur) VALUES (?,?)", (cle, str(valeur)))


def evenement(quoi: str, utilisateur_id: str | None = None, ip: str | None = None):
    """Journal de sécurité (connexions, suppressions de compte…) : jamais de code ni de mot de passe dedans."""
    with tx() as c:
        c.execute("INSERT INTO securite (evenement, utilisateur_id, ip) VALUES (?,?,?)", (quoi, utilisateur_id, ip))
