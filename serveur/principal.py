"""L'API du site. Toutes les routes sauf /api/sante, /api/agents et /api/auth/* exigent une session.

  POST /api/auth/code           {email}            → envoie un code à 6 chiffres
  POST /api/auth/code/verifier  {email, code}      → session
  POST /api/auth/google         {jeton}            → session (Google Identity Services)
  POST /api/auth/apple          {jeton}            → session (Sign in with Apple)
  POST /api/auth/deconnexion
  GET  /api/moi · PATCH /api/moi {notif_email} · DELETE /api/moi (efface le compte ET toutes ses données)
  GET  /api/agents · POST /api/agent {agent}
  GET  /api/conversation?apres_moi=&apres_agent= · POST /api/messages {texte} · POST /api/cv (PDF)
  GET  /api/fichiers/{id} · GET /api/candidatures · GET /api/test"""
from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import base, courrier, espaces, identite, reglages, securite


class Email(BaseModel):
    email: str = Field(max_length=254)


class Code(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(max_length=12)


class Jeton(BaseModel):
    jeton: str = Field(max_length=8000)


class Message(BaseModel):
    texte: str = Field(min_length=1, max_length=4000)


class ChoixAgent(BaseModel):
    agent: str = Field(max_length=40)


class Reglages(BaseModel):
    notif_email: bool


def _boucle(f, secondes: int, arret: threading.Event):
    while not arret.wait(secondes):
        try:
            f()
        except Exception as e:                      # une tâche qui plante ne fait jamais tomber le serveur
            print(f"[{time.strftime('%H:%M:%S')}] {getattr(f, '__name__', 'tache')} : {type(e).__name__}: {e}",
                  flush=True)


@asynccontextmanager
async def _vie(app: FastAPI):
    base.connexion()
    arret = threading.Event()
    if reglages.env("SANS_TACHES") != "1":
        espaces.surveiller()
        for f, s in ((espaces.surveiller, 60), (courrier.relever, 120), (courrier.notifier, 120)):
            threading.Thread(target=_boucle, args=(f, s, arret), daemon=True).start()
    yield
    arret.set()
    espaces.arreter_tout()


app = FastAPI(title="Agents Emploi", lifespan=_vie, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=reglages.origines(), allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                   max_age=600)
app.middleware("http")(securite.intergiciel)


def _session(u: dict, requete: Request) -> dict:
    return {"jeton": identite.ouvrir_session(u["id"], securite.ip(requete)), "utilisateur": _profil(u)}


def _profil(u: dict) -> dict:
    return {"email": u["email"], "nom": u["nom"], "agent": u["agent"], "notif_email": bool(u["notif_email"]),
            "fournisseur": u["fournisseur"], "adresse_test": u["email"],
            "adresse_agent": courrier.adresse_reponse(u["jeton_reponse"]) if u["jeton_reponse"] else None}


# ---------- Public ----------
@app.get("/api/sante")
def sante():
    return {"ok": True, "google": bool(reglages.env("GOOGLE_CLIENT_ID")), "apple": bool(reglages.env("APPLE_CLIENT_ID")),
            "google_client_id": reglages.env("GOOGLE_CLIENT_ID"), "apple_client_id": reglages.env("APPLE_CLIENT_ID")}


@app.get("/api/agents")
def agents():
    return espaces.catalogue_public()


# ---------- Connexion ----------
@app.post("/api/auth/code")
def demander_code(d: Email, requete: Request):
    ip = securite.ip(requete)
    securite.limiter(f"code-ip:{ip}", 10, 3600)
    email = identite.normaliser(d.email)
    securite.limiter(f"code-email:{email}", 3, 900)
    identite.demander_code(email)
    return {"ok": True}


@app.post("/api/auth/code/verifier")
def verifier_code(d: Code, requete: Request):
    securite.limiter(f"verif-ip:{securite.ip(requete)}", 30, 900)
    email = identite.verifier_code(d.email, d.code)
    return _session(identite.trouver_ou_creer(email, None, "email"), requete)


@app.post("/api/auth/google")
def google(d: Jeton, requete: Request):
    securite.limiter(f"oauth-ip:{securite.ip(requete)}", 30, 900)
    email, nom = identite.verifier_google(d.jeton)
    return _session(identite.trouver_ou_creer(email, nom, "google"), requete)


@app.post("/api/auth/apple")
def apple(d: Jeton, requete: Request):
    securite.limiter(f"oauth-ip:{securite.ip(requete)}", 30, 900)
    email, nom = identite.verifier_apple(d.jeton)
    return _session(identite.trouver_ou_creer(email, nom, "apple"), requete)


@app.post("/api/auth/deconnexion")
def deconnexion(u: dict = Depends(identite.utilisateur_courant)):
    identite.fermer_session(u["_jeton"])
    return {"ok": True}


# ---------- Mon compte ----------
@app.get("/api/moi")
def moi(u: dict = Depends(identite.utilisateur_courant)):
    return {**_profil(u), "agent_en_marche": espaces.en_marche(u["id"])}


@app.patch("/api/moi")
def regler(d: Reglages, u: dict = Depends(identite.utilisateur_courant)):
    with base.tx() as c:
        c.execute("UPDATE utilisateurs SET notif_email=? WHERE id=?", (int(d.notif_email), u["id"]))
    return {"ok": True}


@app.delete("/api/moi")
def supprimer_compte(requete: Request, u: dict = Depends(identite.utilisateur_courant)):
    """Droit à l'effacement : le compte, les sessions et TOUTES les données (CV, lettres, mémoire) disparaissent."""
    espaces.supprimer_donnees(u["id"])
    with base.tx() as c:
        c.execute("DELETE FROM sessions WHERE utilisateur_id=?", (u["id"],))
        c.execute("DELETE FROM utilisateurs WHERE id=?", (u["id"],))
    base.evenement("compte supprimé", u["id"], securite.ip(requete))
    return {"ok": True}


@app.post("/api/agent")
def choisir(d: ChoixAgent, u: dict = Depends(identite.utilisateur_courant)):
    try:
        espaces.choisir_agent(u["id"], d.agent)
    except KeyError:
        raise HTTPException(404, "Cet agent n'existe pas (encore).")
    return {"ok": True}


# ---------- Conversation ----------
def _avec_agent(u: dict):
    if not u["agent"]:
        raise HTTPException(409, "Choisis d'abord ton agent.")


@app.get("/api/conversation")
def conversation(apres_moi: int = 0, apres_agent: int = 0, u: dict = Depends(identite.utilisateur_courant)):
    _avec_agent(u)
    return espaces.conversation(u["id"], max(0, apres_moi), max(0, apres_agent))


@app.post("/api/messages")
def envoyer(d: Message, u: dict = Depends(identite.utilisateur_courant)):
    _avec_agent(u)
    securite.limiter(f"msg:{u['id']}", 30, 60)
    espaces.ecrire(u["id"], d.texte.strip())
    espaces.demarrer(u["id"])
    return {"ok": True}


@app.post("/api/cv")
async def cv(fichier: UploadFile = File(...), u: dict = Depends(identite.utilisateur_courant)):
    _avec_agent(u)
    securite.limiter(f"cv:{u['id']}", 10, 3600)
    contenu = await fichier.read(securite.TAILLE_MAX + 1)
    if len(contenu) > securite.TAILLE_MAX:
        raise HTTPException(413, "Fichier trop lourd (10 Mo maximum).")
    if not contenu.startswith(b"%PDF"):
        raise HTTPException(400, "Envoie ton CV en PDF.")
    dossier = espaces.dossier(u["id"]) / "depots"
    dossier.mkdir(exist_ok=True)
    chemin = dossier / f"cv_{int(time.time())}.pdf"          # nom choisi par le serveur, jamais par le client
    chemin.write_bytes(contenu)
    espaces.ecrire(u["id"], "Voici mon CV.", chemin, "cv.pdf")
    espaces.demarrer(u["id"])
    return {"ok": True}


@app.get("/api/fichiers/{message_id}")
def telecharger(message_id: int, u: dict = Depends(identite.utilisateur_courant)):
    chemin = espaces.fichier_sortie(u["id"], message_id)
    if not chemin:
        raise HTTPException(404, "Fichier introuvable.")
    return FileResponse(chemin, filename=chemin.name,
                        media_type="application/pdf" if chemin.suffix.lower() == ".pdf" else "application/octet-stream")


@app.get("/api/candidatures")
def candidatures(u: dict = Depends(identite.utilisateur_courant)):
    return espaces.candidatures(u["id"]) if u["agent"] else []


@app.get("/api/test")
def phase_test(u: dict = Depends(identite.utilisateur_courant)):
    return espaces.phase_test(u["id"]) if u["agent"] else None
