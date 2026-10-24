"""Le courrier du service : une seule boîte d'envoi (la nôtre), pour que les utilisateurs n'aient RIEN à régler.

  • Codes de connexion et notifications : envoyés depuis la boîte du service.
  • Candidatures : envoyées par l'agent de chaque utilisateur avec « De : Prénom Nom <boîte du service> » et
    « Répondre à : service+JETON@… » — un alias propre à chaque utilisateur (Gmail et la plupart des boîtes
    acceptent le « +jeton »).
  • Réponses des recruteurs : le routeur lit la boîte du service et dépose chaque email UNIQUEMENT dans le dossier
    de l'utilisateur dont le jeton figure dans l'adresse. Un agent ne voit jamais le courrier des autres.
En SIMULATION, rien ne sort : les emails sont écrits dans donnees/courrier/*.eml."""
from __future__ import annotations

import email
import imaplib
import re
import smtplib
import time
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

from . import base, reglages

NOM_SERVICE = "Agents Emploi"


def adresse_service() -> str:
    return reglages.env("EMAIL_ADRESSE", "service@exemple.be")


def adresse_reponse(jeton: str) -> str:
    """service+jeton@domaine : les réponses des recruteurs reviennent dans la boîte du service, étiquetées."""
    local, domaine = adresse_service().split("@", 1)
    return f"{local.split('+')[0]}+{jeton}@{domaine}"


def envoyer(destinataire: str, sujet: str, texte: str, pieces: list[Path] | None = None):
    m = EmailMessage()
    m["From"] = f"{NOM_SERVICE} <{adresse_service()}>"
    m["To"] = destinataire
    m["Subject"] = sujet
    m["Date"] = formatdate(localtime=True)
    m["Message-ID"] = make_msgid(domain=adresse_service().split("@")[-1])
    m.set_content(texte)
    for p in pieces or []:
        if p.exists() and p.suffix.lower() == ".pdf":
            m.add_attachment(p.read_bytes(), maintype="application", subtype="pdf", filename=p.name)
    if reglages.simulation():
        d = reglages.donnees() / "courrier"
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{datetime.now():%Y%m%d_%H%M%S_%f}.eml").write_bytes(bytes(m))
        return
    hote, port = reglages.env("SMTP_HOTE", "smtp.gmail.com"), int(reglages.env("SMTP_PORT", "465"))
    serveur = (smtplib.SMTP_SSL(hote, port, timeout=30, local_hostname="localhost") if port == 465
               else smtplib.SMTP(hote, port, timeout=30, local_hostname="localhost"))
    with serveur as s:
        if port != 465:
            s.starttls()
        s.login(adresse_service(), reglages.env("EMAIL_MOT_DE_PASSE"))
        s.send_message(m)


# ---------- Réponses des recruteurs → le bon utilisateur ----------
_JETON = re.compile(r"\+([a-z0-9]{12})@", re.I)


def destinataire_jeton(msg) -> str | None:
    entetes = " ".join(str(msg.get(h, "")) for h in ("To", "Cc", "Delivered-To", "X-Original-To", "Envelope-To"))
    m = _JETON.search(entetes)
    return m.group(1).lower() if m else None


def deposer(brut: bytes) -> str | None:
    """Range un email reçu dans la boîte de l'utilisateur concerné. Renvoie son id, ou None (email ignoré)."""
    from . import espaces
    jeton = destinataire_jeton(email.message_from_bytes(brut))
    if not jeton:
        return None
    u = base.q1("SELECT id FROM utilisateurs WHERE jeton_reponse=?", jeton)
    if not u:
        return None
    boite = espaces.dossier(u["id"]) / "boite"
    boite.mkdir(parents=True, exist_ok=True)
    (boite / f"{time.time_ns()}.eml").write_bytes(brut)
    return u["id"]


def relever():
    """Lit les nouveaux emails de la boîte du service (lecture seule) et les distribue. Appelé toutes les 2 min."""
    if reglages.simulation() or not reglages.env("EMAIL_MOT_DE_PASSE"):
        return
    m = imaplib.IMAP4_SSL(reglages.env("IMAP_HOTE", "imap.gmail.com"), timeout=60)
    try:
        m.login(adresse_service(), reglages.env("EMAIL_MOT_DE_PASSE"))
        m.select("INBOX", readonly=True)
        dernier = base.kv_get("imap_dernier_uid")
        if dernier is None:                      # premier démarrage : on ne relit pas l'historique de la boîte
            _, d = m.uid("search", None, "ALL")
            uids = d[0].split()
            base.kv_set("imap_dernier_uid", int(uids[-1]) if uids else 0)
            return
        _, d = m.uid("search", None, f"UID {int(dernier) + 1}:*")
        for uid in [u for u in d[0].split() if int(u) > int(dernier)][:100]:
            _, data = m.uid("fetch", uid, "(BODY.PEEK[])")
            if data and isinstance(data[0], tuple):
                deposer(data[0][1])
            base.kv_set("imap_dernier_uid", int(uid))
    finally:
        try:
            m.logout()
        except Exception:
            pass


# ---------- Notifications par email ----------
def notifier(delai_minutes: int = 3, intervalle_minutes: int = 15):
    """Messages de l'agent que la personne n'a pas lus dans l'app depuis quelques minutes → UN email récapitulatif
    (lettres en PDF jointes), si elle a coché « recevoir par email ». Au plus un email toutes les 15 min."""
    from . import espaces
    site = reglages.env("SITE_URL", reglages.origines()[0]).rstrip("/") + "/app.html"
    for u in base.q("SELECT id, email, notif_email FROM utilisateurs WHERE notif_email=1 AND agent IS NOT NULL"):
        if time.time() - float(base.kv_get(f"notif_{u['id']}", 0)) < intervalle_minutes * 60:
            continue
        nouveaux = espaces.a_notifier(u["id"], delai_minutes)
        if not nouveaux:
            continue
        textes = [n["texte"] for n in nouveaux if n["texte"]]
        pieces = [Path(n["fichier"]) for n in nouveaux if n["fichier"]]
        corps = ("Ton agent t'a écrit :\n\n" + "\n\n— — —\n\n".join(t[:2000] for t in textes[:10])
                 + (f"\n\n📎 {len(pieces)} document(s) en pièce jointe." if pieces else "")
                 + f"\n\nRéponds-lui dans ton espace : {site}\n"
                 "(Pour ne plus recevoir ces emails : Réglages → décoche « Recevoir par email ».)")
        envoyer(u["email"], "Ton agent t'a écrit", corps, pieces[:5])
        espaces.marquer_notifies(u["id"], [n["id"] for n in nouveaux])
        base.kv_set(f"notif_{u['id']}", time.time())
