// Espace personnel : connexion, choix de l'agent, discussion, candidatures, phase de test, réglages.
// Sécurité : tout texte venant du serveur est inséré avec textContent (jamais innerHTML) → pas d'injection possible.
"use strict";
const API = (window.CONFIG.API || "").replace(/\/$/, "");
const DEMO = !API;
const $ = (s) => document.querySelector(s);
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
  for (const id of ["ecran-connexion", "ecran-autorisation", "ecran-agents", "ecran-app"]) $("#" + id).hidden = id !== nom;
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
      try { await appel("/api/agent", { methode: "POST", corps: { agent: a.id } }); utilisateur.agent = a.id; initApp(); }
      catch (e) { toast(e.message); carte.disabled = false; }
    };
    zone.append(carte);
  }
}

// ---------- Application ----------
function suite() {
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
  montrer("accueil");
  rafraichir();
  clearInterval(minuteur);
  minuteur = setInterval(() => { if (!document.hidden) rafraichir(); }, 2500);
}

function montrer(vue) {
  vueActive = vue;
  document.querySelectorAll(".onglet").forEach((o) => o.setAttribute("aria-selected", String(o.dataset.vue === vue)));
  for (const v of ["accueil", "discussion", "candidatures", "test", "reglages"]) $("#vue-" + v).hidden = v !== vue;
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
  if (m.role === "agent" && m.genre === "notation") fil.append(formulaireNote());
}

function formulaireNote() {
  const f = document.createElement("form"); f.className = "noter";
  const titre = document.createElement("span"); titre.className = "mono"; titre.textContent = "Ta note sur 20";
  const chiffre = document.createElement("div"); chiffre.className = "chiffre";
  const curseur = document.createElement("input"); curseur.type = "range"; curseur.min = 0; curseur.max = 20; curseur.value = 12;
  curseur.setAttribute("aria-label", "Note sur 20");
  const maj = () => { chiffre.textContent = curseur.value; const s = document.createElement("small"); s.textContent = " /20"; chiffre.append(s); };
  curseur.oninput = maj; maj();
  const zone = document.createElement("textarea");
  zone.placeholder = "Ce que tu as aimé, ce que tu as moins aimé (ton, longueur, ce qui manque…)";
  zone.maxLength = 1500; zone.setAttribute("aria-label", "Ton avis");
  const ok = document.createElement("button"); ok.className = "bouton terre"; ok.type = "submit"; ok.textContent = "Envoyer ma note";
  f.append(titre, chiffre, curseur, zone, ok);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const texte = `note ${curseur.value} : ${zone.value.trim() || "pas de commentaire"}`;
    envoyer(texte); f.remove();
  };
  return f;
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
function el(tag, cls, texte) { const e = document.createElement(tag); if (cls) e.className = cls; if (texte !== undefined) e.textContent = texte; return e; }
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
  $("#maintenant-texte").textContent = t.en_ce_moment ? `${t.en_ce_moment}…`
    : t.derniere_activite ? `En pause — dernière action ${depuis(t.derniere_activite)}. Il reprend tout seul.`
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
  if (test && test.statut === "a_noter") carteAction(`Test n°${test.tour} à noter`, "3 candidatures t'attendent sur ton email. Donne une note sur 20.", "Noter", () => montrer("test"));
  if (test && test.statut === "attente_accord") carteAction("Test réussi 🎉", "Ton agent attend ton accord pour écrire aux recruteurs.", "Donner mon accord", () => montrer("test"));

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

// ---------- Phase de test ----------
async function afficherTest() {
  const zone = $("#carte-test"); zone.textContent = "";
  let t;
  try { t = await appel("/api/test"); } catch (e) { return toast(e.message); }
  const derniere = t.notes.length ? t.notes[t.notes.length - 1].note : null;
  const carte = document.createElement("div"); carte.className = "bareme";
  const titre = document.createElement("h3");
  titre.textContent = { en_cours: `Test n°${t.tour} en préparation`, a_noter: `Test n°${t.tour} : à toi de noter !`,
    attente_accord: "Test réussi : j'attends ton accord", reussi: "Phase de test réussie 🎉" }[t.statut] || "Phase de test";
  const regle = document.createElement("div"); regle.className = "regle";
  const seuil = document.createElement("div"); seuil.className = "seuil";
  const s = document.createElement("span"); s.textContent = "15/20 = feu vert"; seuil.append(s); regle.append(seuil);
  if (derniere !== null) { const c = document.createElement("div"); c.className = "curseur"; c.style.left = (derniere / 20 * 100) + "%"; regle.append(c); }
  const grad = document.createElement("div"); grad.className = "graduations";
  ["0", "5", "10", "15", "20"].forEach((x) => { const sp = document.createElement("span"); sp.textContent = x; grad.append(sp); });
  const p = document.createElement("p"); p.className = "petit-texte";
  p.textContent = "Chaque test : 3 candidatures envoyées sur ton email, comme un recruteur les recevrait. Il faut au moins 2 tests et une note ≥ 15/20, puis ton accord, avant le premier envoi réel.";
  const tours = document.createElement("div"); tours.className = "tours";
  t.notes.forEach((n) => {
    const d = document.createElement("div"); d.className = "tour";
    const e = document.createElement("span"); e.className = "etiquette " + (n.note >= 15 ? "vert" : "terre"); e.textContent = `Test n°${n.tour}`;
    const b = document.createElement("b"); b.textContent = `${n.note}/20`;
    const c = document.createElement("span"); c.textContent = n.commentaire || "";
    d.append(e, b, c); tours.append(d);
  });
  carte.append(titre, regle, grad, p, tours);
  zone.append(carte);
  if (t.statut === "a_noter") zone.append(formulaireNote());
  if (t.statut === "attente_accord") {
    const choix = document.createElement("div"); choix.className = "choix";
    [["✅ Oui, envoie aux recruteurs", "autoriser envoi"], ["🔁 Encore un test", "refaire un test"]].forEach(([l, c]) => {
      const x = document.createElement("button"); x.type = "button"; x.textContent = l; x.onclick = () => { envoyer(c, l); montrer("discussion"); }; choix.append(x);
    });
    zone.append(choix);
  }
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
