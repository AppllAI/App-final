// Onglet « À postuler » : les offres qui se postulent sur le site de l'employeur. Une carte courte par offre :
// ce que c'est, le lien direct, comment Applai remplit le formulaire, et les boutons « C'est envoyé » / « Pas pour moi ».
// Tout texte venant du serveur passe par textContent (jamais innerHTML).
"use strict";

async function compterAPostuler() {
  try {
    const r = await appel("/api/a-postuler");
    majPastillePostuler(r.offres.length);
    const t = await appel("/api/test");                  // test réussi : l'onglet « Phase de test » laisse sa place
    document.querySelector('.onglet[data-vue="test"]').hidden = !!(t && t.statut === "reussi");
  } catch (e) { /* hors ligne : on réessaiera */ }
}

function majPastillePostuler(n) {
  const p = $("#pastille-postuler");
  p.hidden = !n; p.textContent = n > 99 ? "99+" : String(n);
}

function nouvelle(le) { return le && Date.now() - Date.parse(le.replace(" ", "T") + (le.length > 10 ? "Z" : "")) < 36 * 3600 * 1000; }

async function afficherAPostuler() {
  const z = $("#postuler");
  let offres;
  try { offres = (await appel("/api/a-postuler")).offres; } catch (e) { return toast(e.message); }
  z.textContent = "";
  majPastillePostuler(offres.length);
  if (!offres.length) {
    const v = el("div", "vide"); v.append(el("div", "grand", "✨"), el("p", "", "Rien à faire toi-même pour l'instant. Ton agent postule par email ; les offres à remplir sur un site arriveront ici."));
    return z.append(v);
  }
  const aide = el("div", "aide-postuler");
  aide.append(el("b", "", "Pour chaque offre :"));
  const ol = el("ol", "etapes-unclic");
  ["Clique « Ouvrir l'offre ».", "Clique l'icône Applai → « Remplir cette page ».", "Relis, envoie, puis « C'est envoyé »."]
    .forEach((t) => ol.append(el("li", "", t)));
  const installer = el("button", "lien", "Pas encore l'icône Applai ? L'installer"); installer.type = "button";
  installer.onclick = () => { montrer("reglages"); setTimeout(() => $("#unclic")?.scrollIntoView({ behavior: "smooth" }), 200); };
  aide.append(ol, installer);
  z.append(aide);
  for (const o of offres) z.append(carteOffre(o));
}

function carteOffre(o) {
  const c = el("article", "carte-postuler");
  const tete = el("div", "tete-postuler");
  tete.append(el("b", "", o.entreprise || "Employeur"));
  if (nouvelle(o.ajoute_le)) tete.append(el("span", "etiquette vert", "nouveau"));
  c.append(tete, el("p", "titre-postuler", [o.titre, o.ville].filter(Boolean).join(" · ")));
  if (o.explication) c.append(el("p", "explication-postuler", o.explication));
  const comment = el("p", "comment-postuler");
  if (o.badge) comment.append(el("span", "badge-postuler", o.badge));
  comment.append(el("span", "", "👉 " + o.conseil));
  c.append(comment);
  const actions = el("div", "actions-postuler");
  const ouvrir = el("a", "bouton petit", "Ouvrir l'offre ↗");
  ouvrir.href = o.url; ouvrir.target = "_blank"; ouvrir.rel = "noopener";
  const fait = el("button", "bouton clair petit", "✓ C'est envoyé"); fait.type = "button";
  const non = el("button", "lien", "Pas pour moi"); non.type = "button";
  const agir = (action, message) => async () => {
    try { await appel(`/api/a-postuler/${o.id}/${action}`, { methode: "POST" }); c.remove(); toast(message); compterAPostuler(); }
    catch (e) { toast(e.message); }
  };
  fait.onclick = agir("fait", "Bravo ! C'est noté.");
  non.onclick = agir("ecarter", "Retirée de ta liste.");
  actions.append(ouvrir, fait, non);
  c.append(actions);
  const lettre = el("button", "lien petit-lien", o.a_lettre ? "📋 Copier ma lettre" : "✍️ Le site demande une lettre ? Je l'écris");
  lettre.type = "button";
  lettre.onclick = async () => {
    if (!o.a_lettre) {
      try { await appel(`/api/a-postuler/${o.id}/lettre`, { methode: "POST" }); lettre.disabled = true; lettre.textContent = "C'est demandé : ta lettre arrive dans la discussion (1 minute)."; }
      catch (e) { toast(e.message); }
      return;
    }
    try {
      const t = (await appel(`/api/a-postuler/${o.id}/lettre`)).lettre || "";
      const lignes = t.split("\n");
      const debut = lignes.findIndex((l) => /^\s*(madame|monsieur|dear|geachte|beste|bonjour|hello)/i.test(l));
      await navigator.clipboard.writeText((debut >= 0 ? lignes.slice(debut) : lignes).join("\n").trim());
      toast("Lettre copiée : colle-la dans le champ « lettre » du site.");
    } catch (e) { toast(e.message || "Copie impossible ici."); }
  };
  c.append(lettre);
  return c;
}
