'use strict';
/* =========================================================
   🧲 TUNNELS & COURRIELS (style systeme.io)
   - Tunnels : page de capture → page merci, publiés sur /f/<slug>
   - Contacts : liste de courriels avec étiquettes
   - Séquences : courriels automatiques envoyés par Brevo
   - Courriels : réglages Brevo, essai, diffusion, journal
   Données dans Supabase (tables privées, voir supabase-tunnels.sql).
   Chargé après croissance.js, avant brand.js.
   ========================================================= */

NAV.splice(NAV.findIndex(n => n[0] === 'projets'), 0, ['tunnels', 'Tunnels & courriels', '🧲']);

const TN = {
  tab: 'tunnels', loaded: false, loading: false, missing: false, error: '',
  funnels: [], stats: {}, contacts: [], sequences: [], enroll: [], log: [], settings: null, keyInfo: null,
  editId: null, preview: 'capture', seqId: null, q: '', tag: '', busy: '', ranOnce: false
};
const FUNNEL_API = '/api/funnel';
const SITE = () => location.origin;
const funnelUrl = f => `${SITE()}/f/${f.slug}`;
const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tunnel';

async function funnelApi(action, body) {
  const { data: { session } } = await Cloud.client.auth.getSession();
  if (!session) throw new Error('Session expirée : reconnecte-toi.');
  let r;
  try { r = await fetch(`${FUNNEL_API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body || {}) }); }
  catch (e) { throw new Error('Pas de connexion Internet, ou le site ne répond pas.'); }
  let j = null; try { j = await r.json(); } catch (e) { }
  if (r.status === 404 && !j) throw new Error('La fonction /api/funnel est introuvable : attends la fin du déploiement Vercel.');
  if (!r.ok) throw new Error((j && j.error) || `Erreur ${r.status}`);
  return j;
}
const sb = () => Cloud.client;
function isMissingTable(err) { return !!err && /relation|does not exist|schema cache|PGRST205|42P01|Could not find/i.test((err.message || '') + (err.code || '')); }

/* ---------- Chargement ---------- */
async function loadTunnels(force) {
  if (!Cloud.client || !Cloud.user) return;
  if (TN.loading || (TN.loaded && !force)) return;
  TN.loading = true; TN.error = '';
  try {
    const [f, c, s, e, l, st, k] = await Promise.all([
      sb().from('funnels').select('*').order('created_at', { ascending: false }),
      sb().from('contacts').select('*').order('created_at', { ascending: false }).limit(2000),
      sb().from('sequences').select('*').order('created_at', { ascending: true }),
      sb().from('enrollments').select('id,sequence_id,contact_id,etape,statut,prochain_envoi').limit(5000),
      sb().from('email_log').select('*').order('created_at', { ascending: false }).limit(60),
      sb().from('email_settings').select('*').maybeSingle(),
      sb().rpc('get_brevo_key_info')
    ]);
    const firstErr = [f, c, s, e, l, st].map(x => x.error).find(Boolean);
    if (firstErr) { TN.missing = isMissingTable(firstErr); if (!TN.missing) TN.error = firstErr.message; }
    else {
      TN.missing = false;
      TN.funnels = f.data || []; TN.contacts = c.data || []; TN.sequences = s.data || []; TN.enroll = e.data || []; TN.log = l.data || [];
      TN.settings = st.data || null; TN.keyInfo = (k.data && k.data[0]) || null;
      await loadStats();
      TN.loaded = true;
      autoRun();
    }
  } catch (err) { TN.error = err.message; }
  TN.loading = false;
  if (location.hash === '#tunnels' && !document.activeElement.matches('input,textarea,select')) render();
}
async function loadStats() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await sb().from('funnel_events').select('funnel_id,type,created_at').gte('created_at', since).limit(20000);
  const stats = {};
  TN.funnels.forEach(f => stats[f.id] = { vue: 0, inscription: 0, clic: 0, jours: {} });
  (data || []).forEach(ev => {
    const s = stats[ev.funnel_id]; if (!s) return;
    s[ev.type] = (s[ev.type] || 0) + 1;
    const d = ev.created_at.slice(0, 10); s.jours[d] = s.jours[d] || { vue: 0, inscription: 0 };
    if (ev.type in s.jours[d]) s.jours[d][ev.type]++;
  });
  TN.stats = stats;
}
// Envoi automatique des courriels dus quand tu ouvres le tableau de bord (en plus du passage quotidien)
async function autoRun() {
  if (TN.ranOnce || !TN.keyInfo) return;
  const now = Date.now();
  if (!TN.enroll.some(x => x.statut === 'actif' && x.prochain_envoi && Date.parse(x.prochain_envoi) <= now)) return;
  TN.ranOnce = true;
  try { const r = await funnelApi('run'); if (r.envoyes) { toast(`📧 ${r.envoyes} courriel(s) automatique(s) envoyé(s)`); TN.loaded = false; loadTunnels(); } }
  catch (e) { /* silencieux */ }
}
{
  let started = false;
  setInterval(() => { if (Cloud.user && !started) { started = true; loadTunnels(); } if (!Cloud.user) { started = false; TN.loaded = false; TN.ranOnce = false; } }, 1500);
}

/* ---------- Modèles prêts à l'emploi ---------- */
const SIGN = '— Taoufik\nStony Automation';
const FUNNEL_TEMPLATES = {
  guide: {
    nom: 'Guide gratuit — 7 tâches à automatiser', slug: 'guide-7-taches',
    config: {
      theme: 'mousse', etiquettes: ['guide-7-taches'],
      capture: {
        surtitre: 'Guide gratuit · PME du Québec',
        titre: '7 tâches que votre PME peut **automatiser cette semaine**',
        sous_titre: 'Un guide simple, sans jargon, pour récupérer des heures chaque semaine, même sans aucune connaissance technique.',
        puces: ['Les 7 tâches qui font perdre le plus de temps aux PME', 'Les outils simples (souvent gratuits) pour les automatiser', 'Un exemple chiffré pour une entreprise de construction', 'Une liste à cocher pour commencer dès lundi'],
        titre_formulaire: 'Recevez le guide gratuit', bouton: 'Envoyez-moi le guide →', preuve: '🔒 Aucun pourriel. Désabonnement en 1 clic.',
        champs: { prenom: true, entreprise: true, telephone: false }
      },
      merci: {
        titre: 'C’est confirmé! Votre guide est prêt.',
        texte: 'Téléchargez-le ci-dessous : vous le recevrez aussi par courriel dans quelques minutes.\n\nVous voulez savoir ce que **vous** pourriez automatiser? Réservez un appel gratuit de 30 minutes.',
        telechargement_texte: '⬇ Télécharger le guide (PDF)', telechargement_url: '', bouton_texte: 'Réserver mon appel gratuit →', bouton_url: ''
      }
    },
    sequence: {
      nom: 'Bienvenue — Guide 7 tâches',
      etapes: [
        { delai_jours: 0, sujet: 'Votre guide : 7 tâches à automatiser', corps: `Bonjour {{prenom}},\n\nMerci pour votre intérêt! Voici votre guide :\nCOLLE-ICI-LE-LIEN-DU-GUIDE\n\nMon conseil : ne cherchez pas à tout automatiser. Choisissez **une seule tâche** dans la liste, celle qui vous énerve le plus, et commencez par celle-là.\n\nDans quelques jours, je vous raconte la tâche n° 1 que je vois partout dans les PME de la région.\n\n${SIGN}` },
        { delai_jours: 2, sujet: 'La tâche n° 1 que je vois partout', corps: `Bonjour {{prenom}},\n\nDans presque toutes les PME que je rencontre, c’est la même chose : **des appels manqués**.\n\nVous êtes sur un chantier ou en atelier, le téléphone sonne, vous ne pouvez pas répondre… et le client appelle le concurrent.\n\nAujourd’hui, un simple système peut répondre par texto en quelques secondes, poser 2-3 questions et fixer un rendez-vous dans votre calendrier.\n\nCombien d’appels manquez-vous par semaine? Répondez à ce courriel avec un chiffre, je suis curieux.\n\n${SIGN}` },
        { delai_jours: 3, sujet: 'Combien vous coûte la paperasse?', corps: `Bonjour {{prenom}},\n\nUn petit calcul que je fais avec chaque entreprise :\n\n10 heures de tâches répétitives par semaine × 35 $ de l’heure × 48 semaines = **16 800 $ par année**.\n\nEt c’est souvent plus. Faites le calcul pour votre entreprise en 30 secondes ici :\n${location.origin}/site/#calcul\n\n${SIGN}` },
        { delai_jours: 3, sujet: '30 minutes pour {{entreprise}}?', corps: `Bonjour {{prenom}},\n\nSi vous voulez savoir précisément ce que vous pourriez automatiser, je vous offre un appel gratuit de 30 minutes.\n\nPas de vente sous pression : on regarde vos tâches, je vous donne 2-3 pistes concrètes, et vous décidez ensuite.\n\nPour réserver : ${location.origin}/site/#diagnostic\n\n${SIGN}` }
      ]
    }
  },
  diagnostic: {
    nom: 'Diagnostic gratuit', slug: 'diagnostic-gratuit',
    config: {
      theme: 'mousse', etiquettes: ['demande-diagnostic'],
      capture: {
        surtitre: 'Diagnostic gratuit · 30 minutes',
        titre: 'Découvrez combien d’heures votre entreprise **perd chaque semaine**',
        sous_titre: 'En 30 minutes, on repère les tâches qui vous coûtent le plus cher et ce qu’on peut automatiser. Gratuit, sans engagement.',
        puces: ['Vos 3 tâches les plus coûteuses, chiffrées', 'Des pistes concrètes dès le premier appel', 'En personne en Mauricie, ou en visio partout au Québec'],
        titre_formulaire: 'Réservez votre diagnostic', bouton: 'Réserver mon diagnostic gratuit →', preuve: 'Réponse en 24 h ouvrables.',
        champs: { prenom: true, entreprise: true, telephone: true }
      },
      merci: {
        titre: 'Merci! Votre demande est bien reçue.',
        texte: 'Choisissez dès maintenant le moment qui vous convient pour notre appel de 30 minutes.\n\nSi aucun moment ne vous convient, pas de souci : on vous contacte d’ici 24 h ouvrables.',
        bouton_texte: '📅 Choisir mon moment', bouton_url: ''
      }
    },
    sequence: {
      nom: 'Suivi — Demande de diagnostic',
      etapes: [
        { delai_jours: 0, sujet: 'Votre demande de diagnostic est bien reçue', corps: `Bonjour {{prenom}},\n\nMerci pour votre demande! Je vous contacte d’ici 24 h ouvrables pour fixer notre appel de 30 minutes.\n\nPour que l’appel soit vraiment utile, pensez d’avance à ceci :\n1. Quelle tâche vous fait perdre le plus de temps?\n2. Quels logiciels utilisez-vous (Excel, QuickBooks, papier…)?\n3. Qu’est-ce que vous aimeriez ne plus jamais faire à la main?\n\n${SIGN}` },
        { delai_jours: 3, sujet: 'Ce que les PME automatisent en premier', corps: `Bonjour {{prenom}},\n\nEn attendant notre appel, voici les 3 automatisations qu’on met en place le plus souvent en premier :\n\n**1. Réponse aux appels manqués** : un texto part en quelques secondes et fixe un rendez-vous.\n**2. Soumissions** : un gabarit rempli à partir de quelques questions, envoyé en 5 minutes au lieu d’une heure.\n**3. Relances clients** : plus aucune soumission oubliée.\n\nLaquelle vous rapporterait le plus?\n\n${SIGN}` }
      ]
    }
  },
  vide: { nom: 'Nouveau tunnel', slug: 'nouveau-tunnel', config: { theme: 'mousse', etiquettes: [], capture: { champs: { prenom: true } }, merci: {} } }
};

/* ---------- Vue principale ---------- */
VIEWS.tunnels = () => {
  if (!Cloud.user) return `<div class="info">🧲 Les tunnels fonctionnent seulement en mode en ligne : connecte-toi au tableau de bord.</div>`;
  if (TN.missing) return setupCard();
  if (!TN.loaded) { loadTunnels(); return `<div class="card empty">${TN.error ? `<div class="info err">${esc(TN.error)}</div><button class="btn" data-tn-reload>Réessayer</button>` : '⏳ Chargement des tunnels…'}</div>`; }
  const tabs = [['tunnels', '🧲 Tunnels'], ['contacts', `👥 Contacts (${TN.contacts.length})`], ['sequences', '✉️ Séquences'], ['courriels', '⚙️ Courriels Brevo']];
  const warn = !TN.keyInfo || !TN.settings || !TN.settings.expediteur_courriel || !TN.settings.adresse_postale;
  const body = TN.tab === 'contacts' ? contactsTab() : TN.tab === 'sequences' ? sequencesTab() : TN.tab === 'courriels' ? emailsTab() : funnelsTab();
  return `<div class="tn-tabs">${tabs.map(([k, l]) => `<button class="tn-tab ${TN.tab === k ? 'on' : ''}" data-tn-tab="${k}">${l}</button>`).join('')}<span class="sp"></span><button class="btn small" data-tn-reload title="Actualiser">↻</button></div>
  ${warn && TN.tab !== 'courriels' ? `<div class="info warn small">⚙️ Les courriels automatiques ne partiront pas tant que Brevo n’est pas configuré. <a href="#tunnels" data-tn-tab="courriels">Configurer maintenant →</a></div>` : ''}
  ${body}`;
};

function setupCard() {
  return `<div class="card tn-setup"><h2>🧲 Activer les tunnels et les courriels</h2>
  <p>Une seule étape, comme pour les demandes du site :</p>
  <ol><li>Ouvre <b>Supabase</b> → <b>SQL Editor</b> → <b>New query</b>.</li>
  <li>Colle tout le contenu du fichier <b>supabase-tunnels.sql</b> (dans ton dépôt GitHub), puis clique <b>Run</b>.</li>
  <li>Reviens ici et clique « J’ai terminé ».</li></ol>
  <button class="btn primary" data-tn-reload>✓ J’ai terminé</button></div>`;
}

/* ---------- Onglet Tunnels ---------- */
function funnelsTab() {
  const f = TN.funnels.find(x => x.id === TN.editId);
  if (f) return funnelEditor(f);
  const tot = TN.funnels.reduce((a, x) => { const s = TN.stats[x.id] || {}; a.v += s.vue || 0; a.i += s.inscription || 0; return a; }, { v: 0, i: 0 });
  return `<div class="grid kpis">
    <div class="card kpi"><div class="label">Visites (30 j)</div><div class="value">${tot.v}</div></div>
    <div class="card kpi"><div class="label">Inscriptions (30 j)</div><div class="value">${tot.i}</div></div>
    <div class="card kpi"><div class="label">Taux de conversion</div><div class="value">${tot.v ? Math.round(tot.i / tot.v * 100) : 0} %</div><div class="sub">inscriptions ÷ visites</div></div>
    <div class="card kpi"><div class="label">Abonnés actifs</div><div class="value">${TN.contacts.filter(c => !c.desabonne).length}</div></div>
  </div>
  <div class="toolbar"><span class="sp"></span><button class="btn primary" data-tn-new>+ Nouveau tunnel</button></div>
  <div class="tn-list">${TN.funnels.map(x => {
    const s = TN.stats[x.id] || {}, seq = TN.sequences.find(q => q.id === x.sequence_id);
    return `<div class="card tn-fcard">
      <div class="tn-fhead"><div><h3>${esc(x.nom)}</h3><a class="tn-url" href="${esc(funnelUrl(x))}" target="_blank" rel="noopener">${esc(funnelUrl(x).replace(/^https?:\/\//, ''))} ↗</a></div>
        <span class="badge ${x.actif ? 'green' : 'orange'}">${x.actif ? '● Publié' : 'Brouillon'}</span></div>
      <div class="tn-nums"><span>Visites<b>${s.vue || 0}</b></span><span>Inscrits<b>${s.inscription || 0}</b></span><span>Conversion<b>${s.vue ? Math.round((s.inscription || 0) / s.vue * 100) : 0} %</b></span><span>Clics merci<b>${s.clic || 0}</b></span></div>
      ${sparkline(s.jours || {})}
      <div class="muted small">✉️ ${seq ? esc(seq.nom) : 'Aucune séquence'} · 🏷 ${(x.config.etiquettes || []).map(esc).join(', ') || 'aucune étiquette'}${x.vers_prospection ? ' · 🎯 copie dans Prospection' : ''}</div>
      <div class="tn-factions"><button class="btn small primary" data-tn-edit="${x.id}">✏️ Modifier</button><button class="btn small" data-tn-copy="${esc(funnelUrl(x))}">📋 Copier le lien</button><button class="btn small" data-tn-toggle="${x.id}">${x.actif ? 'Dépublier' : '🚀 Publier'}</button></div>
    </div>`;
  }).join('') || `<div class="card empty">Aucun tunnel. Clique « + Nouveau tunnel » : un modèle prêt à l’emploi (guide gratuit ou diagnostic) est rempli pour toi, avec sa séquence de courriels.</div>`}</div>`;
}
function sparkline(jours) {
  const days = []; for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const max = Math.max(1, ...days.map(d => (jours[d] || {}).vue || 0));
  return `<div class="tn-spark" title="Visites (gris) et inscriptions (vert), 30 derniers jours">${days.map(d => { const j = jours[d] || {}; return `<i style="height:${Math.max(2, (j.vue || 0) / max * 34)}px"><u style="height:${(j.vue ? (j.inscription || 0) / (j.vue) : 0) * 100}%"></u></i>`; }).join('')}</div>`;
}

function openNewFunnel() {
  modal(`<h2>Nouveau tunnel</h2>
    <p class="muted">Choisis un modèle : tout est prérempli (textes, page merci, séquence de courriels). Tu pourras tout modifier.</p>
    <div class="tn-tpls">
      <label class="tn-tpl"><input type="radio" name="tpl" value="guide" checked><b>📘 Guide gratuit</b><span>Le visiteur laisse son courriel pour recevoir un guide PDF. Idéal pour bâtir ta liste.</span></label>
      <label class="tn-tpl"><input type="radio" name="tpl" value="diagnostic"><b>🩺 Diagnostic gratuit</b><span>Le visiteur demande un appel de 30 min. Idéal pour obtenir des rendez-vous.</span></label>
      <label class="tn-tpl"><input type="radio" name="tpl" value="vide"><b>📄 Page vide</b><span>Tu écris tout toi-même.</span></label>
    </div>
    <label>Nom du tunnel<input id="nf-nom" value="${esc(FUNNEL_TEMPLATES.guide.nom)}"></label>
    <label>Adresse de la page<div class="tn-slug"><span>${esc(SITE().replace(/^https?:\/\//, ''))}/f/</span><input id="nf-slug" value="${esc(FUNNEL_TEMPLATES.guide.slug)}"></div></label>
    <label class="inline"><input type="checkbox" id="nf-seq" checked style="width:auto"> Créer aussi la séquence de courriels suggérée</label>
    <div id="nf-msg"></div>
    <div class="modal-actions"><span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="nf-go">Créer</button></div>`);
  let slugTouched = false;
  $('#nf-slug').oninput = () => { slugTouched = true; };
  $('#nf-nom').oninput = e => { if (!slugTouched) $('#nf-slug').value = slugify(e.target.value); };
  $$('[name=tpl]').forEach(r => r.onchange = () => { const t = FUNNEL_TEMPLATES[r.value]; $('#nf-nom').value = t.nom; if (!slugTouched) $('#nf-slug').value = t.slug; $('#nf-seq').closest('label').style.display = t.sequence ? '' : 'none'; });
  $('#nf-go').onclick = async () => {
    const tplKey = $('[name=tpl]:checked').value, t = FUNNEL_TEMPLATES[tplKey];
    const nom = $('#nf-nom').value.trim() || t.nom, slug = slugify($('#nf-slug').value);
    $('#nf-go').disabled = true;
    try {
      let sequence_id = null;
      if (t.sequence && $('#nf-seq').checked) {
        const { data, error } = await sb().from('sequences').insert({ nom: t.sequence.nom, actif: true, etapes: t.sequence.etapes.map(e => ({ id: uid(), ...e })) }).select().single();
        if (error) throw error; TN.sequences.push(data); sequence_id = data.id;
      }
      const { data, error } = await sb().from('funnels').insert({ nom, slug, actif: false, config: JSON.parse(JSON.stringify(t.config)), sequence_id, vers_prospection: true }).select().single();
      if (error) throw (/duplicate|unique/i.test(error.message) ? new Error('Cette adresse est déjà prise : choisis-en une autre.') : error);
      TN.funnels.unshift(data); TN.stats[data.id] = { vue: 0, inscription: 0, clic: 0, jours: {} };
      TN.editId = data.id; TN.preview = 'capture'; closeModal(); render(); toast('Tunnel créé ✓ (brouillon)');
    } catch (e) { $('#nf-msg').innerHTML = `<div class="info err small">${esc(e.message)}</div>`; $('#nf-go').disabled = false; }
  };
}

/* ---------- Éditeur de tunnel ---------- */
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setPathObj(o, p, v) { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { a = a[k] = (a[k] && typeof a[k] === 'object') ? a[k] : {}; }); a[ks[ks.length - 1]] = v; }
function tnIn(path, label, f, opts = {}) {
  const v = getPath(f.config, path);
  if (opts.area) return `<label>${label}<textarea data-tnc="${path}" rows="${opts.rows || 3}" placeholder="${esc(opts.ph || '')}">${esc(Array.isArray(v) ? v.join('\n') : (v || ''))}</textarea>${opts.help ? `<small class="muted">${opts.help}</small>` : ''}</label>`;
  if (opts.check) return `<label class="inline"><input type="checkbox" data-tnc="${path}" ${v ? 'checked' : ''} style="width:auto"> ${label}</label>`;
  return `<label>${label}<input data-tnc="${path}" value="${esc(v || '')}" placeholder="${esc(opts.ph || '')}">${opts.help ? `<small class="muted">${opts.help}</small>` : ''}</label>`;
}
function funnelEditor(f) {
  ensurePreviewCss();
  const c = f.config;
  if (c.capture && c.capture.champs && c.capture.champs.prenom === undefined) c.capture.champs.prenom = true;
  const R = window.FunnelRender;
  return `<div class="toolbar"><button class="btn" data-tn-back>← Tous les tunnels</button><span class="sp"></span>
    <span class="muted small" id="tn-saved">${TN.dirty ? 'Modifications non enregistrées' : '✓ Enregistré'}</span>
    <a class="btn small" href="${esc(funnelUrl(f))}" target="_blank" rel="noopener">Ouvrir ↗</a>
    <button class="btn small" data-tn-copy="${esc(funnelUrl(f))}">📋 Lien</button>
    <button class="btn small ${f.actif ? '' : 'primary'}" data-tn-toggle="${f.id}">${f.actif ? 'Dépublier' : '🚀 Publier'}</button>
    <button class="btn small primary" data-tn-save>💾 Enregistrer</button></div>
  <div class="tn-editor">
    <div class="tn-form card">
      <h3>⚙️ Réglages</h3>
      <label>Nom du tunnel (interne)<input data-tnf="nom" value="${esc(f.nom)}"></label>
      <label>Adresse<div class="tn-slug"><span>/f/</span><input data-tnf="slug" value="${esc(f.slug)}"></div></label>
      <label>Couleur<select data-tnc="theme">${Object.entries(R.THEMES).map(([k, t]) => `<option value="${k}" ${c.theme === k ? 'selected' : ''}>${t.nom}</option>`).join('')}</select></label>
      <label>Étiquettes ajoutées aux inscrits<input data-tnc="etiquettes" value="${esc((c.etiquettes || []).join(', '))}" placeholder="ex. : guide-7-taches"><small class="muted">Séparées par des virgules. Sert à filtrer les contacts et à faire des envois ciblés.</small></label>
      <label>Séquence de courriels<select data-tnf="sequence_id"><option value="">— Aucune —</option>${TN.sequences.map(q => `<option value="${q.id}" ${q.id === f.sequence_id ? 'selected' : ''}>${esc(q.nom)}${q.actif ? '' : ' (en pause)'}</option>`).join('')}</select></label>
      <label class="inline"><input type="checkbox" data-tnf="vers_prospection" ${f.vers_prospection ? 'checked' : ''} style="width:auto"> Copier chaque inscrit dans 🎯 Prospection</label>

      <h3>1️⃣ Page de capture</h3>
      ${tnIn('capture.surtitre', 'Petit texte au-dessus du titre', f)}
      ${tnIn('capture.titre', 'Titre principal', f, { area: true, rows: 2, help: 'Mets un mot **entre doubles étoiles** pour le mettre en gras.' })}
      ${tnIn('capture.sous_titre', 'Sous-titre', f, { area: true, rows: 2 })}
      ${tnIn('capture.puces', 'Avantages (une ligne = une puce ✓)', f, { area: true, rows: 4 })}
      ${tnIn('capture.image_url', 'Image (lien https, facultatif)', f, { ph: 'https://…' })}
      ${tnIn('capture.titre_formulaire', 'Titre du formulaire', f)}
      <div class="tn-checks">${tnIn('capture.champs.prenom', 'Prénom', f, { check: true })}${tnIn('capture.champs.entreprise', 'Entreprise', f, { check: true })}${tnIn('capture.champs.telephone', 'Téléphone', f, { check: true })}</div>
      ${tnIn('capture.bouton', 'Texte du bouton', f)}
      ${tnIn('capture.preuve', 'Petite phrase sous le bouton', f)}
      ${tnIn('capture.consentement_texte', 'Texte de consentement (Loi anti-pourriel)', f, { area: true, rows: 2, ph: 'J’accepte de recevoir des courriels de Stony Automation…' })}

      <h3>2️⃣ Page merci</h3>
      ${tnIn('merci.titre', 'Titre', f)}
      ${tnIn('merci.texte', 'Texte', f, { area: true, rows: 4 })}
      ${tnIn('merci.video_url', 'Vidéo YouTube ou Vimeo (facultatif)', f, { ph: 'https://youtu.be/…' })}
      ${tnIn('merci.telechargement_url', 'Lien de téléchargement (guide PDF, facultatif)', f, { ph: 'https://…', help: 'Astuce : mets ton PDF dans Google Drive (partage « Tous ceux qui ont le lien ») et colle le lien ici.' })}
      ${tnIn('merci.telechargement_texte', 'Texte du bouton de téléchargement', f)}
      ${tnIn('merci.bouton_url', 'Lien de réservation (Calendly, Google Agenda…)', f, { ph: 'https://calendly.com/…' })}
      ${tnIn('merci.bouton_texte', 'Texte du bouton de réservation', f)}

      <h3>🔎 Référencement</h3>
      ${tnIn('titre_page', 'Titre de l’onglet', f)}
      ${tnIn('description', 'Description (Google, Facebook)', f, { area: true, rows: 2 })}
      <hr><button class="btn danger small" data-tn-del="${f.id}">Supprimer ce tunnel</button>
    </div>
    <div class="tn-prev-wrap">
      <div class="tn-prev-tabs"><button class="tn-tab ${TN.preview === 'capture' ? 'on' : ''}" data-tn-prev="capture">1. Capture</button><button class="tn-tab ${TN.preview === 'merci' ? 'on' : ''}" data-tn-prev="merci">2. Merci</button><span class="sp"></span><button class="tn-tab ${TN.mobile ? 'on' : ''}" data-tn-mobile>📱 Mobile</button></div>
      <div class="tn-prev ${TN.mobile ? 'mobile' : ''}"><div class="fnp" id="tn-preview">${TN.preview === 'merci' ? R.merci(c) : R.capture(c)}</div></div>
    </div>
  </div>`;
}
function ensurePreviewCss() {
  if ($('#fnp-css')) return;
  const s = document.createElement('style'); s.id = 'fnp-css'; s.textContent = window.FunnelRender.css('.fnp'); document.head.appendChild(s);
}
function refreshPreview(f) {
  const el = $('#tn-preview'); if (!el) return;
  el.innerHTML = TN.preview === 'merci' ? window.FunnelRender.merci(f.config) : window.FunnelRender.capture(f.config);
}
let tnSaveT = null;
function markDirty(f) {
  TN.dirty = true; const s = $('#tn-saved'); if (s) s.textContent = 'Enregistrement…';
  clearTimeout(tnSaveT); tnSaveT = setTimeout(() => saveFunnel(f, true), 1500);
}
async function saveFunnel(f, silent) {
  clearTimeout(tnSaveT);
  const { error } = await sb().from('funnels').update({ nom: f.nom, slug: f.slug, config: f.config, sequence_id: f.sequence_id || null, vers_prospection: !!f.vers_prospection, actif: !!f.actif, updated_at: new Date().toISOString() }).eq('id', f.id);
  const s = $('#tn-saved');
  if (error) { const m = /duplicate|unique/i.test(error.message) ? 'Adresse déjà prise' : /check/i.test(error.message) ? 'Adresse invalide (lettres, chiffres, tirets)' : error.message; if (s) s.textContent = '⚠ ' + m; if (!silent) toast('⚠ ' + m); return false; }
  TN.dirty = false; if (s) s.textContent = '✓ Enregistré'; if (!silent) toast('Tunnel enregistré ✓');
  return true;
}
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-tnc],[data-tnf]'); if (!el) return;
  const f = TN.funnels.find(x => x.id === TN.editId); if (!f) return;
  const val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.tnf) {
    const k = el.dataset.tnf;
    f[k] = k === 'slug' ? slugify(val) : val;
  } else {
    const p = el.dataset.tnc;
    let v = val;
    if (p === 'etiquettes') v = String(val).split(',').map(x => slugify(x)).filter(Boolean);
    else if (p === 'capture.puces') v = String(val).split('\n');
    setPathObj(f.config, p, v);
    refreshPreview(f);
  }
  markDirty(f);
});

/* ---------- Onglet Contacts ---------- */
function contactsTab() {
  const tags = Array.from(new Set(TN.contacts.flatMap(c => c.etiquettes || []))).sort();
  const q = TN.q.toLowerCase();
  const list = TN.contacts.filter(c => (!TN.tag || (c.etiquettes || []).includes(TN.tag)) && (!q || [c.prenom, c.nom, c.courriel, c.entreprise, c.source].join(' ').toLowerCase().includes(q)));
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  return `<div class="grid kpis">
    <div class="card kpi"><div class="label">Contacts</div><div class="value">${TN.contacts.length}</div></div>
    <div class="card kpi"><div class="label">Abonnés actifs</div><div class="value">${TN.contacts.filter(c => !c.desabonne && c.consentement).length}</div></div>
    <div class="card kpi"><div class="label">Nouveaux (7 j)</div><div class="value">${TN.contacts.filter(c => c.created_at >= week).length}</div></div>
    <div class="card kpi"><div class="label">Désabonnés</div><div class="value">${TN.contacts.filter(c => c.desabonne).length}</div></div>
  </div>
  <div class="toolbar"><input class="tn-search" placeholder="Rechercher…" value="${esc(TN.q)}">
    <select class="tn-tagf"><option value="">Toutes les étiquettes</option>${tags.map(t => `<option ${t === TN.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <span class="sp"></span><button class="btn" data-tn-export>⬇ Exporter (CSV)</button></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Entreprise</th><th>Étiquettes</th><th>Source</th><th>Inscrit le</th><th>Courriels</th><th></th></tr></thead><tbody>
  ${list.slice(0, 500).map(c => {
    const en = TN.enroll.filter(x => x.contact_id === c.id);
    return `<tr><td><b>${esc([c.prenom, c.nom].filter(Boolean).join(' ') || '—')}</b><br><span class="muted small">${esc(c.courriel)}${c.telephone ? ' · ' + esc(c.telephone) : ''}</span></td>
      <td>${esc(c.entreprise || '')}</td><td>${(c.etiquettes || []).map(t => `<span class="badge">${esc(t)}</span>`).join(' ')}</td>
      <td class="small">${esc(c.source || '')}</td><td class="small">${fmtDate(String(c.created_at).slice(0, 10))}</td>
      <td class="small">${c.desabonne ? '<span class="badge red">Désabonné</span>' : en.map(x => `${x.statut === 'actif' ? '▶' : x.statut === 'termine' ? '✓' : '■'} ${esc((TN.sequences.find(s => s.id === x.sequence_id) || {}).nom || '')} (${x.etape})`).join('<br>') || '—'}</td>
      <td><button class="btn small" data-tn-cdel="${c.id}" title="Supprimer (demande Loi 25)">🗑</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">Aucun contact pour l’instant. Publie un tunnel et partage son lien!</td></tr>'}
  </tbody></table></div></div>`;
}
function exportContacts() {
  const cols = ['prenom', 'nom', 'courriel', 'telephone', 'entreprise', 'etiquettes', 'source', 'consentement', 'desabonne', 'created_at'];
  const csvCell = v => `"${String(Array.isArray(v) ? v.join(' ') : v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(';'), ...TN.contacts.map(c => cols.map(k => csvCell(c[k])).join(';'))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `contacts-${todayISO()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('tn-search')) { TN.q = e.target.value; render(); const s = $('.tn-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
});
document.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('tn-tagf')) { TN.tag = e.target.value; render(); } });

/* ---------- Onglet Séquences ---------- */
function sequencesTab() {
  const s = TN.sequences.find(x => x.id === TN.seqId);
  if (s) return sequenceEditor(s);
  return `<div class="toolbar"><span class="sp"></span><button class="btn" data-tn-seqai>✨ Rédiger une séquence avec Yahya</button><button class="btn primary" data-tn-seqnew>+ Nouvelle séquence</button></div>
  <div class="tn-list">${TN.sequences.map(x => {
    const en = TN.enroll.filter(e => e.sequence_id === x.id);
    const used = TN.funnels.filter(f => f.sequence_id === x.id).map(f => f.nom);
    const todo = (x.etapes || []).some(e => /COLLE-ICI/.test(e.corps || ''));
    return `<div class="card tn-fcard"><div class="tn-fhead"><div><h3>${esc(x.nom)}</h3><div class="muted small">${(x.etapes || []).length} courriel(s) · sur ${(x.etapes || []).reduce((a, e, i) => a + (Number(e.delai_jours) || 0), 0)} jours${used.length ? ' · utilisée par : ' + used.map(esc).join(', ') : ''}</div></div>
      <span class="badge ${x.actif ? 'green' : 'orange'}">${x.actif ? 'Active' : 'En pause'}</span></div>
      <div class="tn-nums"><span>En cours<b>${en.filter(e => e.statut === 'actif').length}</b></span><span>Terminées<b>${en.filter(e => e.statut === 'termine').length}</b></span><span>Arrêtées<b>${en.filter(e => e.statut === 'arrete').length}</b></span></div>
      ${todo ? '<div class="info warn small">⚠️ Un courriel contient encore « COLLE-ICI… » : remplace-le par ton vrai lien.</div>' : ''}
      <div class="tn-factions"><button class="btn small primary" data-tn-seqedit="${x.id}">✏️ Modifier</button></div></div>`;
  }).join('') || '<div class="card empty">Aucune séquence. Crée un tunnel à partir d’un modèle : sa séquence est créée automatiquement.</div>'}</div>`;
}
function sequenceEditor(s) {
  let cumul = 0;
  return `<div class="toolbar"><button class="btn" data-tn-seqback>← Toutes les séquences</button><span class="sp"></span><span class="muted small" id="tn-seqsaved">${TN.seqDirty ? 'Non enregistré' : '✓ Enregistré'}</span><button class="btn small primary" data-tn-seqsave>💾 Enregistrer</button></div>
  <div class="card"><div class="form-grid">
    <label>Nom de la séquence<input data-tns="nom" value="${esc(s.nom)}"></label>
    <label class="inline" style="align-self:end"><input type="checkbox" data-tns="actif" ${s.actif ? 'checked' : ''} style="width:auto"> Séquence active (décocher = pause)</label>
  </div>
  <p class="muted small">Variables : <code>{{prenom}}</code> <code>{{entreprise}}</code> · <code>**gras**</code> · les liens https deviennent cliquables. Le lien de désabonnement et ton adresse sont ajoutés automatiquement en bas.</p></div>
  ${(s.etapes || []).map((e, i) => { cumul += Number(e.delai_jours) || 0; return `<div class="card tn-step">
    <div class="tn-stephead"><span class="tn-num">${i + 1}</span>
      <label class="inline">Envoyer <input type="number" min="0" max="365" data-tnstep="${i}.delai_jours" value="${Number(e.delai_jours) || 0}" style="width:70px"> jour(s) ${i === 0 ? 'après l’inscription' : 'après le courriel précédent'}</label>
      <span class="muted small">(jour ${cumul})</span><span class="sp"></span>
      <button class="btn small" data-tn-stepmove="${i}:-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn small" data-tn-stepmove="${i}:1" ${i === s.etapes.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="btn small" data-tn-steptest="${i}">📨 M’envoyer un essai</button><button class="btn small" data-tn-stepdel="${i}">✕</button></div>
    <label>Sujet<input data-tnstep="${i}.sujet" value="${esc(e.sujet || '')}"></label>
    <label>Message<textarea data-tnstep="${i}.corps" rows="10">${esc(e.corps || '')}</textarea></label>
    ${/COLLE-ICI/.test(e.corps || '') ? '<div class="info warn small">⚠️ Remplace « COLLE-ICI-LE-LIEN-DU-GUIDE » par le vrai lien de ton guide.</div>' : ''}
  </div>`; }).join('')}
  <div class="toolbar"><button class="btn" data-tn-stepadd>+ Ajouter un courriel</button><span class="sp"></span><button class="btn danger small" data-tn-seqdel="${s.id}">Supprimer la séquence</button></div>`;
}
let seqSaveT = null;
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-tns],[data-tnstep]'); if (!el) return;
  const s = TN.sequences.find(x => x.id === TN.seqId); if (!s) return;
  if (el.dataset.tns) s[el.dataset.tns] = el.type === 'checkbox' ? el.checked : el.value;
  else { const [i, k] = el.dataset.tnstep.split('.'); s.etapes[+i][k] = k === 'delai_jours' ? Math.max(0, Number(el.value) || 0) : el.value; }
  TN.seqDirty = true; const t = $('#tn-seqsaved'); if (t) t.textContent = 'Enregistrement…';
  clearTimeout(seqSaveT); seqSaveT = setTimeout(() => saveSequence(s, true), 1500);
});
async function saveSequence(s, silent) {
  clearTimeout(seqSaveT);
  const { error } = await sb().from('sequences').update({ nom: s.nom, actif: !!s.actif, etapes: s.etapes, updated_at: new Date().toISOString() }).eq('id', s.id);
  const t = $('#tn-seqsaved');
  if (error) { if (t) t.textContent = '⚠ ' + error.message; if (!silent) toast('⚠ ' + error.message); return false; }
  TN.seqDirty = false; if (t) t.textContent = '✓ Enregistré'; if (!silent) toast('Séquence enregistrée ✓'); return true;
}

async function writeSequenceWithAI() {
  modal(`<h2>✨ Rédiger une séquence avec Yahya</h2>
    <label>Objectif de la séquence<textarea id="sq-brief" rows="4" placeholder="Ex. : nouveaux inscrits au guide gratuit. Les amener à réserver un appel de diagnostic. Cible : propriétaires de PME de construction en Mauricie."></textarea></label>
    <label>Nombre de courriels<select id="sq-n"><option>3</option><option selected>4</option><option>5</option></select></label>
    <div id="sq-msg"></div>
    <div class="modal-actions"><span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="sq-go">Rédiger</button></div>`);
  $('#sq-go').onclick = async () => {
    const brief = $('#sq-brief').value.trim(); if (!brief) return;
    const ag = db.agents.find(a => a.key === 'marketing') || db.agents[0];
    const model = ag.model || db.provider.modeleDefaut;
    if (!model) { $('#sq-msg').innerHTML = '<div class="info err small">Choisis d’abord un modèle pour Yahya.</div>'; return; }
    $('#sq-go').disabled = true; $('#sq-go').textContent = '⏳ Yahya rédige…'; window.AI_BUSY = true;
    const n = Number($('#sq-n').value);
    const prompt = `Rédige une séquence de ${n} courriels automatiques pour Stony Automation (automatisation et IA pour PME du Québec, fondateur Taoufik, Trois-Rivières).
Objectif : ${brief}
Règles : français québécois naturel, vouvoiement, courriels courts (80 à 160 mots), un seul appel à l'action par courriel, aucun chiffre ni témoignage inventé, aucun jargon. Utilise {{prenom}} dans la salutation. Signe « — Taoufik\\nStony Automation ». N'ajoute pas de lien de désabonnement (ajouté automatiquement). Pour un lien vers le site, utilise ${location.origin}/site/#diagnostic.
Le premier courriel part le jour 0, les suivants 2 à 4 jours après le précédent.
Réponds UNIQUEMENT avec du JSON valide, sans texte autour : {"nom":"…","etapes":[{"delai_jours":0,"sujet":"…","corps":"…"}]}`;
    try {
      const t0 = Date.now();
      const res = await callAgentApi('POST', '', { model, temperature: 0.6, max_tokens: 3500, messages: [{ role: 'system', content: agentSystem(ag) }, { role: 'user', content: prompt }] });
      const tk = addUsage(ag, res.usage);
      logAgentTime(ag, Date.now() - t0, ag._lastCost, { categorie: 'Prospection / vente', description: 'Séquence de courriels (tunnel)', tokens: tk });
      const m = String(res.content || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('Réponse illisible : réessaie.');
      const j = JSON.parse(m[0]);
      if (!Array.isArray(j.etapes) || !j.etapes.length) throw new Error('Aucun courriel reçu : réessaie.');
      const { data, error } = await sb().from('sequences').insert({ nom: clipStr(j.nom || 'Séquence Yahya', 120), actif: false, etapes: j.etapes.slice(0, 8).map(e => ({ id: uid(), delai_jours: Math.max(0, Number(e.delai_jours) || 0), sujet: clipStr(e.sujet, 200), corps: clipStr(e.corps, 8000) })) }).select().single();
      if (error) throw error;
      TN.sequences.push(data); TN.seqId = data.id; save(); closeModal(); render(); toast('Séquence rédigée ✓ (en pause : relis-la puis active-la)');
    } catch (e) { $('#sq-msg').innerHTML = `<div class="info err small">${esc(e.message)}</div>`; $('#sq-go').disabled = false; $('#sq-go').textContent = 'Rédiger'; }
    window.AI_BUSY = false;
  };
}
const clipStr = (s, n) => String(s == null ? '' : s).slice(0, n);

/* ---------- Onglet Courriels (Brevo) ---------- */
function emailsTab() {
  const s = TN.settings || {};
  const tags = Array.from(new Set(TN.contacts.flatMap(c => c.etiquettes || []))).sort();
  const ready = TN.keyInfo && s.expediteur_courriel && s.adresse_postale;
  const due = TN.enroll.filter(x => x.statut === 'actif' && x.prochain_envoi && Date.parse(x.prochain_envoi) <= Date.now()).length;
  return `<div class="grid cols-2 tn-mail">
  <div class="card"><h3>1. Connexion à Brevo ${TN.keyInfo ? '<span class="badge green">connecté</span>' : '<span class="badge orange">à faire</span>'}</h3>
    <ol class="small tn-steps">
      <li>Crée un compte gratuit sur <a href="https://www.brevo.com/fr/" target="_blank" rel="noopener">brevo.com</a> (300 courriels par jour gratuits).</li>
      <li>Menu <b>Expéditeurs, domaines et IP</b> → <b>Expéditeurs</b> → ajoute ton courriel et clique le lien de confirmation reçu.</li>
      <li>Menu (ton nom en haut à droite) → <b>SMTP et API</b> → onglet <b>Clés API</b> → <b>Générer une nouvelle clé</b>. Copie-la (elle commence par <code>xkeysib-</code>).</li>
      <li>Colle-la ci-dessous. Elle est cachée : même toi tu ne pourras plus la relire ici.</li>
      <li>Important : menu <b>Sécurité</b> → <b>IP autorisées</b> → <b>Désactiver le blocage</b> pour l’API (l’adresse IP de Vercel change à chaque envoi).</li>
    </ol>
    ${TN.keyInfo ? `<p class="small">Clé enregistrée : <code>••••${esc(TN.keyInfo.key_hint || '')}</code> · ${fmtDate(String(TN.keyInfo.updated_at).slice(0, 10))}</p>` : ''}
    <div class="tn-row"><input type="password" id="bv-key" placeholder="${TN.keyInfo ? 'Nouvelle clé (pour la remplacer)' : 'xkeysib-…'}" autocomplete="off"><button class="btn primary" data-tn-savekey>Enregistrer la clé</button></div>
    ${TN.keyInfo ? '<button class="btn small" data-tn-delkey>Retirer la clé</button>' : ''}
  </div>
  <div class="card"><h3>2. Expéditeur ${s.expediteur_courriel && s.adresse_postale ? '<span class="badge green">ok</span>' : '<span class="badge orange">à faire</span>'}</h3>
    <label>Nom affiché<input id="es-nom" value="${esc(s.expediteur_nom || 'Taoufik — Stony Automation')}"></label>
    <label>Courriel d’envoi (le même que confirmé dans Brevo)<input id="es-mail" type="email" value="${esc(s.expediteur_courriel || '')}" placeholder="toi@exemple.com"></label>
    <label>Adresse postale (obligatoire, Loi anti-pourriel)<input id="es-adr" value="${esc(s.adresse_postale || '')}" placeholder="Case postale ou adresse d’affaires, Trois-Rivières (Québec)"><small class="muted">La loi exige une adresse postale valide dans chaque courriel commercial. Une case postale convient.</small></label>
    <div class="tn-row"><button class="btn primary" data-tn-savesettings>Enregistrer</button><button class="btn" data-tn-test ${ready ? '' : 'disabled'}>📨 M’envoyer un essai</button></div>
  </div></div>

  <div class="card"><div class="toolbar" style="margin:0"><h3 style="margin:0">⏱ Envois automatiques</h3><span class="sp"></span><button class="btn small" data-tn-run ${ready ? '' : 'disabled'}>▶ Envoyer maintenant les courriels en attente (${due})</button></div>
    <p class="muted small">Le 1er courriel d’une séquence part dès l’inscription (si son délai est 0). Les suivants partent chaque matin vers 8 h, et aussi quand tu ouvres le tableau de bord.</p></div>

  <div class="card"><h3>📣 Envoyer un courriel à une liste</h3>
    <div class="form-grid">
      <label>Destinataires<select id="bc-tag"><option value="">Tous les abonnés actifs</option>${tags.map(t => `<option>${esc(t)}</option>`).join('')}</select><small class="muted" id="bc-count"></small></label>
      <label>Sujet<input id="bc-sujet" placeholder="Ex. : Nouveau : réponse automatique aux appels manqués"></label>
      <label class="full">Message<textarea id="bc-corps" rows="7" placeholder="Bonjour {{prenom}},&#10;&#10;…&#10;&#10;— Taoufik&#10;Stony Automation"></textarea></label>
    </div>
    <div class="tn-row"><span class="sp"></span><button class="btn primary" data-tn-broadcast ${ready ? '' : 'disabled'}>Envoyer</button></div>
  </div>

  <div class="card"><h3>📜 Journal des envois</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>À</th><th>Sujet</th><th>Type</th><th>Statut</th></tr></thead><tbody>
    ${TN.log.map(l => `<tr><td class="small">${new Date(l.created_at).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="small">${esc(l.courriel || '')}</td><td class="small">${esc(l.sujet || '')}</td><td class="small">${esc(l.type || '')}</td><td>${l.statut === 'envoye' ? '<span class="badge green">envoyé</span>' : `<span class="badge red" title="${esc(l.erreur || '')}">erreur</span><div class="muted small">${esc(l.erreur || '')}</div>`}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun envoi pour l’instant.</td></tr>'}
  </tbody></table></div></div>`;
}
function broadcastCount() {
  const tag = $('#bc-tag') ? $('#bc-tag').value : '';
  return TN.contacts.filter(c => !c.desabonne && c.consentement && (!tag || (c.etiquettes || []).includes(tag))).length;
}
document.addEventListener('change', e => { if (e.target.id === 'bc-tag') $('#bc-count').textContent = broadcastCount() + ' destinataire(s)'; });

/* ---------- Clics ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest && e.target.closest('[data-tn-tab],[data-tn-reload],[data-tn-new],[data-tn-edit],[data-tn-back],[data-tn-save],[data-tn-copy],[data-tn-toggle],[data-tn-del],[data-tn-prev],[data-tn-mobile],[data-tn-export],[data-tn-cdel],[data-tn-seqnew],[data-tn-seqai],[data-tn-seqedit],[data-tn-seqback],[data-tn-seqsave],[data-tn-seqdel],[data-tn-stepadd],[data-tn-stepdel],[data-tn-stepmove],[data-tn-steptest],[data-tn-savekey],[data-tn-delkey],[data-tn-savesettings],[data-tn-test],[data-tn-run],[data-tn-broadcast]');
  if (!t) return;
  const d = t.dataset;
  const cur = () => TN.funnels.find(x => x.id === TN.editId);
  const seq = () => TN.sequences.find(x => x.id === TN.seqId);
  try {
    if (d.tnTab) { e.preventDefault(); if (TN.dirty && cur()) await saveFunnel(cur(), true); TN.tab = d.tnTab; TN.editId = null; TN.seqId = null; render(); }
    else if (d.tnReload !== undefined) { TN.loaded = false; TN.missing = false; render(); await loadTunnels(true); }
    else if (d.tnNew !== undefined) openNewFunnel();
    else if (d.tnEdit) { TN.editId = d.tnEdit; TN.preview = 'capture'; TN.dirty = false; ensurePreviewCss(); render(); window.scrollTo(0, 0); }
    else if (d.tnBack !== undefined) { if (TN.dirty && cur()) await saveFunnel(cur(), true); TN.editId = null; await loadStats(); render(); }
    else if (d.tnSave !== undefined) { const f = cur(); if (f) await saveFunnel(f); }
    else if (d.tnCopy) { try { await navigator.clipboard.writeText(d.tnCopy); toast('Lien copié ✓'); } catch (x) { prompt('Copie ce lien :', d.tnCopy); } }
    else if (d.tnToggle) {
      const f = TN.funnels.find(x => x.id === d.tnToggle); if (!f) return;
      if (!f.actif && !(f.config.capture || {}).titre) return toast('Ajoute au moins un titre avant de publier');
      f.actif = !f.actif;
      if (await saveFunnel(f, true)) { toast(f.actif ? `🚀 Publié : ${funnelUrl(f)}` : 'Tunnel dépublié'); render(); } else f.actif = !f.actif;
    }
    else if (d.tnDel) {
      if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer : supprimer définitivement (statistiques incluses)'; return; }
      const { error } = await sb().from('funnels').delete().eq('id', d.tnDel); if (error) throw error;
      TN.funnels = TN.funnels.filter(x => x.id !== d.tnDel); TN.editId = null; render(); toast('Tunnel supprimé');
    }
    else if (d.tnPrev) { TN.preview = d.tnPrev; render(); }
    else if (d.tnMobile !== undefined) { TN.mobile = !TN.mobile; render(); }
    else if (d.tnExport !== undefined) exportContacts();
    else if (d.tnCdel) {
      if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer'; return; }
      const { error } = await sb().from('contacts').delete().eq('id', d.tnCdel); if (error) throw error;
      TN.contacts = TN.contacts.filter(c => c.id !== d.tnCdel); TN.enroll = TN.enroll.filter(x => x.contact_id !== d.tnCdel); render(); toast('Contact supprimé');
    }
    else if (d.tnSeqnew !== undefined) {
      const { data, error } = await sb().from('sequences').insert({ nom: 'Nouvelle séquence', actif: false, etapes: [{ id: uid(), delai_jours: 0, sujet: 'Bienvenue {{prenom}}!', corps: `Bonjour {{prenom}},\n\nMerci pour votre inscription!\n\n${SIGN}` }] }).select().single();
      if (error) throw error; TN.sequences.push(data); TN.seqId = data.id; render();
    }
    else if (d.tnSeqai !== undefined) writeSequenceWithAI();
    else if (d.tnSeqedit) { TN.seqId = d.tnSeqedit; TN.seqDirty = false; render(); window.scrollTo(0, 0); }
    else if (d.tnSeqback !== undefined) { if (TN.seqDirty && seq()) await saveSequence(seq(), true); TN.seqId = null; render(); }
    else if (d.tnSeqsave !== undefined) { if (seq()) await saveSequence(seq()); }
    else if (d.tnSeqdel) {
      if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer la suppression'; return; }
      const { error } = await sb().from('sequences').delete().eq('id', d.tnSeqdel); if (error) throw error;
      TN.sequences = TN.sequences.filter(x => x.id !== d.tnSeqdel); TN.funnels.forEach(f => { if (f.sequence_id === d.tnSeqdel) f.sequence_id = null; });
      TN.seqId = null; render(); toast('Séquence supprimée');
    }
    else if (d.tnStepadd !== undefined && seq()) { const s = seq(); s.etapes.push({ id: uid(), delai_jours: 3, sujet: '', corps: `Bonjour {{prenom}},\n\n\n\n${SIGN}` }); await saveSequence(s, true); render(); }
    else if (d.tnStepdel && seq()) { const s = seq(); if (s.etapes.length <= 1) return toast('Une séquence doit garder au moins un courriel'); s.etapes.splice(+d.tnStepdel, 1); await saveSequence(s, true); render(); }
    else if (d.tnStepmove && seq()) { const s = seq(); const [i, dir] = d.tnStepmove.split(':').map(Number); const j = i + dir; [s.etapes[i], s.etapes[j]] = [s.etapes[j], s.etapes[i]]; await saveSequence(s, true); render(); }
    else if (d.tnSteptest && seq()) {
      const st = seq().etapes[+d.tnSteptest]; t.disabled = true;
      const r = await funnelApi('test', { sujet: st.sujet, corps: st.corps }); toast(`📨 Essai envoyé à ${r.to}`); t.disabled = false;
    }
    else if (d.tnSavekey !== undefined) {
      const k = $('#bv-key').value.trim(); if (!k) return;
      if (!/^xkeysib-/.test(k)) toast('⚠ Une clé API Brevo commence normalement par « xkeysib- »');
      const { error } = await sb().rpc('set_brevo_key', { p_key: k }); if (error) throw error;
      $('#bv-key').value = ''; const { data } = await sb().rpc('get_brevo_key_info'); TN.keyInfo = (data && data[0]) || null; render(); toast('Clé Brevo enregistrée ✓');
    }
    else if (d.tnDelkey !== undefined) {
      if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer'; return; }
      const { error } = await sb().rpc('delete_brevo_key'); if (error) throw error; TN.keyInfo = null; render(); toast('Clé retirée');
    }
    else if (d.tnSavesettings !== undefined) {
      const row = { owner: Cloud.user.id, expediteur_nom: $('#es-nom').value.trim(), expediteur_courriel: $('#es-mail').value.trim(), adresse_postale: $('#es-adr').value.trim(), updated_at: new Date().toISOString() };
      if (row.expediteur_courriel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.expediteur_courriel)) return toast('Courriel d’envoi invalide');
      const { data, error } = await sb().from('email_settings').upsert(row).select().single(); if (error) throw error;
      TN.settings = data; render(); toast('Réglages enregistrés ✓');
    }
    else if (d.tnTest !== undefined) { t.disabled = true; const r = await funnelApi('test', {}); toast(`📨 Essai envoyé à ${r.to} : vérifie ta boîte (et les indésirables)`); t.disabled = false; }
    else if (d.tnRun !== undefined) { t.disabled = true; const r = await funnelApi('run'); toast(r.erreur ? `⚠ ${r.erreur}` : `${r.envoyes} courriel(s) envoyé(s)`); TN.loaded = false; await loadTunnels(true); }
    else if (d.tnBroadcast !== undefined) {
      const sujet = $('#bc-sujet').value.trim(), corps = $('#bc-corps').value.trim(), etiquette = $('#bc-tag').value;
      if (!sujet || !corps) return toast('Sujet et message obligatoires');
      const n = broadcastCount(); if (!n) return toast('Aucun destinataire');
      if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = `Confirmer l’envoi à ${n} personne(s)`; return; }
      t.disabled = true; t.textContent = 'Envoi…';
      const r = await funnelApi('broadcast', { sujet, corps, etiquette });
      toast(r.erreur ? `⚠ ${r.envoyes}/${r.total} envoyés · ${r.erreur}` : `📣 ${r.envoyes} courriel(s) envoyé(s)`);
      TN.loaded = false; await loadTunnels(true);
    }
  } catch (err) { toast('⚠ ' + (err.message || err)); t.disabled = false; }
});
