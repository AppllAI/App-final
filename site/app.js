// Espace personnel : connexion, choix de l'agent, discussion, candidatures, phase de test, réglages.
// Sécurité : tout texte venant du serveur est inséré avec textContent (jamais innerHTML) → pas d'injection possible.
"use strict";
const API = (window.CONFIG.API || "").replace(/\/$/, "");
const DEMO = !API;
const $ = (s) => document.querySelector(s);
function el(tag, cls, texte) { const e = document.createElement(tag); if (cls) e.className = cls; if (texte !== undefined) e.textContent = texte; return e; }
const STATUTS = {
  qualifiee: ["Retenue", ""], redigee: ["Lettre écrite", ""], a_valider: ["À valider", "or"], validee: ["En partance", "or"],
  repetee: ["Test envoyé", "terre"], manuelle: ["Via le site", "or"], envoyee: ["Envoyée", "vert"], relancee: ["Relancée", "vert"],
  entretien: ["Entretien !", "vert"], refus: ["Refus", ""], sans_reponse: ["Sans réponse", ""], offre_recue: ["Offre reçue 🎉", "vert"],
};

let jeton = localStorage.getItem("ae_jeton");
let utilisateur = null;
let derniers = { moi: 0, agent: 0 };
let vueActive = "discussion";
let nonLus = 0;
let minuteur = null;

// ---------- Appels au serveur ----------
async function appel(chemin, options = {}) {
  if (DEMO) return window.DEMO.appel(chemin, options);
  const { methode = "GET", corps, fichier, brut } = options;
  const entetes = {};
  if (jeton) entetes.Authorization = "Bearer " + jeton;
  let body;
  if (fichier) { body = new FormData(); body.append("fichier", fichier); }
  else if (corps !== undefined) { entetes["Content-Type"] = "application/json"; body = JSON.stringify(corps); }
  const r = await fetch(API + chemin, { method: methode, headers: entetes, body, credentials: "omit" });
  if (r.status === 401 && jeton) { deconnecter(); throw new Error("Session expirée, reconnecte-toi."); }
  if (r.status === 403 && utilisateur) {                     // autorisation Gmail retirée chez Google
    utilisateur.gmail_ok = false; clearInterval(minuteur); initAutorisation();
    throw new Error("Autorise à nouveau l'envoi depuis ton Gmail.");
  }
  if (!r.ok) {
    let msg = "Erreur " + r.status;
    try { msg = (await r.json()).detail || msg; } catch (e) { /* réponse non JSON */ }
    throw new Error(typeof msg === "string" ? msg : "Requête refusée.");
  }
  return brut ? r.blob() : r.json();
}

function toast(texte) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = texte; t.setAttribute("role", "status");
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

function ecran(nom) {
  for (const id of ["ecran-connexion", "ecran-autorisation", "ecran-agents", "ecran-audace", "ecran-app", "ecran-admin"]) $("#" + id).hidden = id !== nom;
}

// ---------- Texte enrichi sûr : *gras* et liens, construits en DOM ----------
function remplir(el, texte) {
  const morceaux = (texte || "").split(/(\*[^*\n]+\*|https?:\/\/[^\s)]+)/g);
  for (const m of morceaux) {
    if (!m) continue;
    if (/^\*[^*\n]+\*$/.test(m)) { const b = document.createElement("strong"); b.textContent = m.slice(1, -1); el.append(b); }
    else if (/^https?:\/\//.test(m)) {
      const a = document.createElement("a"); a.href = m; a.textContent = m.length > 50 ? m.slice(0, 47) + "…" : m;
      a.target = "_blank"; a.rel = "noopener noreferrer"; el.append(a);
    } else el.append(document.createTextNode(m));
  }
}

// ---------- Connexion (Google uniquement) ----------
// Flux « code d'autorisation » : Google ouvre sa fenêtre, la personne coche « Envoyer des e-mails en votre nom »,
// le site reçoit un code à usage unique et le donne au serveur, qui seul l'échange (avec son secret) contre les jetons.
const PORTEES = "openid email profile https://www.googleapis.com/auth/gmail.send";
let clientGoogle = null;

function ecranErreur(id, texte, info) { const e = $(id); e.textContent = texte || ""; e.classList.toggle("info", !!info); }

async function initConnexion() {
  ecran("ecran-connexion");
  if (DEMO) return ecranErreur("#erreur-connexion", "Démo : le bouton te connecte avec un compte fictif.", true);
  try {
    const sante = await appel("/api/sante");
    if (!sante.google || !sante.google_client_id) return ecranErreur("#erreur-connexion", "La connexion Google n'est pas encore activée sur le serveur.");
    await preparerGoogle(sante.google_client_id, sante.portees || PORTEES);
  } catch (e) { ecranErreur("#erreur-connexion", "Serveur injoignable pour le moment. Réessaie dans un instant."); }
}

function charger(src) {
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = ko; document.head.append(s); });
}

async function preparerGoogle(clientId, portees) {
  if (clientGoogle) return;
  await charger("https://accounts.google.com/gsi/client");
  clientGoogle = (consentement) => google.accounts.oauth2.initCodeClient({
    client_id: clientId, scope: portees, ux_mode: "popup", include_granted_scopes: true,
    ...(consentement ? { prompt: "consent" } : {}),
    callback: (r) => {
      if (r.error) return ecranErreur(utilisateur ? "#erreur-autorisation" : "#erreur-connexion", "Connexion annulée.");
      connecte(appel("/api/auth/google", { methode: "POST", corps: { code: r.code } }));
    },
    error_callback: (e) => ecranErreur(utilisateur ? "#erreur-autorisation" : "#erreur-connexion",
      e && e.type === "popup_closed" ? "Fenêtre Google fermée. Réessaie." : "Google n'a pas pu s'ouvrir (bloqueur de fenêtres ?)."),
  });
}

function ouvrirGoogle(consentement) {
  if (DEMO) return connecte(appel("/api/auth/google", { methode: "POST", corps: { code: "demo" } }));
  if (!clientGoogle) return ecranErreur("#erreur-connexion", "Google se charge… réessaie dans une seconde.");
  clientGoogle(consentement).requestCode();           // doit partir directement du clic (sinon la fenêtre est bloquée)
}

$("#bouton-google").onclick = () => ouvrirGoogle(false);
$("#bouton-autoriser").onclick = () => ouvrirGoogle(true);        // « consent » : Google redemande la case à cocher
$("#deconnexion-autorisation").onclick = async () => {
  try { await appel("/api/auth/deconnexion", { methode: "POST" }); } catch (e) { /* déjà expirée */ }
  deconnecter();
};

async function connecte(promesse) {
  ecranErreur("#erreur-connexion", ""); ecranErreur("#erreur-autorisation", "");
  try {
    const r = await promesse;
    jeton = r.jeton; localStorage.setItem("ae_jeton", jeton);
    utilisateur = r.utilisateur;
    utilisateur._refus = !utilisateur.gmail_ok;            // vient de passer par Google sans cocher la case
    suite();
  } catch (e) { ecranErreur(utilisateur ? "#erreur-autorisation" : "#erreur-connexion", e.message); }
}

async function initAutorisation() {
  ecran("ecran-autorisation");
  if (!DEMO) {
    try { const s = await appel("/api/sante"); await preparerGoogle(s.google_client_id, s.portees || PORTEES); }
    catch (e) { ecranErreur("#erreur-autorisation", "Serveur injoignable pour le moment."); }
  }
  if (utilisateur && utilisateur.gmail_ok === false && utilisateur._refus)
    ecranErreur("#erreur-autorisation", "La case « Envoyer des e-mails en votre nom » n'a pas été cochée.");
}

function deconnecter() {
  jeton = null; utilisateur = null; localStorage.removeItem("ae_jeton");
  clearInterval(minuteur); derniers = { moi: 0, agent: 0 }; $("#fil").textContent = "";
  initConnexion();
}

// ---------- Choix de l'agent ----------
async function initAgents() {
  ecran("ecran-agents");
  const zone = $("#choix-agents"); zone.textContent = "";
  const liste = await appel("/api/agents");
  for (const a of liste) {
    const carte = carteAgent(a, true);
    carte.onclick = async () => {
      if (utilisateur.agent && utilisateur.agent !== a.id &&
          !confirm("Changer d'agent efface ton espace actuel (CV, lettres, mémoire). Continuer ?")) return;
      carte.disabled = true;
      try { await appel("/api/agent", { methode: "POST", corps: { agent: a.id } }); utilisateur.agent = a.id; initAudace(); }
      catch (e) { toast(e.message); carte.disabled = false; }
    };
    zone.append(carte);
  }
}

// ---------- Style de candidature : strict, équilibré ou audacieux ----------
const ICONE = (d) => `<svg class="icone-audace" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const AUDACES = [
  { id: "strict", nom: "Strict", accroche: "Je coche toutes les cases",
    texte: "Je postule seulement quand ton profil colle à 100 % : langues, expérience, diplômes. Moins d'envois, zéro hors-sujet.",
    icone: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>' },
  { id: "equilibre", nom: "Équilibré", accroche: "Le bon dosage", reco: true,
    texte: "Une exigence claire de l'annonce te bloque, un simple « atout » non. Le meilleur rapport entre envois et réponses.",
    icone: '<path d="M12 4v16M5 20h14M6 8h12"/><path d="m6 8-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z"/>' },
  { id: "audacieux", nom: "Audacieux", accroche: "J'ose",
    texte: "Je postule même si l'annonce exige une langue ou une expérience que tu n'as pas encore.",
    icone: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15 6.5 12.5C8 8 11.5 4 20 4c0 8.5-4 12-8.5 13.5z"/><circle cx="15" cy="9" r="1.5"/>' },
];

// Les 3 cartes ; « audacieux » demande une confirmation, avec ce que ça change concrètement
function choixAudace(zone, actuel, surChoix) {
  zone.textContent = "";
  const grille = el("div", "audaces");
  const details = el("div", "confirmation-audace"); details.hidden = true;
  const choisir = (id) => {
    grille.querySelectorAll(".carte-audace").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.mode === id)));
    surChoix(id);
  };
  for (const a of AUDACES) {
    const c = el("button", "carte-audace"); c.type = "button"; c.dataset.mode = a.id; c.setAttribute("aria-pressed", String(a.id === actuel));
    const tete = el("span", "tete-audace"); tete.innerHTML = ICONE(a.icone);            // icône statique, aucun texte venant du serveur
    tete.append(el("b", "", a.nom));
    if (a.reco) tete.append(el("span", "etiquette", "Recommandé"));
    c.append(tete, el("span", "accroche", a.accroche), el("span", "texte-audace", a.texte));
    c.onclick = () => {
      if (a.id !== "audacieux") { details.hidden = true; return choisir(a.id); }
      details.hidden = false; details.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    };
    grille.append(c);
  }
  details.append(el("b", "", "Le mode audacieux, concrètement"));
  const ul = el("ul");
  ["Une offre exige le néerlandais et ce n'est pas sur ton CV ? Je postule quand même.",
   "Toujours dans ton domaine, ta zone et tes horaires : jamais un poste hors sujet.",
   "Tes lettres restent 100 % honnêtes : je n'écris jamais que tu parles une langue que tu ne parles pas.",
   "Plus d'envois, plus de chances… et un peu plus de refus. C'est le jeu."].forEach((t) => ul.append(el("li", "", t)));
  const boutons = el("div", "boutons-audace");
  const oui = el("button", "bouton vert", "Je confirme, j'ose"); oui.type = "button";
  const non = el("button", "bouton clair", "Finalement non"); non.type = "button";
  oui.onclick = () => { details.hidden = true; choisir("audacieux"); };
  non.onclick = () => { details.hidden = true; };
  boutons.append(oui, non); details.append(ul, boutons);
  zone.append(grille, details);
}

async function enregistrerAudace(mode) {
  const r = await appel("/api/audace", { methode: "POST", corps: { mode } });
  utilisateur.audace = r.audace || mode;
}

function initAudace() {
  ecran("ecran-audace");
  choixAudace($("#choix-audace"), null, async (mode) => {
    try { await enregistrerAudace(mode); initApp(); } catch (e) { toast(e.message); }
  });
}

// ---------- Application ----------
function suite() {
  if (utilisateur.admin) return initAdmin();           // l'administrateur ne postule pas : il suit les bêta-testeurs
  if (!utilisateur.gmail_ok) return initAutorisation();
  if (!utilisateur.agent) initAgents(); else initApp();
}

function initApp() {
  ecran("ecran-app");
  $("#qui").textContent = utilisateur.email;
  $("#adresse-envoi").textContent = utilisateur.email;
  $("#reglage-adresse-agent").hidden = !utilisateur.adresse_agent;
  $("#adresse-agent").textContent = utilisateur.adresse_agent || "";
  $("#notif").checked = !!utilisateur.notif_email;
  $("#agent-actuel").textContent = "Agent " + utilisateur.agent;
  initUnClic();
  choixAudace($("#reglage-audace"), utilisateur.audace || "equilibre", async (mode) => {
    try { await enregistrerAudace(mode); toast("Style « " + AUDACES.find((a) => a.id === mode).nom + " » enregistré."); }
    catch (e) { toast(e.message); }
  });
  const depart = location.hash.slice(1);                  // lien de l'email « à toi de noter » : …/app.html#test
  montrer(VUES.includes(depart) ? depart : "accueil");
  rafraichir();
  clearInterval(minuteur);
  minuteur = setInterval(() => { if (!document.hidden) rafraichir(); }, 2500);
}

const VUES = ["accueil", "discussion", "candidatures", "test", "reglages"];
function montrer(vue) {
  vueActive = vue;
  if (location.hash.slice(1) !== vue) history.replaceState(null, "", "#" + vue);
  document.querySelectorAll(".onglet").forEach((o) => o.setAttribute("aria-selected", String(o.dataset.vue === vue)));
  for (const v of VUES) $("#vue-" + v).hidden = v !== vue;
  $("#saisie").hidden = vue !== "discussion";
  $("#titre-vue").textContent = { accueil: "Accueil", discussion: "Discussion", candidatures: "Candidatures", test: "Phase de test", reglages: "Réglages" }[vue];
  if (vue === "accueil") afficherTableau();
  if (vue === "discussion") { nonLus = 0; majPastille(); defiler(); }
  if (vue === "candidatures") afficherCandidatures();
  if (vue === "test") afficherTest();
}
document.querySelectorAll(".onglet").forEach((o) => (o.onclick = () => montrer(o.dataset.vue)));

function majPastille() { const p = $("#pastille"); p.hidden = !nonLus; p.textContent = nonLus; }
function defiler() { const v = $("#vue-discussion"); v.scrollTop = v.scrollHeight; }

async function rafraichir() {
  let c;
  try { c = await appel(`/api/conversation?apres_moi=${derniers.moi}&apres_agent=${derniers.agent}`); }
  catch (e) { return; }
  const nouveaux = [...c.moi.map((m) => ({ ...m, role: "moi" })), ...c.agent.map((m) => ({ ...m, role: "agent" }))]
    .sort((a, b) => (a.le < b.le ? -1 : a.le > b.le ? 1 : 0));
  for (const m of nouveaux) {
    if (m.role === "moi") { derniers.moi = Math.max(derniers.moi, m.id); $(`[data-provisoire="${CSS.escape(m.texte || "")}"]`)?.remove(); }
    else derniers.agent = Math.max(derniers.agent, m.id);
    afficherMessage(m);
    if (m.role === "agent" && vueActive !== "discussion") nonLus++;
  }
  majPastille();
  document.querySelectorAll(".ecrit").forEach((e) => e.remove());
  if (c.occupe) { const e = document.createElement("div"); e.className = "ecrit"; e.append(document.createElement("span"), document.createElement("span"), document.createElement("span")); $("#fil").append(e); }
  if (nouveaux.length) defiler();
  if (vueActive === "accueil" && Date.now() - (window._dernierTableau || 0) > 15000) { window._dernierTableau = Date.now(); afficherTableau(); }
  // Onglet test ouvert : on suit l'arrivée des candidatures (sans effacer une note en cours de saisie)
  if (vueActive === "test" && !document.querySelector("#carte-test form.retour[data-touche]")
      && Date.now() - (window._dernierTest || 0) > 3000) { window._dernierTest = Date.now(); afficherTest(false); }
}

function heure(le) { return le ? le.slice(11, 16) : ""; }

function afficherMessage(m) {
  const fil = $("#fil");
  if (m.role === "agent" && m.genre === "fichier") {
    const d = document.createElement("button"); d.type = "button"; d.className = "document";
    const icone = document.createElement("span"); icone.className = "pdf"; icone.textContent = "PDF";
    const t = document.createElement("span"); t.textContent = m.legende || m.nom_fichier || "Document";
    const s = document.createElement("small"); s.textContent = (m.nom_fichier || "") + " · ouvrir";
    t.append(s); d.append(icone, t);
    d.onclick = () => ouvrirFichier(m.id, m.nom_fichier || "document.pdf");
    return fil.append(d);
  }
  const b = document.createElement("div");
  b.className = "bulle de-" + m.role;
  if (m.fichier && m.role === "moi") remplir(b, "📎 " + m.fichier + "\n");
  remplir(b, m.texte);
  const h = document.createElement("span"); h.className = "heure"; h.textContent = heure(m.le); b.append(h);
  if (m.boutons) {
    const choix = document.createElement("div"); choix.className = "choix";
    m.boutons.flat().forEach((bt) => {
      const x = document.createElement("button"); x.type = "button"; x.textContent = bt.libelle;
      x.onclick = () => envoyer(bt.commande, bt.libelle);
      choix.append(x);
    });
    b.append(choix);
  }
  fil.append(b);
  if (m.role === "agent" && m.genre === "notation") {
    const b = el("button", "bouton noter", "🧪 Donner ma note globale"); b.type = "button"; b.onclick = () => montrer("test"); fil.append(b);
  }
  if (m.role === "agent" && m.genre === "retour") fil.append(formulaireRetour());
}

async function ouvrirFichier(id, nom) {
  try {
    const blob = await appel(`/api/fichiers/${id}`, { brut: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nom; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message); }
}

async function envoyer(texte, affiche) {
  texte = (texte || "").trim();
  if (!texte) return;
  const b = document.createElement("div"); b.className = "bulle de-moi"; b.dataset.provisoire = texte;
  b.textContent = affiche || texte; $("#fil").append(b); defiler();
  try { await appel("/api/messages", { methode: "POST", corps: { texte } }); setTimeout(rafraichir, 600); }
  catch (e) { b.remove(); toast(e.message); }
}

$("#saisie").addEventListener("submit", (ev) => { ev.preventDefault(); const z = $("#message"); envoyer(z.value); z.value = ""; z.style.height = ""; });
$("#message").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); $("#saisie").requestSubmit(); } });
$("#message").addEventListener("input", (ev) => { ev.target.style.height = "auto"; ev.target.style.height = Math.min(ev.target.scrollHeight, 160) + "px"; });
$("#joindre").onclick = () => $("#fichier-cv").click();
$("#fichier-cv").onchange = async (ev) => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return toast("Envoie ton CV en PDF.");
  if (f.size > 10 * 1024 * 1024) return toast("Fichier trop lourd (10 Mo maximum).");
  toast("Envoi de ton CV…");
  try { await appel("/api/cv", { methode: "POST", fichier: f }); setTimeout(rafraichir, 600); } catch (e) { toast(e.message); }
};

// ---------- Accueil : le tableau de bord ----------
// Tout est construit en DOM avec textContent (aucun HTML venant du serveur).
const nombre = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-BE"));
function depuis(le) {
  if (!le) return "";
  const t = new Date(le.replace(" ", "T") + "Z"), s = (Date.now() - t) / 1000;
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return t.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}
function joliRdv(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("fr-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

async function afficherTableau() {
  let t, test;
  try { [t, test] = await Promise.all([appel("/api/tableau"), appel("/api/test")]); } catch (e) { return toast(e.message); }
  t = t || { chiffres: {}, activite: [], rdv: [] };
  const c = t.chiffres || {};

  // En ce moment
  $("#maintenant").classList.toggle("actif", !!t.en_ce_moment);
  $("#maintenant-texte").textContent = t.en_pause ? "En pause, comme tu l'as demandé. Écris « reprendre » pour qu'il s'y remette."
    : t.en_ce_moment ? `${t.en_ce_moment}…`
    : t.derniere_activite ? `En veille — dernière action ${depuis(t.derniere_activite)}. Il repart tout seul à la prochaine recherche.`
    : "Prêt. Envoie ton CV et dis-lui ce que tu cherches.";

  // À toi de jouer : ce qui attend une décision
  const faire = $("#a-faire"); faire.textContent = "";
  const carteAction = (titre, texte, libelle, action) => {
    const d = el("div", "action-carte"); d.append(el("span", "mono", "À toi de jouer"), el("b", "", titre), el("p", "", texte));
    const b = el("button", "bouton petit", libelle); b.type = "button"; b.onclick = action; d.append(b); faire.append(d);
  };
  for (const r of (t.rdv || []).filter((x) => x.statut === "propose"))
    carteAction(`Entretien proposé · ${r.entreprise || "un employeur"}`, `${joliRdv(r.debut)}${r.lieu ? " · " + r.lieu : ""}. Tu es d'accord ?`,
      "Répondre", () => montrer("discussion"));
  if (test && test.statut === "a_lancer") carteAction("Lance ta phase de test", `3 candidatures arriveront sur ${utilisateur.email}, puis tu leur donneras une note globale.`, "Voir", () => montrer("test"));
  const nb = ((test && test.candidatures) || []).length;
  if (test && test.statut === "en_cours") carteAction(`Test en cours · ${nb}/3`, "Ton agent envoie les 3 candidatures sur ton email. Tu es prévenu quand elles sont toutes là.", "Suivre", () => montrer("test"));
  if (test && test.statut === "a_noter") carteAction("Tes 3 candidatures sont arrivées", "Lis-les dans ta boîte mail, puis donne-leur une note globale sur 20.", "Noter", () => montrer("test"));
  if (test && test.statut === "retour") carteAction("Dis-lui ce qui n'a pas été", "La note est sous 15/20 : tes remarques, puis il refait un test.", "Répondre", () => montrer("test"));
  if (test && test.statut === "attente_accord") carteAction("Test réussi 🎉", "Note ≥ 15/20 : tu peux passer aux vraies candidatures.", "Décider", () => montrer("test"));

  // Chiffres clés
  const cartes = $("#cartes-chiffres"); cartes.textContent = "";
  [["analysees", "offres analysées"], ["ecartees", "écartées (tes règles)"], ["en_preparation", "en préparation"],
   ["tests", "candidatures de test"], ["envoyees", "envoyées aux recruteurs"], ["reponses", "réponses reçues"],
   ["entretiens", "entretiens"], ["taux_reponse", "taux de réponse"]].forEach(([k, lib]) => {
    const d = el("div", "chiffre-carte" + (k === "envoyees" || k === "entretiens" ? " fort" : ""));
    d.append(el("strong", "", k === "taux_reponse" ? (c[k] === null || c[k] === undefined ? "—" : `${c[k]} %`) : nombre(c[k] || 0)), el("span", "", lib));
    cartes.append(d);
  });

  // Entonnoir : de l'offre lue à l'entretien
  const ent = $("#entonnoir"); ent.textContent = "";
  const max = Math.max(1, c.analysees || 0);
  [["Lues", c.analysees], ["Retenues", (c.analysees || 0) - (c.ecartees || 0)], ["Envoyées", c.envoyees], ["Réponses", c.reponses], ["Entretiens", c.entretiens]]
    .forEach(([lib, n]) => {
      const ligne = el("div", "etage"); const barre = el("div", "barre-e"); const plein = el("span");
      plein.style.setProperty("--l", n ? `${Math.max(2, Math.round(100 * n / max))}%` : "0");
      barre.append(plein); ligne.append(el("span", "lib", lib), barre, el("b", "", nombre(n || 0))); ent.append(ligne);
    });

  // Fil d'activité
  const fil = $("#activite"); fil.textContent = "";
  if (!(t.activite || []).length) fil.append(el("li", "vide-ligne", "Rien encore : il commence dès qu'il a ton CV."));
  (t.activite || []).forEach((a) => {
    const li = el("li"); li.append(el("span", "role", a.role), el("span", "quoi", a.quoi), el("time", "", depuis(a.le))); fil.append(li);
  });
}

// ---------- Candidatures ----------
async function afficherCandidatures() {
  const zone = $("#liste-cand"); zone.textContent = "";
  let liste = [];
  try { liste = await appel("/api/candidatures"); } catch (e) { return toast(e.message); }
  if (!liste.length) {
    const v = document.createElement("div"); v.className = "vide";
    const g = document.createElement("div"); g.className = "grand"; g.textContent = "📭";
    const p = document.createElement("p"); p.textContent = "Pas encore de candidature. Envoie ton CV et dis à ton agent ce que tu cherches : il s'y met tout de suite.";
    v.append(g, p); return zone.append(v);
  }
  for (const c of liste) {
    const l = document.createElement("div"); l.className = "ligne-cand";
    const t = document.createElement("b"); t.textContent = `${c.titre || "?"}`;
    const [libelle, couleur] = STATUTS[c.statut] || [c.statut, ""];
    const e = document.createElement("span"); e.className = "etiquette " + couleur; e.textContent = libelle;
    const m = document.createElement("span"); m.className = "meta";
    m.textContent = `n°${c.id} · ${c.entreprise || "?"} · ${c.ville || "?"}` + (c.score ? ` · adéquation ${c.score}/10` : "") + (c.note_lettre ? ` · lettre ${c.note_lettre}/10` : "");
    l.append(t, e, m); zone.append(l);
  }
}

// ---------- Phase de test : d'abord 3 candidatures, ensuite UNE note globale ----------
const LIBELLES_TEST = {
  a_lancer: ["Pas encore lancé", "Ton agent prépare 3 candidatures et les envoie sur ton email (jamais chez un recruteur). Ensuite, tu leur donnes une note globale."],
  en_cours: ["Envoi des candidatures", "Ton agent cherche des offres et écrit tes 3 candidatures. Tu es prévenu ici et par email quand elles sont toutes arrivées."],
  a_noter: ["À toi de noter", "Les 3 candidatures sont dans ta boîte mail. Lis-les, puis donne-leur une note globale sur 20."],
  retour: ["Dis-lui ce qui n'a pas été", "La note est sous 15/20. Tes remarques sont gardées pour toutes tes futures candidatures."],
  attente_accord: ["Test réussi", "Ta note atteint 15/20. Tu peux passer aux vraies candidatures."],
  reussi: ["Phase de test réussie", "Ton agent postule pour de vrai, depuis ton Gmail."],
};
// Si le serveur ne les donne pas (version précédente), les mêmes cases que lui
const CRITERES_TEST = [["trop_long", "Trop long"], ["trop_court", "Pas assez développé"], ["ton", "Ton pas adapté"],
  ["pas_perso", "Pas assez personnalisé"], ["erreur", "Erreur ou invention"], ["fautes", "Fautes ou tournures maladroites"],
  ["offres", "Offres pas pertinentes"]].map(([code, libelle]) => ({ code, libelle }));

function commandeTest(chemin, corps, message) {
  return appel(chemin, { methode: "POST", corps }).then(() => { if (message) toast(message); setTimeout(afficherTest, 1800); })
    .catch((e) => toast(e.message));
}

function curseurNote(valeur) {
  const f = el("div", "note-inline");
  const chiffre = el("div", "chiffre-note");
  const r = el("input"); r.type = "range"; r.min = 0; r.max = 20; r.value = valeur ?? 14; r.setAttribute("aria-label", "Ta note globale sur 20");
  const maj = () => { chiffre.textContent = r.value; chiffre.append(el("small", "", "/20")); chiffre.classList.toggle("ok", +r.value >= 15); };
  r.oninput = maj; maj();
  f.append(chiffre, r);
  return f;
}

// Les 3 étapes, toujours visibles : on sait où on en est et ce qui vient après
function etapesTest(t) {
  const rang = { a_lancer: 0, en_cours: 0, a_noter: 1, retour: 1, attente_accord: 2, reussi: 3 }[t.statut] ?? 0;
  const ol = el("ol", "etapes-test");
  [[`Envoi des ${t.taille} candidatures`, `${t.candidatures.length}/${t.taille} sur ton email`],
   ["Ta note globale", t.note === null || t.note === undefined ? "sur 20, les 3 ensemble" : `${t.note}/20`],
   ["Pour de vrai", "à partir de 15/20, avec ton accord"]].forEach(([titre, detail], k) => {
    const li = el("li", k < rang ? "fait" : k === rang ? "actuelle" : "");
    li.append(el("span", "pastille-etape", k < rang ? "✓" : String(k + 1)), el("b", "", titre), el("small", "", detail));
    ol.append(li);
  });
  return ol;
}

let dernierTest = "";
async function afficherTest(force = true) {
  const zone = $("#carte-test");
  let t;
  try { t = await appel("/api/test"); } catch (e) { return toast(e.message); }
  if (!t) return;
  // Serveur de la version précédente (note par candidature, ou note globale par message) : on s'adapte
  const moderne = Array.isArray(t.criteres_possibles);
  if (!moderne) {
    const notes = (t.candidatures || []).map((c) => c.note).filter((n) => n !== null && n !== undefined);
    t.note = t.moyenne ?? (t.notes && t.notes.length ? t.notes[t.notes.length - 1].note : null) ?? (notes.length ? notes[0] : null);
  }
  t = { taille: 3, exigences: [], historique: [], note: null, ...t, candidatures: t.candidatures || [],
        criteres_possibles: t.criteres_possibles || CRITERES_TEST };
  const empreinte = JSON.stringify(t);
  if (!force && empreinte === dernierTest) return;          // rien de neuf : on ne redessine pas (pas de clignotement)
  // Une note ou des remarques en cours de saisie : on ne les efface pas
  dernierTest = empreinte;
  zone.textContent = "";
  const [titre, sous] = LIBELLES_TEST[t.statut] || ["Phase de test", ""];

  // En-tête : où on en est + la note globale sur la jauge
  const tete = el("div", "test-tete");
  const g = el("div"); g.append(el("span", "mono", `Test n°${t.tour}`), el("h3", "", titre), el("p", "petit-texte serre", sous));
  const note = el("div", "moyenne" + (t.note !== null && t.note >= 15 ? " ok" : ""));
  note.append(el("strong", "", t.note === null ? "—" : String(t.note)), el("small", "", "/20 · ta note"));
  tete.append(g, note);
  const regle = el("div", "regle"); const plein = el("div", "remplissage" + (t.note >= 15 ? " ok" : ""));
  plein.style.setProperty("width", `${((t.note || 0) / 20) * 100}%`);
  const seuil = el("div", "seuil"); seuil.append(el("span", "", "15/20"));
  regle.append(plein, seuil);
  zone.append(tete, etapesTest(t), regle);
  if (t.statut === "a_noter") zone.append(formulaireNote(t, moderne));   // d'abord ce qu'on attend de la personne
  if (t.statut === "retour") zone.append(formulaireRetour());

  if (t.statut === "a_lancer") {
    const b = el("button", "bouton vert large", "▶  Lancer le test");
    b.type = "button"; b.onclick = () => { b.disabled = true; commandeTest("/api/test/lancer", undefined, "Test lancé : ton agent s'y met."); };
    const p = el("p", "petit-texte", `Les ${t.taille} candidatures arriveront sur ${utilisateur.email}, jamais chez un recruteur.`);
    zone.append(b, p);
  }

  // Les candidatures du test (la note de l'IA à côté, pour comparer avec ton avis)
  if (t.candidatures.length || t.statut === "en_cours") {
    const liste = el("div", "cand-test");
    t.candidatures.forEach((c, i) => {
      const ligne = el("div", "ct-ligne");
      const info = el("div", "ct-info");
      info.append(el("span", "mono", `Candidature ${i + 1}`), el("b", "", c.entreprise || "Employeur"), el("span", "ct-poste", `${c.titre || ""}${c.ville ? " · " + c.ville : ""}`));
      const notes = el("div", "ct-notes");
      const ia = el("div", "pastille-note ia"); ia.append(el("small", "", "Note de l'IA"), el("b", "", c.note_ia === null || c.note_ia === undefined ? "—" : `${c.note_ia}/20`));
      notes.append(ia);
      ligne.append(info, notes); liste.append(ligne);
    });
    for (let k = t.candidatures.length; k < t.taille && t.statut === "en_cours"; k++) {
      const vide = el("div", "ct-ligne attente"); vide.append(el("span", "ecrit-mini"), el("span", "petit-texte", `Candidature ${k + 1} en préparation…`));
      liste.append(vide);
    }
    zone.append(liste);
  }

  if (t.statut === "attente_accord") {
    const choix = el("div", "choix");
    [["✅ Postuler pour de vrai", "autoriser envoi"], ["🔁 Encore un test", "refaire un test"]].forEach(([l, c]) => {
      const x = el("button", "", l); x.type = "button"; x.onclick = () => { envoyer(c, l); montrer("discussion"); }; choix.append(x);
    });
    zone.append(choix);
  }

  // Les tests précédents et ses exigences, gardées pour toujours
  if ((t.historique || []).length) {
    const h = el("div", "exigences"); h.append(el("span", "mono", "Tests précédents"));
    const ul = el("ul");
    t.historique.slice().reverse().forEach((x) => {
      const n = x.note ?? x.moyenne;
      ul.append(el("li", "", `Test n°${x.tour} : ${n === null || n === undefined ? "—" : n + "/20"}${x.retour ? " — " + x.retour : ""}`));
    });
    h.append(ul); zone.append(h);
  }
  if ((t.exigences || []).length) {
    const ex = el("div", "exigences"); ex.append(el("span", "mono", "Tes exigences, gardées pour toujours"));
    const ul = el("ul"); t.exigences.slice().reverse().forEach((x) => ul.append(el("li", "", x.texte))); ex.append(ul);
    zone.append(ex);
  }
}

// La note globale : un curseur, ce qui n'allait pas en un clic, et ses mots
function formulaireNote(t, moderne) {
  const f = el("form", "retour note-globale");
  f.append(el("b", "", "Ta note globale pour ces 3 candidatures"),
    el("p", "petit-texte serre", "À partir de 15/20, tu pourras passer aux vraies candidatures. En dessous, ton agent corrige et refait un test."));
  const curseur = curseurNote(14);
  const cases = el("fieldset", "puces");
  cases.append(el("legend", "", "Ce qui n'allait pas (facultatif)"));
  t.criteres_possibles.forEach((c) => {
    const lab = el("label", "puce"); const x = el("input"); x.type = "checkbox"; x.value = c.code;
    lab.append(x, el("span", "", c.libelle)); cases.append(lab);
  });
  const z = el("textarea"); z.maxLength = 2000; z.placeholder = "Avec tes mots (facultatif) : ce que tu as aimé, ce qui manque, ce qui sonne faux…";
  z.setAttribute("aria-label", "Ton avis");
  const ok = el("button", "bouton vert large", "Envoyer ma note"); ok.type = "submit";
  f.append(curseur, cases, z, ok);
  f.oninput = () => { f.dataset.touche = "1"; };              // en cours de saisie : le rafraîchissement attend
  f.onsubmit = (ev) => {
    ev.preventDefault(); ok.disabled = true;
    const note = +curseur.querySelector("input").value;
    const criteres = [...cases.querySelectorAll("input:checked")].map((x) => x.value);
    const mots = z.value.trim();
    if (moderne) return commandeTest("/api/test/noter", { note, criteres, commentaire: mots }, `Noté ${note}/20 ✓`);
    // Serveur de la version précédente : la note passe par la discussion (« note 14 : … »), qu'il comprend
    const libelles = criteres.map((c) => (t.criteres_possibles.find((x) => x.code === c) || {}).libelle).filter(Boolean);
    envoyer(`note ${note} : ${[...libelles, mots].filter(Boolean).join(", ") || "pas de commentaire"}`); montrer("discussion");
  };
  return f;
}

function formulaireRetour() {
  const f = el("form", "retour");
  f.append(el("b", "", "Qu'est-ce qui n'a pas été ?"),
    el("p", "petit-texte serre", "Le style, le ton, la longueur, ce qui manque… Ton agent le retient pour toutes tes candidatures, puis refait un test."));
  const z = el("textarea"); z.maxLength = 2000; z.required = true; z.placeholder = "Ex. : trop formel, parle davantage de mon stage, lettres plus courtes…";
  z.setAttribute("aria-label", "Ce qui n'a pas été");
  const ok = el("button", "bouton vert", "Envoyer et refaire un test"); ok.type = "submit";
  f.append(z, ok);
  f.oninput = () => { f.dataset.touche = "1"; };
  f.onsubmit = (ev) => {
    ev.preventDefault(); if (z.value.trim().length < 3) return;
    ok.disabled = true; commandeTest("/api/test/retour", { texte: z.value.trim() }, "Merci ! C'est noté pour toujours.");
  };
  return f;
}

// ---------- Réglages ----------
$("#notif").onchange = async (ev) => {
  try { await appel("/api/moi", { methode: "PATCH", corps: { notif_email: ev.target.checked } }); utilisateur.notif_email = ev.target.checked; toast("Enregistré."); }
  catch (e) { toast(e.message); ev.target.checked = !ev.target.checked; }
};
$("#changer-agent").onclick = () => { clearInterval(minuteur); initAgents(); };
$("#deconnexion").onclick = async () => { try { await appel("/api/auth/deconnexion", { methode: "POST" }); } catch (e) { /* déjà expirée */ } deconnecter(); };
$("#supprimer").onclick = async () => {
  const ok = prompt("Tout sera effacé définitivement (compte, CV, lettres, mémoire).\nÉcris SUPPRIMER pour confirmer :");
  if (ok !== "SUPPRIMER") return;
  try { await appel("/api/moi", { methode: "DELETE" }); toast("Compte supprimé."); deconnecter(); } catch (e) { toast(e.message); }
};

// ---------- Démarrage ----------
(async () => {
  if (DEMO) $("#bandeau-demo").hidden = false;
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!jeton) return initConnexion();
  try { utilisateur = await appel("/api/moi"); suite(); } catch (e) { initConnexion(); }
})();
