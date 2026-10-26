// Applai — « Remplir en 1 clic » : pré-remplit le formulaire de candidature ouvert (n'importe quel site), sans
// jamais l'envoyer. Utilisé tel quel par l'extension (Chrome, Edge, Firefox, Safari) et par le favori Safari.
// Ne lit ni n'envoie rien : il ne fait qu'écrire SES informations dans les champs vides qu'il reconnaît.
//
//   ApplaiRemplir({ fiche: {prenom, nom, email, telephone, adresse, code_postal, ville, pays, linkedin},
//                   lettre: "texte" | null, cv: File | null }, { ecraser: false })
//   → { remplis: [{champ, etiquette}], cv: bool, lettre: bool }
//
//   ApplaiRemplir.questions()          → les questions encore vides [{id, question, type, options}] (jamais : mot de
//                                        passe, consentement, date de naissance, n° national, IBAN, salaire, captcha…)
//   ApplaiRemplir.repondre({id: texte}) → écrit les réponses proposées par son agent (surlignées « à relire »)
//   ApplaiRemplir.suivre(rappel)        → formulaire en plusieurs étapes : rappel() à chaque nouvelle étape
//
// Reconnaît les champs par leur rôle (autocomplete), leur nom, leur id, leur libellé, en français, néerlandais et
// anglais, y compris dans les formulaires « web components » (Shadow DOM) et chez Workday, Greenhouse, Lever,
// SmartRecruiters, Teamtailor, Recruitee, Indeed.
(function (racine) {
  "use strict";
  const sansAccents = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Ordre = priorité : le premier rôle reconnu l'emporte (« e-mail address » est un email, pas une adresse)
  const ROLES = [
    { champ: "email", auto: /^email$/, type: /^email$/, mots: /e-?mail|courriel|mailadres/ },
    { champ: "telephone", auto: /^tel(-national)?$/, type: /^tel$/,
      mots: /phone|t[eé]l[eé]phone|\btel\b|telefoon|\bgsm\b|mobile?\b|portable|mobiel|cellphone/ },
    { champ: "linkedin", mots: /linked\s?in/ },
    { champ: "prenom", auto: /^given-name$/, mots: /first.?name|given.?name|fore.?name|pr[eé]nom|voornaam|firstname|\bfname\b/ },
    { champ: "nom", auto: /^family-name$/,
      mots: /last.?name|family.?name|sur.?name|achternaam|lastname|\blname\b|\bnom\b|legalnamesection_lastname/,
      sauf: /pr[eé]nom|first|complet|full|utilisateur|user|entreprise|soci[eé]t[eé]|company|employeur|r[eé]f[eé]rence|rue|stra|ville|city|ecole|school|naam van/ },
    { champ: "nom_complet", auto: /^name$/, mots: /full.?name|nom complet|volledige naam|your name|\bnaam\b|candidate\[name\]|systemfield_name|^name\*?$|^name$/,
      sauf: /company|entreprise|soci[eé]t[eé]|user|utilisateur|school|ecole|bedrijf|file|fichier/ },
    // Formulaires belges : le numéro (et la boîte) à part de la rue
    { champ: "numero", auto: /^address-line2$/, mots: /huis.?nummer|house.?number|street.?number|\bnumero\b|\bn°|\bnr\.?\b|\bno\.?\b|^num$|\bnum\b/,
      sauf: /t[eé]l|phone|gsm|mobile|national|tva|btw|vat|registre|rijksregister|compte|iban|fax|identit|telefoon|\bid\b|adres|address|rue et|straat en|street and/ },
    { champ: "code_postal", auto: /^postal-code$/, mots: /postal|\bzip\b|code postal|postcode|\bcp\b|postnummer/ },
    { champ: "ville", auto: /^address-level2$/, mots: /\bcity\b|ville|localit|woonplaats|gemeente|\bplaats\b|commune|town/ },
    { champ: "adresse", auto: /^(street-address|address-line1)$/,
      mots: /street|\brue\b|adresse|address|straat|addressline1|domicile/, sauf: /e-?mail|courriel|ip\b|url|web/ },
    { champ: "pays", auto: /^country(-name)?$/, mots: /country|\bpays\b|\bland\b/, sauf: /nationalit|code|indicatif/ },
  ];
  // Indicatif du pays à part (Workday, iCIMS…) : on choisit la Belgique et le numéro s'écrit sans +32
  const INDICATIF = /indicatif|country.?(phone.?)?code|phone.?code|dial.?code|landcode|landnummer|code (du )?pays|countrycode/;
  const LETTRE = /cover|lettre|motivation|motivatie|message|pourquoi|why|presentez|introduce|additional information|toelichting/;
  const CV = /resume|r[eé]sum[eé]|\bcv\b|curriculum|cv_|attach|pi[eè]ce|document|upload|bijlage|fichier|file/;
  const LETTRE_FICHIER = /cover|lettre|motivation|motivatie/;
  const PAYS = ["belgique", "belgium", "belgie", "belgien", "be", "bel"];

  // Tous les champs de la page, y compris dans les Shadow DOM ouverts
  function champs(base) {
    const sortie = [];
    const parcourir = (noeud) => {
      noeud.querySelectorAll("input, textarea, select").forEach((e) => sortie.push(e));
      noeud.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) parcourir(e.shadowRoot); });
    };
    parcourir(base);
    return sortie;
  }

  function visible(e) {
    if (e.type === "file") return !e.disabled;           // souvent caché derrière un joli bouton : on le garde
    if (e.disabled || e.readOnly) return false;
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    return st.visibility !== "hidden" && st.display !== "none" && (r.width > 0 || r.height > 0);
  }

  // Tout ce qui dit à quoi sert le champ, en un seul texte
  function description(e) {
    const morceaux = [e.getAttribute("autocomplete"), e.name, e.id, e.placeholder, e.getAttribute("aria-label"),
      e.getAttribute("data-automation-id"), e.getAttribute("data-qa"), e.getAttribute("data-testid"), e.title];
    const doc = e.getRootNode();
    const lb = e.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((i) => { const x = doc.getElementById && doc.getElementById(i); if (x) morceaux.push(x.textContent); });
    let libelle = null;
    if (e.id && doc.querySelector) { try { libelle = doc.querySelector(`label[for="${CSS.escape(e.id)}"]`); } catch (x) { /* id exotique */ } }
    if (libelle) morceaux.push(libelle.textContent);
    const parent = e.closest("label"); if (parent) morceaux.push(parent.textContent);
    if (!lb && !libelle && !parent) {
      // pas de vrai libellé : le texte « libellé » le plus proche AVANT le champ, dans ses 3 conteneurs
      let p = e.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const avant = [...p.querySelectorAll("label, legend, [class*=label], [class*=Label]")]
          .filter((x) => !x.contains(e) && (x.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
        const t = avant.length ? avant[avant.length - 1].textContent : "";
        if (t && t.length < 80) { morceaux.push(t); break; }
      }
    }
    return sansAccents(morceaux.filter(Boolean).join(" | ").replace(/\s+/g, " ")).slice(0, 400);
  }

  // « section-perso billing tel-national » → « tel-national » (norme HTML : le type est le dernier jeton)
  function jetonAuto(e) {
    const j = sansAccents(e.getAttribute("autocomplete") || "").split(/\s+/)
      .filter((x) => x && !/^(section-|shipping|billing|home|work|mobile|fax|pager|webauthn|on|off)/.test(x));
    return j.length ? j[j.length - 1] : "";
  }

  function role(e, d) {
    const auto = jetonAuto(e);
    const type = (e.type || "").toLowerCase();
    for (const r of ROLES) {
      if ((r.auto && r.auto.test(auto)) || (r.type && r.type.test(type))) return r.champ;
    }
    for (const r of ROLES) {
      if (r.mots.test(d) && !(r.sauf && r.sauf.test(d))) return r.champ;
    }
    return null;
  }

  // Écrire comme un humain : les sites React / Vue / Angular ne voient pas un simple e.value = …
  function ecrire(e, valeur) {
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    e.focus({ preventScroll: true });
    setter.call(e, valeur);
    e.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    e.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    e.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  function choisir(select, candidats) {
    const opts = [...select.options];
    const o = opts.find((x) => candidats.includes(sansAccents(x.textContent).trim()) || candidats.includes(sansAccents(x.value).trim()))
      || opts.find((x) => candidats.some((c) => c.length > 3 && sansAccents(x.textContent).includes(c)));
    if (!o) return false;
    ecrire(select, o.value);
    return true;
  }

  function marquer(e) {
    const avant = e.style.getPropertyValue("box-shadow");
    e.style.setProperty("box-shadow", "0 0 0 2px #a5a8ff", "important");
    setTimeout(() => e.style.setProperty("box-shadow", avant), 2500);
  }

  function joindre(input, fichier) {
    try {
      const dt = new DataTransfer();
      dt.items.add(fichier);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return input.files.length > 0;
    } catch (x) { return false; }   // navigateur trop ancien : elle choisit le fichier elle-même
  }

  function remplir(donnees, options) {
    const fiche = (donnees && donnees.fiche) || {};
    const ecraser = !!(options && options.ecraser);
    const valeurs = { ...fiche, nom_complet: [fiche.prenom, fiche.nom].filter(Boolean).join(" ") };
    const rapport = { remplis: [], cv: false, lettre: false };
    const tous = champs(document).filter(visible);
    // « Rue de la Loi 16 bte 3 » : s'il y a un champ « numéro », la rue s'écrit sans le numéro
    const coupe = (valeurs.adresse || "").match(/^(.*?\D)[\s,]+(\d+\s*[a-z]?(?:\s*(?:bte|bus|boite|boîte|b)\.?\s*\w+)?)$/i);
    if (coupe && tous.some((e) => !(e instanceof HTMLSelectElement) && e.type !== "file" && role(e, description(e)) === "numero")) {
      valeurs.adresse = coupe[1].trim(); valeurs.numero = coupe[2].trim();
    }
    const pris = new Set();
    // Un indicatif à part ? Alors il prend « +32 » / Belgique et le numéro s'écrit sans indicatif
    const indicatifs = tous.filter((e) => e.type !== "file" && INDICATIF.test(description(e)));
    if (indicatifs.length && /^\+32/.test((valeurs.telephone || "").replace(/\s/g, ""))) {
      valeurs.telephone = valeurs.telephone.replace(/^\s*\+32\s*/, "").replace(/^0/, "");
      for (const e of indicatifs) {
        if (!ecraser && e.value && !(e instanceof HTMLSelectElement && e.selectedIndex <= 0)) continue;
        const ok = e instanceof HTMLSelectElement ? choisir(e, ["+32", "32", "belgique (+32)", "belgium (+32)", "belgique", "belgium", "belgie"])
          : (ecrire(e, "+32"), true);
        if (ok) { marquer(e); rapport.remplis.push({ champ: "indicatif", etiquette: description(e).slice(0, 60) }); }
      }
    }
    for (const e of tous) {
      if (e.type === "file" || e.type === "hidden" || e.type === "checkbox" || e.type === "radio" || e.type === "password") continue;
      if (indicatifs.includes(e)) continue;
      const d = description(e);
      if (e instanceof HTMLTextAreaElement) {
        if (donnees.lettre && LETTRE.test(d) && (ecraser || !e.value.trim())) {
          ecrire(e, donnees.lettre); marquer(e); rapport.lettre = true; rapport.remplis.push({ champ: "lettre", etiquette: d.slice(0, 60) });
        }
        continue;
      }
      const r = role(e, d);
      if (!r || !valeurs[r]) continue;
      if (r === "pays") {
        if (e instanceof HTMLSelectElement ? (ecraser || !e.value) && choisir(e, PAYS.concat(sansAccents(valeurs.pays))) : (ecraser || !e.value)) {
          if (!(e instanceof HTMLSelectElement)) ecrire(e, valeurs.pays);
          marquer(e); rapport.remplis.push({ champ: r, etiquette: d.slice(0, 60) });
        }
        continue;
      }
      if (e instanceof HTMLSelectElement) continue;
      if (!ecraser && e.value.trim()) continue;              // jamais par-dessus ce qu'elle a déjà tapé
      if (pris.has(r) && r !== "email") continue;            // l'email se confirme souvent 2 fois
      ecrire(e, valeurs[r]); marquer(e); pris.add(r);
      rapport.remplis.push({ champ: r, etiquette: d.slice(0, 60) });
    }
    // Le CV : le champ fichier qui parle de CV, sinon le seul champ fichier de la page
    if (donnees.cv) {
      const fichiers = champs(document).filter((e) => e.type === "file" && !e.disabled && !(e.files && e.files.length));
      const pourCv = fichiers.filter((e) => !LETTRE_FICHIER.test(description(e)));
      const cible = pourCv.find((e) => CV.test(description(e))) || (pourCv.length === 1 ? pourCv[0] : null);
      if (cible && joindre(cible, donnees.cv)) { rapport.cv = true; rapport.remplis.push({ champ: "cv", etiquette: description(cible).slice(0, 60) }); }
    }
    return rapport;
  }

  // ---------- Les autres questions : son agent propose, elle relit ----------
  // Jamais : ce qui ne se devine pas ou ne se confie pas à une IA (et le consentement : c'est à elle de cocher)
  const SENSIBLE = new RegExp(["password|mot de passe|wachtwoord|captcha|naissance|birth|geboorte|\\bage\\b|\\bage ?:|leeftijd",
    "nationalit|national.?(number|nummer)|numero national|rijksregister|\\bniss\\b|\\binsz\\b|social security|\\bssn\\b",
    "passport|passeport|paspoort|carte d.identite|identity card|identiteitskaart|\\biban\\b|\\bbic\\b|bank|compte bancaire",
    "salaire|salary|\\bloon\\b|remuneration|wage|pay expectation|sexe|\\bgender|geslacht|handicap|disabilit",
    "ethni|\\brace\\b|religion|veteran|signature|coupon|code promo"].join("|"));
  const VIDE = /^(|select.*|choisi.*|selectionne.*|kies.*|maak een keuze.*|please select.*|none)$/;
  const videChoix = (t) => VIDE.test(sansAccents(t).replace(/[^a-z0-9 ]/g, "").trim());
  let compteur = 0;

  // Le libellé lisible du champ (ce qu'elle voit), pas les attributs techniques
  function intitule(e) {
    const doc = e.getRootNode(), propre = (t) => (t || "").replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim();
    const lb = e.getAttribute("aria-labelledby");
    if (lb) { const t = lb.split(/\s+/).map((i) => (doc.getElementById && doc.getElementById(i) || {}).textContent || "").join(" "); if (propre(t)) return propre(t); }
    let libelle = null;
    if (e.id && doc.querySelector) { try { libelle = doc.querySelector(`label[for="${CSS.escape(e.id)}"]`); } catch (x) { /* id exotique */ } }
    if (libelle && propre(libelle.textContent)) return propre(libelle.textContent);
    const parent = e.closest("label");
    if (parent) { const c = parent.cloneNode(true); c.querySelectorAll("input,select,textarea,option").forEach((x) => x.remove()); if (propre(c.textContent)) return propre(c.textContent); }
    if (e.getAttribute("aria-label")) return propre(e.getAttribute("aria-label"));
    let p = e.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      const avant = [...p.querySelectorAll("label, legend, [class*=label], [class*=Label], [class*=question], h3, h4, p")]
        .filter((x) => !x.contains(e) && !x.querySelector("input,select,textarea") && (x.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
      const t = avant.length ? propre(avant[avant.length - 1].textContent) : "";
      if (t && t.length < 300) return t;
    }
    return propre(e.placeholder || e.title || "");
  }

  function vide(e) {
    if (e instanceof HTMLSelectElement) return e.selectedIndex < 0 || videChoix(e.options[e.selectedIndex].textContent);
    return !e.value.trim();
  }

  function questions() {
    const sortie = [], groupes = new Map();
    for (const e of champs(document).filter(visible)) {
      if (/^(file|hidden|password|checkbox|submit|button|reset|image|search|email|tel|color|range)$/.test(e.type)) continue;
      const d = description(e);
      if (e.type === "radio") {                      // un groupe de boutons = une question à choix
        const nom = e.name || d;
        if (!groupes.has(nom)) groupes.set(nom, []);
        groupes.get(nom).push(e);
        continue;
      }
      if (!vide(e) || role(e, d) || INDICATIF.test(d) || SENSIBLE.test(d)) continue;
      const q = intitule(e);
      if (!q || q.length < 3 || SENSIBLE.test(sansAccents(q))) continue;
      if (!e.dataset.applaiQ) e.dataset.applaiQ = "q" + (++compteur);
      const options = e instanceof HTMLSelectElement
        ? [...e.options].map((o) => o.textContent.trim()).filter((t) => t && !videChoix(t)) : [];
      const type = options.length ? "choix" : e instanceof HTMLTextAreaElement ? "long" : e.type === "number" ? "nombre"
        : e.type === "date" ? "date" : "texte";
      sortie.push({ id: e.dataset.applaiQ, question: q.slice(0, 300), type, ...(options.length ? { options: options.slice(0, 40) } : {}) });
    }
    for (const radios of groupes.values()) {
      if (radios.some((r) => r.checked)) continue;
      const premier = radios[0];
      const fs = premier.closest("fieldset"), rg = premier.closest("[role=radiogroup]");
      let q = (fs && fs.querySelector("legend") && fs.querySelector("legend").textContent)
        || (rg && (rg.getAttribute("aria-label") || (rg.getAttribute("aria-labelledby") && intitule(rg))));
      if (!q) {                                       // le texte juste avant le groupe
        let p = premier.parentElement;
        while (p && radios.some((r) => !p.contains(r))) p = p.parentElement;
        if (p) q = intitule(p.querySelector("input"));
      }
      q = (q || "").replace(/\s+/g, " ").trim();
      const options = radios.map((r) => intitule(r) || r.value).filter(Boolean);
      if (!q || SENSIBLE.test(sansAccents(q)) || options.length < 2) continue;
      if (!premier.dataset.applaiQ) { const id = "q" + (++compteur); radios.forEach((r) => (r.dataset.applaiQ = id)); }
      sortie.push({ id: premier.dataset.applaiQ, question: q.slice(0, 300), type: "choix", options: options.slice(0, 40) });
    }
    return sortie.slice(0, 30);
  }

  function marquerARelire(e) {
    e.style.setProperty("outline", "2px dashed #f5a524", "important");
    e.style.setProperty("outline-offset", "2px", "important");
    e.addEventListener("input", () => e.style.removeProperty("outline"), { once: true });
  }

  // Écrit les réponses proposées ; ne touche jamais un champ qu'elle a rempli entre-temps
  function repondre(reponses) {
    let n = 0;
    for (const [id, valeur] of Object.entries(reponses || {})) {
      if (valeur === null || valeur === undefined || valeur === "") continue;
      const cibles = champs(document).filter((e) => e.dataset && e.dataset.applaiQ === id);
      if (!cibles.length) continue;
      const v = sansAccents(String(valeur)).trim();
      if (cibles[0].type === "radio") {
        if (cibles.some((r) => r.checked)) continue;
        const r = cibles.find((x) => sansAccents(intitule(x) || x.value).trim() === v)
          || cibles.find((x) => sansAccents(x.value).trim() === v);
        if (!r) continue;
        r.click(); marquerARelire(r.closest("label") || r); n++;
        continue;
      }
      const e = cibles[0];
      if (!vide(e)) continue;
      if (e instanceof HTMLSelectElement) { if (choisir(e, [v])) { marquerARelire(e); n++; } continue; }
      ecrire(e, String(valeur)); marquerARelire(e); n++;
    }
    return n;
  }

  // Formulaires en plusieurs étapes (Workday, SmartRecruiters…) : la page change sans se recharger.
  // rappel() est appelé quand de nouveaux champs vides apparaissent, pendant 20 minutes au plus.
  function suivre(rappel) {
    if (racine.__applaiSuivi) { racine.__applaiSuivi.rappel = rappel; return; }
    const etat = { rappel, signature: "" };
    racine.__applaiSuivi = etat;
    const signature = () => champs(document).filter(visible).filter((e) => e.type !== "hidden" && vide(e)).length + "|" + location.href;
    etat.signature = signature();
    let minuterie = null;
    const obs = new MutationObserver(() => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        const s = signature();
        if (s !== etat.signature && Number(s.split("|")[0]) > 0) { etat.signature = s; try { etat.rappel(); } catch (x) { /* rien */ } }
      }, 900);
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); delete racine.__applaiSuivi; }, 20 * 60 * 1000);
  }

  racine.ApplaiRemplir = remplir;
  racine.ApplaiRemplir.questions = questions;
  racine.ApplaiRemplir.repondre = repondre;
  racine.ApplaiRemplir.suivre = suivre;
  racine.ApplaiRemplir.intitule = intitule;
  racine.ApplaiRemplir.description = description;     // pour les tests
  racine.ApplaiRemplir.role = (e) => role(e, description(e));
})(typeof window !== "undefined" ? window : globalThis);
