'use strict';
/* =========================================================
   Agents IA + Fournisseur de tokens
   Chargé APRÈS app.js. Utilise : db, save, render, VIEWS, NAV,
   ui, Cloud, modal, closeModal, toast, esc, uid, todayISO, ...
   Les appels IA passent par la fonction serveur /api/agent
   (la clé API reste dans Vercel, jamais dans le navigateur).
   ========================================================= */

const AGENT_API = '/api/agent';
const HISTORY_LIMIT = 20; // nombre de messages récents envoyés à l'IA

/* ---------- Agents de départ ---------- */
function defaultAgents() {
  const a = (key, icone, nom, role, prompt, opts = {}) => ({
    id: uid(), key, icone, nom, role, prompt, model: '', temperature: 0.7,
    contexte: true, finances: false, marque: false, ...opts,
    memoire: [], conversations: [], usage: { total: 0, mois: {} }
  });
  return [
    a('marketing', '📣', 'Mentor marketing numérique', 'Stratégie, prospection, LinkedIn, SEO local, contenu',
`Tu es le mentor en marketing numérique B2B de Taoufik, qui lance une agence d'automatisation et d'IA pour les PME de la Mauricie et du Québec (niches : construction / services terrain et usines / maintenance).

Ta façon de travailler :
- Tu donnes des actions concrètes, faisables avec environ 2 heures par jour et sans publicité coûteuse.
- Tu remets en question les hypothèses faibles et tu proposes une façon de mesurer chaque action.
- Tu écris les textes (courriels, messages LinkedIn, pages web) en français québécois professionnel et naturel.
- Pour la prospection par courriel ou message, tu respectes la Loi canadienne anti-pourriel (LCAP) : consentement, identification, désabonnement. Tu le rappelles quand c'est pertinent.
- Tu restes bref et structuré. Tu termines par la prochaine action à faire.`),
    a('finances', '💰', 'Expert finances Québec', 'Dépenses, TPS/TVQ, impôts, tenue de livres, prix',
`Tu es un conseiller en finances pour travailleur autonome et petite entreprise au Québec. Tu aides Taoufik (entreprise individuelle à Trois-Rivières, agence d'automatisation et d'IA en démarrage) à gérer ses dépenses, fixer ses prix, organiser sa tenue de livres et préparer ses déclarations (Revenu Québec, ARC, TPS/TVQ, acomptes provisionnels, dépenses déductibles).

Règles importantes :
- Tu n'es pas comptable (CPA) ni fiscaliste. Pour toute décision fiscale ou déclaration, tu recommandes de faire valider par un professionnel.
- Les seuils, taux et dates changent : tu dis quand une information doit être vérifiée et tu indiques la source officielle à consulter (revenuquebec.ca, canada.ca/arc).
- Tu n'inventes jamais un chiffre. Tu calcules à partir des données fournies et tu montres ton calcul.
- Tu donnes des conseils prudents et pratiques, en français clair, étape par étape.`, { finances: true, temperature: 0.3 }),
    a('technique', '🛠', 'Expert technique et code', 'n8n, API, JavaScript, Python, Supabase, Vercel',
`Tu es l'expert technique de Taoufik : automatisation (n8n), API et webhooks, JavaScript, Python, Supabase, Vercel, intégration de modèles d'IA, RAG.

Ta façon de travailler :
- Taoufik se décrit comme débutant pour l'hébergement et la configuration : explique étape par étape, avec les clics et les commandes exactes.
- Donne du code complet et testé mentalement, avec des commentaires en français.
- Sécurité d'abord : jamais de clé secrète dans le code ou dans GitHub, gestion des erreurs, journalisation, sauvegardes.
- Distingue toujours une démo d'un système prêt pour la production.
- Règle absolue en usine : on automatise l'information et la paperasse, jamais le contrôle des machines ni les systèmes de sécurité.`, { temperature: 0.2 }),
    a('rapports', '📝', 'Rédacteur de rapports', 'Diagnostics, propositions, études de cas, avec ta marque',
`Tu es le rédacteur de rapports de l'agence. Tu rédiges des documents professionnels pour les clients : rapports de diagnostic, propositions de services, études de cas, comptes rendus de rencontre.

Règles :
- Français québécois professionnel, phrases claires, pas de jargon inutile.
- Respecte le profil de marque fourni (nom, ton, structure, signature).
- Structure par défaut : Résumé exécutif, Situation actuelle, Constats, Recommandations (priorisées), Retour sur investissement estimé, Prochaines étapes.
- N'invente jamais de chiffres, de noms ou de résultats : écris [À COMPLÉTER : …] quand une information manque.
- Utilise des titres (##), des listes et du gras pour que le rapport soit facile à lire et à imprimer.`, { marque: true, temperature: 0.5 })
  ];
}

function ensureAgentData(d) {
  if (!Array.isArray(d.agents) || !d.agents.length) d.agents = defaultAgents();
  d.agents.forEach(a => {
    a.memoire = Array.isArray(a.memoire) ? a.memoire : [];
    a.conversations = Array.isArray(a.conversations) ? a.conversations : [];
    a.usage = a.usage || { total: 0, mois: {} };
    a.usage.mois = a.usage.mois || {};
  });
  d.provider = {
    nom: 'Yonsepo', site: 'https://yonsepo.tech/', baseUrl: 'https://yonsepo.tech/v1',
    modeleDefaut: '', budgetMensuel: 0, modeles: [], dernierTest: null,
    ...(d.provider || {})
  };
  d.marque = { nom: '', slogan: '', ton: 'Professionnel, chaleureux, concret', couleurs: '', structure: '', signature: '', ...(d.marque || {}) };
  return d;
}
ensureAgentData(db);

/* ---------- Navigation ---------- */
NAV.push(['agents', 'Agents IA', '🤖'], ['fournisseur', 'Fournisseur de tokens', '🔑']);
if (!SCHEMAS.notes.fields.find(f => f.k === 'source').o.includes('Agent IA')) SCHEMAS.notes.fields.find(f => f.k === 'source').o.push('Agent IA');

const AG = { agentId: null, tab: 'chat', convId: null, busy: false, draft: '', error: '' };
const currentAgent = () => db.agents.find(a => a.id === AG.agentId) || db.agents[0];
const currentConv = a => a.conversations.find(c => c.id === AG.convId) || null;
const monthNow = () => monthKey(todayISO());

/* ---------- Mini rendu Markdown (titres, gras, listes, code) ---------- */
function md(s) {
  return String(s || '').split('```').map((b, i) => {
    if (i % 2 === 1) { const nl = b.indexOf('\n'); return `<pre class="code"><code>${esc(nl >= 0 ? b.slice(nl + 1) : b)}</code></pre>`; }
    let h = esc(b);
    h = h.replace(/^#{3,6} (.*)$/gm, '<h4>$1</h4>').replace(/^#{1,2} (.*)$/gm, '<h3>$1</h3>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/(?:^[-*•] .*(?:\n|$))+/gm, m => '<ul>' + m.trim().split('\n').map(l => `<li>${l.replace(/^[-*•] /, '')}</li>`).join('') + '</ul>');
    h = h.replace(/(?:^\d+[.)] .*(?:\n|$))+/gm, m => '<ol>' + m.trim().split('\n').map(l => `<li>${l.replace(/^\d+[.)] /, '')}</li>`).join('') + '</ol>');
    h = h.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    return h;
  }).join('');
}

/* ---------- Contexte envoyé aux agents ---------- */
function agencyContext(agent) {
  const s = db.settings, mois = monthNow();
  const rev = sumTx('Revenu', t => monthKey(t.date) === mois), dep = sumTx('Dépense', t => monthKey(t.date) === mois);
  const treso = (Number(s.budgetInitial) || 0) + sumTx('Revenu') - sumTx('Dépense');
  const projets = db.projets.filter(p => ['Prospect', 'En cours', 'Actif (récurrent)'].includes(p.statut))
    .map(p => `- ${p.nom} [${p.statut}]${p.client ? ' — client : ' + p.client : ''}${p.prochaine ? ' — prochaine action : ' + p.prochaine : ''}`).join('\n') || '- aucun';
  let txt = `CONTEXTE DE L'AGENCE (au ${fmtDate(todayISO())})
Nom : ${s.agence}
Projets actifs :
${projets}
Finances (en $ CA) : budget de départ ${money(s.budgetInitial)}, revenus ce mois ${money(rev)}, dépenses ce mois ${money(dep)}, trésorerie estimée ${money(treso)}, revenu récurrent ${money(mrr())}/mois (cible ${money(s.revenuCible)}/mois).
Temps : ${hm(minutesThisWeek())} cette semaine sur un objectif de ${s.objectifHeures} h.`;
  if (agent.finances) {
    const tx = [...db.transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30)
      .map(t => `- ${t.date} | ${t.type} | ${t.categorie || '—'} | ${t.description} | ${money(t.montant)}`).join('\n') || '- aucune';
    const since = addDays(-365);
    txt += `\nRevenus des 12 derniers mois : ${money(sumTx('Revenu', t => (t.date || '') >= since))}.
30 dernières transactions :
${tx}`;
  }
  return txt;
}

function brandText() {
  const m = db.marque;
  const lines = [['Nom de l’entreprise', m.nom], ['Slogan', m.slogan], ['Ton', m.ton], ['Couleurs', m.couleurs], ['Structure préférée', m.structure], ['Signature', m.signature]]
    .filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`);
  return lines.length ? 'PROFIL DE MARQUE\n' + lines.join('\n') : '';
}

function buildMessages(agent, conv) {
  let system = agent.prompt || '';
  if (agent.memoire.length) system += '\n\nMÉMOIRE (idées, décisions et faits importants retenus des discussions précédentes) :\n' + agent.memoire.map(m => `- (${m.date}) ${m.texte}`).join('\n');
  if (agent.contexte) system += '\n\n' + agencyContext(agent);
  if (agent.marque) { const b = brandText(); if (b) system += '\n\n' + b; }
  system += `\n\nDate du jour : ${todayISO()}. Réponds en français.`;
  const history = conv.messages.filter(m => !m.error).slice(-HISTORY_LIMIT).map(m => ({ role: m.role, content: m.content }));
  return [{ role: 'system', content: system }, ...history];
}

/* ---------- Appel à la fonction serveur ---------- */
async function callAgentApi(method, query, body) {
  if (!Cloud.user || !Cloud.client) throw new Error('Connexion requise : les agents fonctionnent seulement en mode en ligne (connecté à Supabase).');
  const { data: { session } } = await Cloud.client.auth.getSession();
  if (!session) throw new Error('Session expirée : reconnecte-toi.');
  let r;
  try {
    r = await fetch(AGENT_API + (query || ''), {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new Error('Pas de connexion Internet, ou le site ne répond pas.'); }
  let data = null; try { data = await r.json(); } catch (e) { /* pas du JSON */ }
  if (r.status === 404 && !data) throw new Error('La fonction serveur /api/agent est introuvable. Vérifie que le dossier « api » est sur GitHub et que Vercel a redéployé le site. (Elle ne marche pas en ouvrant index.html directement sur l’ordinateur.)');
  if (!r.ok || !data) {
    const det = data && data.details ? ` — ${typeof data.details === 'string' ? data.details : JSON.stringify(data.details)}` : '';
    throw new Error(((data && data.error) || `Erreur ${r.status}`) + det);
  }
  return data;
}

function addUsage(agent, usage) {
  const n = usage ? Number(usage.total_tokens) || ((Number(usage.prompt_tokens) || 0) + (Number(usage.completion_tokens) || 0)) : 0;
  if (!n) return 0;
  agent.usage.total += n;
  agent.usage.mois[monthNow()] = (agent.usage.mois[monthNow()] || 0) + n;
  return n;
}

async function sendToAgent(text) {
  const agent = currentAgent();
  if (!agent.model && !db.provider.modeleDefaut) { AG.error = 'Choisis d’abord un modèle : onglet « Réglages » de l’agent, ou modèle par défaut dans « Fournisseur de tokens ».'; render(); return; }
  let conv = currentConv(agent);
  if (!conv) {
    conv = { id: uid(), titre: text.slice(0, 60), date: todayISO(), messages: [] };
    agent.conversations.unshift(conv); AG.convId = conv.id;
  }
  conv.messages.push({ role: 'user', content: text, date: new Date().toISOString() });
  AG.draft = ''; AG.busy = true; AG.error = '';
  save(); render(); scrollChat();
  try {
    const res = await callAgentApi('POST', '', { model: agent.model || db.provider.modeleDefaut, temperature: agent.temperature, messages: buildMessages(agent, conv) });
    const tokens = addUsage(agent, res.usage);
    conv.messages.push({ role: 'assistant', content: res.content, date: new Date().toISOString(), tokens, model: res.model });
  } catch (e) {
    AG.error = e.message;
  }
  AG.busy = false; save(); render(); scrollChat();
}

function scrollChat() { const c = $('#ag-chat'); if (c) c.scrollTop = c.scrollHeight; }

async function summarizeToMemory() {
  const agent = currentAgent(); const conv = currentConv(agent);
  if (!conv || !conv.messages.length) { toast('Ouvre d’abord une discussion.'); return; }
  AG.busy = true; AG.error = ''; render();
  try {
    const msgs = buildMessages(agent, conv);
    msgs.push({ role: 'user', content: 'Résume cette discussion en 3 à 6 points courts à garder en mémoire pour nos prochaines discussions : idées retenues, décisions prises, faits importants, prochaines étapes. Une ligne par point, commençant par « - ». Rien d’autre.' });
    const res = await callAgentApi('POST', '', { model: agent.model || db.provider.modeleDefaut, temperature: 0.2, messages: msgs, max_tokens: 600 });
    addUsage(agent, res.usage); save();
    AG.busy = false; render();
    openMemoryEditor(res.content.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).join('\n'), true);
  } catch (e) { AG.busy = false; AG.error = e.message; render(); }
}

function openMemoryEditor(text, multi = false, editId = null) {
  const agent = currentAgent();
  modal(`<h2>${editId ? 'Modifier le souvenir' : 'Garder en mémoire'} — ${esc(agent.nom)}</h2>
    <p class="muted">${multi ? 'Une ligne = un souvenir. Modifie ou supprime des lignes avant d’enregistrer.' : 'Raccourcis le texte pour ne garder que l’essentiel : l’agent le relira à chaque discussion.'}</p>
    <form id="mem-f"><textarea name="t" style="min-height:180px">${esc(text)}</textarea>
      <div class="modal-actions"><span class="sp"></span><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  $('#mem-f').onsubmit = e => {
    e.preventDefault(); const v = e.target.elements.t.value.trim(); if (!v) return;
    if (editId) { const m = agent.memoire.find(x => x.id === editId); if (m) m.texte = v; }
    else (multi ? v.split('\n').map(s => s.trim()).filter(Boolean) : [v]).forEach(t => agent.memoire.push({ id: uid(), date: todayISO(), texte: t }));
    save(); closeModal(); render(); toast('Mémoire mise à jour ✓');
  };
}

/* ---------- Impression d'un rapport avec la marque ---------- */
function printReport(text, agent) {
  const m = db.marque;
  printHTML(`<div style="border-bottom:2pt solid #000;padding-bottom:6pt;margin-bottom:10pt">
      <div style="font-size:15pt;font-weight:700">${esc(m.nom || db.settings.agence)}</div>
      ${m.slogan ? `<div style="font-size:10pt">${esc(m.slogan)}</div>` : ''}
    </div>
    <div class="pmeta">${fmtDate(todayISO())} · ${esc(agent.nom)}</div>
    <div class="report">${md(text)}</div>
    ${m.signature ? `<div style="margin-top:16pt;white-space:pre-wrap">${esc(m.signature)}</div>` : ''}`);
}

/* ---------- Vue : Agents ---------- */
VIEWS.agents = () => {
  const agent = currentAgent(); AG.agentId = agent.id;
  const conv = currentConv(agent);
  const tabs = [['chat', '💬 Discussion'], ['memoire', `🧠 Mémoire (${agent.memoire.length})`], ['reglages', '⚙ Réglages']];
  const offline = !Cloud.user;
  return `
  ${offline ? '<div class="info">Les agents fonctionnent seulement en <b>mode en ligne</b> : configure Supabase (config.js), connecte-toi, puis configure le fournisseur de tokens.</div>' : ''}
  <div class="ag-layout">
    <div class="ag-list">
      ${db.agents.map(a => `<button class="ag-item ${a.id === agent.id ? 'active' : ''}" data-ag-select="${a.id}">
        <span class="ag-ico">${esc(a.icone || '🤖')}</span>
        <span><b>${esc(a.nom)}</b><br><span class="muted">${esc(a.role || '')}</span><br><span class="muted small">🧠 ${a.memoire.length} · 💬 ${a.conversations.length} · ${(a.usage.mois[monthNow()] || 0).toLocaleString('fr-CA')} tokens ce mois</span></span>
      </button>`).join('')}
      <button class="btn" data-ag-new>+ Nouvel agent</button>
    </div>
    <div class="ag-main card">
      <div class="ag-head">
        <div class="ag-title"><span class="ag-ico big">${esc(agent.icone || '🤖')}</span><div><b>${esc(agent.nom)}</b><div class="muted small">Modèle : ${esc(agent.model || db.provider.modeleDefaut || 'non choisi')}</div></div></div>
        <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${AG.tab === k ? 'active' : ''}" data-ag-tab="${k}">${l}</button>`).join('')}</div>
      </div>
      ${AG.tab === 'chat' ? chatTab(agent, conv) : AG.tab === 'memoire' ? memoryTab(agent) : settingsTab(agent)}
    </div>
  </div>`;
};

function chatTab(agent, conv) {
  return `
  <div class="toolbar">
    <select id="ag-conv"><option value="">— Nouvelle discussion —</option>${agent.conversations.map(c => `<option value="${c.id}" ${conv && c.id === conv.id ? 'selected' : ''}>${esc(fmtDate(c.date))} · ${esc(c.titre)}</option>`).join('')}</select>
    <button class="btn" data-ag-newconv>+ Nouvelle</button>
    ${conv ? `<button class="btn" data-ag-summary ${AG.busy ? 'disabled' : ''}>🧠 Résumer en mémoire</button><button class="btn danger" data-ag-delconv>Supprimer</button>` : ''}
  </div>
  <div class="ag-chat" id="ag-chat">
    ${conv && conv.messages.length ? conv.messages.map((m, i) => `
      <div class="msg ${m.role}">
        <div class="bubble">${m.role === 'assistant' ? md(m.content) : esc(m.content).replace(/\n/g, '<br>')}</div>
        ${m.role === 'assistant' ? `<div class="msg-actions">
          <button class="btn small" data-ag-mem="${i}">📌 Mémoire</button>
          <button class="btn small" data-ag-note="${i}">📝 Note</button>
          <button class="btn small" data-ag-print="${i}">🖨 PDF</button>
          <button class="btn small" data-ag-copy="${i}">⧉ Copier</button>
          ${m.tokens ? `<span class="muted small">${m.tokens.toLocaleString('fr-CA')} tokens</span>` : ''}
        </div>` : ''}
      </div>`).join('') : `<div class="empty">Pose ta première question à ${esc(agent.nom)}.<br><span class="small">Il connaît ta mémoire${agent.contexte ? ', tes projets et tes chiffres' : ''}${agent.marque ? ' et ta marque' : ''}.</span></div>`}
    ${AG.busy ? '<div class="msg assistant"><div class="bubble typing">L’agent réfléchit…</div></div>' : ''}
  </div>
  ${AG.error ? `<div class="ag-error">⚠ ${esc(AG.error)}</div>` : ''}
  <form id="ag-send" class="composer">
    <textarea id="ag-input" placeholder="Écris ton message… (Ctrl + Entrée pour envoyer)" ${AG.busy ? 'disabled' : ''}>${esc(AG.draft)}</textarea>
    <button class="btn primary" ${AG.busy ? 'disabled' : ''}>Envoyer</button>
  </form>
  <p class="muted small">Ne colle pas de renseignements personnels de clients (Loi 25) : les messages sont envoyés au fournisseur de tokens.</p>`;
}

function memoryTab(agent) {
  return `
  <p class="muted">Ce que l’agent relit au début de <b>chaque</b> discussion. Garde des phrases courtes : idées, décisions, faits importants.</p>
  <ul class="list">${agent.memoire.map(m => `<li><span style="flex:1"><span class="muted small">${esc(fmtDate(m.date))}</span><br>${esc(m.texte)}</span>
    <span style="display:flex;gap:6px"><button class="btn small" data-ag-memedit="${m.id}">Modifier</button><button class="btn small danger" data-ag-memdel="${m.id}">✕</button></span></li>`).join('') || '<li class="muted">Mémoire vide. Utilise « 📌 Mémoire » sur une réponse, ou « 🧠 Résumer en mémoire ».</li>'}</ul>
  <form id="ag-memadd" style="margin-top:12px;display:flex;gap:8px"><input name="t" placeholder="Ajouter un souvenir (ex. : Mon client construction manque ~10 appels / semaine)"><button class="btn primary">Ajouter</button></form>`;
}

function settingsTab(agent) {
  const models = db.provider.modeles || [];
  const m = db.marque;
  return `
  <datalist id="ag-models">${models.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <form id="ag-set" class="form-grid">
    <label>Nom<input name="nom" value="${esc(agent.nom)}" required></label>
    <label>Icône (émoji)<input name="icone" value="${esc(agent.icone || '')}" maxlength="4"></label>
    <label class="full">Rôle (court)<input name="role" value="${esc(agent.role || '')}"></label>
    <label>Modèle<input name="model" list="ag-models" value="${esc(agent.model || '')}" placeholder="${esc(db.provider.modeleDefaut ? 'défaut : ' + db.provider.modeleDefaut : 'ex. nom du modèle')}"></label>
    <label>Créativité (0 = précis, 1 = créatif)<input name="temperature" type="number" min="0" max="1.5" step="0.1" value="${esc(agent.temperature)}"></label>
    <label class="full">Instructions de l’agent (son rôle, ses règles)<textarea name="prompt" style="min-height:220px">${esc(agent.prompt)}</textarea></label>
    <label class="full chk"><input type="checkbox" name="contexte" ${agent.contexte ? 'checked' : ''}> Donner à l’agent le contexte de l’agence (projets, chiffres du mois, temps)</label>
    <label class="full chk"><input type="checkbox" name="finances" ${agent.finances ? 'checked' : ''}> Ajouter le détail des 30 dernières transactions</label>
    <label class="full chk"><input type="checkbox" name="marque" ${agent.marque ? 'checked' : ''}> Utiliser le profil de marque</label>
    ${agent.marque ? `
    <div class="full brand-box"><h3>🎨 Profil de marque (partagé par tous les agents qui l’utilisent)</h3>
      <div class="form-grid">
        <label>Nom de l’entreprise<input name="b_nom" value="${esc(m.nom)}"></label>
        <label>Slogan<input name="b_slogan" value="${esc(m.slogan)}"></label>
        <label>Ton<input name="b_ton" value="${esc(m.ton)}"></label>
        <label>Couleurs<input name="b_couleurs" value="${esc(m.couleurs)}" placeholder="ex. bleu #2f5bea, gris foncé"></label>
        <label class="full">Structure préférée des rapports<textarea name="b_structure">${esc(m.structure)}</textarea></label>
        <label class="full">Signature<textarea name="b_signature" placeholder="Taoufik …&#10;Téléphone · courriel · site">${esc(m.signature)}</textarea></label>
      </div></div>` : ''}
    <div class="modal-actions full">
      <button type="button" class="btn danger" data-ag-del>Supprimer l’agent</button>
      <button type="button" class="btn" data-ag-clearmem>Vider la mémoire</button>
      <span class="sp"></span><button class="btn primary">Enregistrer</button>
    </div>
  </form>`;
}

/* ---------- Vue : Fournisseur de tokens ---------- */
VIEWS.fournisseur = () => {
  const p = db.provider; const mois = monthNow();
  const used = db.agents.reduce((s, a) => s + (a.usage.mois[mois] || 0), 0);
  const total = db.agents.reduce((s, a) => s + (a.usage.total || 0), 0);
  const t = p.dernierTest;
  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Tokens ce mois</div><div class="value">${used.toLocaleString('fr-CA')}</div>
      ${p.budgetMensuel ? `<div class="sub">budget : ${Number(p.budgetMensuel).toLocaleString('fr-CA')}</div><div class="bar ${used > p.budgetMensuel ? 'warn' : ''}"><span style="width:${pct(used, p.budgetMensuel)}%"></span></div>` : '<div class="sub">aucun budget défini</div>'}</div>
    <div class="card kpi"><div class="label">Tokens au total</div><div class="value">${total.toLocaleString('fr-CA')}</div></div>
    <div class="card kpi"><div class="label">Connexion</div><div class="value" style="font-size:18px">${t ? (t.ok ? '✅ OK' : '⚠ Erreur') : '— Pas testée'}</div><div class="sub">${t ? esc(fmtDate(t.date)) + (t.ok ? ` · ${t.count} modèles` : '') : ''}</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card"><h3>🔑 Fournisseur</h3>
      <form id="prov-f" class="form-grid">
        <label>Nom<input name="nom" value="${esc(p.nom)}"></label>
        <label>Site<input name="site" type="url" value="${esc(p.site)}"></label>
        <label class="full">Adresse de l’API (base URL)<input name="baseUrl" value="${esc(p.baseUrl)}"></label>
        <label>Modèle par défaut<input name="modeleDefaut" list="prov-models" value="${esc(p.modeleDefaut)}" placeholder="choisis après le test"></label>
        <label>Budget de tokens par mois (0 = aucun)<input name="budgetMensuel" type="number" min="0" step="1000" value="${esc(p.budgetMensuel)}"></label>
        <datalist id="prov-models">${(p.modeles || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="modal-actions full"><button type="button" class="btn" id="prov-test">🔌 Tester la connexion et charger les modèles</button><span class="sp"></span><button class="btn primary">Enregistrer</button></div>
      </form>
      ${t && !t.ok ? `<div class="ag-error">⚠ ${esc(t.message)}</div>` : ''}
      ${p.modeles && p.modeles.length ? `<details style="margin-top:10px"><summary>${p.modeles.length} modèles disponibles</summary><div class="small" style="margin-top:6px">${p.modeles.map(esc).join(' · ')}</div></details>` : ''}
    </div>
    <div class="card"><h3>🔒 Clé API</h3>${keyCard()}</div>
  </div>
  <div class="card" style="margin-top:14px"><h3>Consommation par agent</h3>
    <div class="table-wrap"><table><thead><tr><th>Agent</th><th>Modèle</th><th>Discussions</th><th>Mémoire</th><th class="num">Tokens ce mois</th><th class="num">Total</th></tr></thead>
    <tbody>${db.agents.map(a => `<tr><td>${esc(a.icone)} ${esc(a.nom)}</td><td>${esc(a.model || p.modeleDefaut || '—')}</td><td>${a.conversations.length}</td><td>${a.memoire.length}</td><td class="num">${(a.usage.mois[mois] || 0).toLocaleString('fr-CA')}</td><td class="num">${(a.usage.total || 0).toLocaleString('fr-CA')}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
};

/* ---------- Clé API (gardée dans Supabase, jamais relue par le navigateur) ---------- */
const KEYSTATE = { loaded: false, loading: false, info: null, error: '' };

function rpcError(err) {
  const m = String((err && (err.message || err.details)) || err || '');
  if (/function .*does not exist|Could not find the function|PGRST202|schema cache/i.test(m)) return 'Les fonctions de la clé sont introuvables : exécute le fichier supabase-cle-api.sql dans Supabase (SQL Editor → New query → Run).';
  if (/trop courte/i.test(m)) return 'Clé trop courte : vérifie que tu l’as copiée en entier.';
  return m || 'Erreur inconnue.';
}

async function loadKeyInfo() {
  if (!Cloud.user || !Cloud.client || KEYSTATE.loading) return;
  KEYSTATE.loading = true;
  try {
    const { data, error } = await Cloud.client.rpc('get_provider_key_info');
    if (error) throw error;
    KEYSTATE.info = Array.isArray(data) ? (data[0] || null) : (data || null);
    KEYSTATE.error = '';
  } catch (e) { KEYSTATE.error = rpcError(e); }
  KEYSTATE.loading = false; KEYSTATE.loaded = true;
  if (location.hash === '#fournisseur') render();
}

function keyCard() {
  if (!Cloud.user) return '<p class="muted">Connecte-toi (mode en ligne) pour gérer la clé.</p>';
  if (!KEYSTATE.loaded) { setTimeout(loadKeyInfo, 0); return '<p class="muted">Chargement…</p>'; }
  const i = KEYSTATE.info;
  return `
    ${KEYSTATE.error ? `<div class="ag-error">⚠ ${esc(KEYSTATE.error)}</div>` : ''}
    <p>${i ? `✅ Clé enregistrée : <b>••••${esc(i.key_hint || '')}</b><br><span class="muted small">Modifiée le ${esc(fmtDate(String(i.updated_at || '').slice(0, 10)))}${i.base_url ? ' · adresse : ' + esc(i.base_url) : ''}</span>` : '⚠ Aucune clé enregistrée.'}</p>
    <form id="key-f" class="form-grid">
      <label class="full">${i ? 'Remplacer par une nouvelle clé' : 'Coller ta clé API Yonsepo'}<input name="k" type="password" autocomplete="off" spellcheck="false" placeholder="colle la clé ici" required></label>
      <div class="modal-actions full">${i ? '<button type="button" class="btn danger" id="key-del">Supprimer la clé</button>' : ''}<span class="sp"></span><button class="btn primary">Enregistrer la clé</button></div>
    </form>
    <p class="muted small">La clé est envoyée à ta base de données Supabase. Ce tableau de bord ne peut <b>pas</b> la relire (il affiche seulement les 4 derniers caractères). Seule la fonction serveur Vercel l’utilise, pour un utilisateur connecté.</p>
    <details class="small"><summary>Réglage unique dans Vercel (une seule fois)</summary>
      <ol class="steps"><li>Vercel → projet → <b>Settings → Environment Variables</b>.</li>
      <li><code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> = les valeurs de config.js.</li>
      <li><code>SUPABASE_SERVICE_ROLE_KEY</code> = la clé « service_role » ou « secret » de Supabase (Project Settings → API Keys). Elle va <b>seulement</b> dans Vercel, jamais dans config.js.</li>
      <li><b>Deployments → ⋯ → Redeploy</b>.</li></ol>
    </details>`;
}

async function saveKey(form) {
  const k = form.elements.k.value.trim(); if (!k) return;
  const b = $('button.primary', form); b.disabled = true; b.textContent = 'Enregistrement…';
  const { error } = await Cloud.client.rpc('set_provider_key', { p_key: k, p_base_url: db.provider.baseUrl || null });
  form.elements.k.value = '';
  if (error) { KEYSTATE.error = rpcError(error); render(); return; }
  KEYSTATE.loaded = false; db.provider.dernierTest = null; save();
  toast('Clé enregistrée ✓ Teste la connexion.');
  await loadKeyInfo(); render();
}

async function deleteKey(btn) {
  if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.textContent = 'Confirmer la suppression'; return; }
  const { error } = await Cloud.client.rpc('delete_provider_key');
  if (error) { KEYSTATE.error = rpcError(error); render(); return; }
  KEYSTATE.loaded = false; toast('Clé supprimée'); await loadKeyInfo(); render();
}

async function testProvider() {
  const p = db.provider; const b = $('#prov-test'); if (b) { b.disabled = true; b.textContent = 'Test en cours…'; }
  try {
    const r = await callAgentApi('GET', '?action=models');
    p.modeles = r.models || []; p.dernierTest = { ok: true, date: todayISO(), count: p.modeles.length };
    if (!p.modeleDefaut && p.modeles.length) p.modeleDefaut = p.modeles[0];
    toast(`Connexion OK ✓ ${p.modeles.length} modèles`);
  } catch (e) {
    p.dernierTest = { ok: false, date: todayISO(), message: e.message };
  }
  save(); render();
}

/* ---------- Événements ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || $('#modal-backdrop').contains(t)) return;
  const d = t.dataset; const agent = currentAgent();
  if (d.agSelect) { AG.agentId = d.agSelect; AG.convId = null; AG.error = ''; AG.tab = 'chat'; render(); scrollChat(); }
  else if (d.agTab) { AG.tab = d.agTab; render(); if (AG.tab === 'chat') scrollChat(); }
  else if ('agNewconv' in d) { AG.convId = null; AG.error = ''; render(); $('#ag-input') && $('#ag-input').focus(); }
  else if ('agDelconv' in d) {
    if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer'; return; }
    agent.conversations = agent.conversations.filter(c => c.id !== AG.convId); AG.convId = null; save(); render();
  }
  else if ('agSummary' in d) summarizeToMemory();
  else if (d.agMem !== undefined) { const m = currentConv(agent).messages[+d.agMem]; openMemoryEditor(m.content.slice(0, 1500)); }
  else if (d.agNote !== undefined) {
    const conv = currentConv(agent); const m = conv.messages[+d.agNote];
    db.notes.push({ id: uid(), titre: `${agent.nom} — ${conv.titre}`.slice(0, 120), date: todayISO(), source: 'Agent IA', tags: 'agent', contenu: m.content });
    save(); toast('Enregistré dans Notes ✓');
  }
  else if (d.agPrint !== undefined) { const m = currentConv(agent).messages[+d.agPrint]; printReport(m.content, agent); }
  else if (d.agCopy !== undefined) {
    const m = currentConv(agent).messages[+d.agCopy];
    (navigator.clipboard ? navigator.clipboard.writeText(m.content) : Promise.reject()).then(() => toast('Copié ✓'), () => toast('Copie impossible : sélectionne le texte à la main.'));
  }
  else if (d.agMemedit) { const m = agent.memoire.find(x => x.id === d.agMemedit); if (m) openMemoryEditor(m.texte, false, m.id); }
  else if (d.agMemdel) { agent.memoire = agent.memoire.filter(x => x.id !== d.agMemdel); save(); render(); }
  else if ('agClearmem' in d) {
    if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer : vider la mémoire'; return; }
    agent.memoire = []; save(); render(); toast('Mémoire vidée');
  }
  else if ('agDel' in d) {
    if (db.agents.length <= 1) { toast('Garde au moins un agent.'); return; }
    if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer la suppression'; return; }
    db.agents = db.agents.filter(a => a.id !== agent.id); AG.agentId = null; AG.tab = 'chat'; save(); render();
  }
  else if ('agNew' in d) {
    const a = { id: uid(), key: 'perso', icone: '🤖', nom: 'Nouvel agent', role: '', prompt: 'Tu es un assistant expert. Décris ici son rôle et ses règles.', model: '', temperature: 0.7, contexte: true, finances: false, marque: false, memoire: [], conversations: [], usage: { total: 0, mois: {} } };
    db.agents.push(a); AG.agentId = a.id; AG.tab = 'reglages'; save(); render();
  }
  else if (t.id === 'prov-test') testProvider();
  else if (t.id === 'key-del') deleteKey(t);
});

document.addEventListener('change', e => {
  if (e.target.id === 'ag-conv') { AG.convId = e.target.value || null; AG.error = ''; render(); scrollChat(); }
});
document.addEventListener('input', e => { if (e.target.id === 'ag-input') AG.draft = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.target.id === 'ag-input' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#ag-send').requestSubmit(); }
});

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'ag-send') {
    e.preventDefault(); const v = $('#ag-input').value.trim(); if (!v || AG.busy) return; sendToAgent(v);
  } else if (f.id === 'ag-memadd') {
    e.preventDefault(); const v = f.elements.t.value.trim(); if (!v) return;
    currentAgent().memoire.push({ id: uid(), date: todayISO(), texte: v }); save(); render();
  } else if (f.id === 'ag-set') {
    e.preventDefault(); const a = currentAgent(); const el = f.elements;
    a.nom = el.nom.value.trim() || a.nom; a.icone = el.icone.value.trim(); a.role = el.role.value.trim();
    a.model = el.model.value.trim(); a.temperature = Number(el.temperature.value) || 0;
    a.prompt = el.prompt.value; a.contexte = el.contexte.checked; a.finances = el.finances.checked;
    const hadBrand = a.marque; a.marque = el.marque.checked;
    if (hadBrand && el.b_nom) for (const k of ['nom', 'slogan', 'ton', 'couleurs', 'structure', 'signature']) db.marque[k] = el['b_' + k].value.trim();
    save(); render(); toast('Agent enregistré ✓');
  } else if (f.id === 'key-f') {
    e.preventDefault(); saveKey(f);
  } else if (f.id === 'prov-f') {
    e.preventDefault(); const el = f.elements; const p = db.provider;
    const oldBase = p.baseUrl;
    p.nom = el.nom.value.trim(); p.site = el.site.value.trim(); p.baseUrl = el.baseUrl.value.trim().replace(/\/+$/, '');
    if (p.baseUrl !== oldBase && Cloud.user && KEYSTATE.info) {
      Cloud.client.rpc('set_provider_base_url', { p_base_url: p.baseUrl || null }).then(({ error }) => { if (error) toast('⚠ ' + rpcError(error)); else { KEYSTATE.loaded = false; loadKeyInfo(); } });
    }
    p.modeleDefaut = el.modeleDefaut.value.trim(); p.budgetMensuel = Number(el.budgetMensuel.value) || 0;
    save(); render(); toast('Fournisseur enregistré ✓');
  }
});
