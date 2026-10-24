# Image du serveur + des agents. Construite sur le serveur (docker compose up -d --build).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY serveur ./serveur
# Les agents du catalogue : chaque dépôt est téléchargé à sa branche (voir serveur/catalogue.yaml)
COPY deploiement/agents.sh .
RUN sh agents.sh /app/agents
# Pas de droits administrateur pour le serveur ni pour les agents
RUN useradd --create-home --uid 10001 service && mkdir -p /donnees && chown service /donnees
USER service
ENV DONNEES_DIR=/donnees AGENTS_DIR=/app/agents PORT=8000 PROXY_DE_CONFIANCE=*
EXPOSE 8000
CMD ["python", "-m", "serveur"]
