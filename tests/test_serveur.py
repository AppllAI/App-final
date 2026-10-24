"""Tests du serveur, en SIMULATION (aucune IA ni email réel). Lancer : python -m unittest discover tests -v

Le test de bout en bout lance un VRAI agent (Agent-avocat) si son dépôt est présent dans AGENTS_DIR."""
import email
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="serveur_test_"))
os.environ.update({"DONNEES_DIR": str(TMP), "SIMULATION": "1", "SANS_TACHES": "1", "ANTHROPIC_API_KEY": "",
                   "SITE_ORIGINE": "https://site.exemple", "EMAIL_ADRESSE": "service@exemple.be"})
os.environ.setdefault("AGENTS_DIR", str(RACINE / "agents"))
sys.path.insert(0, str(RACINE))

from fastapi.testclient import TestClient  # noqa: E402

from serveur import base, courrier, espaces, identite, securite  # noqa: E402
from serveur.principal import app  # noqa: E402

client = TestClient(app)


def dernier_code(adresse: str) -> str:
    for f in sorted((TMP / "courrier").glob("*.eml"), reverse=True):
        m = email.message_from_bytes(f.read_bytes())
        if m["To"] == adresse:
            return re.search(r"\b(\d{6})\b", m["Subject"]).group(1)
    raise AssertionError("aucun code envoyé")


def connecter(adresse: str) -> dict:
    securite.reinitialiser()
    assert client.post("/api/auth/code", json={"email": adresse}).status_code == 200
    r = client.post("/api/auth/code/verifier", json={"email": adresse, "code": dernier_code(adresse)})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def uid(adresse):
    return base.q1("SELECT id FROM utilisateurs WHERE email=?", adresse)["id"]


class Connexion(unittest.TestCase):
    def setUp(self):
        securite.reinitialiser()

    def test_code_par_email(self):
        h = connecter("alex@exemple.be")
        moi = client.get("/api/moi", headers=h).json()
        self.assertEqual(moi["email"], "alex@exemple.be")
        self.assertEqual(client.post("/api/auth/deconnexion", headers=h).status_code, 200)
        self.assertEqual(client.get("/api/moi", headers=h).status_code, 401)          # session révoquée

    def test_code_faux_puis_bloque(self):
        client.post("/api/auth/code", json={"email": "bob@exemple.be"})
        bon = dernier_code("bob@exemple.be")
        faux = "000000" if bon != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(client.post("/api/auth/code/verifier",
                                         json={"email": "bob@exemple.be", "code": faux}).status_code, 400)
        r = client.post("/api/auth/code/verifier", json={"email": "bob@exemple.be", "code": bon})
        self.assertEqual(r.status_code, 400)                                        # 5 essais : code détruit
        self.assertIsNone(base.q1("SELECT 1 FROM codes WHERE code_hash LIKE ?", f"%{bon}%"))   # jamais en clair

    def test_limite_de_codes(self):
        codes = [client.post("/api/auth/code", json={"email": "spam@exemple.be"}).status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])

    def test_sans_session(self):
        self.assertEqual(client.get("/api/moi").status_code, 401)
        self.assertEqual(client.get("/api/moi", headers={"Authorization": "Bearer jeton-invente"}).status_code, 401)
        self.assertEqual(client.post("/api/auth/code", json={"email": "pas-un-email"}).status_code, 400)

    def test_google_signature_verifiee(self):
        import jwt
        from cryptography.hazmat.primitives.asymmetric import rsa
        cle = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pirate = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        class FauxClient:
            def get_signing_key_from_jwt(self, _):
                return type("K", (), {"key": cle.public_key()})()

        identite._clients_jwk[identite.GOOGLE_CLES] = FauxClient()
        os.environ["GOOGLE_CLIENT_ID"] = "mon-app.apps.googleusercontent.com"
        try:
            def jeton(signataire, **k):
                d = {"iss": "https://accounts.google.com", "aud": "mon-app.apps.googleusercontent.com", "sub": "1",
                     "email": "camille@gmail.com", "email_verified": True, "name": "Camille",
                     "iat": int(time.time()), "exp": int(time.time()) + 600, **k}
                return jwt.encode(d, signataire, algorithm="RS256")
            r = client.post("/api/auth/google", json={"jeton": jeton(cle)})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["utilisateur"]["nom"], "Camille")
            for mauvais in (jeton(pirate), jeton(cle, aud="autre-app"), jeton(cle, email_verified=False),
                            jeton(cle, exp=int(time.time()) - 3600)):
                self.assertEqual(client.post("/api/auth/google", json={"jeton": mauvais}).status_code, 401)
        finally:
            del os.environ["GOOGLE_CLIENT_ID"]
            identite._clients_jwk.clear()

    def test_cors_et_entetes(self):
        r = client.get("/api/agents", headers={"Origin": "https://pirate.exemple"})
        self.assertNotIn("access-control-allow-origin", r.headers)
        r = client.get("/api/agents", headers={"Origin": "https://site.exemple"})
        self.assertEqual(r.headers["access-control-allow-origin"], "https://site.exemple")
        self.assertEqual(r.headers["x-frame-options"], "DENY")
        self.assertIn("avocat", [a["id"] for a in r.json()])


class Espaces(unittest.TestCase):
    def tearDown(self):
        espaces.arreter_tout()

    def setUp(self):
        self.a = connecter("a@exemple.be")
        self.b = connecter("b@exemple.be")
        with base.tx() as c:                        # agent choisi sans lancer de processus
            c.execute("UPDATE utilisateurs SET agent='avocat' WHERE email IN ('a@exemple.be','b@exemple.be')")

    def test_isolation_des_fichiers(self):
        lettre = espaces.dossier(uid("a@exemple.be")) / "lettre.pdf"
        lettre.write_bytes(b"%PDF-1.4 lettre de A")
        with espaces.canal(uid("a@exemple.be")) as c:
            ok = c.execute("INSERT INTO sortie (genre, fichier) VALUES ('fichier', ?)", (str(lettre),)).lastrowid
            piege = c.execute("INSERT INTO sortie (genre, fichier) VALUES ('fichier', '/etc/passwd')").lastrowid
        self.assertEqual(client.get(f"/api/fichiers/{ok}", headers=self.a).content, b"%PDF-1.4 lettre de A")
        self.assertEqual(client.get(f"/api/fichiers/{ok}", headers=self.b).status_code, 404)   # pas celui de B
        self.assertEqual(client.get(f"/api/fichiers/{piege}", headers=self.a).status_code, 404)  # hors de l'espace

    def test_cv_pdf_seulement(self):
        r = client.post("/api/cv", headers=self.a, files={"fichier": ("cv.exe", b"MZ...", "application/pdf")})
        self.assertEqual(r.status_code, 400)
        r = client.post("/api/cv", headers=self.a, files={"fichier": ("../../cv.pdf", b"%PDF-1.4 cv", "application/pdf")})
        self.assertEqual(r.status_code, 200)
        with espaces.canal(uid("a@exemple.be")) as c:
            f = c.execute("SELECT fichier FROM entree ORDER BY id DESC").fetchone()["fichier"]
        self.assertTrue(Path(f).resolve().is_relative_to(espaces.dossier(uid("a@exemple.be"))))

    def test_conversation_et_suppression(self):
        client.post("/api/messages", headers=self.a, json={"texte": "Bonjour"})
        conv = client.get("/api/conversation", headers=self.a).json()
        self.assertEqual(conv["moi"][-1]["texte"], "Bonjour")
        self.assertEqual(client.get("/api/conversation", headers=self.b).json()["moi"], [])   # rien chez B
        dossier = espaces.dossier(uid("a@exemple.be"))
        self.assertEqual(client.delete("/api/moi", headers=self.a).status_code, 200)
        self.assertFalse(dossier.exists())
        self.assertEqual(client.get("/api/moi", headers=self.a).status_code, 401)

    def test_reponses_des_recruteurs_au_bon_utilisateur(self):
        jeton = base.q1("SELECT jeton_reponse FROM utilisateurs WHERE email='b@exemple.be'")["jeton_reponse"]
        m = email.message.EmailMessage()
        m["From"], m["To"], m["Subject"] = "rh@cabinet.be", courrier.adresse_reponse(jeton), "Re: Candidature"
        m.set_content("Nous aimerions vous rencontrer.")
        self.assertEqual(courrier.deposer(bytes(m)), uid("b@exemple.be"))
        self.assertTrue(list((espaces.dossier(uid("b@exemple.be")) / "boite").glob("*.eml")))
        self.assertFalse((espaces.dossier(uid("a@exemple.be")) / "boite").exists()
                         and list((espaces.dossier(uid("a@exemple.be")) / "boite").glob("*.eml")))
        m.replace_header("To", "service+inconnu12345@exemple.be")
        self.assertIsNone(courrier.deposer(bytes(m)))                               # jeton inconnu : ignoré

    def test_notification_par_email_avec_pdf(self):
        u = uid("b@exemple.be")
        lettre = espaces.dossier(u) / "lettre.pdf"
        lettre.write_bytes(b"%PDF-1.4 x")
        with espaces.canal(u) as c:
            c.execute("INSERT INTO sortie (texte, le) VALUES ('Une candidature est prête', datetime('now','-10 minutes'))")
            c.execute("INSERT INTO sortie (genre, fichier, le) VALUES ('fichier', ?, datetime('now','-10 minutes'))",
                      (str(lettre),))
        base.kv_set(f"notif_{u}", 0)
        courrier.notifier()
        m = email.message_from_bytes(sorted((TMP / "courrier").glob("*.eml"))[-1].read_bytes())
        self.assertEqual(m["To"], "b@exemple.be")
        self.assertEqual([p.get_filename() for p in m.walk() if p.get_filename()], ["lettre.pdf"])
        self.assertEqual(espaces.a_notifier(u, 3), [])                              # pas deux fois


@unittest.skipUnless((Path(os.environ["AGENTS_DIR"]) / "Agent-avocat" / "agent_avocat").exists(),
                     "dépôt Agent-avocat absent de AGENTS_DIR")
class BoutEnBout(unittest.TestCase):
    """Un vrai Agent Avocat (en simulation) tourne pour un utilisateur et lui répond dans l'app."""

    def test_agent_reel(self):
        h = connecter("vrai@exemple.be")
        self.assertEqual(client.post("/api/agent", headers=h, json={"agent": "avocat"}).status_code, 200)
        try:
            agent = []
            for _ in range(80):
                agent = client.get("/api/conversation", headers=h).json()["agent"]
                if agent:
                    break
                time.sleep(0.25)
            self.assertTrue(agent, (espaces.dossier(uid("vrai@exemple.be")) / "agent.log").read_text())
            self.assertIn("Phase de test", agent[0]["texte"])                       # le message de bienvenue
            client.post("/api/messages", headers=h, json={"texte": "stats"})
            for _ in range(80):
                agent = client.get("/api/conversation", headers=h).json()["agent"]
                if any("Bilan" in (m["texte"] or "") for m in agent):
                    break
                time.sleep(0.25)
            self.assertTrue(any("Bilan" in (m["texte"] or "") for m in agent))
            self.assertEqual(client.get("/api/test", headers=h).json()["tour"], 1)
        finally:
            espaces.arreter_tout()


if __name__ == "__main__":
    unittest.main(verbosity=2)
