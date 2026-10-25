// Page d'accueil : parcours animé au défilement, liste des agents, avis, compteurs.
"use strict";
const AGENTS_SECOURS = [
  { id: "avocat", nom: "Agent Avocat", titre: "Stage, juriste, collaborateur en Belgique", emoji: "⚖️", couleur: "#1f4d3a",
    description: "Lit toutes les offres juridiques de Belgique (LexGO, EURES, Forem, pages carrières des cabinets, tes alertes LinkedIn), écrit une lettre sur mesure vérifiée fait par fait, et contacte les cabinets qui ne publient pas.",
    exemples: ["Stagiaire avocat à Bruxelles", "Juriste en droit immobilier", "Paralegal corporate"], disponible: true },
  { id: "student", nom: "Agent Student", titre: "Jobs étudiants partout en Belgique", emoji: "🎒", couleur: "#c2552d",
    description: "Surveille Student.be, StudentJob, EURES, Forem, Indeed et les enseignes, écrit un message clair avec tes disponibilités exactes, et postule pendant que tu étudies.",
    exemples: ["Vendeur·se le samedi", "Serveur·se en soirée", "Job d'été en festival"], disponible: true },
  { id: "infirmier", nom: "Agent Santé", titre: "Infirmier·e, aide-soignant·e", emoji: "🩺", couleur: "#2d5f8a",
    description: "Bientôt disponible.", exemples: [], disponible: false },
];

// Les avis RÉELS des bêta-testeurs, à ajouter ici (jamais d'avis inventés) :
//   { texte: "…", nom: "Prénom", agent: "Agent Avocat", note: 17 }
const AVIS = [];

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

// ---------- Avis ----------
const zoneAvis = document.getElementById("liste-avis");
if (zoneAvis) {
  const ajoute = (parent, tag, cls, texte) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = texte; parent.append(e); return e; };
  if (!AVIS.length) {
    const v = ajoute(zoneAvis, "div", "carte avis-vide", "");
    ajoute(v, "span", "surtitre", "Bêta en cours");
    ajoute(v, "h3", "", "Les premiers avis arrivent bientôt.");
    ajoute(v, "p", "", "Teste ton agent, note-le sur 20 : ton avis peut être le premier publié ici.");
    const a = ajoute(v, "a", "bouton clair petit", "Essayer gratuitement"); a.href = "app.html";
  }
  AVIS.forEach((x) => {
    const c = ajoute(zoneAvis, "figure", "carte carte-avis", "");
    if (x.note) ajoute(c, "span", "note-avis", `${x.note}/20`);
    ajoute(c, "blockquote", "", `« ${x.texte} »`);
    ajoute(c, "figcaption", "", `${x.nom}${x.agent ? " · " + x.agent : ""}`);
  });
}

// ---------- Apparitions (désactivées si « réduire les animations ») ----------
const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const observateur = "IntersectionObserver" in window && new IntersectionObserver((entrees) => {
  entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); observateur.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll(".apparait").forEach((el) => (observateur ? observateur.observe(el) : el.classList.add("visible")));

// ---------- Le film : chaque image dépend de la position exacte du défilement (aucun palier) ----------
// p = 0 → 1 sur ~2 hauteurs d'écran. Cinq temps qui se recouvrent : le suivant entre pendant que l'autre sort.
const film = document.getElementById("film");
const scene = document.getElementById("scene");
if (film && scene) {
  const borne = (x) => Math.min(1, Math.max(0, x));
  const lisse = (x) => { x = borne(x); return x * x * (3 - 2 * x); };
  const seg = (p, a, b) => lisse((p - a) / (b - a));
  const compteur = document.getElementById("compteur");
  const note = document.getElementById("note");
  const anneau = document.getElementById("anneau");
  const seuil = document.getElementById("seuil");
  const TOUR = 314.16;
  const OFFRES = 113;              // mesuré : 113 offres trouvées en 18 s lors de notre test réel (voir Performances)

  const dessiner = (p) => {
    const v = {
      p, i: seg(p, 0, 0.08),
      // un temps sort complètement avant que le suivant entre (aucun texte superposé)
      v1: 1 - seg(p, 0.17, 0.2),
      v2: seg(p, 0.2, 0.23) * (1 - seg(p, 0.39, 0.42)),
      v3: seg(p, 0.42, 0.45) * (1 - seg(p, 0.61, 0.64)),
      v4: seg(p, 0.64, 0.67) * (1 - seg(p, 0.81, 0.84)),
      v5: seg(p, 0.84, 0.87),
      s: seg(p, 0.02, 0.17), t: seg(p, 0.23, 0.39), l: seg(p, 0.45, 0.61), e: seg(p, 0.87, 1),
    };
    for (const [k, x] of Object.entries(v)) scene.style.setProperty(`--${k}`, x.toFixed(4));
    compteur.textContent = Math.round(OFFRES * v.s);
    const n = Math.round(16 * seg(p, 0.67, 0.81));
    note.textContent = n;
    anneau.style.setProperty("stroke-dashoffset", (TOUR * (1 - n / 20)).toFixed(2));
    seuil.classList.toggle("allume", n >= 15);
  };

  const surDefilement = () => {
    const r = film.getBoundingClientRect();
    const total = film.offsetHeight - window.innerHeight;
    dessiner(borne(-r.top / Math.max(1, total)));
    document.body.classList.toggle("apres-film", r.bottom < window.innerHeight * 0.6);
  };

  if (calme) {
    film.classList.add("statique");               // les 5 temps en liste, l'écran montre le résultat final
    dessiner(1);
  } else {
    let attente = false;
    const demander = () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; surDefilement(); });
    };
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);
    surDefilement();
  }
}
