'use strict';
/* =========================================================
   Marque Stony Automation : logo, charte graphique,
   impression des rapports aux couleurs de la marque.
   Chargé APRÈS reunions.js.
   ========================================================= */

const BRAND = {
  nom: 'Stony Automation',
  slogan: 'L’automatisation solide pour les PME du Québec',
  couleurs: [
    { nom: 'Ardoise', hex: '#1F2933', role: 'Texte, titres, fonds sombres' },
    { nom: 'Granit', hex: '#52606D', role: 'Texte secondaire, pierre de base du logo' },
    { nom: 'Schiste', hex: '#7B8794', role: 'Bordures, icônes, pierre du milieu' },
    { nom: 'Galet', hex: '#E4DED4', role: 'Fonds de cartes, séparateurs' },
    { nom: 'Sable', hex: '#F5F3EF', role: 'Fond de page' },
    { nom: 'Mousse', hex: '#2F6F57', role: 'Couleur d’action : boutons, liens, accents' },
    { nom: 'Lichen', hex: '#3F8F6E', role: 'Accent clair, pierre du sommet (l’étincelle d’automatisation)' },
    { nom: 'Cuivre', hex: '#B86B3A', role: 'Accent secondaire, mise en valeur ponctuelle' }
  ]
};

/* Logo : un cairn (pierres empilées) — solidité, équilibre, progression.
   La pierre du sommet, couleur mousse, représente l'automatisation. */
function logoSVG(size = 32, dark = false) {
  const hi = dark ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.22)';
  return `<svg class="logo-svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${BRAND.nom}">
    <rect x="7" y="45" width="50" height="14" rx="7" fill="${dark ? '#9AA5B1' : '#52606D'}"/>
    <rect x="12" y="48" width="20" height="3" rx="1.5" fill="${hi}"/>
    <rect x="13" y="31.5" width="38" height="13" rx="6.5" fill="${dark ? '#CBD2D9' : '#7B8794'}" transform="rotate(-4 32 38)"/>
    <rect x="17" y="34" width="14" height="2.6" rx="1.3" fill="${hi}" transform="rotate(-4 32 38)"/>
    <rect x="19" y="19" width="26" height="12" rx="6" fill="${dark ? '#E4DED4' : '#9AA5B1'}" transform="rotate(3 32 25)"/>
    <rect x="27" y="6.5" width="14" height="11" rx="5.5" fill="#3F8F6E" transform="rotate(-6 34 12)"/>
    <circle cx="35.5" cy="11.5" r="1.8" fill="#E9F5EF" transform="rotate(-6 34 12)"/>
  </svg>`;
}
function wordmark(dark = false) {
  return `<span class="wordmark ${dark ? 'dark' : ''}"><b>Stony</b><span>Automation</span></span>`;
}

/* ---------- Application de la marque à l'interface ---------- */
function applyBrandChrome() {
  const name = (db.marque && db.marque.nom) || db.settings.agence || BRAND.nom;
  const sb = $('.sidebar .brand');
  if (sb && !sb.dataset.branded) { sb.dataset.branded = '1'; sb.innerHTML = `${logoSVG(34, true)}<span id="brand-name"></span>`; }
  const bn = $('#brand-name'); if (bn) bn.innerHTML = name === BRAND.nom ? wordmark(true) : esc(name);
  const ab = $('.auth-brand'); if (ab && !ab.dataset.branded) { ab.dataset.branded = '1'; ab.innerHTML = `${logoSVG(44)}${wordmark()}`; }
}
applyBrandChrome();

/* ---------- Charte graphique ---------- */
NAV.push(['charte', 'Charte graphique', '🪨']);

VIEWS.charte = () => `
  <div class="brand-hero">
    <div class="brand-hero-logo">${logoSVG(120, true)}</div>
    <div>${wordmark(true)}<p>${esc(db.marque.slogan || BRAND.slogan)}</p></div>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><h3>Le logo : un cairn</h3>
      <p>Des pierres empilées en équilibre : chaque automatisation repose solidement sur la précédente. La petite pierre <b style="color:#2F6F57">mousse</b> au sommet représente l’étincelle de l’automatisation et de l’IA.</p>
      <div class="logo-demos">
        <div class="logo-demo light">${logoSVG(64)}${wordmark()}</div>
        <div class="logo-demo darkbg">${logoSVG(64, true)}${wordmark(true)}</div>
        <div class="logo-demo light">${logoSVG(40)}</div>
      </div>
      <p class="muted small">Garder de l’espace vide autour du logo (au moins la hauteur de la pierre du sommet). Ne pas déformer, ne pas changer les couleurs des pierres.</p>
    </div>
    <div class="card"><h3>Typographie</h3>
      <div class="typo-sample"><div class="t-outfit">Outfit — Titres</div><p class="muted small">Géométrique et solide. Titres, chiffres clés, nom de la marque.</p></div>
      <div class="typo-sample"><div class="t-inter">Inter — Texte courant</div><p class="muted small">Très lisible à l’écran et à l’impression. Paragraphes, tableaux, interface.</p></div>
      <h3 style="margin-top:16px">Ton de la marque</h3>
      <ul class="tone"><li><b>Solide</b> : des promesses mesurables, pas de jargon.</li><li><b>Concret</b> : chaque recommandation a un coût, un gain et une prochaine étape.</li><li><b>Local</b> : français québécois professionnel, vouvoiement avec les clients.</li></ul>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Palette « Pierre »</h3>
    <div class="swatches">${BRAND.couleurs.map(c => `<div class="swatch"><div class="sw" style="background:${c.hex}"></div><b>${c.nom}</b><code>${c.hex}</code><span class="muted small">${c.role}</span></div>`).join('')}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Utilisation</h3>
    <p>Ces éléments sont appliqués automatiquement : tableau de bord, écran de connexion, rapports PDF, rapports clients officiels. Le nom, le slogan et la signature se modifient dans <b>Agents IA → Yaman → Réglages → Profil de marque</b>.</p>
    <button class="btn" id="print-charte">🖨 Imprimer la charte graphique (PDF)</button>
  </div>`;

document.addEventListener('click', e => {
  if (e.target.id === 'print-charte') {
    printHTML(`<div class="p-brand">${logoSVG(56)}${wordmark()}</div>
      <h1>Charte graphique</h1><p>${esc(db.marque.slogan || BRAND.slogan)}</p>
      <h2>Palette « Pierre »</h2>${BRAND.couleurs.map(c => `<div class="row"><span style="display:inline-block;width:14mm;height:7mm;background:${c.hex};border:0.5pt solid #999;vertical-align:middle;margin-right:6pt"></span><b>${c.nom}</b> ${c.hex} — ${c.role}</div>`).join('')}
      <h2>Typographie</h2><div class="row"><b>Outfit</b> : titres et chiffres clés</div><div class="row"><b>Inter</b> : texte courant</div>
      <h2>Le logo</h2><p>Un cairn : des pierres empilées en équilibre. La pierre mousse du sommet représente l’automatisation.</p>`, 'Letter');
  }
});

/* ---------- Rapports imprimés aux couleurs de la marque ---------- */
printReport = function (text, agent) {
  const m = db.marque;
  printHTML(`<div class="p-head">${logoSVG(40)}<div><div class="p-name">${esc(m.nom || BRAND.nom)}</div>${m.slogan ? `<div class="p-slogan">${esc(m.slogan)}</div>` : ''}</div></div>
    <div class="pmeta">${fmtDate(todayISO())}${agent && agent.nom ? ' · ' + esc(agent.nom) : ''}</div>
    <div class="report">${md(text)}</div>
    ${m.signature ? `<div class="p-sign">${esc(m.signature)}</div>` : ''}`);
};

function printClientReport(r) {
  const rc = r.rapportClient; if (!rc) return;
  const m = db.marque;
  printHTML(`
    <div class="cover">
      <div class="cover-top">${logoSVG(70)}${wordmark()}</div>
      <div class="cover-mid">
        <div class="cover-kicker">Rapport d’analyse et de recommandations</div>
        <h1 class="cover-title">${esc(rc.titre || r.titre)}</h1>
        ${rc.client ? `<div class="cover-client">Préparé pour : <b>${esc(rc.client)}</b></div>` : ''}
        <div class="cover-date">${esc(fmtDate(rc.date || todayISO()))}</div>
      </div>
      <div class="cover-bottom"><span>${esc(m.slogan || BRAND.slogan)}</span><span>Document confidentiel</span></div>
    </div>
    <div class="page-break"></div>
    <div class="p-head small">${logoSVG(26)}<div class="p-name">${esc(m.nom || BRAND.nom)}</div><div class="p-right">${esc(rc.client || '')}</div></div>
    <div class="report official">${md(rc.contenu)}</div>
    <div class="p-sign">${esc(m.signature || m.nom || BRAND.nom)}</div>
    <div class="p-foot">${esc(m.nom || BRAND.nom)} · ${esc(m.slogan || BRAND.slogan)}</div>`, 'Letter');
}
