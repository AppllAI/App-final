// Page d'accueil : la liste des agents vient du serveur (catalogue), sinon de cette liste de secours.
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

// ---------- Animations et interactions de la page d'accueil (légères, désactivées si « réduire les animations ») ----------
const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Apparition des sections au défilement
const observateur = "IntersectionObserver" in window && new IntersectionObserver((entrees) => {
  entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); observateur.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll(".apparait").forEach((el) => (observateur ? observateur.observe(el) : el.classList.add("visible")));

// Halo qui suit la souris dans le héros, et lumière sur les cartes
const heros = document.getElementById("heros");
if (heros && !calme) {
  heros.addEventListener("pointermove", (e) => {
    const r = heros.getBoundingClientRect();
    heros.style.setProperty("--hx", `${e.clientX - r.left}px`);
    heros.style.setProperty("--hy", `${e.clientY - r.top}px`);
  });
}
document.addEventListener("pointermove", (e) => {
  const carte = e.target.closest && e.target.closest(".lumiere");
  if (!carte) return;
  const r = carte.getBoundingClientRect();
  carte.style.setProperty("--x", `${e.clientX - r.left}px`);
  carte.style.setProperty("--y", `${e.clientY - r.top}px`);
});

// Le « journal » de l'agent qui s'écrit ligne par ligne, en boucle
const journal = document.getElementById("journal");
if (journal) {
  const lignes = [...journal.children];
  if (calme) lignes.forEach((l) => l.classList.add("vu"));
  else {
    let i = 0;
    const suivante = () => {
      if (i < lignes.length) { lignes[i++].classList.add("vu"); setTimeout(suivante, i === lignes.length - 1 ? 1400 : 650); }
      else setTimeout(() => { lignes.forEach((l) => l.classList.remove("vu")); i = 0; setTimeout(suivante, 600); }, 5200);
    };
    setTimeout(suivante, 500);
  }
}

// La note de démonstration (phase de test)
const curseur = document.getElementById("essai-curseur");
if (curseur) {
  const maj = () => {
    const n = +curseur.value, ok = n >= 15;
    document.getElementById("essai-valeur").textContent = n;
    const remplissage = document.getElementById("remplissage");
    remplissage.style.width = `${(n / 20) * 100}%`;
    remplissage.classList.toggle("ok", ok);
    const v = document.getElementById("essai-verdict");
    v.classList.toggle("ok", ok);
    v.textContent = ok ? "→ Feu vert. Après le 2e test, il te demande ton accord avant d'écrire aux recruteurs."
                       : "→ Il retient tes remarques, réécrit les lettres et t'envoie un nouveau test.";
  };
  curseur.addEventListener("input", maj);
  maj();
}

// Compteurs
document.querySelectorAll("[data-compte]").forEach((el) => {
  const cible = +el.dataset.compte, suffixe = el.dataset.suffixe || "";
  const ecrire = (v) => (el.textContent = Math.round(v).toLocaleString("fr-BE") + suffixe);
  if (calme || !observateur) return ecrire(cible);
  const o = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    const debut = performance.now();
    const pas = (t) => { const p = Math.min(1, (t - debut) / 1400); ecrire(cible * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  });
  o.observe(el);
});
