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
  // Onglet test ouvert : on suit l'arrivée des candidatures (sans effacer une note en cours de saisie)
  if (vueActive === "test" && !document.querySelector("#carte-test .note-inline, #carte-test .retour textarea:focus")
      && !(document.querySelector("#carte-test .retour textarea") || {}).value
      && Date.now() - (window._dernierTest || 0) > 5000) { window._dernierTest = Date.now(); afficherTest(false); }
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
    const b = el("button", "bouton noter", "🧪 Noter mes candidatures"); b.type = "button"; b.onclick = () => montrer("test"); fil.append(b);
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
  if (test && test.statut === "a_lancer") carteAction("Lance ta phase de test", `3 candidatures arriveront sur ${utilisateur.email}, pour que tu les notes.`, "Voir", () => montrer("test"));
  const aNoter = test ? test.candidatures.filter((c) => c.note === null || c.note === undefined).length : 0;
  if (test && ["en_cours", "a_noter"].includes(test.statut) && aNoter && test.candidatures.length)
    carteAction(`${aNoter} candidature${aNoter > 1 ? "s" : ""} à noter`, "Elles sont dans ta boîte mail. Donne une note sur 20 à chacune.", "Noter", () => montrer("test"));
  if (test && test.statut === "retour") carteAction("Dis-lui ce qui n'a pas été", "La moyenne est sous 15/20 : tes remarques, puis il refait un test.", "Répondre", () => montrer("test"));
  if (test && test.statut === "attente_accord") carteAction("Test réussi 🎉", "Moyenne ≥ 15/20 : tu peux passer aux vraies candidatures.", "Décider", () => montrer("test"));

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

// ---------- Phase de test : une note par candidature, la moyenne décide ----------
const LIBELLES_TEST = {
  a_lancer: ["Pas encore lancé", "Quand ton agent a ton CV et sait ce que tu cherches, lance le test : 3 candidatures arrivent sur ton email, rien chez les recruteurs."],
  en_cours: ["Test en préparation", "Ton agent cherche des offres et écrit tes candidatures. Tu peux noter chacune dès qu'elle arrive."],
  a_noter: ["À toi de noter", "Lis les candidatures reçues sur ton email, puis note chacune sur 20."],
  retour: ["Dis-lui ce qui n'a pas été", "La moyenne est sous 15/20. Tes remarques sont gardées pour toutes tes futures candidatures."],
  attente_accord: ["Test réussi 🎉", "La moyenne dépasse 15/20. Tu peux passer aux vraies candidatures."],
  reussi: ["Phase de test réussie", "Ton agent postule pour de vrai, depuis ton Gmail."],
};

function commandeTest(chemin, corps, message) {
  return appel(chemin, { methode: "POST", corps }).then(() => { if (message) toast(message); setTimeout(afficherTest, 1800); })
    .catch((e) => toast(e.message));
}

function curseurNote(valeur, surValider) {
  const f = el("form", "note-inline");
  const chiffre = el("div", "chiffre-note");
  const r = el("input"); r.type = "range"; r.min = 0; r.max = 20; r.value = valeur ?? 14; r.setAttribute("aria-label", "Ta note sur 20");
  const maj = () => { chiffre.textContent = r.value; chiffre.append(el("small", "", "/20")); chiffre.classList.toggle("ok", +r.value >= 15); };
  r.oninput = maj; maj();
  const ok = el("button", "bouton petit vert", "Valider"); ok.type = "submit";
  f.append(chiffre, r, ok);
  f.onsubmit = (ev) => { ev.preventDefault(); ok.disabled = true; surValider(+r.value); };
  return f;
}

let dernierTest = "";
async function afficherTest(force = true) {
  const zone = $("#carte-test");
  let t;
  try { t = await appel("/api/test"); } catch (e) { return toast(e.message); }
  if (!t) return;
  const empreinte = JSON.stringify(t);
  if (!force && empreinte === dernierTest) return;          // rien de neuf : on ne redessine pas (pas de clignotement)
  dernierTest = empreinte;
  zone.textContent = "";
  const [titre, sous] = LIBELLES_TEST[t.statut] || ["Phase de test", ""];

  // En-tête : où on en est + la moyenne sur la jauge
  const tete = el("div", "test-tete");
  const g = el("div"); g.append(el("span", "mono", `Test n°${t.tour}`), el("h3", "", titre), el("p", "petit-texte serre", sous));
  const moy = el("div", "moyenne" + (t.moyenne !== null && t.moyenne >= 15 ? " ok" : ""));
  moy.append(el("strong", "", t.moyenne === null ? "—" : String(t.moyenne).replace(".", ",")), el("small", "", "/20 de moyenne"));
  tete.append(g, moy);
  const regle = el("div", "regle"); const plein = el("div", "remplissage" + (t.moyenne >= 15 ? " ok" : ""));
  plein.style.setProperty("width", `${((t.moyenne || 0) / 20) * 100}%`);
  const seuil = el("div", "seuil"); seuil.append(el("span", "", "15/20"));
  regle.append(plein, seuil);
  zone.append(tete, regle);
  if (t.statut === "retour") zone.append(formulaireRetour());   // d'abord ce qu'on attend d'elle

  if (t.statut === "a_lancer") {
    const b = el("button", "bouton vert large", "▶  Lancer le test");
    b.type = "button"; b.onclick = () => { b.disabled = true; commandeTest("/api/test/lancer", undefined, "Test lancé : ton agent s'y met."); };
    const p = el("p", "petit-texte", `Les ${t.taille} candidatures arriveront sur ${utilisateur.email}, jamais chez un recruteur.`);
    zone.append(b, p);
  }

  // Les candidatures du test, une par une
  if (t.candidatures.length || t.statut === "en_cours") {
    const liste = el("div", "cand-test");
    t.candidatures.forEach((c, i) => {
      const ligne = el("div", "ct-ligne");
      const info = el("div", "ct-info");
      info.append(el("span", "mono", `Candidature ${i + 1}`), el("b", "", c.entreprise || "Employeur"), el("span", "ct-poste", `${c.titre || ""}${c.ville ? " · " + c.ville : ""}`));
      const notes = el("div", "ct-notes");
      const ia = el("div", "pastille-note ia"); ia.append(el("small", "", "Note de l'IA"), el("b", "", c.note_ia === null ? "—" : `${c.note_ia}/20`));
      notes.append(ia);
      if (c.note !== null && c.note !== undefined) {
        const moi = el("div", "pastille-note moi"); moi.append(el("small", "", "Ta note"), el("b", "", `${c.note}/20`)); notes.append(moi);
      } else if (["en_cours", "a_noter"].includes(t.statut)) {
        const b = el("button", "bouton petit noter", "Noter"); b.type = "button";
        b.onclick = () => { b.replaceWith(curseurNote(14, (n) => commandeTest("/api/test/noter", { offre_id: c.id, note: n }, `Noté ${n}/20 ✓`))); };
        notes.append(b);
      }
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

  // Ses exigences, gardées pour toujours
  if ((t.exigences || []).length) {
    const ex = el("div", "exigences"); ex.append(el("span", "mono", "Tes exigences, gardées pour toujours"));
    const ul = el("ul"); t.exigences.slice().reverse().forEach((x) => ul.append(el("li", "", x.texte))); ex.append(ul);
    zone.append(ex);
  }
}

function formulaireRetour() {
  const f = el("form", "retour");
  f.append(el("b", "", "Qu'est-ce qui n'a pas été ?"),
    el("p", "petit-texte serre", "Le style, le ton, la longueur, ce qui manque… Ton agent le retient pour toutes tes candidatures, puis refait un test."));
  const z = el("textarea"); z.maxLength = 2000; z.required = true; z.placeholder = "Ex. : trop formel, parle davantage de mon stage, lettres plus courtes…";
  z.setAttribute("aria-label", "Ce qui n'a pas été");
  const ok = el("button", "bouton vert", "Envoyer et refaire un test"); ok.type = "submit";
  f.append(z, ok);
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
