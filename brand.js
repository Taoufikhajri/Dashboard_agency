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
    { nom: 'Granit', hex: '#52606D', role: 'Texte secondaire, facettes sombres du logo' },
    { nom: 'Schiste', hex: '#7B8794', role: 'Bordures, icônes, facettes du logo' },
    { nom: 'Galet', hex: '#E4DED4', role: 'Fonds de cartes, séparateurs' },
    { nom: 'Sable', hex: '#F5F3EF', role: 'Fond de page' },
    { nom: 'Mousse', hex: '#2F6F57', role: 'Couleur d’action : boutons, liens, accents' },
    { nom: 'Lichen', hex: '#3F8F6E', role: 'Accent clair, facette centrale du logo (l’automatisation)' },
    { nom: 'Cuivre', hex: '#B86B3A', role: 'Accent secondaire, mise en valeur ponctuelle' }
  ]
};

/* Logo : une roche prismatique (taillée en facettes, comme un cristal).
   Solidité de la pierre + précision de la technologie.
   La facette centrale, couleur mousse, représente l'automatisation. */
const ROCK = {
  // contour : (10,40) (18,18) (34,8) (52,16) (56,38) (44,56) (22,58) — points internes : (30,28) (42,36) (26,44)
  facets: [
    '18,18 34,8 30,28',
    '34,8 52,16 42,36 30,28',
    '52,16 56,38 42,36',
    '56,38 44,56 42,36',
    '44,56 22,58 26,44 42,36',
    '22,58 10,40 26,44',
    '10,40 18,18 30,28 26,44'
  ],
  core: '30,28 42,36 26,44',
  light: ['#CBD2D9', '#9AA5B1', '#7B8794', '#52606D', '#3E4C59', '#52606D', '#7B8794'],
  dark:  ['#F5F3EF', '#E4DED4', '#CBD2D9', '#9AA5B1', '#7B8794', '#9AA5B1', '#CBD2D9']
};
function logoSVG(size = 32, dark = false) {
  const tones = dark ? ROCK.dark : ROCK.light;
  const edge = dark ? 'rgba(31,41,51,.35)' : 'rgba(255,255,255,.35)';
  return `<svg class="logo-svg" width="${size}" height="${size}" viewBox="4 4 56 58" role="img" aria-label="${BRAND.nom}">
    ${ROCK.facets.map((p, i) => `<polygon points="${p}" fill="${tones[i]}" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"/>`).join('')}
    <polygon points="${ROCK.core}" fill="#3F8F6E" stroke="${edge}" stroke-width="0.8" stroke-linejoin="round"/>
    <polygon points="30,28 36,32 28.5,34" fill="rgba(255,255,255,.28)"/>
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
    <div class="card"><h3>Le logo : une roche prismatique</h3>
      <p>Une pierre taillée en facettes, comme un cristal : la <b>solidité</b> de la roche et la <b>précision</b> de la technologie. La facette centrale <b style="color:#2F6F57">mousse</b> représente le cœur du métier : l’automatisation et l’IA.</p>
      <div class="logo-demos">
        <div class="logo-demo light">${logoSVG(64)}${wordmark()}</div>
        <div class="logo-demo darkbg">${logoSVG(64, true)}${wordmark(true)}</div>
        <div class="logo-demo light">${logoSVG(40)}</div>
      </div>
      <p class="muted small">Garder de l’espace vide autour du logo (au moins le quart de sa largeur). Ne pas déformer, ne pas changer les couleurs des pierres.</p>
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
      <h2>Le logo</h2><p>Une roche prismatique taillée en facettes. La facette centrale mousse représente l’automatisation et l’IA.</p>`, 'Letter');
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
