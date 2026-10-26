// Mode DÉMO : un faux serveur dans le navigateur, avec exactement les mêmes réponses que la vraie API.
// Actif seulement quand CONFIG.API est vide. Rien n'est envoyé nulle part.
"use strict";
window.DEMO = (() => {
  const etat = { moi: [], agent: [], idMoi: 0, idAgent: 0, utilisateur: null, cand: [],
                 test: { tour: 1, statut: "a_lancer", ids: [], note: null, criteres: [], commentaire: "", historique: [], exigences: [] } };
  const maintenant = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  const dit = (texte, extra = {}) => etat.agent.push({ id: ++etat.idAgent, genre: "texte", texte, boutons: null,
    fichier: false, nom_fichier: null, legende: null, le: maintenant(), ...extra });
  const plusTard = (ms, f) => setTimeout(f, ms);
  const bouton = (libelle, commande) => ({ libelle, commande });
  const OFFRES = [
    { id: 12, titre: "Stagiaire avocat – droit immobilier", entreprise: "Cabinet Lumen", ville: "Bruxelles", note_lettre: 9 },
    { id: 14, titre: "Juriste contentieux", entreprise: "Delta & Associés", ville: "Namur", note_lettre: 8 },
    { id: 15, titre: "Candidature spontanée – stagiaire", entreprise: "Horizon Law", ville: "Bruxelles", note_lettre: 8.5 },
  ];

  function proposerTest() {
    dit(`J'ai tout ce qu'il me faut 👍 Prochaine étape : le *test*.\n1️⃣ Je prépare 3 candidatures et je les envoie sur *ton* adresse (${etat.utilisateur.email}), jamais chez les recruteurs.\n2️⃣ Quand les 3 sont arrivées, je te préviens (ici et par email).\n3️⃣ Tu les lis et tu leur donnes *une note globale* sur 20. À partir de 15/20, je te propose de postuler pour de vrai.\nOn lance ?`,
      { boutons: [[bouton("▶️ Lancer le test", "lancer le test"), bouton("Plus tard", "plus tard")]] });
  }

  function lancerTest() {
    if (etat.test.statut !== "a_lancer" && etat.test.statut !== "en_cours") return;
    etat.test.statut = "en_cours"; etat.test.ids = []; etat.test.note = null;
    dit(`C'est parti 🧪 Je cherche les offres et j'écris tes 3 candidatures de test. Elles arrivent sur ${etat.utilisateur.email} au fur et à mesure ; quand les 3 seront là, je te préviens pour la note.`);
    OFFRES.forEach((o, k) => plusTard(2500 * (k + 1), () => {
      etat.test.ids.push(o.id);
      etat.cand = OFFRES.slice(0, k + 1).map((x) => ({ ...x, statut: "repetee", score: 9 }));
      if (k === 0) dit("📄 Lettre de motivation (PDF) — Cabinet Lumen", { genre: "fichier", fichier: true, nom_fichier: "Lettre_de_motivation_demo.pdf", legende: "Lettre – Cabinet Lumen" });
      if (k === OFFRES.length - 1) {
        etat.test.statut = "a_noter";
        dit(`🧪 Test n°${etat.test.tour} terminé : tes 3 candidatures sont sur ${etat.utilisateur.email}, exactement comme un recruteur les recevrait (rien n'est parti chez eux).\nÀ toi : lis-les, puis donne *une note globale* sur 20 et coche ce qui n'allait pas. Je t'ai aussi envoyé un email.`, { genre: "notation" });
      }
    }));
  }

  const CRITERES = { trop_long: "plus court, à l'essentiel", trop_court: "plus développé, avec des exemples concrets",
    ton: "un ton adapté aux cabinets", pas_perso: "plus personnalisé pour chaque cabinet", erreur: "chaque fait vérifié",
    fautes: "relu phrase par phrase", offres: "des offres plus proches de ce que tu cherches" };

  function noterGlobal(note, criteres = [], commentaire = "") {
    if (etat.test.statut !== "a_noter") return;
    Object.assign(etat.test, { note, criteres, commentaire });
    if (note >= 15) {
      etat.test.statut = "attente_accord";
      etat.test.historique.push({ tour: etat.test.tour, note, criteres, retour: commentaire });
      return dit(`🎉 ${note}/20 : la qualité est au rendez-vous.\nOn quitte la phase de test et je commence à postuler pour de vrai, depuis ton Gmail ?`,
        { boutons: [[bouton("✅ Oui, postuler pour de vrai", "autoriser envoi"), bouton("🔁 Encore un test", "refaire un test")]] });
    }
    if (!criteres.length && !commentaire) {
      etat.test.statut = "retour";
      return dit(`Oups, ${note}/20 : en dessous de 15/20.\nAvant de continuer, dis-moi ce qui n'a pas été : le style, le ton, la longueur, ce qui manque… Je le retiens pour toujours.`, { genre: "retour" });
    }
    corriger(criteres, commentaire);
  }

  function corriger(criteres, commentaire) {
    const consignes = criteres.map((c) => CRITERES[c]).filter(Boolean);
    if (commentaire) consignes.push(`« ${commentaire} »`);
    etat.test.exigences.push({ le: maintenant().slice(0, 10), texte: commentaire || consignes.join(", ") });
    etat.test.historique.push({ tour: etat.test.tour, note: etat.test.note, criteres, retour: commentaire });
    etat.test.tour += 1;
    dit(`Compris, et gardé pour toujours ✍️ Voici ce que je change pour toutes tes prochaines candidatures :\n${consignes.map((c) => "• " + c).join("\n")}\nJe prépare le test n°${etat.test.tour} : 3 candidatures réécrites, et je te préviens quand elles sont toutes arrivées.`);
    etat.test.statut = "a_lancer"; etat.cand = [];
    plusTard(500, lancerTest);
  }

  function retour(texte) { if (etat.test.statut === "retour") corriger(etat.test.criteres || [], texte); }

  function vueTest() {
    const c = etat.test.ids.map((i) => { const o = OFFRES.find((x) => x.id === i);
      return { id: o.id, titre: o.titre, entreprise: o.entreprise, ville: o.ville, note_ia: Math.round(o.note_lettre * 2) }; });
    const ia = c.map((x) => x.note_ia);
    return { tour: etat.test.tour, statut: etat.test.statut, candidatures: c, note: etat.test.note, criteres: etat.test.criteres,
             commentaire: etat.test.commentaire, note_ia: ia.length ? Math.round(ia.reduce((a, b) => a + b, 0) / ia.length) : null,
             taille: 3, historique: etat.test.historique, exigences: etat.test.exigences,
             criteres_possibles: [["trop_long", "Trop long"], ["trop_court", "Pas assez développé"], ["ton", "Ton pas adapté"],
               ["pas_perso", "Pas assez personnalisé"], ["erreur", "Erreur ou invention"], ["fautes", "Fautes ou tournures maladroites"],
               ["offres", "Offres pas pertinentes"]].map(([code, libelle]) => ({ code, libelle })) };
  }

  function repondre(texte) {
    const t = texte.toLowerCase();
    if (t.startsWith("lancer le test")) return lancerTest();
    if (t === "plus tard") return dit("Pas de souci. Quand tu veux, touche « Lancer le test ».", { boutons: [[bouton("▶️ Lancer le test", "lancer le test")]] });
    if (t.includes("autoriser")) { etat.test.statut = "reussi"; return dit("C'est parti 🚀 Phase de test réussie : je postule pour de vrai, depuis ton Gmail."); }
    if (t.includes("refaire")) { etat.test.tour += 1; etat.test.statut = "a_lancer"; return lancerTest(); }
    if (t === "test") return dit("Ouvre l'onglet *Phase de test* : tu y donnes ta note globale aux 3 candidatures.");
    const m = /^note\s*:?\s*(\d{1,2})\s*(?:\/\s*20)?\s*[:,.-]?\s*(.*)$/i.exec(texte.trim());
    if (m && etat.test.statut === "a_noter") return noterGlobal(Math.min(20, +m[1]), [], m[2] === "pas de commentaire" ? "" : m[2]);
    if (t.includes("souviens")) return dit("Oui : le 21/10 tu m'as parlé du cabinet Verhaegen à Namur, tu préfères les cabinets de taille moyenne. Je les privilégie.");
    if (/immobilier|bruxelles|stage|juriste|cherche|job|vente/.test(t)) {
      dit("Noté 👍 Récap : stage ou juriste en droit immobilier, à Bruxelles, sans pénal.");
      return plusTard(1200, proposerTest);
    }
    dit("Compris ! (mode démo : en vrai, ton agent agit pour de bon.)");
  }

  function demoAdmin(chemin) {
    const compte = { id: "demo1", email: "sam.demo@gmail.com", nom: "Sam", agent: "student", cree_le: "2026-10-25 14:50:00",
      vu_le: Date.now() / 1000 - 600, gmail_ok: true, admin: false, en_marche: true, cv: true, test: "en_cours", note: null,
      offres: 113, retenues: 6, envoyees: 0, tests_envoyes: 2, cout_24h: 0.21, cout_total: 0.21, derniere_activite: "2026-10-25 15:20:00" };
    if (chemin === "/api/admin/etat") return { agents_en_marche: { conversations: 1, tournees: 0 },
      modele_local: { etat: "en marche", machine_dispo_mo: 6645, machine_total_mo: 7941, tri_7j: { emails: 0, duree_moyenne_s: null } } };
    if (chemin === "/api/admin/utilisateurs") return [compte];
    if (/\/budget$/.test(chemin)) return { ok: true, remis: 0.95 };
    if (/\/adresse$|\/relire-cv$/.test(chemin)) return { ok: true };
    if (/\/cv$|\/fichiers\//.test(chemin)) return new Blob(["%PDF-1.4 démo"], { type: "application/pdf" });
    if (/\/offres\/\d+$/.test(chemin)) return { id: 16, titre: "Vendeur étudiant (démo)", entreprise: "Boutique Lumen", ville: "Bruxelles",
      statut: "repetee", score: 7, raison: "Vente le samedi, comme demandé.", email_contact: "jobs@boutique-lumen.be", url: "",
      objet_mail: "Candidature : vendeur étudiant", corps_mail: "Madame, Monsieur,\n\nVous trouverez ma candidature en pièce jointe.",
      lettre: "Lettre de démonstration.", note_lettre: 8, description: "Annonce de démonstration.", envoye_le: "2026-10-25 15:10:00",
      journal: [{ agent: "redacteur", quoi: "→ validee", le: "2026-10-25 15:05:00" }] };
    return { compte, fiche_cv: "# Fiche profil (démo)\n- Bachelier en économie\n- Caissier le samedi depuis 1 an",
      objectif: "villes: [Bruxelles]\npostes_vises: [vendeur, serveur]", memoire: [], exigences: [],
      test: { tour: 1, statut: "en_cours", note: null, note_ia: 16, criteres: [], commentaire: "", historique: [],
        candidatures: [{ titre: "Vendeur étudiant", entreprise: "Boutique Lumen", envoye_le: "2026-10-25 15:10:00", note_ia: 16 }] },
      offres: [{ id: 16, titre: "Vendeur étudiant (démo)", entreprise: "Boutique Lumen", ville: "Bruxelles", source: "indeed", statut: "repetee",
        score: 7, raison: "Vente le samedi.", note_lettre: 8, email_contact: "jobs@boutique-lumen.be", envoye_le: "2026-10-25 15:10:00" }],
      emails_recus: [], rdv: [], couts: [{ agent: "redacteur", modele: "sonnet", appels: 5, eur: 0.1, eur_24h: 0.1 }],
      journal: [{ agent: "eclaireur", quoi: "113 nouvelle(s) offre(s)", le: "2026-10-25 14:55:00" }],
      discussion: [{ de: "personne", id: 1, texte: "Voici mon CV.", fichier: "cv.pdf", bouton: false, le: "2026-10-25 14:51:00" },
        { de: "agent", id: 1, texte: "📄 CV lu ✅", fichier: false, lu: true, le: "2026-10-25 14:51:10" }] };
  }

  return {
    async appel(chemin, { methode = "GET", corps, fichier } = {}) {
      await new Promise((r) => setTimeout(r, 250));
      if (chemin === "/api/sante") return { ok: true, google: true, google_client_id: "demo" };
      if (chemin === "/api/agents") return AGENTS_SECOURS;
      // Suivi administrateur (démo : app.html?admin) — un testeur fictif
      if (chemin.startsWith("/api/admin/")) return demoAdmin(chemin);
      if (chemin === "/api/auth/google") {
        etat.utilisateur = { email: "camille.demo@gmail.com", nom: "Camille", agent: null, notif_email: true, audace: "equilibre", fournisseur: "google",
          adresse_test: "camille.demo@gmail.com", gmail_ok: true, adresse_agent: null };
        if (/[?&]admin\b/.test(location.search)) Object.assign(etat.utilisateur, { email: "admin.demo@gmail.com", admin: true });
        return { jeton: "demo", utilisateur: etat.utilisateur };
      }
      if (!etat.utilisateur) etat.utilisateur = { email: "camille.demo@gmail.com", agent: null, notif_email: true, audace: "equilibre",
        adresse_test: "camille.demo@gmail.com", gmail_ok: true };
      if (chemin === "/api/moi" && methode === "GET") return { ...etat.utilisateur, agent_en_marche: true };
      if (chemin === "/api/moi" && methode === "PATCH") { etat.utilisateur.notif_email = corps.notif_email; return { ok: true }; }
      if (chemin === "/api/moi" && methode === "DELETE") { etat.utilisateur = null; return { ok: true }; }
      if (chemin === "/api/auth/deconnexion") return { ok: true };
      if (chemin === "/api/audace") {
        etat.utilisateur.audace = corps.mode;
        const t = { strict: "Mode *strict* : je ne postule que là où ton profil coche tout (langues, expérience, diplômes).",
          equilibre: "Mode *équilibré* : une exigence claire de l'annonce bloque, un simple « atout » non.",
          audacieux: "Mode *audacieux* : j'ose même quand l'annonce exige une langue ou une expérience que tu n'as pas encore, toujours dans ton domaine, ta zone et tes horaires. Tes lettres restent honnêtes." };
        dit(t[corps.mode]);
        return { ok: true, audace: corps.mode };
      }
      if (chemin === "/api/agent") {
        etat.utilisateur.agent = corps.agent;
        const e = etat.utilisateur.email;
        dit("⚖️ *Agent Avocat*\nJe cherche les offres juridiques en continu, j'écris une lettre sur mesure pour chacune et je postule pour toi. Je ne te dérange que pour décider.\n\n"
          + "*Comment ça marche, étape par étape :*\n1️⃣ *Ton CV* : envoie-le en PDF avec le trombone 📎.\n"
          + "2️⃣ *Ce que tu cherches* : dis-moi le poste, les matières, les villes, ce que tu refuses et ta date de début.\n"
          + `3️⃣ *Le test* : quand j'ai tout, je te propose de le lancer. Je prépare 3 candidatures et je les envoie sur *ton* adresse (${e}), jamais chez un cabinet.\n`
          + "4️⃣ *Ta note* : quand les 3 sont arrivées, je te préviens (ici et par email). Tu leur donnes *une note globale* sur 20 dans l'onglet *Phase de test*. À partir de 15/20, je te propose de postuler pour de vrai. Sinon, tu me dis ce qui ne va pas, je le retiens pour toujours et je refais un test.\n"
          + "5️⃣ *Pour de vrai* : je postule depuis ton Gmail, je relance, je trie les réponses et je te préviens pour les entretiens.\n\n"
          + "*Ensuite, parle-moi normalement*, par exemple :\n• « plus de droit fiscal », « ajoute Liège » → je change ta recherche\n• « trop long », « moins formel » → je le retiens pour toutes tes lettres");
        return { ok: true };
      }
      if (chemin.startsWith("/api/conversation")) {
        const p = new URLSearchParams(chemin.split("?")[1] || "");
        return { moi: etat.moi.filter((m) => m.id > +(p.get("apres_moi") || 0)),
                 agent: etat.agent.filter((m) => m.id > +(p.get("apres_agent") || 0)), occupe: false };
      }
      if (chemin === "/api/messages") {
        etat.moi.push({ id: ++etat.idMoi, texte: corps.texte, fichier: null, le: maintenant() });
        plusTard(900, () => repondre(corps.texte));
        return { ok: true };
      }
      if (chemin === "/api/cv") {
        etat.moi.push({ id: ++etat.idMoi, texte: "Voici mon CV.", fichier: fichier.name, le: maintenant() });
        plusTard(1500, () => dit("📄 CV lu ✅ Voici ce que j'ai retenu (c'est la seule base de tes lettres) :\n\n- Master en droit (démo)\n- Stage de 3 mois, étude notariale\n- Néerlandais B1\n\nQue cherches-tu exactement ? (poste, villes, matières)"));
        return { ok: true };
      }
      if (chemin.startsWith("/api/fichiers/")) return new Blob(["%PDF-1.4 démo"], { type: "application/pdf" });
      if (chemin === "/api/candidatures") return etat.cand;
      if (chemin === "/api/test") return vueTest();
      if (chemin === "/api/test/lancer") { lancerTest(); return { ok: true }; }
      if (chemin === "/api/test/noter") { noterGlobal(corps.note, corps.criteres || [], corps.commentaire || ""); return { ok: true }; }
      if (chemin === "/api/test/retour") { retour(corps.texte); return { ok: true }; }
      if (chemin === "/api/tableau") {
        const tests = etat.test.ids.length, envoyees = etat.test.statut === "reussi" ? 4 : 0;
        const activite = etat.cand.length ? [
          { role: "Envoi", quoi: `Test n°${etat.test.tour} → ${etat.utilisateur.email}`, le: maintenant() },
          { role: "Rédaction", quoi: "Lettre écrite et vérifiée (9/10) · Cabinet Lumen", le: maintenant() },
          { role: "Tri selon tes règles", quoi: "29 offres écartées (pénal, néerlandais exigé)", le: maintenant() },
          { role: "Recherche d'offres", quoi: "EURES, Forem, LexGO : 37 nouvelles offres", le: maintenant() }] : [];
        return { chiffres: { analysees: tests ? 37 : 0, ecartees: tests ? 29 : 0, en_preparation: tests ? 5 : 0, tests,
                             envoyees, reponses: envoyees ? 1 : 0, entretiens: envoyees ? 1 : 0, recherches: tests ? 2 : 0,
                             taux_reponse: envoyees ? 25 : null },
                 activite, rdv: [], en_ce_moment: null, agent_actif: true, en_pause: false, derniere_activite: activite.length ? maintenant() : null };
      }
      throw new Error("Route inconnue en démo : " + chemin);
    },
  };
})();
