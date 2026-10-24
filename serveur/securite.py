"""Garde-fous : limites de fréquence (anti force brute / anti spam) et en-têtes HTTP de sécurité."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_fenetres: dict[str, deque] = defaultdict(deque)
_verrou = threading.Lock()


def limiter(cle: str, maximum: int, secondes: int):
    """Au plus `maximum` appels par `secondes` pour cette clé (IP, email, utilisateur…), sinon 429."""
    maintenant = time.monotonic()
    with _verrou:
        f = _fenetres[cle]
        while f and f[0] <= maintenant - secondes:
            f.popleft()
        if len(f) >= maximum:
            raise HTTPException(429, "Trop de tentatives. Réessaie dans quelques minutes.")
        f.append(maintenant)


def reinitialiser():
    with _verrou:
        _fenetres.clear()


def ip(requete: Request) -> str:
    return requete.client.host if requete.client else "?"


ENTETES = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "cross-origin",
}
TAILLE_MAX = 10 * 1024 * 1024        # 10 Mo par requête (un CV PDF tient largement dedans)


async def intergiciel(requete: Request, suite):
    longueur = requete.headers.get("content-length")
    if longueur and longueur.isdigit() and int(longueur) > TAILLE_MAX:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Fichier trop lourd (10 Mo maximum)."}, status_code=413)
    reponse = await suite(requete)
    for k, v in ENTETES.items():
        reponse.headers.setdefault(k, v)
    return reponse
