// Mode DÉMO : un faux serveur dans le navigateur, avec exactement les mêmes réponses que la vraie API.
// Actif seulement quand CONFIG.API est vide. Rien n'est envoyé nulle part.
"use strict";
window.DEMO = (() => {
  const etat = { moi: [], agent: [], idMoi: 0, idAgent: 0, utilisateur: null,
                 test: { tour: 1, statut: "en_cours", ids: [], notes: [] }, cand: [] };
  const maintenant = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  const dit = (texte, extra = {}) => etat.agent.push({ id: ++etat.idAgent, genre: "texte", texte, boutons: null,
    fichier: false, nom_fichier: null, legende: null, le: maintenant(), ...extra });
  const plusTard = (ms, f) => setTimeout(f, ms);

  function envoyerTest() {
    etat.cand = [
      { id: 12, titre: "Stagiaire avocat – droit immobilier", entreprise: "Cabinet Lumen", ville: "Bruxelles", statut: "repetee", score: 9, note_lettre: 9 },
      { id: 14, titre: "Juriste contentieux", entreprise: "Delta & Associés", ville: "Namur", statut: "repetee", score: 8, note_lettre: 8 },
      { id: 15, titre: "Candidature spontanée – stagiaire", entreprise: "Horizon Law", ville: "Bruxelles", statut: "repetee", score: 8, note_lettre: 9 },
    ];
    etat.test.ids = [12, 14, 15];
    etat.test.statut = "a_noter";
    dit("📄 Lettre de motivation (PDF) — Cabinet Lumen", { genre: "fichier", fichier: true, nom_fichier: "Lettre_de_motivation_demo.pdf", legende: "Lettre – Cabinet Lumen" });
    dit(`🧪 Test n°${etat.test.tour} terminé : tu as reçu 3 candidatures sur ${etat.utilisateur.email}, exactement comme un recruteur les recevrait (rien n'est parti chez eux).\nLis-les, puis donne-moi une *note sur 20* et dis-moi ce que tu as aimé et moins aimé.`, { genre: "notation" });
  }

  function repondre(texte) {
    const t = texte.toLowerCase();
    const note = texte.match(/^note\s*:?\s*(\d{1,2})\s*(?:\/\s*20)?\s*[:,.-]?\s*([\s\S]*)$/i);
    if (note) {
      const n = Math.min(20, +note[1]);
      etat.test.notes.push({ tour: etat.test.tour, note: n, commentaire: note[2] });
      if (n >= 15 && etat.test.tour >= 2) {
        etat.test.statut = "attente_accord";
        return dit(`🎉 ${n}/20 au test n°${etat.test.tour} : la qualité est au rendez-vous.\nJe peux maintenant envoyer tes candidatures *directement aux recruteurs*. Tu me donnes ton accord ?`,
          { boutons: [[{ libelle: "✅ Oui, envoie aux recruteurs", commande: "autoriser envoi" }, { libelle: "🔁 Encore un test", commande: "refaire un test" }]] });
      }
      etat.test.tour += 1; etat.test.statut = "en_cours"; etat.test.ids = [];
      dit(`Merci pour ta note (${n}/20). Je réécris ces candidatures en tenant compte de tes remarques : tu reçois le test n°${etat.test.tour} par email dans quelques minutes.`);
      return plusTard(4000, envoyerTest);
    }
    if (t.includes("autoriser")) { etat.test.statut = "reussi"; return dit("C'est parti 🚀 Phase de test réussie : à partir de maintenant, j'écris directement aux recruteurs."); }
    if (t.includes("refaire")) { etat.test.tour += 1; etat.test.statut = "en_cours"; dit(`OK, je prépare le test n°${etat.test.tour} sur de nouvelles offres.`); return plusTard(4000, envoyerTest); }
    if (t.includes("souviens")) return dit("Oui : le 21/10 tu m'as parlé du cabinet Verhaegen à Namur, tu préfères les cabinets de taille moyenne. Je les privilégie.");
    if (/immobilier|bruxelles|stage|juriste|cherche/.test(t)) {
      dit("Noté 👍 Je cherche dès maintenant. Dès que j'ai 3 candidatures prêtes, je te les envoie par email pour le test n°1.");
      return plusTard(5000, envoyerTest);
    }
    dit("Compris ! (mode démo : en vrai, ton agent agit pour de bon.)");
  }

  return {
    async appel(chemin, { methode = "GET", corps, fichier } = {}) {
      await new Promise((r) => setTimeout(r, 250));
      if (chemin === "/api/sante") return { ok: true, google: false, apple: false };
      if (chemin === "/api/agents") return AGENTS_SECOURS;
      if (chemin === "/api/auth/code") return { ok: true };
      if (chemin === "/api/auth/code/verifier") {
        etat.utilisateur = { email: corps.email, nom: null, agent: null, notif_email: true, fournisseur: "email", adresse_test: corps.email };
        return { jeton: "demo", utilisateur: etat.utilisateur };
      }
      if (!etat.utilisateur) etat.utilisateur = { email: "toi@exemple.be", agent: null, notif_email: true, adresse_test: "toi@exemple.be" };
      if (chemin === "/api/moi" && methode === "GET") return { ...etat.utilisateur, agent_en_marche: true };
      if (chemin === "/api/moi" && methode === "PATCH") { etat.utilisateur.notif_email = corps.notif_email; return { ok: true }; }
      if (chemin === "/api/moi" && methode === "DELETE") { etat.utilisateur = null; return { ok: true }; }
      if (chemin === "/api/auth/deconnexion") return { ok: true };
      if (chemin === "/api/agent") {
        etat.utilisateur.agent = corps.agent;
        dit("⚖️ *Ton agent est prêt.*\n\n*Pour démarrer :*\n1️⃣ Envoie ton CV en PDF (📎)\n2️⃣ Dis-moi ce que tu cherches (poste, villes, ce que tu refuses)\n\n🧪 *Phase de test d'abord* : je t'envoie 3 candidatures sur TON email. Tu les notes sur 20, je corrige, et après 2 tests ≥ 15/20 je te demande ton accord avant d'écrire au moindre recruteur.");
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
      if (chemin === "/api/test") return etat.test;
      throw new Error("Route inconnue en démo : " + chemin);
    },
  };
})();
