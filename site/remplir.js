// Applai — « Remplir en 1 clic » : pré-remplit le formulaire de candidature ouvert (n'importe quel site), sans
// jamais l'envoyer. Utilisé tel quel par l'extension (Chrome, Edge, Firefox, Safari) et par le favori Safari.
// Ne lit ni n'envoie rien : il ne fait qu'écrire SES informations dans les champs vides qu'il reconnaît.
//
//   ApplaiRemplir({ fiche: {prenom, nom, email, telephone, adresse, code_postal, ville, pays, linkedin},
//                   lettre: "texte" | null, cv: File | null }, { ecraser: false })
//   → { remplis: [{champ, etiquette}], cv: bool, lettre: bool }
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
    { champ: "nom_complet", auto: /^name$/, mots: /full.?name|nom complet|volledige naam|your name|\bnaam\b|candidate\[name\]|^name\*?$|^name$/,
      sauf: /company|entreprise|soci[eé]t[eé]|user|utilisateur|school|ecole|bedrijf|file|fichier/ },
    { champ: "code_postal", auto: /^postal-code$/, mots: /postal|\bzip\b|code postal|postcode|\bcp\b|postnummer/ },
    { champ: "ville", auto: /^address-level2$/, mots: /\bcity\b|ville|localit|woonplaats|gemeente|\bplaats\b|commune|town/ },
    { champ: "adresse", auto: /^(street-address|address-line1)$/,
      mots: /street|\brue\b|adresse|address|straat|addressline1|domicile/, sauf: /e-?mail|courriel|ip\b|url|web/ },
    { champ: "pays", auto: /^country(-name)?$/, mots: /country|\bpays\b|\bland\b/, sauf: /nationalit|code|indicatif/ },
  ];
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

  function role(e, d) {
    const auto = sansAccents(e.getAttribute("autocomplete") || "");
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
    const pris = new Set();
    for (const e of tous) {
      if (e.type === "file" || e.type === "hidden" || e.type === "checkbox" || e.type === "radio" || e.type === "password") continue;
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

  racine.ApplaiRemplir = remplir;
  racine.ApplaiRemplir.description = description;     // pour les tests
  racine.ApplaiRemplir.role = (e) => role(e, description(e));
})(typeof window !== "undefined" ? window : globalThis);
