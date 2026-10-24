"""python -m serveur  → lance l'API (port 8000 par défaut ; PORT pour en changer)."""
import uvicorn

from . import reglages

if __name__ == "__main__":
    uvicorn.run("serveur.principal:app", host=reglages.env("HOTE", "0.0.0.0"), port=int(reglages.env("PORT", "8000")),
                proxy_headers=True, forwarded_allow_ips=reglages.env("PROXY_DE_CONFIANCE", "127.0.0.1"),
                server_header=False)
