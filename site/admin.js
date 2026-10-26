// Suivi des bêta-testeurs : seulement pour l'administrateur (le serveur vérifie l'adresse ; pour tout autre compte,
// les routes /api/admin n'existent pas). Lecture seule. Tout texte venant du serveur passe par textContent.
"use strict";
const STATUTS_TEST = { a_lancer: "pas lancé", en_cours: "en cours", a_noter: "à noter", retour: "attend ses remarques",
  attente_accord: "attend son accord", reussi: "réussi" };
const GROUPES_OFFRES = [
  ["envoyees", "Envoyées", ["envoyee", "relancee", "entretien", "refus", "sans_reponse", "offre_recue"]],
  ["tests", "Tests", ["repetee", "manuelle"]],
  ["pretes", "Prêtes à partir", ["redigee", "a_valider", "validee"]],
  ["retenues", "Retenues", ["qualifiee", "enrichie"]],
  ["ecartees", "Écartées", ["ecartee", "erreur"]],
  ["decouvertes", "Pas encore lues", ["decouverte"]],
];
let adminCourant = null;

function ilYa(v) {
  if (!v) return "jamais";
  const t = typeof v === "number" ? v * 1000 : Date.parse(String(v).replace(" ", "T") + (String(v).includes("Z") ? "" : "Z"));
  if (Number.isNaN(t)) return String(v);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const euros = (x) => `${(+x || 0).toFixed(2).replace(".", ",")} €`;

async function initAdmin() {
  ecran("ecran-admin");
  $("#admin-qui").textContent = utilisateur.email;
  $("#admin-deconnexion").onclick = async () => { try { await appel("/api/auth/deconnexion", { methode: "POST" }); } catch (e) { /* expirée */ } deconnecter(); };
  $("#admin-retour").onclick = () => listeAdmin();
  $("#admin-actualiser").onclick = () => (adminCourant ? ouvrirUtilisateur(adminCourant) : listeAdmin());
  listeAdmin();
}

async function etatServeur() {
  const z = $("#admin-serveur"); z.textContent = "";
  try {
    const e = await appel("/api/admin/etat");
    const m = e.modele_local || {};
    const puce = (t, ok) => { const s = el("span", "puce-etat" + (ok ? " ok" : ""), t); z.append(s); };
    puce(`Agents en marche : ${(e.agents_en_marche && (e.agents_en_marche.conversations + e.agents_en_marche.tournees)) || 0}`, true);
    puce(`Modèle local : ${m.etat || "absent"}`, m.etat === "en marche");
    if (m.machine_dispo_mo) puce(`RAM libre : ${(m.machine_dispo_mo / 1024).toFixed(1)} / ${(m.machine_total_mo / 1024).toFixed(1)} Go`, m.machine_dispo_mo > 1500);
    if (m.tri_7j) puce(`Emails triés en local (7 j) : ${m.tri_7j.emails}${m.tri_7j.duree_moyenne_s ? ` · ${m.tri_7j.duree_moyenne_s} s` : ""}`, true);
  } catch (e) { z.append(el("span", "puce-etat", "État du serveur indisponible")); }
}

async function listeAdmin() {
  adminCourant = null;
  $("#admin-retour").hidden = true;
  $("#admin-titre").textContent = "Bêta-testeurs";
  const zone = $("#admin-contenu"); zone.textContent = "";
  etatServeur();
  let liste;
  try { liste = await appel("/api/admin/utilisateurs"); } catch (e) { zone.append(el("p", "erreur", e.message)); return; }
  const gens = liste.filter((u) => !u.admin);
  const total = gens.reduce((s, u) => s + (u.cout_24h || 0), 0);
  zone.append(el("p", "sous", `${gens.length} compte(s) · IA dépensée sur 24 h : ${euros(total)}`));
  if (!gens.length) zone.append(el("div", "vide", "Personne ne s'est encore inscrit."));
  const grille = el("div", "admin-grille");
  for (const u of gens) {
    const c = el("button", "admin-carte"); c.type = "button";
    const haut = el("div", "admin-carte-haut");
    haut.append(el("b", "", u.email), el("span", "etiquette" + (u.en_marche ? " vert" : ""), u.en_marche ? "agent en marche" : "agent arrêté"));
    c.append(haut, el("span", "sous", `${u.nom || "—"} · ${u.agent ? "Agent " + u.agent : "pas d'agent choisi"} · inscrit ${ilYa(u.cree_le)} · vu ${ilYa(u.vu_le)}`));
    const etapes = el("div", "admin-etapes");
    const etape = (texte, ok) => etapes.append(el("span", "puce-etat" + (ok ? " ok" : ""), texte));
    etape(u.gmail_ok ? "Gmail autorisé" : "Gmail non autorisé", u.gmail_ok);
    etape(u.cv ? "CV reçu" : "pas de CV", u.cv);
    etape(`Test : ${STATUTS_TEST[u.test] || "pas lancé"}${u.tests_envoyes ? ` (${u.tests_envoyes}/3)` : ""}${u.note != null ? ` · ${u.note}/20` : ""}`,
      u.test === "reussi" || u.test === "attente_accord");
    c.append(etapes);
    const ch = el("div", "admin-chiffres");
    for (const [n, l] of [[u.offres, "offres vues"], [u.retenues, "retenues"], [u.envoyees, "envoyées"], [u.a_postuler_site ?? 0, "sur leur site"],
      [euros(u.cout_24h), "IA 24 h"], [euros(u.cout_total), "IA total"]]) {
      const d = el("div"); d.append(el("strong", "", String(n)), el("span", "", l)); ch.append(d);
    }
    c.append(ch);
    if (u.erreur) c.append(el("p", "erreur", u.erreur));
    if (u.demandes) c.append(el("span", "puce-etat", `💡 ${u.demandes} demande(s) à ajouter`));
    c.append(el("span", "petit-texte", `Dernière activité de l'agent : ${ilYa(u.derniere_activite)}`));
    c.onclick = () => ouvrirUtilisateur(u.id);
    grille.append(c);
  }
  zone.append(grille);
}

async function ouvrirUtilisateur(id) {
  adminCourant = id;
  $("#admin-retour").hidden = false;
  const zone = $("#admin-contenu"); zone.textContent = "";
  zone.append(el("p", "sous", "Chargement…"));
  let d;
  try { d = await appel(`/api/admin/utilisateurs/${encodeURIComponent(id)}`); }
  catch (e) { zone.textContent = ""; zone.append(el("p", "erreur", e.message)); return; }
  zone.textContent = "";
  const u = d.compte;
  $("#admin-titre").textContent = u.email;
  const onglets = el("div", "admin-onglets"); const corps = el("div", "admin-corps");
  const SECTIONS = [["resume", "Résumé"], ["cv", "CV"], ["recherche", "Recherche"], ["test", "Test"], ["offres", `Offres (${d.offres.length})`],
    ["discussion", "Discussion"], ["reponses", `Réponses (${d.emails_recus.length})`], ["couts", "Coûts et journal"]];
  const montrerSection = (k) => {
    [...onglets.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    corps.textContent = "";
    ({ resume: secResume, cv: secCv, recherche: secRecherche, test: secTest, offres: secOffres, discussion: secDiscussion,
       reponses: secReponses, couts: secCouts })[k](corps, d, id);
  };
  for (const [k, l] of SECTIONS) { const b = el("button", "puce-onglet", l); b.type = "button"; b.dataset.k = k; b.onclick = () => montrerSection(k); onglets.append(b); }
  const exp = el("button", "bouton clair petit admin-export", "Exporter pour analyse"); exp.type = "button";
  exp.onclick = () => exporterDossier(exp, d, id);
  zone.append(exp, onglets, corps);
  montrerSection("resume");
}

function bloc(parent, titre) { const b = el("section", "bloc admin-bloc"); if (titre) b.append(el("h3", "", titre)); parent.append(b); return b; }
function texteBrut(parent, t, vide) { parent.append(t ? el("pre", "admin-pre", t) : el("p", "sous", vide)); }
function ligneAdmin(parent, cle, valeur) { const l = el("div", "admin-ligne"); l.append(el("span", "sous", cle), el("span", "", valeur == null || valeur === "" ? "—" : String(valeur))); parent.append(l); }

function secResume(z, d, id) {
  const u = d.compte;
  actionsAdmin(z, d, id);
  const b = bloc(z, "Où il en est");
  ligneAdmin(b, "Nom", u.nom); ligneAdmin(b, "Agent", u.agent ? "Agent " + u.agent : "pas choisi");
  ligneAdmin(b, "Inscrit", ilYa(u.cree_le)); ligneAdmin(b, "Vu dans l'app", ilYa(u.vu_le));
  ligneAdmin(b, "Gmail", u.gmail_ok ? "autorisé" : "non autorisé"); ligneAdmin(b, "CV", u.cv ? "reçu" : "pas encore");
  ligneAdmin(b, "Phase de test", `${STATUTS_TEST[u.test] || "pas lancé"}${u.note != null ? ` · note ${u.note}/20` : ""}`);
  ligneAdmin(b, "Offres", `${u.offres} vues · ${u.retenues} retenues · ${u.envoyees} envoyées · ${u.tests_envoyes} tests`);
  ligneAdmin(b, "IA", `${euros(u.cout_24h)} sur 24 h · ${euros(u.cout_total)} au total`);
  ligneAdmin(b, "Dernière activité", ilYa(u.derniere_activite));
  if (d.demandes && d.demandes.length) {
    const q = bloc(z, "Ses demandes que l'agent ne sait pas encore faire");
    for (const x of d.demandes.slice().reverse()) ligneAdmin(q, x.le || "", x.texte || "");
  }
  const j = bloc(z, "Dernières actions de l'agent");
  journal(j, d.journal.slice(0, 15));
}

// Actions de l'administrateur sur cet espace (le serveur les écrit dans la base de son agent)
function actionsAdmin(z, d, id) {
  const b = bloc(z, "Actions");
  const base = `/api/admin/utilisateurs/${encodeURIComponent(id)}`;
  const rangee = el("div", "admin-actions");
  const bouton = (texte, f) => { const x = el("button", "bouton clair petit", texte); x.type = "button"; x.onclick = () => f(x); rangee.append(x); return x; };
  bouton("Remettre son budget du jour à zéro", async (x) => {
    if (!confirm("Son budget d'aujourd'hui redevient entier (1 € + 0,35 € pour les lettres). Continuer ?")) return;
    x.disabled = true;
    try { const r = await appel(`${base}/budget`, { methode: "POST" }); toast(`Budget remis à zéro (${euros(r.remis)} offerts aujourd'hui).`); }
    catch (e) { toast(e.message); }
    x.disabled = false;
  });
  bouton("Relire son CV actuel", async (x) => {
    x.disabled = true;
    try { await appel(`${base}/relire-cv`, { methode: "POST" }); toast("Son agent relit son CV (il lui dira ce qui a changé)."); }
    catch (e) { toast(e.message); }
    x.disabled = false;
  });
  b.append(rangee);
  const f = el("form", "admin-adresse");
  const champ = el("input"); champ.type = "email"; champ.placeholder = "adresse pour ses copies et messages";
  champ.value = d.copie_a || ""; champ.setAttribute("aria-label", "Adresse de copie");
  const ok = el("button", "bouton petit", "Enregistrer"); ok.type = "submit";
  f.append(champ, ok);
  f.onsubmit = async (ev) => {
    ev.preventDefault(); ok.disabled = true;
    try { await appel(`${base}/adresse`, { methode: "POST", corps: { adresse: champ.value.trim() } });
      toast(champ.value.trim() ? "Copies et messages iront aussi à cette adresse." : "Copies arrêtées."); }
    catch (e) { toast(e.message); }
    ok.disabled = false;
  };
  b.append(el("p", "petit-texte", "Adresse où elle reçoit une copie de chaque candidature envoyée et les messages de son agent (vide = son Gmail de connexion)."), f);
  if (d.budget_offert) b.append(el("p", "petit-texte", `Budget remis à zéro aujourd'hui (${euros(d.budget_offert)} offerts).`));
}

function secCv(z, d, id) {
  const b = bloc(z, "Le CV");
  if (d.compte.cv) {
    const bt = el("button", "bouton clair petit", "Télécharger le CV (PDF)"); bt.type = "button";
    bt.onclick = () => telechargerAdmin(`/api/admin/utilisateurs/${encodeURIComponent(id)}/cv`, `cv_${d.compte.email}.pdf`);
    b.append(bt);
  } else b.append(el("p", "sous", "Pas encore de CV."));
  const f = bloc(z, "Ce que l'agent en a retenu (fiche profil, seule base des lettres)");
  texteBrut(f, d.fiche_cv, "Pas encore de fiche.");
  if (d.memoire && d.memoire.length) {
    const m = bloc(z, "Mémoire de l'agent");
    for (const s of d.memoire) m.append(el("p", "admin-souvenir", s.texte || JSON.stringify(s)));
  }
}

function secRecherche(z, d) {
  const b = bloc(z, "Ce qu'il cherche (objectif)");
  texteBrut(b, d.objectif, "Pas encore d'objectif.");
  if (d.exigences && d.exigences.length) {
    const e = bloc(z, "Ses exigences (retenues de ses remarques)");
    const ul = el("ul"); for (const x of d.exigences) ul.append(el("li", "", x.texte || String(x))); e.append(ul);
  }
}

function secTest(z, d) {
  const t = d.test;
  const b = bloc(z, "Phase de test");
  if (!t) { b.append(el("p", "sous", "Pas d'agent.")); return; }
  ligneAdmin(b, "Statut", `${STATUTS_TEST[t.statut] || t.statut} · test n°${t.tour}`);
  ligneAdmin(b, "Sa note", t.note != null ? `${t.note}/20` : "pas encore");
  ligneAdmin(b, "Note de l'IA", t.note_ia != null ? `${t.note_ia}/20` : "—");
  ligneAdmin(b, "Ce qui n'allait pas", (t.criteres || []).join(", "));
  ligneAdmin(b, "Son commentaire", t.commentaire);
  const c = bloc(z, "Les candidatures du test");
  if (!t.candidatures.length) c.append(el("p", "sous", "Aucune envoyée pour l'instant."));
  for (const x of t.candidatures) ligneAdmin(c, `${x.titre || "?"} · ${x.entreprise || "?"}`, `${x.envoye_le ? "envoyée " + ilYa(x.envoye_le) : "en préparation"} · IA ${x.note_ia ?? "—"}/20`);
  if (t.historique && t.historique.length) {
    const h = bloc(z, "Tests précédents");
    for (const x of t.historique) ligneAdmin(h, `Test n°${x.tour}`, `${x.note}/20 · ${(x.criteres || []).join(", ")} ${x.retour || ""}`);
  }
}

function secOffres(z, d, id) {
  const filtres = el("div", "admin-onglets"); const liste = el("div", "admin-offres"); const detail = el("div");
  const groupes = GROUPES_OFFRES.map(([k, l, st]) => [k, l, d.offres.filter((o) => st.includes(o.statut))]);
  const montrer = (k) => {
    [...filtres.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    liste.textContent = ""; detail.textContent = "";
    const g = groupes.find((x) => x[0] === k);
    if (!g[2].length) liste.append(el("p", "sous", "Aucune."));
    for (const o of g[2]) {
      const r = el("button", "admin-offre"); r.type = "button";
      const h = el("div", "admin-carte-haut");
      h.append(el("b", "", `${o.titre || "?"}`), el("span", "etiquette", o.statut));
      r.append(h, el("span", "sous", `${o.entreprise || "?"} · ${o.ville || "?"} · ${o.source || ""}${o.score != null ? ` · ${o.score}/10` : ""}${o.note_lettre ? ` · lettre ${o.note_lettre}/10` : ""}`));
      if (o.raison) r.append(el("span", "petit-texte", o.raison));
      if (o.envoye_le) r.append(el("span", "petit-texte", `Envoyée ${ilYa(o.envoye_le)} à ${o.email_contact || "?"}`));
      r.onclick = () => ouvrirOffre(detail, id, o.id);
      liste.append(r);
    }
  };
  for (const [k, l, os] of groupes) { const b = el("button", "puce-onglet", `${l} (${os.length})`); b.type = "button"; b.dataset.k = k; b.onclick = () => montrer(k); filtres.append(b); }
  z.append(filtres, detail, liste);
  montrer((groupes.find((g) => g[2].length) || groupes[0])[0]);
}

async function ouvrirOffre(z, id, oid) {
  z.textContent = "";
  let o;
  try { o = await appel(`/api/admin/utilisateurs/${encodeURIComponent(id)}/offres/${oid}`); } catch (e) { z.append(el("p", "erreur", e.message)); return; }
  const b = bloc(z, `${o.titre || "?"} · ${o.entreprise || "?"}`);
  ligneAdmin(b, "Statut", o.statut); ligneAdmin(b, "Ville", o.ville); ligneAdmin(b, "Source", o.source);
  ligneAdmin(b, "Adéquation", o.score != null ? `${o.score}/10` : null); ligneAdmin(b, "Pourquoi", o.raison);
  ligneAdmin(b, "Destinataire", o.email_contact); ligneAdmin(b, "Envoyée", o.envoye_le ? ilYa(o.envoye_le) : "non");
  if (o.url && /^https?:\/\//.test(o.url)) { const a = el("a", "lien", "Voir l'annonce"); a.href = o.url; a.target = "_blank"; a.rel = "noopener noreferrer"; b.append(a); }
  if (o.objet_mail || o.corps_mail) { const m = bloc(z, "L'email"); ligneAdmin(m, "Objet", o.objet_mail); texteBrut(m, o.corps_mail, ""); }
  const l = bloc(z, `La lettre${o.note_lettre ? ` (relecteur : ${o.note_lettre}/10)` : ""}`);
  texteBrut(l, o.lettre, "Pas encore de lettre.");
  if (o.description) { const a = bloc(z, "L'annonce"); texteBrut(a, o.description, ""); }
  const j = bloc(z, "Son parcours"); journal(j, (o.journal || []).slice().reverse());
  z.scrollIntoView({ behavior: "smooth", block: "start" });
}

function secDiscussion(z, d, id) {
  const fil = el("div", "fil admin-fil");
  if (!d.discussion || !d.discussion.length) fil.append(el("p", "sous", "Pas encore de discussion."));
  for (const m of d.discussion || []) {
    const b = el("div", "bulle " + (m.de === "agent" ? "de-agent" : "de-moi") + (m.bouton ? " admin-bouton" : ""));
    if (m.bouton) b.append(el("span", "etiquette", "bouton de l'app"));
    const t = el("div"); remplir(t, m.texte || (m.fichier ? "📎 " + (m.nom_fichier || m.fichier) : "")); b.append(t);
    if (m.de === "agent" && m.fichier) {
      const f = el("button", "bouton clair petit", "📎 " + (m.nom_fichier || "fichier")); f.type = "button";
      f.onclick = () => telechargerAdmin(`/api/admin/utilisateurs/${encodeURIComponent(id)}/fichiers/${m.id}`, m.nom_fichier || "fichier.pdf");
      b.append(f);
    }
    b.append(el("span", "heure", `${m.le || ""}${m.de === "agent" && !m.lu ? " · pas encore lu par la personne" : ""}`));
    fil.append(b);
  }
  z.append(fil);
}

function secReponses(z, d) {
  const b = bloc(z, "Réponses reçues des recruteurs");
  if (!d.emails_recus.length) b.append(el("p", "sous", "Aucune pour l'instant."));
  for (const e of d.emails_recus) {
    const r = el("div", "admin-offre");
    const h = el("div", "admin-carte-haut"); h.append(el("b", "", e.sujet || "(sans objet)"), el("span", "etiquette", e.categorie || "?"));
    r.append(h, el("span", "sous", `${e.expediteur || "?"} · ${ilYa(e.recu_le)}`));
    if (e.analyse) r.append(el("span", "petit-texte", e.analyse));
    b.append(r);
  }
  if (d.rdv && d.rdv.length) { const r = bloc(z, "Rendez-vous"); for (const x of d.rdv) ligneAdmin(r, x.entreprise || "?", `${x.debut || "?"} · ${x.statut}`); }
}

function secCouts(z, d) {
  const b = bloc(z, "Dépense IA par agent");
  if (!d.couts.length) b.append(el("p", "sous", "Rien dépensé."));
  for (const c of d.couts) ligneAdmin(b, `${c.agent} · ${c.modele}`, `${c.appels} appels · ${euros(c.eur)} (24 h : ${euros(c.eur_24h)})`);
  const j = bloc(z, "Journal de l'agent (150 dernières lignes)");
  journal(j, d.journal);
}

function journal(parent, lignes) {
  if (!lignes.length) { parent.append(el("p", "sous", "Rien pour l'instant.")); return; }
  const ul = el("ul", "activite");
  for (const x of lignes) {
    const li = el("li"); li.append(el("span", "role", x.agent || ""), el("span", "quoi", x.quoi || ""), el("time", "", x.le || "")); ul.append(li);
  }
  parent.append(ul);
}

async function telechargerAdmin(chemin, nom) {
  try {
    const blob = await appel(chemin, { brut: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nom; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message); }
}

// Tout le dossier d'un testeur dans un fichier (lettres comprises), à transmettre pour analyse.
async function exporterDossier(bouton, d, id) {
  bouton.disabled = true; bouton.textContent = "Préparation…";
  try {
    const avecLettre = d.offres.filter((o) => o.a_lettre || o.envoye_le).slice(0, 80);
    const offres = [];
    for (const o of avecLettre) {
      try { offres.push(await appel(`/api/admin/utilisateurs/${encodeURIComponent(id)}/offres/${o.id}`)); } catch (e) { /* offre effacée */ }
    }
    const dossier = { exporte_le: new Date().toISOString(), ...d, offres_detaillees: offres };
    const blob = new Blob([JSON.stringify(dossier, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `dossier_${(d.compte.email || id).split("@")[0]}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("Dossier exporté.");
  } catch (e) { toast(e.message); }
  bouton.disabled = false; bouton.textContent = "Exporter pour analyse";
}
