'use strict';
/* =========================================================
   CROISSANCE : 🎯 Prospection + 🩺 Diagnostic client
   Chargé APRÈS documents.js et AVANT brand.js.
   Utilise : db, save, render, VIEWS, NAV, SCHEMAS, modal, toast,
   callAgentApi, agentSystem, addUsage, logAgentTime, md, ...
   ========================================================= */

const ETAPES = ['À contacter', 'Contacté', 'Rendez-vous prévu', 'Diagnostic proposé', 'Client', 'Pas intéressé'];
const ETAPES_ACTIVES = ETAPES.filter(e => !['Client', 'Pas intéressé'].includes(e));
const SOURCES = ['Réseau perso', 'Ancien collègue', 'LinkedIn', 'Référence', 'Événement', 'Autre'];
const CONSENTEMENTS = ['Relation existante', 'Consentement exprès', 'Consentement implicite (publié)', 'Inconnu'];
const TYPES_CONTACT = ['Appel', 'Courriel', 'LinkedIn', 'SMS', 'Rencontre', 'Note'];
const TYPES_MESSAGE = ['Premier contact', 'Relance', 'Après la rencontre', 'Proposer un diagnostic', 'Remerciement'];
const CANAUX = ['Courriel', 'LinkedIn', 'SMS'];
const OBJECTIF_CONTACTS_SEMAINE = 10;

SCHEMAS.prospects = {
  single: 'prospect', filter: 'etape',
  cols: ['entreprise', 'contact', 'etape', 'niche', 'prochaineRelance', 'valeurPotentielle'],
  fields: [
    { k: 'entreprise', l: 'Entreprise', t: 'text', req: true },
    { k: 'contact', l: 'Personne contact', t: 'text' },
    { k: 'poste', l: 'Poste', t: 'text' },
    { k: 'courriel', l: 'Courriel', t: 'email' },
    { k: 'telephone', l: 'Téléphone', t: 'tel' },
    { k: 'linkedin', l: 'Profil LinkedIn', t: 'url' },
    { k: 'ville', l: 'Ville', t: 'text', def: 'Trois-Rivières' },
    { k: 'niche', l: 'Niche', t: 'select', o: NICHES },
    { k: 'source', l: 'Source', t: 'select', o: SOURCES, def: 'Réseau perso' },
    { k: 'etape', l: 'Étape', t: 'select', o: ETAPES, def: 'À contacter' },
    { k: 'prochaineRelance', l: 'Prochaine relance', t: 'date' },
    { k: 'consentement', l: 'Consentement (LCAP)', t: 'select', o: CONSENTEMENTS, def: 'Relation existante' },
    { k: 'valeurPotentielle', l: 'Valeur potentielle ($)', t: 'number', money: true },
    { k: 'notes', l: 'Notes (pas de renseignements sensibles)', t: 'textarea', full: true }
  ]
};

function ensureGrowthData(d) {
  d.prospects = Array.isArray(d.prospects) ? d.prospects : [];
  d.diagnostics = Array.isArray(d.diagnostics) ? d.diagnostics : [];
  d.prospects.forEach(p => { p.historique = Array.isArray(p.historique) ? p.historique : []; if (!p.etape) p.etape = 'À contacter'; });
  return d;
}
ensureGrowthData(db);
// migrate() appelle ensureAgentData : on y ajoute nos données (rechargement, nuage, import)
if (typeof ensureAgentData === 'function') {
  const _ead = ensureAgentData;
  ensureAgentData = function (d) { _ead(d); return ensureGrowthData(d); };
}

NAV.splice(NAV.findIndex(n => n[0] === 'projets'), 0, ['prospection', 'Prospection', '🎯'], ['diagnostics', 'Diagnostics clients', '🩺']);

/* ---------- Utilitaires ---------- */
const prospectById = id => db.prospects.find(p => p.id === id);
const isActiveProspect = p => ETAPES_ACTIVES.includes(p.etape || 'À contacter');
const relanceDue = p => isActiveProspect(p) && p.prochaineRelance && daysUntil(p.prochaineRelance) <= 0;
const dueProspects = () => db.prospects.filter(relanceDue).sort((a, b) => a.prochaineRelance.localeCompare(b.prochaineRelance));
function contactsThisWeek() {
  const ws = weekStart();
  return db.prospects.reduce((s, p) => s + (p.historique || []).filter(h => h.type !== 'Note' && (h.date || '') >= ws).length, 0);
}
function agentByKey(key) { return db.agents.find(a => a.key === key) || db.agents[0]; }
function modelOf(a) { return a.model || db.provider.modeleDefaut; }

/* ---------- Échéances du tableau de bord + pastille du menu ---------- */
{
  const _dl = deadlines;
  deadlines = function () {
    const out = _dl();
    db.prospects.filter(p => isActiveProspect(p) && p.prochaineRelance && daysUntil(p.prochaineRelance) <= 30)
      .forEach(p => out.push({ date: p.prochaineRelance, label: `${p.entreprise}${p.contact ? ' (' + p.contact + ')' : ''}`, kind: 'Relance', col: 'prospects', id: p.id }));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };
}
{
  const _dn = decorateNav;
  decorateNav = function () {
    _dn();
    const link = $('#nav a[href="#prospection"]'); if (!link) return;
    const n = dueProspects().length;
    let b = $('.nav-badge', link);
    if (n) { if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; link.appendChild(b); } b.textContent = n; }
    else if (b) b.remove();
  };
}
// Un clic sur une relance (tableau de bord) ouvre la fiche du prospect
document.addEventListener('click', e => {
  const ed = e.target.closest && e.target.closest('[data-edit="prospects"]');
  if (ed && !$('#modal-backdrop').contains(ed)) { e.stopImmediatePropagation(); openProspect(ed.dataset.id); }
}, true);

/* =========================================================
   🎯 PROSPECTION
   ========================================================= */
const PR = { q: '', busy: null, error: '', draft: {}, msgType: {}, canal: {} };

VIEWS.prospection = () => {
  const items = db.prospects.filter(p => !PR.q || Object.values(p).join(' ').toLowerCase().includes(PR.q.toLowerCase()));
  const actifs = db.prospects.filter(isActiveProspect);
  const due = dueProspects();
  const clients = db.prospects.filter(p => p.etape === 'Client').length;
  const fermes = clients + db.prospects.filter(p => p.etape === 'Pas intéressé').length;
  const pipe = actifs.reduce((s, p) => s + (Number(p.valeurPotentielle) || 0), 0);
  const cw = contactsThisWeek();
  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Contacts cette semaine</div><div class="value">${cw} / ${OBJECTIF_CONTACTS_SEMAINE}</div><div class="bar ${cw >= OBJECTIF_CONTACTS_SEMAINE ? 'ok' : ''}"><span style="width:${pct(cw, OBJECTIF_CONTACTS_SEMAINE)}%"></span></div></div>
    <div class="card kpi"><div class="label">Relances à faire</div><div class="value ${due.length ? 'neg' : ''}">${due.length}</div><div class="sub">aujourd’hui ou en retard</div></div>
    <div class="card kpi"><div class="label">Prospects actifs</div><div class="value">${actifs.length}</div><div class="sub">${db.prospects.filter(p => p.etape === 'Rendez-vous prévu').length} rendez-vous prévu(s)</div></div>
    <div class="card kpi"><div class="label">Valeur du pipeline</div><div class="value">${money(pipe)}</div><div class="sub">taux de conversion : ${fermes ? pct(clients, fermes) : 0} %</div></div>
  </div>
  ${due.length ? `<div class="card relances"><h3>📞 Relances à faire</h3><ul class="list">${due.map(p => `<li class="clickable" data-pr-open="${p.id}"><span><b>${esc(p.entreprise)}</b>${p.contact ? ' · ' + esc(p.contact) : ''} ${badge(p.etape)}</span><span class="muted small">${daysUntil(p.prochaineRelance) < 0 ? `<span class="badge red">${-daysUntil(p.prochaineRelance)} j de retard</span>` : 'aujourd’hui'}</span></li>`).join('')}</ul></div>` : ''}
  <div class="toolbar">
    <input class="pr-search" placeholder="Rechercher un prospect…" value="${esc(PR.q)}">
    <button class="btn" data-pr-import>⬆ Importer (CSV)</button>
    <button class="btn primary" data-add="prospects">+ Prospect</button>
  </div>
  <p class="muted" style="margin-top:-4px">Glisse une carte pour changer d’étape. Clique sur une carte pour ouvrir la fiche : historique, message écrit par Yahya, diagnostic, conversion en client.</p>
  <div class="kanban pipe">${ETAPES.map(s => {
    const list = items.filter(p => (p.etape || 'À contacter') === s)
      .sort((a, b) => (a.prochaineRelance || '9999').localeCompare(b.prochaineRelance || '9999'));
    return `<div class="pcol" data-etape="${esc(s)}">
      <div class="kcol-head"><span>${esc(s)} <span class="muted">(${list.length})</span></span></div>
      ${list.map(p => `<div class="pcard ${relanceDue(p) ? 'due' : ''}" draggable="true" data-pr-open="${p.id}">
        <div class="t">${esc(p.entreprise)}</div>
        <div class="m">${[p.contact, p.poste].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="m">${[p.niche, p.source].filter(Boolean).map(esc).join(' · ')}</div>
        ${p.valeurPotentielle ? `<div class="m">${money(p.valeurPotentielle)}</div>` : ''}
        ${p.prochaineRelance && isActiveProspect(p) ? `<div class="next">📅 Relance : ${fmtDate(p.prochaineRelance)}${relanceDue(p) ? ' <span class="badge red">à faire</span>' : ''}</div>` : ''}
        ${(p.historique || []).length ? `<div class="m">🗂 ${p.historique.length} échange(s)</div>` : ''}
      </div>`).join('') || '<div class="muted small empty">—</div>'}
    </div>`;
  }).join('')}</div>`;
};

document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('pr-search')) {
    PR.q = e.target.value; render();
    const s = $('.pr-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
});

/* Glisser-déposer des cartes de prospect */
let prDrag = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.pcard'); if (c) { prDrag = c.dataset.prOpen; e.dataTransfer.effectAllowed = 'move'; } });
document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.pcol'); if (col && prDrag) { e.preventDefault(); $$('.pcol').forEach(k => k.classList.toggle('over', k === col)); } });
document.addEventListener('dragend', () => { prDrag = null; $$('.pcol').forEach(k => k.classList.remove('over')); });
document.addEventListener('drop', e => {
  const col = e.target.closest && e.target.closest('.pcol'); if (!col || !prDrag) return;
  e.preventDefault(); const p = prospectById(prDrag); prDrag = null;
  if (p) setEtape(p, col.dataset.etape);
  render();
});

function setEtape(p, etape) {
  if (!p || p.etape === etape) return;
  p.etape = etape;
  p.historique.push({ id: uid(), date: todayISO(), type: 'Note', texte: `Étape → ${etape}` });
  save(); toast(`Étape : ${etape}`);
}

/* ---------- Fiche prospect ---------- */
function openProspect(id) {
  const p = prospectById(id); if (!p) return;
  const mt = PR.msgType[id] || (p.etape === 'À contacter' ? 'Premier contact' : p.etape === 'Rendez-vous prévu' ? 'Après la rencontre' : 'Relance');
  const canal = PR.canal[id] || (p.courriel ? 'Courriel' : p.linkedin ? 'LinkedIn' : 'Courriel');
  const draft = PR.draft[id] || '';
  const lcapWarn = ['Courriel', 'SMS'].includes(canal) && (!p.consentement || p.consentement === 'Inconnu');
  const diag = db.diagnostics.find(d => d.prospectId === p.id);
  const yahya = agentByKey('marketing');
  modal(`<div class="pr-head">
      <div><h2 style="margin:0">${esc(p.entreprise)}</h2>
      <div class="muted">${[p.contact, p.poste, p.ville].filter(Boolean).map(esc).join(' · ') || '—'}</div>
      <div class="pr-links">${p.courriel ? `<a href="mailto:${esc(p.courriel)}">✉️ ${esc(p.courriel)}</a>` : ''}${p.telephone ? `<a href="tel:${esc(p.telephone)}">📞 ${esc(p.telephone)}</a>` : ''}${p.linkedin ? `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">in LinkedIn ↗</a>` : ''}</div></div>
      <label class="pr-etape">Étape<select id="pr-etape">${ETAPES.map(s => `<option ${s === p.etape ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    </div>
    <div class="pr-row">
      <span class="muted">Prochaine relance : <b>${p.prochaineRelance ? fmtDate(p.prochaineRelance) : 'aucune'}</b></span>
      <span class="sp"></span>
      ${[3, 7, 14].map(n => `<button class="btn small" data-pr-relance="${n}">+${n} j</button>`).join('')}
      ${p.prochaineRelance ? '<button class="btn small" data-pr-relance="0">Aucune</button>' : ''}
    </div>

    <div class="pr-grid">
      <div>
        <h3>🗂 Historique</h3>
        <form id="pr-log" class="pr-log">
          <select name="type">${TYPES_CONTACT.map(t => `<option>${t}</option>`).join('')}</select>
          <input name="texte" placeholder="Ex. : appel, intéressé, rappeler mardi" required>
          <button class="btn primary small">Ajouter</button>
        </form>
        <ul class="list pr-hist">${[...p.historique].reverse().map(h => `<li><span><span class="badge">${esc(h.type)}</span> ${esc(h.texte)}</span><span class="muted small">${fmtDate(h.date)}</span></li>`).join('') || '<li class="muted">Aucun échange pour l’instant.</li>'}</ul>
        ${p.notes ? `<div class="info small" style="margin-top:8px">${esc(p.notes)}</div>` : ''}
      </div>
      <div>
        <h3>✉️ Message écrit par ${esc(yahya.nom)}</h3>
        <div class="pr-msgopts">
          <select id="pr-mtype">${TYPES_MESSAGE.map(t => `<option ${t === mt ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select id="pr-canal">${CANAUX.map(t => `<option ${t === canal ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <button class="btn primary small" id="pr-gen" ${PR.busy === id ? 'disabled' : ''}>${PR.busy === id ? '⏳ Rédaction…' : (draft ? '↻ Réécrire' : '✨ Écrire')}</button>
        </div>
        ${lcapWarn ? `<div class="info warn small">⚠️ Loi anti-pourriel (LCAP) : consentement inconnu. Avant un courriel ou un SMS commercial, assure-toi d’avoir une relation d’affaires existante ou un consentement. Sinon, préfère un appel ou LinkedIn.</div>` : ''}
        ${PR.error && PR.busy === null && PR.errorId === id ? `<div class="info err small">${esc(PR.error)}</div>` : ''}
        <textarea id="pr-draft" class="pr-draft" placeholder="Le message apparaîtra ici. Tu peux le modifier avant de l’envoyer.">${esc(draft)}</textarea>
        <div class="pr-row">
          <button class="btn small" id="pr-copy" ${draft ? '' : 'disabled'}>📋 Copier</button>
          ${canal === 'Courriel' && p.courriel ? `<button class="btn small" id="pr-mail" ${draft ? '' : 'disabled'}>✉️ Ouvrir dans le courriel</button>` : ''}
          <span class="sp"></span>
          <button class="btn small primary" id="pr-sent" ${draft ? '' : 'disabled'}>✓ Marquer comme envoyé</button>
        </div>
        <p class="muted small">Seuls l’entreprise, le prénom, le poste, la niche et l’historique sont envoyés à l’IA (pas de courriel ni de téléphone). Tu envoies toi-même le message.</p>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn" id="pr-edit">✏️ Modifier la fiche</button>
      <button class="btn" id="pr-diag">🩺 ${diag ? 'Ouvrir le diagnostic' : 'Faire un diagnostic'}</button>
      <span class="sp"></span>
      ${p.etape === 'Client' && p.projetId ? '<a class="btn" href="#projets" data-close>📁 Voir le projet</a>' : '<button class="btn primary" id="pr-convert">➡️ Convertir en client</button>'}
      <button class="btn" data-close>Fermer</button>
    </div>`);
  const keep = () => { PR.draft[id] = $('#pr-draft').value; };
  $('#pr-etape').onchange = e => { setEtape(p, e.target.value); render(); openProspect(id); };
  $$('[data-pr-relance]').forEach(b => b.onclick = () => {
    keep(); const n = Number(b.dataset.prRelance); p.prochaineRelance = n ? addDays(n) : ''; save(); render(); openProspect(id);
  });
  $('#pr-log').onsubmit = e => {
    e.preventDefault(); keep();
    const f = e.target.elements; logContact(p, f.type.value, f.texte.value.trim());
    render(); openProspect(id); toast('Échange ajouté ✓');
  };
  $('#pr-mtype').onchange = e => { keep(); PR.msgType[id] = e.target.value; };
  $('#pr-canal').onchange = e => { keep(); PR.canal[id] = e.target.value; openProspect(id); };
  $('#pr-draft').oninput = e => {
    PR.draft[id] = e.target.value; const has = !!e.target.value.trim();
    ['pr-copy', 'pr-mail', 'pr-sent'].forEach(x => { const el = $('#' + x); if (el) el.disabled = !has; });
  };
  $('#pr-gen').onclick = () => { keep(); writeProspectMessage(id); };
  $('#pr-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#pr-draft').value); toast('Copié ✓'); } catch (e) { $('#pr-draft').select(); toast('Sélectionné : fais Ctrl+C'); } };
  if ($('#pr-mail')) $('#pr-mail').onclick = () => {
    const { objet, corps } = splitSubject($('#pr-draft').value);
    location.href = `mailto:${encodeURIComponent(p.courriel)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
  };
  $('#pr-sent').onclick = () => {
    const type = PR.msgType[id] || mt, ch = PR.canal[id] || canal;
    logContact(p, ch, `Message envoyé (${type})`);
    if (type !== 'Remerciement') p.prochaineRelance = addDays(7);
    if (type === 'Proposer un diagnostic' && ['À contacter', 'Contacté', 'Rendez-vous prévu'].includes(p.etape)) setEtape(p, 'Diagnostic proposé');
    PR.draft[id] = ''; save(); render(); openProspect(id); toast('Envoi noté · relance dans 7 jours ✓');
  };
  $('#pr-edit').onclick = () => openForm('prospects', id);
  $('#pr-diag').onclick = () => { closeModal(); openDiagnosticFor(p); };
  if ($('#pr-convert')) $('#pr-convert').onclick = () => convertProspect(p);
}

function logContact(p, type, texte) {
  if (!texte) return;
  p.historique.push({ id: uid(), date: todayISO(), type, texte });
  if (type !== 'Note' && p.etape === 'À contacter') p.etape = 'Contacté';
  if (type !== 'Note' && (!p.prochaineRelance || daysUntil(p.prochaineRelance) <= 0)) p.prochaineRelance = addDays(7);
  save();
}

function splitSubject(text) {
  const lines = String(text || '').split('\n');
  const i = lines.findIndex(l => /^\s*objet\s*:/i.test(l));
  if (i < 0) return { objet: '', corps: text };
  const objet = lines[i].replace(/^\s*objet\s*:\s*/i, '').trim();
  lines.splice(i, 1);
  return { objet, corps: lines.join('\n').replace(/^\s+/, '') };
}

async function writeProspectMessage(id) {
  const p = prospectById(id); if (!p || PR.busy) return;
  const ag = agentByKey('marketing');
  const type = PR.msgType[id] || $('#pr-mtype').value, canal = PR.canal[id] || $('#pr-canal').value;
  PR.errorId = id;
  if (!modelOf(ag)) { PR.error = 'Choisis d’abord un modèle pour Yahya (page de l’agent) ou un modèle par défaut dans « Fournisseur de tokens ».'; openProspect(id); return; }
  PR.busy = id; PR.error = ''; window.AI_BUSY = true; openProspect(id);
  const m = db.marque;
  const hist = p.historique.slice(-8).map(h => `- ${h.date} | ${h.type} | ${h.texte}`).join('\n') || '- aucun échange';
  const prenom = String(p.contact || '').trim().split(/\s+/)[0] || '';
  const regles = {
    Courriel: `Format COURRIEL : la toute première ligne est « Objet : … » (court, concret). Corps de 80 à 130 mots. Termine par la signature ci-dessous, puis une ligne de désabonnement simple, par exemple : « Si vous préférez ne plus recevoir de messages de ma part, répondez simplement “non merci”. »`,
    LinkedIn: 'Format LINKEDIN : message privé de 50 à 80 mots, sans objet, sans signature formelle (prénom seulement).',
    SMS: `Format SMS : 1 à 3 phrases, moins de 300 caractères. Identifie-toi (Taoufik, ${m.nom || 'Stony Automation'}) et termine par « Répondez STOP pour ne plus recevoir de messages. »`
  }[canal];
  const instr = `Écris UN message de prospection prêt à envoyer.
Type : ${type}. Canal : ${canal}.
Prospect : entreprise « ${p.entreprise} »${prenom ? `, contact : ${prenom}` : ''}${p.poste ? `, poste : ${p.poste}` : ''}${p.niche ? `, niche : ${p.niche}` : ''}${p.ville ? `, ville : ${p.ville}` : ''}. Source du lien : ${p.source || 'inconnue'}.
Historique des échanges :
${hist}
${p.notes ? `Notes de Taoufik : ${String(p.notes).slice(0, 600)}` : ''}

Règles :
- Français québécois naturel. Vouvoiement, sauf si la source est « Ancien collègue » ou « Réseau perso » (alors tutoiement amical).
- Court, humain, sans jargon technique ni mots comme « révolutionnaire » ou « IA de pointe ».
- Parle d’un problème concret du métier (paperasse, soumissions, suivis, appels manqués, maintenance) et non de technologie.
- UNE seule demande claire à la fin (ex. : un appel de 15 minutes, ou un diagnostic).
- N’invente AUCUN chiffre, résultat, client ou fait. Ne prétends pas avoir déjà fait quelque chose.
- ${regles}
Signature à utiliser :
${m.signature || 'Taoufik — Stony Automation'}
Réponds uniquement avec le message, sans commentaire.`;
  try {
    const t0 = Date.now();
    const res = await callAgentApi('POST', '', {
      model: modelOf(ag), temperature: 0.6, max_tokens: 700,
      messages: [{ role: 'system', content: agentSystem(ag) }, { role: 'user', content: instr }]
    });
    const tk = addUsage(ag, res.usage);
    logAgentTime(ag, Date.now() - t0, ag._lastCost, { categorie: 'Prospection / vente', description: `Message « ${type} » pour ${p.entreprise}`, tokens: tk });
    PR.draft[id] = String(res.content || '').trim();
    save();
  } catch (e) { PR.error = e.message; }
  PR.busy = null; window.AI_BUSY = false;
  if ($('#pr-draft')) openProspect(id); else render();
}

function convertProspect(p) {
  let proj = db.projets.find(x => x.id === p.projetId);
  if (!proj) {
    const diag = db.diagnostics.find(d => d.prospectId === p.id);
    const nom = uniqueProjectName(`${p.entreprise} — premier projet`);
    proj = { id: uid(), nom, client: p.entreprise, statut: 'En cours', type: 'Client', niche: NICHES.includes(p.niche) ? p.niche : '', valeur: Number(p.valeurPotentielle) || '', debut: todayISO(), prochaine: 'Planifier le démarrage avec le client', notes: diag ? `Diagnostic du ${fmtDate(diag.date)} disponible dans « Diagnostics clients ».` : '' };
    db.projets.push(proj);
    if (diag && !diag.projet) diag.projet = nom;
  }
  p.projetId = proj.id;
  setEtape(p, 'Client');
  save(); closeModal(); render(); toast(`🎉 ${p.entreprise} est client · projet créé`);
}
function uniqueProjectName(base) { let n = base, i = 2; while (db.projets.some(x => x.nom === n)) n = `${base} (${i++})`; return n; }

/* ---------- Import CSV ---------- */
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split('\n')[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const CSV_MAP = {
  entreprise: ['entreprise', 'compagnie', 'company', 'societe', 'organisation', 'nom entreprise'],
  contact: ['contact', 'nom', 'name', 'personne', 'prenom nom', 'nom complet'],
  poste: ['poste', 'titre', 'title', 'fonction', 'position'],
  courriel: ['courriel', 'email', 'e-mail', 'mail', 'adresse courriel'],
  telephone: ['telephone', 'tel', 'phone', 'cellulaire', 'mobile'],
  linkedin: ['linkedin', 'profil', 'url'],
  ville: ['ville', 'city', 'municipalite'],
  niche: ['niche', 'secteur', 'industrie', 'industry'],
  source: ['source'],
  notes: ['notes', 'note', 'commentaire', 'commentaires']
};
const normH = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function importProspects(text) {
  const rows = parseCSV(text); if (rows.length < 2) return { added: 0, skipped: 0 };
  const head = rows[0].map(normH);
  const idx = {};
  for (const [k, names] of Object.entries(CSV_MAP)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) idx[k] = i; }
  if (idx.entreprise === undefined) throw new Error('Colonne « Entreprise » introuvable dans la première ligne.');
  const known = new Set(db.prospects.map(p => normH(p.entreprise)));
  let added = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const v = k => idx[k] !== undefined ? String(r[idx[k]] || '').trim() : '';
    const ent = v('entreprise');
    if (!ent || known.has(normH(ent))) { skipped++; continue; }
    known.add(normH(ent));
    const niche = NICHES.find(n => normH(n) === normH(v('niche'))) || (v('niche') ? 'Autre' : '');
    const source = SOURCES.find(n => normH(n) === normH(v('source'))) || 'Autre';
    db.prospects.push({ id: uid(), ...defaults('prospects'), entreprise: ent, contact: v('contact'), poste: v('poste'), courriel: v('courriel'), telephone: v('telephone'), linkedin: /^https?:\/\//.test(v('linkedin')) ? v('linkedin') : '', ville: v('ville') || 'Trois-Rivières', niche, source, notes: v('notes'), consentement: 'Inconnu', etape: 'À contacter', historique: [] });
    added++;
  }
  save();
  return { added, skipped };
}
function openImportProspects() {
  modal(`<h2>Importer des prospects (CSV)</h2>
    <p class="muted">Première ligne = titres de colonnes. Colonnes reconnues : <b>Entreprise</b> (obligatoire), Contact, Poste, Courriel, Téléphone, LinkedIn, Ville, Niche, Source, Notes. Séparateur virgule ou point-virgule (export Excel ou Google Sheets).</p>
    <div class="info warn small">Le consentement est mis à « Inconnu » : vérifie-le avant d’envoyer un courriel commercial (LCAP). Les doublons (même entreprise) sont ignorés.</div>
    <label>Fichier<input type="file" id="pi-file" accept=".csv,text/csv,.txt"></label>
    <label>… ou colle le contenu<textarea id="pi-text" style="min-height:140px" placeholder="Entreprise;Contact;Poste;Niche&#10;Toitures Mauricie;Marc;Propriétaire;Construction / services"></textarea></label>
    <div id="pi-msg"></div>
    <div class="modal-actions"><span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="pi-go">Importer</button></div>`);
  $('#pi-file').onchange = async e => { const f = e.target.files[0]; if (f) $('#pi-text').value = await f.text(); };
  $('#pi-go').onclick = () => {
    try {
      const r = importProspects($('#pi-text').value);
      closeModal(); render(); toast(`${r.added} prospect(s) importé(s)${r.skipped ? ` · ${r.skipped} ignoré(s)` : ''}`);
    } catch (e) { $('#pi-msg').innerHTML = `<div class="info err small">${esc(e.message)}</div>`; }
  };
}

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-pr-open],[data-pr-import]'); if (!t) return;
  if ($('#modal-backdrop').contains(t)) return;
  if (t.dataset.prImport !== undefined) openImportProspects(); else openProspect(t.dataset.prOpen);
});

/* =========================================================
   🩺 DIAGNOSTIC CLIENT + calcul du retour sur investissement
   ========================================================= */
const DG = { id: null, busy: false, error: '', editText: false };

function newDiagnostic(preset = {}) {
  return {
    id: uid(), date: todayISO(), prospectId: '', projet: '', entreprise: '', contact: '', secteur: '', employes: '', outils: '', decideur: '', budget: '',
    irritants: '', objectif: '',
    taches: [{ id: uid(), nom: '', frequence: 5, minutes: 30, personnes: 1, taux: 35, auto: 70 }],
    opp: { appels: 0, valeur: 0, conversion: 20, recuperation: 30 },
    invest: { implementation: 0, mensuel: 0, prixDiag: 0 },
    semaines: 48, rapport: '', rapportDate: '', coutIA: 0, ...preset
  };
}
function openDiagnosticFor(p) {
  let d = db.diagnostics.find(x => x.prospectId === p.id);
  if (!d) {
    d = newDiagnostic({ prospectId: p.id, entreprise: p.entreprise, contact: p.contact || '', secteur: p.niche || '', projet: (db.projets.find(x => x.id === p.projetId) || {}).nom || '' });
    db.diagnostics.unshift(d); save();
  }
  DG.id = d.id; DG.error = ''; DG.editText = false;
  if (location.hash === '#diagnostics') render(); else location.hash = 'diagnostics';
}

const N = v => Number(v) || 0;
function taskCalc(t, sem) {
  const heures = N(t.frequence) * N(t.minutes) / 60 * Math.max(1, N(t.personnes) || 1) * sem;
  const heuresAuto = heures * N(t.auto) / 100;
  return { heures, heuresAuto, gain: heuresAuto * N(t.taux) };
}
function roi(d) {
  const sem = N(d.semaines) || 48;
  const rows = (d.taches || []).filter(t => t.nom || N(t.minutes));
  let heures = 0, heuresAuto = 0, gainTaches = 0;
  rows.forEach(t => { const c = taskCalc(t, sem); heures += c.heures; heuresAuto += c.heuresAuto; gainTaches += c.gain; });
  const o = d.opp || {};
  const revenus = N(o.appels) * sem * N(o.conversion) / 100 * N(o.valeur) * N(o.recuperation) / 100;
  const gain = gainTaches + revenus;
  const i = d.invest || {};
  const cout1 = N(i.implementation) + N(i.mensuel) * 12;
  const net = gain - cout1;
  const roiPct = cout1 > 0 ? net / cout1 * 100 : null;
  const netMensuel = gain / 12 - N(i.mensuel);
  const retourMois = N(i.implementation) > 0 && netMensuel > 0 ? N(i.implementation) / netMensuel : (N(i.implementation) === 0 && netMensuel > 0 ? 0 : null);
  return { sem, heures, heuresAuto, gainTaches, revenus, gain, cout1, net, roiPct, retourMois, nbTaches: rows.length };
}
const h1 = n => (Math.round(n * 10) / 10).toLocaleString('fr-CA');

function roiBox(d) {
  const r = roi(d);
  return `<div class="roi-grid">
    <div class="roi-k"><span>Heures récupérées / an</span><b>${h1(r.heuresAuto)} h</b><small>sur ${h1(r.heures)} h de tâches manuelles</small></div>
    <div class="roi-k"><span>Économies de temps / an</span><b>${money(r.gainTaches)}</b></div>
    <div class="roi-k"><span>Revenus récupérés / an</span><b>${money(r.revenus)}</b></div>
    <div class="roi-k big"><span>Gain total estimé / an</span><b>${money(r.gain)}</b></div>
    <div class="roi-k"><span>Coût la 1ʳᵉ année</span><b>${money(r.cout1)}</b><small>implantation + 12 mois</small></div>
    <div class="roi-k ${r.net >= 0 ? 'pos' : 'neg'}"><span>Gain net 1ʳᵉ année</span><b>${money(r.net)}</b></div>
    <div class="roi-k"><span>Rendement (ROI) 1ʳᵉ année</span><b>${r.roiPct === null ? '—' : Math.round(r.roiPct).toLocaleString('fr-CA') + ' %'}</b></div>
    <div class="roi-k"><span>Retour sur l’investissement</span><b>${r.retourMois === null ? '—' : r.retourMois === 0 ? 'immédiat' : h1(r.retourMois) + ' mois'}</b></div>
  </div>
  <p class="muted small">Estimations à partir des chiffres saisis (${r.sem} semaines travaillées par an). À valider avec le client.</p>`;
}

VIEWS.diagnostics = () => {
  const d = db.diagnostics.find(x => x.id === DG.id);
  if (d) return diagEditor(d);
  DG.id = null;
  return `<div class="info">Le diagnostic est ton produit d’entrée : 1 à 2 h avec le client, tu notes ses tâches répétitives et ses pertes, l’outil calcule le retour sur investissement, puis Yaman rédige un rapport à ses couleurs… et aux tiennes.</div>
  <div class="toolbar"><span class="sp"></span><button class="btn primary" data-dg-new>+ Nouveau diagnostic</button></div>
  <div class="grid cols-3">${db.diagnostics.map(x => {
    const r = roi(x);
    return `<div class="card diag-card clickable" data-dg-open="${x.id}">
      <div class="t"><b>${esc(x.entreprise || 'Sans nom')}</b> ${x.rapport ? '<span class="badge green">rapport prêt</span>' : '<span class="badge orange">brouillon</span>'}</div>
      <div class="muted small">${fmtDate(x.date)}${x.secteur ? ' · ' + esc(x.secteur) : ''}${x.projet ? ' · 📁 ' + esc(x.projet) : ''}</div>
      <div class="diag-nums"><span>Gain estimé<b>${money(r.gain)}/an</b></span><span>ROI 1ʳᵉ année<b>${r.roiPct === null ? '—' : Math.round(r.roiPct) + ' %'}</b></span></div>
    </div>`;
  }).join('') || '<div class="card empty">Aucun diagnostic. Commence par « + Nouveau diagnostic » ou depuis la fiche d’un prospect.</div>'}</div>`;
};

function dgIn(path, val, type = 'text', attrs = '') {
  return `<input data-dg="${path}" type="${type}" ${type === 'number' ? 'step="any" min="0"' : ''} value="${esc(val ?? '')}" ${attrs}>`;
}
function diagEditor(d) {
  const sem = N(d.semaines) || 48;
  const pros = db.prospects.find(p => p.id === d.prospectId);
  const yaman = agentByKey('rapports');
  return `<div class="diag-ed"><div class="toolbar">
      <button class="btn" data-dg-back>← Tous les diagnostics</button>
      <span class="sp"></span>
      ${pros ? `<button class="btn" data-pr-open="${pros.id}">🎯 Fiche prospect</button>` : ''}
      <button class="btn danger" data-dg-del>Supprimer</button>
    </div>
    <div class="grid cols-2 diag">
      <div class="card"><h3>1. L’entreprise</h3>
        <div class="form-grid">
          <label>Entreprise ${dgIn('entreprise', d.entreprise)}</label>
          <label>Personne rencontrée ${dgIn('contact', d.contact)}</label>
          <label>Date ${dgIn('date', d.date, 'date')}</label>
          <label>Secteur ${dgIn('secteur', d.secteur, 'text', 'list="dg-niches"')}<datalist id="dg-niches">${NICHES.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label>Nombre d’employés ${dgIn('employes', d.employes)}</label>
          <label>Qui décide ? ${dgIn('decideur', d.decideur)}</label>
          <label class="full">Outils actuels (logiciels, Excel, papier…) ${dgIn('outils', d.outils)}</label>
          <label>Budget évoqué ${dgIn('budget', d.budget)}</label>
          <label>Projet lié <select data-dg="projet"><option value="">— Aucun —</option>${projectNames().map(n => `<option ${n === d.projet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label class="full">Ce qui les irrite le plus (leurs mots)<textarea data-dg="irritants">${esc(d.irritants)}</textarea></label>
          <label class="full">Objectif dans 6 mois<textarea data-dg="objectif">${esc(d.objectif)}</textarea></label>
        </div>
      </div>
      <div class="card roi-card"><h3>📈 Retour sur investissement</h3><div id="dg-roi">${roiBox(d)}</div></div>
    </div>

    <div class="card"><h3>2. Tâches manuelles répétitives</h3>
      <div class="table-wrap"><table class="dg-table"><thead><tr><th>Tâche</th><th class="num">Fois / sem.</th><th class="num">Minutes / fois</th><th class="num">Personnes</th><th class="num">Taux $/h</th><th class="num">% automatisable</th><th class="num">Heures récupérées / an</th><th class="num">Économie / an</th><th></th></tr></thead>
      <tbody>${(d.taches || []).map(t => { const c = taskCalc(t, sem); return `<tr>
        <td>${dgIn(`taches.${t.id}.nom`, t.nom, 'text', 'placeholder="Ex. : soumissions à la main"')}</td>
        <td>${dgIn(`taches.${t.id}.frequence`, t.frequence, 'number')}</td>
        <td>${dgIn(`taches.${t.id}.minutes`, t.minutes, 'number')}</td>
        <td>${dgIn(`taches.${t.id}.personnes`, t.personnes, 'number')}</td>
        <td>${dgIn(`taches.${t.id}.taux`, t.taux, 'number')}</td>
        <td>${dgIn(`taches.${t.id}.auto`, t.auto, 'number', 'max="100"')}</td>
        <td class="num" id="dg-h-${t.id}">${h1(c.heuresAuto)} h</td>
        <td class="num" id="dg-g-${t.id}">${money(c.gain)}</td>
        <td><button class="btn small" data-dg-deltask="${t.id}" title="Retirer">✕</button></td></tr>`; }).join('')}</tbody></table></div>
      <div class="toolbar" style="margin-top:8px"><button class="btn small" data-dg-addtask>+ Tâche</button><span class="sp"></span><label class="inline small">Semaines travaillées / an ${dgIn('semaines', d.semaines, 'number', 'style="width:70px"')}</label></div>
    </div>

    <div class="grid cols-2">
      <div class="card"><h3>3. Occasions perdues</h3>
        <div class="form-grid">
          <label>Appels ou demandes manqués / sem. ${dgIn('opp.appels', d.opp.appels, 'number')}</label>
          <label>Valeur moyenne d’un contrat ($) ${dgIn('opp.valeur', d.opp.valeur, 'number')}</label>
          <label>Taux de conversion habituel (%) ${dgIn('opp.conversion', d.opp.conversion, 'number')}</label>
          <label>Part récupérable avec l’automatisation (%) ${dgIn('opp.recuperation', d.opp.recuperation, 'number')}</label>
        </div>
      </div>
      <div class="card"><h3>4. Ton offre</h3>
        <div class="form-grid">
          <label>Implantation ($, une fois) ${dgIn('invest.implementation', d.invest.implementation, 'number')}</label>
          <label>Abonnement ($ / mois) ${dgIn('invest.mensuel', d.invest.mensuel, 'number')}</label>
          <label>Prix du diagnostic ($) ${dgIn('invest.prixDiag', d.invest.prixDiag, 'number')}</label>
        </div>
        <p class="muted small">Astuce : le prix du diagnostic peut être crédité sur l’implantation si le client signe.</p>
      </div>
    </div>

    <div class="card"><div class="toolbar" style="margin:0 0 8px">
        <h3 style="margin:0">📝 Rapport de diagnostic ${d.rapportDate ? `<span class="muted small">· ${fmtDate(d.rapportDate)}${d.coutIA ? ' · coût IA ' + money2(d.coutIA) : ''}</span>` : ''}</h3><span class="sp"></span>
        ${d.rapport ? `<button class="btn small" data-dg-edittext>${DG.editText ? '👁 Aperçu' : '✏️ Modifier le texte'}</button><button class="btn small" data-dg-print>🖨 PDF à ma marque</button>` : ''}
        <button class="btn primary small" data-dg-report ${DG.busy ? 'disabled' : ''}>${DG.busy ? `⏳ ${esc(yaman.nom)} rédige…` : (d.rapport ? '↻ Régénérer' : `✨ Générer le rapport (${esc(yaman.nom)})`)}</button>
      </div>
      ${DG.error ? `<div class="info err small">${esc(DG.error)}</div>` : ''}
      ${d.rapport ? (DG.editText ? `<textarea data-dg="rapport" class="dg-rtext">${esc(d.rapport)}</textarea>` : `<div class="report official">${md(d.rapport)}</div>`)
        : `<p class="muted">Remplis les sections ci-dessus, puis ${esc(yaman.nom)} rédige un rapport professionnel : résumé, constats, opportunités, retour sur investissement et prochaines étapes. Les montants viennent uniquement de tes chiffres.</p>`}
    </div></div>`;
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  if (parts[0] === 'taches') { const t = (obj.taches || []).find(x => x.id === parts[1]); if (t) t[parts[2]] = val; return; }
  let o = obj; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
  o[parts[parts.length - 1]] = val;
}
let dgSaveT = null;
function onDgInput(e) {
  const el = e.target.closest && e.target.closest('[data-dg]'); if (!el) return;
  const d = db.diagnostics.find(x => x.id === DG.id); if (!d) return;
  const val = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
  setPath(d, el.dataset.dg, val);
  // Mise à jour en direct sans re-rendre la page (on garde le curseur)
  const box = $('#dg-roi'); if (box) box.innerHTML = roiBox(d);
  const sem = N(d.semaines) || 48;
  (d.taches || []).forEach(t => { const c = taskCalc(t, sem); const hh = $('#dg-h-' + t.id), gg = $('#dg-g-' + t.id); if (hh) hh.textContent = h1(c.heuresAuto) + ' h'; if (gg) gg.textContent = money(c.gain); });
  clearTimeout(dgSaveT); dgSaveT = setTimeout(save, 400);
}
document.addEventListener('input', onDgInput);
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('select[data-dg]')) onDgInput(e); });

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-dg-new],[data-dg-open],[data-dg-back],[data-dg-del],[data-dg-addtask],[data-dg-deltask],[data-dg-report],[data-dg-print],[data-dg-edittext]');
  if (!t || $('#modal-backdrop').contains(t)) return;
  const d = db.diagnostics.find(x => x.id === DG.id);
  const ds = t.dataset;
  if (ds.dgNew !== undefined) { const n = newDiagnostic(); db.diagnostics.unshift(n); DG.id = n.id; DG.error = ''; DG.editText = false; save(); render(); }
  else if (ds.dgOpen) { DG.id = ds.dgOpen; DG.error = ''; DG.editText = false; render(); window.scrollTo(0, 0); }
  else if (ds.dgBack !== undefined) { save(); DG.id = null; render(); }
  else if (ds.dgDel !== undefined && d) {
    if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer la suppression'; return; }
    db.diagnostics = db.diagnostics.filter(x => x.id !== d.id); DG.id = null; save(); render(); toast('Diagnostic supprimé');
  }
  else if (ds.dgAddtask !== undefined && d) { d.taches.push({ id: uid(), nom: '', frequence: 5, minutes: 30, personnes: 1, taux: 35, auto: 70 }); save(); render(); }
  else if (ds.dgDeltask && d) { d.taches = d.taches.filter(x => x.id !== ds.dgDeltask); save(); render(); }
  else if (ds.dgEdittext !== undefined) { DG.editText = !DG.editText; save(); render(); }
  else if (ds.dgReport !== undefined && d) generateDiagReport(d.id);
  else if (ds.dgPrint !== undefined && d) printDiagnostic(d);
});

function diagFacts(d) {
  const r = roi(d), sem = r.sem;
  const lignes = (d.taches || []).filter(t => t.nom || N(t.minutes)).map(t => { const c = taskCalc(t, sem); return `| ${t.nom || '[tâche sans nom]'} | ${N(t.frequence)} fois/sem. × ${N(t.minutes)} min × ${Math.max(1, N(t.personnes))} pers. | ${h1(c.heures)} h | ${N(t.auto)} % | ${h1(c.heuresAuto)} h | ${money(c.gain)} (à ${N(t.taux)} $/h) |`; }).join('\n');
  const o = d.opp, i = d.invest;
  return `DONNÉES DU DIAGNOSTIC (seule source de chiffres autorisée)
Entreprise : ${d.entreprise || '[À COMPLÉTER]'}
Personne rencontrée : ${d.contact || '[À COMPLÉTER]'} · Décideur : ${d.decideur || '[À COMPLÉTER]'}
Date : ${fmtDate(d.date)} · Secteur : ${d.secteur || '[À COMPLÉTER]'} · Employés : ${d.employes || '[À COMPLÉTER]'}
Outils actuels : ${d.outils || '[À COMPLÉTER]'}
Budget évoqué : ${d.budget || 'non précisé'}
Irritants (mots du client) : ${d.irritants || '[À COMPLÉTER]'}
Objectif dans 6 mois : ${d.objectif || '[À COMPLÉTER]'}

TÂCHES MANUELLES (${sem} semaines/an) :
| Tâche | Volume | Heures/an | % automatisable | Heures récupérées/an | Économie/an |
|---|---|---|---|---|---|
${lignes || '| aucune tâche saisie | | | | | |'}

OCCASIONS PERDUES : ${N(o.appels)} appels/demandes manqués par semaine, contrat moyen ${money(o.valeur)}, conversion ${N(o.conversion)} %, part récupérable ${N(o.recuperation)} % → revenus récupérés estimés ${money(r.revenus)}/an.

OFFRE : implantation ${money(i.implementation)}, abonnement ${money(i.mensuel)}/mois${N(i.prixDiag) ? `, diagnostic ${money(i.prixDiag)}` : ''}.

RÉSULTATS CALCULÉS (ne les recalcule pas, reprends-les tels quels) :
- Heures récupérées par an : ${h1(r.heuresAuto)} h (sur ${h1(r.heures)} h de tâches manuelles)
- Économies de temps : ${money(r.gainTaches)}/an
- Revenus récupérés : ${money(r.revenus)}/an
- Gain total estimé : ${money(r.gain)}/an
- Coût la première année : ${money(r.cout1)}
- Gain net première année : ${money(r.net)}
- ROI première année : ${r.roiPct === null ? 'non calculable (offre non chiffrée)' : Math.round(r.roiPct) + ' %'}
- Retour sur investissement : ${r.retourMois === null ? 'non calculable' : r.retourMois === 0 ? 'immédiat' : h1(r.retourMois) + ' mois'}`;
}

async function generateDiagReport(id) {
  const d0 = db.diagnostics.find(x => x.id === id); if (!d0 || DG.busy) return;
  const ag = agentByKey('rapports');
  if (!modelOf(ag)) { DG.error = 'Choisis d’abord un modèle pour Yaman (page de l’agent) ou un modèle par défaut dans « Fournisseur de tokens ».'; render(); return; }
  DG.busy = true; DG.error = ''; window.AI_BUSY = true; save(); render();
  const brand = db.marque.nom || 'Stony Automation';
  const instr = `Rédige le RAPPORT DE DIAGNOSTIC officiel remis au client, au nom de ${brand}.
Règles :
- Vouvoiement, français québécois professionnel, phrases courtes, aucun jargon (explique « automatisation » par des exemples concrets).
- N’utilise QUE les chiffres fournis. N’invente aucun chiffre, nom, outil ou résultat. Si une information manque, écris [À COMPLÉTER : …].
- Ne mentionne jamais d’agents IA internes ni leurs prénoms.
- Présente les montants comme des ESTIMATIONS basées sur les informations fournies par l’entreprise.
- Ne touche jamais au contrôle des machines ni aux systèmes de sécurité : on automatise l’information et la paperasse.
Structure exacte (Markdown) :
## Résumé exécutif
(4 à 6 phrases : situation, principal irritant, gain total estimé, recommandation clé)
## Portrait de l’entreprise
## Constats
(ce qui coûte du temps ou des revenus, et pourquoi)
## Opportunités d’automatisation
(un tableau Markdown : | Tâche | Heures récupérées / an | Économie / an | Solution proposée | Effort |)
## Retour sur investissement estimé
(reprends les résultats calculés, puis la méthode en 2-3 lignes)
## Recommandations
(3 à 5 recommandations numérotées, de la plus rentable à la moins rentable ; commence petit)
## Prochaines étapes
(3 étapes concrètes avec une proposition de date relative, ex. « d’ici 2 semaines »)
Ne mets pas de titre principal ni de signature : ils sont ajoutés automatiquement.`;
  try {
    const t0 = Date.now();
    const res = await callAgentApi('POST', '', {
      model: modelOf(ag), temperature: 0.3, max_tokens: 3000,
      messages: [{ role: 'system', content: agentSystem(ag) }, { role: 'user', content: `${diagFacts(d0)}\n\n${instr}` }]
    });
    const tk = addUsage(ag, res.usage);
    const d = db.diagnostics.find(x => x.id === id);
    if (d) {
      logAgentTime(ag, Date.now() - t0, ag._lastCost, { projet: d.projet || '', categorie: 'Prospection / vente', description: `Rapport de diagnostic « ${d.entreprise || 'client'} »`, tokens: tk });
      d.rapport = String(res.content || '').trim(); d.rapportDate = todayISO(); d.coutIA = (d.coutIA || 0) + (ag._lastCost || 0);
      DG.editText = false;
      const p = db.prospects.find(x => x.id === d.prospectId);
      if (p && ['À contacter', 'Contacté', 'Rendez-vous prévu'].includes(p.etape)) { p.etape = 'Diagnostic proposé'; p.historique.push({ id: uid(), date: todayISO(), type: 'Note', texte: 'Rapport de diagnostic rédigé' }); }
    }
    save(); toast('Rapport de diagnostic prêt ✓');
  } catch (e) { DG.error = e.message; }
  DG.busy = false; window.AI_BUSY = false; render();
}

function printDiagnostic(d) {
  const r = roi(d);
  const resume = `<div class="roi-print">
    <div><span>Heures récupérées / an</span><b>${h1(r.heuresAuto)} h</b></div>
    <div><span>Gain total estimé / an</span><b>${money(r.gain)}</b></div>
    <div><span>ROI 1ʳᵉ année</span><b>${r.roiPct === null ? '—' : Math.round(r.roiPct) + ' %'}</b></div>
    <div><span>Retour sur investissement</span><b>${r.retourMois === null ? '—' : r.retourMois === 0 ? 'immédiat' : h1(r.retourMois) + ' mois'}</b></div>
  </div>`;
  printBrandedReport({ kicker: 'Diagnostic d’automatisation', titre: d.entreprise ? `Diagnostic — ${d.entreprise}` : 'Diagnostic d’automatisation', client: d.entreprise, date: d.rapportDate || d.date, avant: resume, contenu: d.rapport });
}
