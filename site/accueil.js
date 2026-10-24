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
    const v = ajoute(zoneAvis, "div", "avis-vide lumiere", "");
    ajoute(v, "span", "mono", "Bêta en cours");
    ajoute(v, "h3", "", "Les premiers avis arrivent bientôt.");
    ajoute(v, "p", "", "Teste ton agent, note-le sur 20 : ton avis peut être le premier publié ici.");
    const a = ajoute(v, "a", "bouton clair petit", "Essayer gratuitement →"); a.href = "app.html";
  }
  AVIS.forEach((x) => {
    const c = ajoute(zoneAvis, "figure", "carte-avis lumiere", "");
    if (x.note) ajoute(c, "span", "note-avis", `${x.note}/20`);
    ajoute(c, "blockquote", "", `« ${x.texte} »`);
    ajoute(c, "figcaption", "", `${x.nom}${x.agent ? " · " + x.agent : ""}`);
  });
}

// ---------- Animations (désactivées si « réduire les animations ») ----------
const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const observateur = "IntersectionObserver" in window && new IntersectionObserver((entrees) => {
  entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); observateur.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll(".apparait").forEach((el) => (observateur ? observateur.observe(el) : el.classList.add("visible")));

document.addEventListener("pointermove", (e) => {
  const carte = e.target.closest && e.target.closest(".lumiere");
  if (!carte) return;
  const r = carte.getBoundingClientRect();
  carte.style.setProperty("--x", `${e.clientX - r.left}px`);
  carte.style.setProperty("--y", `${e.clientY - r.top}px`);
});

// ---------- Le parcours : plus on descend, plus l'histoire avance ----------
const parcours = document.getElementById("parcours");
const scene = document.getElementById("scene");
if (parcours && scene) {
  const legendes = [...document.querySelectorAll("#legendes li")];
  const N = legendes.length;
  const points = document.getElementById("points");
  legendes.forEach(() => points.append(document.createElement("i")));
  const $ = (id) => document.getElementById(id);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let etapeAffichee = -1;

  // Ce qui suit le doigt À L'INTÉRIEUR d'une étape (k = 0 → 1)
  const animer = (etape, k) => {
    scene.style.setProperty("--k", k.toFixed(3));
    if (etape === 2) $("offres-lues").textContent = Math.round(1284 * ease(k * 1.4)).toLocaleString("fr-BE");
    if (etape === 6) { const n = Math.round(12 * ease(k * 1.5)); $("note-1").textContent = n; $("jauge-1").style.width = `${n * 5}%`; }
    if (etape === 7) {
      const n = Math.round(16 * ease(k * 1.5)); $("note-2").textContent = n; $("jauge-2").style.width = `${n * 5}%`;
      $("jauge-2").classList.toggle("ok", n >= 15); $("feu").classList.toggle("allume", n >= 15);
    }
  };

  const changer = (etape) => {
    if (etape === etapeAffichee) return;
    etapeAffichee = etape;
    scene.dataset.etape = String(etape);
    legendes.forEach((l, i) => l.classList.toggle("actif", i === etape));
    [...points.children].forEach((p, i) => p.classList.toggle("fait", i <= etape));
    $("compteur-etape").textContent = `${String(etape + 1).padStart(2, "0")}/${String(N).padStart(2, "0")}`;
  };

  const surDefilement = () => {
    const r = parcours.getBoundingClientRect();
    const total = parcours.offsetHeight - window.innerHeight;
    const p = Math.min(0.9999, Math.max(0, -r.top / Math.max(1, total)));
    const position = p * N;
    const etape = Math.floor(position);
    changer(etape);
    animer(etape, position - etape);
    $("barre-avancee").style.transform = `scaleX(${p})`;
    document.body.classList.toggle("apres-parcours", r.bottom < window.innerHeight * 0.6);
  };

  if (calme) {
    parcours.classList.add("statique");          // tout s'affiche en liste, sans animation liée au défilement
    changer(N - 1);
    animer(2, 1); animer(6, 1); animer(7, 1);
  } else {
    let attente = false;
    window.addEventListener("scroll", () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; surDefilement(); });
    }, { passive: true });
    window.addEventListener("resize", surDefilement);
    surDefilement();
  }

  // Toucher une légende ou un point → aller à cette étape
  const allerA = (i) => {
    const total = parcours.offsetHeight - window.innerHeight;
    window.scrollTo({ top: parcours.offsetTop + total * ((i + 0.35) / N), behavior: calme ? "auto" : "smooth" });
  };
  legendes.forEach((l, i) => l.addEventListener("click", () => allerA(i)));
  [...points.children].forEach((p, i) => p.addEventListener("click", () => allerA(i)));
}

// ---------- Compteurs ----------
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
