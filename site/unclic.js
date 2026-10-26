// Réglages → « Remplir les formulaires en 1 clic » : sa fiche formulaire, le favori Safari (iPhone, iPad, Mac),
// l'extension (Chrome, Edge, Brave) et sa clé, et « copier mes infos » en secours.
// Tout texte venant du serveur passe par textContent / value (jamais innerHTML).
"use strict";
const CHAMPS_FICHE = [["prenom", "Prénom"], ["nom", "Nom"], ["email", "Email"], ["telephone", "Téléphone"],
  ["adresse", "Adresse (rue et n°)"], ["code_postal", "Code postal"], ["ville", "Ville"], ["pays", "Pays"], ["linkedin", "LinkedIn"]];
const appareil = (() => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return "mac-safari";
  if (/Android/.test(ua)) return "android";
  return "ordinateur";
})();
let ficheUnClic = null;

async function initUnClic() {
  const z = document.getElementById("unclic");
  if (!z) return;
  z.textContent = "";
  let corrigee = false;
  try { const r = await appel("/api/formulaire"); ficheUnClic = r.fiche; corrigee = r.corrigee; }
  catch (e) { z.append(el("p", "erreur", "Fiche indisponible pour le moment.")); return; }
  const infos = partie("🪪 Tes informations", corrigee ? "vérifiées ✓" : "à vérifier une fois");
  infos.open = !corrigee;
  infos.append(formulaireFiche());
  z.append(infos);
  const parties = { ios: partieSafari(true), mac: partieSafari(false), ordi: partieExtension(), copier: partieCopier() };
  const ordre = appareil === "ios" ? ["ios", "copier", "ordi", "mac"] : appareil === "mac-safari" ? ["mac", "ordi", "ios", "copier"]
    : appareil === "android" ? ["copier", "ordi", "ios", "mac"] : ["ordi", "mac", "ios", "copier"];
  ordre.forEach((k, i) => { if (i === 0 && corrigee) parties[k].open = true; z.append(parties[k]); });
}

function formulaireFiche() {
  const f = el("form", "fiche-unclic");
  f.append(el("p", "petit-texte serre", "Vérifie une fois : prénom et nom dans le bon ordre, et l'email que tu donnes aux employeurs."));
  const grille = el("div", "grille-fiche");
  for (const [k, lib] of CHAMPS_FICHE) {
    const l = el("label", "champ"); const s = el("span", "", lib); const i = el("input");
    i.name = k; i.value = ficheUnClic[k] || ""; i.maxLength = k === "linkedin" ? 200 : 120;
    i.type = k === "email" ? "email" : "text";
    if (k === "telephone") i.inputMode = "tel";
    l.append(s, i); grille.append(l);
  }
  const ok = el("button", "bouton petit", "Enregistrer"); ok.type = "submit";
  f.append(grille, ok);
  f.oninput = () => { f.dataset.touche = "1"; };
  f.onsubmit = async (ev) => {
    ev.preventDefault(); ok.disabled = true;
    const corps = {}; for (const [k] of CHAMPS_FICHE) corps[k] = f.elements[k].value.trim();
    try { await appel("/api/formulaire", { methode: "PATCH", corps }); ficheUnClic = corps; toast("Enregistré. Si tu as déjà un favori Applai, recopie-le."); delete f.dataset.touche; initUnClic(); }
    catch (e) { toast(e.message); }
    ok.disabled = false;
  };
  return f;
}

function partie(titre, sousTitre) {
  const d = el("details", "partie-unclic");
  const s = el("summary"); s.append(el("b", "", titre), el("small", "", sousTitre));
  d.append(s);
  return d;
}

function etapes(liste) { const ol = el("ol", "etapes-unclic"); liste.forEach((t) => ol.append(el("li", "", t))); return ol; }

// Le favori : le moteur de remplissage + SES informations, dans un lien « javascript: » qu'on garde en favori.
// Il n'appelle aucun serveur (certains sites l'interdiraient) ; le CV se joint à la main.
async function codeFavori() {
  const r = await fetch("remplir.js?v=20261026g", { cache: "no-cache" });
  const moteur = (await r.text()).split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.trim()).join("\n");
  // Formulaire en plusieurs étapes : chaque nouvelle étape se remplit aussi, sans recliquer
  const appelFavori = `var f=${JSON.stringify(ficheUnClic)},R=window.ApplaiRemplir,r=R({fiche:f,lettre:null,cv:null});`
    + "R.suivre(function(){R({fiche:f,lettre:null,cv:null});});"
    + "alert('Applai : '+r.remplis.length+' champ(s) rempli(s).\\n1. Joins ton CV.\\n2. Relis.\\n3. Envoie.');";
  return "javascript:" + encodeURIComponent(`(function(){${moteur}\n${appelFavori}})();void 0`);
}

function partieSafari(iphone) {
  const d = partie(iphone ? "📱 iPhone et iPad — Safari" : "💻 Mac — Safari", "le favori Applai, sans rien installer");
  const copier = el("button", "bouton petit", "Copier mon favori Applai"); copier.type = "button";
  copier.onclick = async () => {
    try { await navigator.clipboard.writeText(await codeFavori()); copier.textContent = "Copié ✓"; setTimeout(() => (copier.textContent = "Copier mon favori Applai"), 2500); }
    catch (e) { toast("Copie impossible ici : ouvre cette page dans Safari."); }
  };
  if (iphone) {
    d.append(etapes([
      "Touche « Copier mon favori Applai » (ci-dessous).",
      "Safari : touche Partager ⬆️ → « Ajouter un signet » → nomme-le Applai → Enregistrer.",
      "Touche 📖 (signets) → Modifier → Applai. Efface l'adresse, appui long → Coller → OK.",
      "Sur un formulaire : touche la barre d'adresse → Applai. Joins ton CV, relis, envoie.",
    ]), copier);
  } else {
    const lien = el("a", "bouton clair petit favori-glisser", "✍️ Applai"); lien.href = "#";
    codeFavori().then((c) => lien.setAttribute("href", c)).catch(() => {});
    lien.onclick = (ev) => { ev.preventDefault(); toast("Glisse ce bouton dans ta barre des favoris (ne clique pas dessus ici)."); };
    d.append(etapes([
      "Safari : menu Présentation → « Afficher la barre des favoris ».",
      "Glisse le bouton « ✍️ Applai » (ci-dessous) dans cette barre.",
      "Sur un formulaire : clique « Applai » dans la barre. Joins ton CV, relis, envoie.",
    ]), lien, copier);
  }
  d.append(el("p", "petit-texte", "Tu changes tes informations ? Recopie le favori. Rien n'est rempli sur LinkedIn, Jobat ni StepStone (interdit par leurs règles)."));
  return d;
}

function partieExtension() {
  const d = partie("💻 Chrome, Edge, Brave", "l'extension : remplit aussi ton CV, ta lettre et les questions");
  const telecharger = el("a", "bouton clair petit", "Télécharger l'extension"); telecharger.href = "telechargements/applai-extension.zip"; telecharger.download = "";
  d.append(etapes([
    "Clique « Télécharger l'extension » (ci-dessous), puis double-clique sur le fichier reçu.",
    "Dans la barre d'adresse, tape chrome://extensions (Edge : edge://extensions). Active « Mode développeur » en haut à droite.",
    "Clique « Charger l'extension non empaquetée » → choisis le dossier applai-extension.",
    "Clique 🧩 en haut à droite → 📌 à côté d'Applai.",
    "Clique « Créer ma clé » (ci-dessous) → Copier. Clique l'icône Applai → colle → Connecter.",
  ]), telecharger);
  d.append(el("p", "petit-texte", "Ensuite, sur un formulaire : icône Applai → « Remplir cette page »."));
  const zone = el("div", "cle-unclic"); d.append(zone);
  const afficher = async () => {
    zone.textContent = "";
    let active = false;
    try { active = (await appel("/api/extension/cle")).active; } catch (e) { /* hors ligne */ }
    zone.append(el("p", "petit-texte serre", active ? "Une clé est active." : "Pas encore de clé."));
    const creer = el("button", "bouton petit", active ? "Créer une nouvelle clé" : "Créer ma clé"); creer.type = "button";
    creer.onclick = async () => {
      try {
        const r = await appel("/api/extension/cle", { methode: "POST" });
        const ligne = el("div", "ligne-cle"); const i = el("input"); i.readOnly = true; i.value = r.cle;
        const c = el("button", "bouton clair petit", "Copier"); c.type = "button";
        c.onclick = async () => { try { await navigator.clipboard.writeText(r.cle); c.textContent = "Copié ✓"; } catch (e) { i.select(); } };
        ligne.append(i, c);
        zone.append(ligne, el("p", "petit-texte", "Colle-la dans l'extension. Elle ne s'affiche qu'une fois."));
      } catch (e) { toast(e.message); }
    };
    zone.append(creer);
    if (active) {
      const rev = el("button", "bouton clair petit", "Révoquer"); rev.type = "button";
      rev.onclick = async () => { try { await appel("/api/extension/cle", { methode: "DELETE" }); toast("Clé révoquée."); afficher(); } catch (e) { toast(e.message); } };
      zone.append(rev);
    }
  };
  afficher();
  d.append(el("p", "petit-texte", "Firefox et Safari : utilise le favori Applai (même travail, sans le CV)."));
  return d;
}

function partieCopier() {
  const d = partie("📋 Copier mes infos", "un champ à la fois, partout");
  for (const [k, lib] of CHAMPS_FICHE) {
    if (!ficheUnClic[k]) continue;
    const l = el("div", "ligne-copier"); l.append(el("small", "", lib), el("span", "", ficheUnClic[k]));
    const b = el("button", "", "Copier"); b.type = "button";
    b.onclick = async () => { try { await navigator.clipboard.writeText(ficheUnClic[k]); b.textContent = "Copié ✓"; setTimeout(() => (b.textContent = "Copier"), 1500); } catch (e) { toast("Copie impossible."); } };
    l.append(b); d.append(l);
  }
  return d;
}
