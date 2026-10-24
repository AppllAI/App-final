// Page d'accueil : la liste des agents vient du serveur (catalogue), sinon de cette liste de secours.
"use strict";
const AGENTS_SECOURS = [
  { id: "avocat", nom: "Agent Avocat", titre: "Stage, juriste, collaborateur en Belgique", emoji: "⚖️", couleur: "#1f4d3a",
    description: "Cherche les offres juridiques (LexGO, Indeed, barreaux, cabinets), écrit une lettre sur mesure pour chacune, vérifiée fait par fait, et contacte aussi les cabinets qui ne publient pas leurs offres.",
    exemples: ["Stagiaire avocat à Bruxelles", "Juriste en droit immobilier", "Paralegal corporate"], disponible: true },
  { id: "student", nom: "Agent Student", titre: "Jobs étudiants partout en Belgique", emoji: "🎒", couleur: "#c2552d",
    description: "Surveille Student.be, StudentJob, Indeed et les enseignes, écrit un message clair avec tes disponibilités exactes, et postule pendant que tu étudies.",
    exemples: ["Vendeur·se le samedi", "Serveur·se en soirée", "Job d'été en festival"], disponible: true },
  { id: "infirmier", nom: "Agent Santé", titre: "Infirmier·e, aide-soignant·e", emoji: "🩺", couleur: "#2d5f8a",
    description: "Bientôt disponible.", exemples: [], disponible: false },
];

function carteAgent(a, bouton) {
  const el = document.createElement(bouton ? "button" : "article");
  el.className = "agent" + (a.disponible ? "" : " bientot");
  el.style.setProperty("--teinte", a.couleur || "#1f4d3a");
  if (bouton) { el.type = "button"; el.dataset.agent = a.id; el.disabled = !a.disponible; }
  const ajoute = (tag, cls, texte) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = texte; el.append(e); return e; };
  ajoute("span", "emoji", a.emoji || "🤖");
  ajoute("h3", "", a.nom);
  ajoute("span", "titre", a.titre || "");
  ajoute("p", "", a.description || "");
  if (a.exemples && a.exemples.length) {
    const ex = ajoute("div", "exemples", "");
    a.exemples.forEach((x) => { const s = document.createElement("span"); s.textContent = x; ex.append(s); });
  }
  if (!a.disponible) ajoute("span", "etiquette or", "Bientôt");
  return el;
}

async function chargerAgents() {
  if (!window.CONFIG.API) return AGENTS_SECOURS;
  try {
    const r = await fetch(window.CONFIG.API.replace(/\/$/, "") + "/api/agents");
    if (r.ok) return await r.json();
  } catch (e) { /* serveur injoignable : liste de secours */ }
  return AGENTS_SECOURS;
}

const zone = document.getElementById("liste-agents");
if (zone) chargerAgents().then((liste) => liste.forEach((a) => zone.append(carteAgent(a, false))));
