// Mode DÉMO : un faux serveur dans le navigateur, avec exactement les mêmes réponses que la vraie API.
// Actif seulement quand CONFIG.API est vide. Rien n'est envoyé nulle part.
"use strict";
window.DEMO = (() => {
  const etat = { moi: [], agent: [], idMoi: 0, idAgent: 0, utilisateur: null, cand: [],
                 test: { tour: 1, statut: "a_lancer", ids: [], notes: {}, historique: [], exigences: [] } };
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
    dit(`J'ai tout ce qu'il me faut 👍 Veux-tu que je lance le test maintenant ?\nJe prépare 3 candidatures et je les envoie sur *ton* adresse (${etat.utilisateur.email}), pas chez les recruteurs : c'est juste pour que tu les juges et que tu les notes.`,
      { boutons: [[bouton("▶️ Lancer le test", "lancer le test"), bouton("Plus tard", "plus tard")]] });
  }

  function lancerTest() {
    if (etat.test.statut !== "a_lancer" && etat.test.statut !== "en_cours") return;
    etat.test.statut = "en_cours"; etat.test.ids = []; etat.test.notes = {};
    dit(`C'est parti 🧪 Je cherche les offres et j'écris tes candidatures. Tu les recevras sur ${etat.utilisateur.email} au fur et à mesure.`);
    OFFRES.forEach((o, k) => plusTard(2500 * (k + 1), () => {
      etat.test.ids.push(o.id);
      etat.cand = OFFRES.slice(0, k + 1).map((x) => ({ ...x, statut: "repetee", score: 9 }));
      if (k === 0) dit("📄 Lettre de motivation (PDF) — Cabinet Lumen", { genre: "fichier", fichier: true, nom_fichier: "Lettre_de_motivation_demo.pdf", legende: "Lettre – Cabinet Lumen" });
      if (k === OFFRES.length - 1) {
        etat.test.statut = "a_noter";
        dit(`🧪 Test n°${etat.test.tour} prêt : 3 candidatures sur ${etat.utilisateur.email}, exactement comme un recruteur les recevrait.\nNote *chacune* sur 20 dans l'onglet *Phase de test*.`, { genre: "notation" });
      }
    }));
  }

  function moyenne() {
    const n = etat.test.ids.map((i) => etat.test.notes[i]).filter((x) => x !== undefined);
    return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
  }

  function noter(id, note) {
    etat.test.notes[id] = note;
    if (!etat.test.ids.every((i) => etat.test.notes[i] !== undefined) || etat.test.ids.length < 3) return;
    const m = moyenne();
    if (m >= 15) {
      etat.test.statut = "attente_accord";
      return dit(`🎉 Moyenne de ${m}/20 : la qualité est au rendez-vous.\nOn quitte la phase de test et je commence à postuler pour de vrai, depuis ton Gmail ?`,
        { boutons: [[bouton("✅ Oui, postuler pour de vrai", "autoriser envoi"), bouton("🔁 Encore un test", "refaire un test")]] });
    }
    etat.test.statut = "retour";
    dit(`Oups, la moyenne est de ${m}/20 : en dessous de 15/20.\nAvant de continuer, dis-moi ce qui n'a pas été : le style, le ton, la longueur, ce qui manque… Je le retiens pour toujours.`, { genre: "retour" });
  }

  function retour(texte) {
    etat.test.exigences.push({ le: maintenant().slice(0, 10), texte });
    etat.test.historique.push({ tour: etat.test.tour, moyenne: moyenne(), retour: texte });
    etat.test.tour += 1; etat.test.statut = "a_lancer";
    dit(`C'est noté, et gardé pour toutes tes prochaines candidatures ✍️\n« ${texte} »\nJe réécris les candidatures : tu reçois le test n°${etat.test.tour} dans quelques instants.`);
    etat.test.statut = "en_cours"; etat.test.ids = []; etat.test.notes = {}; etat.cand = [];
    plusTard(500, () => { etat.test.statut = "a_lancer"; lancerTest(); });
  }

  function vueTest() {
    const c = etat.test.ids.map((i) => { const o = OFFRES.find((x) => x.id === i);
      return { id: o.id, titre: o.titre, entreprise: o.entreprise, ville: o.ville, note_ia: Math.round(o.note_lettre * 2), note: etat.test.notes[i] ?? null }; });
    return { tour: etat.test.tour, statut: etat.test.statut, candidatures: c, moyenne: moyenne(), taille: 3,
             historique: etat.test.historique, exigences: etat.test.exigences };
  }

  function repondre(texte) {
    const t = texte.toLowerCase();
    if (t.startsWith("lancer le test")) return lancerTest();
    if (t === "plus tard") return dit("Pas de souci. Quand tu veux, touche « Lancer le test ».", { boutons: [[bouton("▶️ Lancer le test", "lancer le test")]] });
    if (t.includes("autoriser")) { etat.test.statut = "reussi"; return dit("C'est parti 🚀 Phase de test réussie : je postule pour de vrai, depuis ton Gmail."); }
    if (t.includes("refaire")) { etat.test.tour += 1; etat.test.statut = "a_lancer"; return lancerTest(); }
    if (t === "test") return dit("Ouvre l'onglet *Phase de test* : tu y notes chaque candidature.");
    if (t.includes("souviens")) return dit("Oui : le 21/10 tu m'as parlé du cabinet Verhaegen à Namur, tu préfères les cabinets de taille moyenne. Je les privilégie.");
    if (/immobilier|bruxelles|stage|juriste|cherche|job|vente/.test(t)) {
      dit("Noté 👍 Récap : stage ou juriste en droit immobilier, à Bruxelles, sans pénal.");
      return plusTard(1200, proposerTest);
    }
    dit("Compris ! (mode démo : en vrai, ton agent agit pour de bon.)");
  }

  return {
    async appel(chemin, { methode = "GET", corps, fichier } = {}) {
      await new Promise((r) => setTimeout(r, 250));
      if (chemin === "/api/sante") return { ok: true, google: true, google_client_id: "demo" };
      if (chemin === "/api/agents") return AGENTS_SECOURS;
      if (chemin === "/api/auth/google") {
        etat.utilisateur = { email: "camille.demo@gmail.com", nom: "Camille", agent: null, notif_email: true, fournisseur: "google",
          adresse_test: "camille.demo@gmail.com", gmail_ok: true, adresse_agent: null };
        return { jeton: "demo", utilisateur: etat.utilisateur };
      }
      if (!etat.utilisateur) etat.utilisateur = { email: "camille.demo@gmail.com", agent: null, notif_email: true,
        adresse_test: "camille.demo@gmail.com", gmail_ok: true };
      if (chemin === "/api/moi" && methode === "GET") return { ...etat.utilisateur, agent_en_marche: true };
      if (chemin === "/api/moi" && methode === "PATCH") { etat.utilisateur.notif_email = corps.notif_email; return { ok: true }; }
      if (chemin === "/api/moi" && methode === "DELETE") { etat.utilisateur = null; return { ok: true }; }
      if (chemin === "/api/auth/deconnexion") return { ok: true };
      if (chemin === "/api/agent") {
        etat.utilisateur.agent = corps.agent;
        const e = etat.utilisateur.email;
        dit("⚖️ *Agent Avocat*\nJe cherche les offres juridiques en continu, j'écris une lettre sur mesure pour chacune et je postule pour toi. Je ne te dérange que pour décider.\n\n"
          + "*Comment ça marche, étape par étape :*\n1️⃣ *Ton CV* : envoie-le en PDF avec le trombone 📎.\n"
          + "2️⃣ *Ce que tu cherches* : dis-moi le poste, les matières, les villes, ce que tu refuses et ta date de début.\n"
          + `3️⃣ *Le test* : quand j'ai tout, je te propose de le lancer. Je prépare 3 candidatures et je les envoie sur *ton* adresse (${e}), jamais chez un cabinet.\n`
          + "4️⃣ *Tes notes* : tu notes chacune sur 20 dans l'onglet *Phase de test*. Moyenne d'au moins 15/20 : je te propose de postuler pour de vrai. Sinon, tu me dis ce qui ne va pas, je le retiens pour toujours et je refais un test.\n"
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
      if (chemin === "/api/test/noter") { noter(corps.offre_id, corps.note); return { ok: true }; }
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
