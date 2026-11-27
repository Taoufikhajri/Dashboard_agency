/* =========================================================
   Rendu des pages de tunnel (partagé) :
   - /f/<slug> (page publique)
   - aperçu en direct dans le tableau de bord (Tunnels)
   ========================================================= */
(function () {
  const THEMES = {
    mousse: { a: '#2F6F57', a2: '#3F8F6E', soft: '#E4F0EA', nom: 'Mousse (vert)' },
    argile: { a: '#B86B3A', a2: '#CF8452', soft: '#F8EADF', nom: 'Argile (orange)' },
    pierre: { a: '#323F4B', a2: '#52606D', soft: '#E9E4DB', nom: 'Pierre (gris foncé)' }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  function ytEmbed(url) {
    const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    const v = String(url || '').match(/vimeo\.com\/(\d+)/);
    return v ? `https://player.vimeo.com/video/${v[1]}` : '';
  }
  const LOGO = `<svg width="30" height="30" viewBox="4 4 56 58" aria-hidden="true"><polygon points="18,18 34,8 30,28" fill="#F5F3EF"/><polygon points="34,8 52,16 42,36 30,28" fill="#E4DED4"/><polygon points="52,16 56,38 42,36" fill="#CBD2D9"/><polygon points="56,38 44,56 42,36" fill="#9AA5B1"/><polygon points="44,56 22,58 26,44 42,36" fill="#7B8794"/><polygon points="22,58 10,40 26,44" fill="#9AA5B1"/><polygon points="10,40 18,18 30,28 26,44" fill="#CBD2D9"/><polygon points="30,28 42,36 26,44" fill="#4FA883"/></svg>`;

  function css(scope) {
    const S = scope || '';
    return `
${S} .fn { --a:#2F6F57; --a2:#3F8F6E; --soft:#E4F0EA; font-family: Inter, system-ui, sans-serif; color:#1F2933; background:#F5F3EF; min-height:100%; line-height:1.6; }
${S} .fn * { box-sizing:border-box; }
${S} .fn h1, ${S} .fn h2 { font-family: Outfit, Inter, sans-serif; line-height:1.12; margin:0 0 14px; letter-spacing:-.01em; }
${S} .fn-top { background:#1F2933; color:#fff; padding:14px 20px; display:flex; align-items:center; gap:10px; font-family:Outfit, Inter, sans-serif; font-weight:700; font-size:17px; }
${S} .fn-top span { color:#7FC4A4; font-weight:500; }
${S} .fn-hero { background: radial-gradient(900px 400px at 85% 0%, var(--soft), transparent 60%), linear-gradient(180deg,#fff,#F5F3EF); padding:54px 20px 64px; }
${S} .fn-wrap { max-width:1060px; margin:0 auto; }
${S} .fn-grid { display:grid; grid-template-columns:1.1fr .9fr; gap:42px; align-items:start; }
${S} .fn-eyebrow { display:inline-block; font-size:12.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--a); background:var(--soft); padding:6px 12px; border-radius:999px; margin-bottom:16px; }
${S} .fn h1 { font-size:clamp(30px,4.4vw,48px); font-weight:800; }
${S} .fn-sub { font-size:18px; color:#52606D; margin:0 0 20px; }
${S} .fn-list { list-style:none; padding:0; margin:0 0 22px; }
${S} .fn-list li { position:relative; padding:7px 0 7px 32px; font-size:16px; }
${S} .fn-list li::before { content:'✓'; position:absolute; left:0; top:8px; width:22px; height:22px; border-radius:50%; background:var(--a); color:#fff; font-size:13px; font-weight:700; display:grid; place-items:center; line-height:22px; text-align:center; }
${S} .fn-img { width:100%; border-radius:16px; box-shadow:0 18px 40px rgba(31,41,51,.15); display:block; margin-top:6px; }
${S} .fn-card { background:#fff; border-radius:20px; padding:26px; box-shadow:0 20px 50px rgba(31,41,51,.12); border:1px solid #E4DED4; position:sticky; top:20px; }
${S} .fn-card h2 { font-size:21px; }
${S} .fn label { display:block; font-size:13px; font-weight:600; color:#323F4B; margin-bottom:12px; }
${S} .fn input[type=text], ${S} .fn input[type=email], ${S} .fn input[type=tel] { width:100%; margin-top:5px; padding:12px 14px; border:1.5px solid #E4DED4; border-radius:12px; font:inherit; font-size:15px; background:#fff; color:#1F2933; }
${S} .fn input:focus { outline:none; border-color:var(--a); }
${S} .fn .fn-consent { display:flex; gap:10px; align-items:flex-start; font-weight:400; font-size:12.5px; color:#52606D; }
${S} .fn .fn-consent input { width:17px; height:17px; margin:2px 0 0; flex:none; accent-color:var(--a); }
${S} .fn-btn { display:block; width:100%; text-align:center; text-decoration:none; padding:16px 20px; border-radius:14px; border:0; cursor:pointer; background:var(--a); color:#fff; font:inherit; font-weight:700; font-size:16.5px; box-shadow:0 10px 24px rgba(0,0,0,.15); transition:transform .15s, background .15s; }
${S} .fn-btn:hover { background:var(--a2); transform:translateY(-1px); }
${S} .fn-btn.ghost { background:#fff; color:var(--a); border:2px solid var(--a); box-shadow:none; }
${S} .fn-proof { text-align:center; font-size:12.5px; color:#7B8794; margin:10px 0 0; }
${S} .fn-msg { margin-top:12px; font-size:14px; padding:10px 12px; border-radius:10px; background:#FDECEC; color:#8A1C1C; display:none; }
${S} .fn-msg.show { display:block; }
${S} .fn-hp { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
${S} .fn-thanks { max-width:720px; margin:0 auto; text-align:center; padding:56px 20px 70px; }
${S} .fn-check { width:66px; height:66px; border-radius:50%; background:var(--a); color:#fff; font-size:34px; display:grid; place-items:center; margin:0 auto 18px; }
${S} .fn-thanks p { font-size:17px; color:#52606D; }
${S} .fn-video { position:relative; padding-top:56.25%; border-radius:16px; overflow:hidden; margin:24px 0; background:#000; }
${S} .fn-video iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
${S} .fn-actions { display:flex; flex-direction:column; gap:12px; max-width:420px; margin:26px auto 0; }
${S} .fn-foot { text-align:center; font-size:12px; color:#7B8794; padding:24px 16px 34px; }
${S} .fn-foot a { color:#7B8794; }
@media (max-width: 820px) { ${S} .fn-grid { grid-template-columns:1fr; gap:28px; } ${S} .fn-card { position:static; } ${S} .fn-hero { padding:36px 16px 46px; } }
`;
  }

  function vars(cfg) { const t = THEMES[cfg.theme] || THEMES.mousse; return `--a:${t.a};--a2:${t.a2};--soft:${t.soft}`; }
  function header(cfg) { return `<div class="fn-top">${LOGO}<div>${esc(cfg.marque || 'Stony')} <span>${esc(cfg.marque2 == null ? 'Automation' : cfg.marque2)}</span></div></div>`; }
  function footer(cfg) { return `<div class="fn-foot">© ${new Date().getFullYear()} ${esc((cfg.marque || 'Stony') + ' ' + (cfg.marque2 == null ? 'Automation' : cfg.marque2))} · <a href="/site/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></div>`; }

  function capture(cfg) {
    cfg = cfg || {}; const c = cfg.capture || {}, ch = c.champs || {};
    const puces = (Array.isArray(c.puces) ? c.puces : String(c.puces || '').split('\n')).map(x => String(x).trim()).filter(Boolean);
    const img = safeUrl(c.image_url);
    return `<div class="fn" style="${vars(cfg)}">${header(cfg)}
<div class="fn-hero"><div class="fn-wrap fn-grid">
  <div>
    ${c.surtitre ? `<span class="fn-eyebrow">${esc(c.surtitre)}</span>` : ''}
    <h1>${rich(c.titre || 'Votre titre accrocheur ici')}</h1>
    ${c.sous_titre ? `<p class="fn-sub">${rich(c.sous_titre)}</p>` : ''}
    ${puces.length ? `<ul class="fn-list">${puces.map(p => `<li>${rich(p)}</li>`).join('')}</ul>` : ''}
    ${img ? `<img class="fn-img" src="${esc(img)}" alt="">` : ''}
  </div>
  <form class="fn-card fn-form" novalidate>
    <h2>${rich(c.titre_formulaire || 'Recevez-le gratuitement')}</h2>
    ${ch.prenom !== false ? '<label>Prénom *<input type="text" name="prenom" autocomplete="given-name" maxlength="60" required></label>' : ''}
    <label>Courriel *<input type="email" name="courriel" autocomplete="email" maxlength="200" required></label>
    ${ch.entreprise ? '<label>Entreprise<input type="text" name="entreprise" autocomplete="organization" maxlength="160"></label>' : ''}
    ${ch.telephone ? '<label>Téléphone<input type="tel" name="telephone" autocomplete="tel" maxlength="40"></label>' : ''}
    <div class="fn-hp" aria-hidden="true"><input type="text" name="site_web" tabindex="-1" autocomplete="off"></div>
    <label class="fn-consent"><input type="checkbox" name="consentement" required><span>${esc(c.consentement_texte || 'J’accepte de recevoir des courriels de Stony Automation (conseils, offres). Je peux me désabonner en tout temps.')}</span></label>
    <button class="fn-btn" type="submit">${esc(c.bouton || 'Je le veux →')}</button>
    ${c.preuve ? `<p class="fn-proof">${esc(c.preuve)}</p>` : ''}
    <div class="fn-msg" role="alert"></div>
  </form>
</div></div>${footer(cfg)}</div>`;
  }

  function merci(cfg) {
    cfg = cfg || {}; const m = cfg.merci || {};
    const vid = ytEmbed(m.video_url), bt = safeUrl(m.bouton_url), dl = safeUrl(m.telechargement_url);
    return `<div class="fn" style="${vars(cfg)}">${header(cfg)}
<div class="fn-thanks">
  <div class="fn-check">✓</div>
  <h1>${rich(m.titre || 'Merci! C’est confirmé.')}</h1>
  ${m.texte ? `<p>${rich(m.texte)}</p>` : ''}
  ${vid ? `<div class="fn-video"><iframe src="${esc(vid)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Vidéo"></iframe></div>` : ''}
  <div class="fn-actions">
    ${dl ? `<a class="fn-btn ${bt ? 'ghost' : ''}" href="${esc(dl)}" target="_blank" rel="noopener" data-fn-click>${esc(m.telechargement_texte || '⬇ Télécharger')}</a>` : ''}
    ${bt ? `<a class="fn-btn" href="${esc(bt)}" target="_blank" rel="noopener" data-fn-click>${esc(m.bouton_texte || 'Réserver mon appel gratuit →')}</a>` : ''}
  </div>
</div>${footer(cfg)}</div>`;
  }

  window.FunnelRender = { THEMES, css, capture, merci, esc };
})();
