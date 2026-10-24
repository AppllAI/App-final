"""Qui es-tu ? Connexion par Google, Apple, ou code à 6 chiffres reçu par email (aucun mot de passe stocké).

Sécurité :
  • Google / Apple : on vérifie la SIGNATURE du jeton avec leurs clés publiques, le destinataire (notre app),
    l'émetteur et l'expiration. Un jeton fabriqué ou volé pour une autre app est refusé.
  • Code email : 6 chiffres, valable 10 min, 5 essais max, stocké en empreinte HMAC (jamais en clair),
    limites par email et par adresse IP (anti force brute).
  • Session : jeton aléatoire de 256 bits, gardé en empreinte SHA-256, valable 30 jours, révocable."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
import uuid

from fastapi import Header, HTTPException

from . import base, courrier, reglages

DUREE_SESSION = 30 * 24 * 3600
DUREE_CODE = 10 * 60
RE_EMAIL = re.compile(r"^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$")
GOOGLE_CLES = "https://www.googleapis.com/oauth2/v3/certs"
APPLE_CLES = "https://appleid.apple.com/auth/keys"
_clients_jwk: dict = {}


def _empreinte(valeur: str) -> str:
    return hmac.new(reglages.secret(), valeur.encode(), hashlib.sha256).hexdigest()


def normaliser(email: str) -> str:
    email = (email or "").strip().lower()
    if not RE_EMAIL.match(email):
        raise HTTPException(400, "Adresse email invalide.")
    return email


# ---------- Comptes ----------
def trouver_ou_creer(email: str, nom: str | None, fournisseur: str) -> dict:
    email = normaliser(email)
    u = base.q1("SELECT * FROM utilisateurs WHERE email=?", email)
    if u:
        return dict(u)
    uid = str(uuid.uuid4())
    jeton = secrets.token_hex(6)                                  # 12 caractères : adresse de réponse personnelle
    with base.tx() as c:
        c.execute("INSERT INTO utilisateurs (id, email, nom, fournisseur, jeton_reponse) VALUES (?,?,?,?,?)",
                  (uid, email, (nom or "").strip()[:80] or None, fournisseur, jeton))
    base.evenement(f"compte créé ({fournisseur})", uid)
    return dict(base.q1("SELECT * FROM utilisateurs WHERE id=?", uid))


def ouvrir_session(utilisateur_id: str, ip: str | None = None) -> str:
    jeton = secrets.token_urlsafe(32)
    with base.tx() as c:
        c.execute("DELETE FROM sessions WHERE expire_le < ?", (time.time(),))
        c.execute("INSERT INTO sessions (jeton_hash, utilisateur_id, expire_le) VALUES (?,?,?)",
                  (hashlib.sha256(jeton.encode()).hexdigest(), utilisateur_id, time.time() + DUREE_SESSION))
    base.evenement("connexion", utilisateur_id, ip)
    return jeton


def fermer_session(jeton: str):
    with base.tx() as c:
        c.execute("DELETE FROM sessions WHERE jeton_hash=?", (hashlib.sha256(jeton.encode()).hexdigest(),))


def utilisateur_courant(authorization: str | None = Header(default=None)) -> dict:
    """Dépendance FastAPI : l'utilisateur de la session, sinon 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Connexion requise.")
    jeton = authorization[7:].strip()
    s = base.q1("SELECT utilisateur_id, expire_le FROM sessions WHERE jeton_hash=?",
                hashlib.sha256(jeton.encode()).hexdigest())
    if not s or s["expire_le"] < time.time():
        raise HTTPException(401, "Session expirée, reconnecte-toi.")
    u = base.q1("SELECT * FROM utilisateurs WHERE id=?", s["utilisateur_id"])
    if not u:
        raise HTTPException(401, "Compte introuvable.")
    with base.tx() as c:
        c.execute("UPDATE utilisateurs SET vu_le=? WHERE id=?", (time.time(), u["id"]))
    return {**dict(u), "_jeton": jeton}


# ---------- Code par email ----------
def demander_code(email: str):
    email = normaliser(email)
    code = f"{secrets.randbelow(10 ** 6):06d}"
    with base.tx() as c:
        c.execute("INSERT OR REPLACE INTO codes (email_hash, code_hash, expire_le, essais) VALUES (?,?,?,0)",
                  (_empreinte(email), _empreinte(f"{email}:{code}"), time.time() + DUREE_CODE))
    courrier.envoyer(email, f"{code} — ton code de connexion",
                     f"Bonjour,\n\nTon code de connexion : {code}\n\nIl est valable 10 minutes. "
                     "Si tu n'as rien demandé, ignore simplement cet email : personne ne peut se connecter sans ce code.\n")


def verifier_code(email: str, code: str) -> str:
    """Renvoie l'email vérifié, ou lève 400. Le code est détruit après usage ou après 5 essais."""
    email = normaliser(email)
    code = re.sub(r"\D", "", code or "")
    cle = _empreinte(email)
    r = base.q1("SELECT * FROM codes WHERE email_hash=?", cle)
    if not r or r["expire_le"] < time.time() or r["essais"] >= 5:
        raise HTTPException(400, "Code expiré : demande-en un nouveau.")
    if not hmac.compare_digest(r["code_hash"], _empreinte(f"{email}:{code}")):
        with base.tx() as c:
            c.execute("UPDATE codes SET essais=essais+1 WHERE email_hash=?", (cle,))
        raise HTTPException(400, "Code incorrect.")
    with base.tx() as c:
        c.execute("DELETE FROM codes WHERE email_hash=?", (cle,))
    return email


# ---------- Google / Apple ----------
def _decoder(jeton: str, url_cles: str, audience: str, emetteurs: list[str]) -> dict:
    import jwt
    if url_cles not in _clients_jwk:
        _clients_jwk[url_cles] = jwt.PyJWKClient(url_cles, cache_keys=True, lifespan=3600)
    try:
        cle = _clients_jwk[url_cles].get_signing_key_from_jwt(jeton)
        return jwt.decode(jeton, cle.key, algorithms=["RS256"], audience=audience, issuer=emetteurs,
                          options={"require": ["exp", "iat", "iss", "aud", "sub"]}, leeway=30)
    except Exception as e:
        raise HTTPException(401, "Connexion refusée (jeton invalide).") from e


def verifier_google(jeton: str) -> tuple[str, str | None]:
    client = reglages.env("GOOGLE_CLIENT_ID")
    if not client:
        raise HTTPException(503, "Connexion Google pas encore activée.")
    d = _decoder(jeton, GOOGLE_CLES, client, ["accounts.google.com", "https://accounts.google.com"])
    if not d.get("email") or not d.get("email_verified"):
        raise HTTPException(401, "Adresse Google non vérifiée.")
    return d["email"], d.get("name")


def verifier_apple(jeton: str) -> tuple[str, str | None]:
    client = reglages.env("APPLE_CLIENT_ID")
    if not client:
        raise HTTPException(503, "Connexion Apple pas encore activée.")
    d = _decoder(jeton, APPLE_CLES, client, ["https://appleid.apple.com"])
    if not d.get("email") or str(d.get("email_verified")).lower() not in ("true", "1"):
        raise HTTPException(401, "Adresse Apple non vérifiée.")
    return d["email"], None
