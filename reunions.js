'use strict';
/* =========================================================
   Réunions d'équipe : Taoufik pose un projet sur la table,
   les agents prennent la parole à tour de rôle, réagissent
   entre eux, puis l'un d'eux rédige le compte rendu.
   Chargé APRÈS agents.js (utilise ses fonctions).
   ========================================================= */

NAV.splice(NAV.findIndex(n => n[0] === 'agents') + 1, 0, ['reunions', 'Réunions d’équipe', '🪑']);

const RM = { view: 'list', id: null, running: false, stop: false, speaking: null, progress: '', error: '' };
const MEET_WORDS = 170;
const getMeeting = id => db.reunions.find(r => r.id === id);

/* ---------- Préparation du contenu envoyé aux agents ---------- */
function projectBrief(p) {
  const lines = [
    `Projet : ${p.nom}`,
    p.client && `Client : ${p.client}`,
    p.statut && `Statut : ${p.statut}`,
    p.type && `Type : ${p.type}`,
    p.niche && `Niche : ${p.niche}`,
    p.valeur && `Valeur du contrat : ${money(p.valeur)}`,
    p.mensuel && `Revenu mensuel : ${money(p.mensuel)}/mois`,
    p.echeance && `Échéance : ${fmtDate(p.echeance)}`,
    p.prochaine && `Prochaine action prévue : ${p.prochaine}`,
    p.notes && `Notes du projet :\n${p.notes}`
  ].filter(Boolean);
  const notes = db.notes.filter(n => n.projet === p.nom).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  if (notes.length) lines.push('Notes liées :\n' + notes.map(n => `• ${n.titre} (${n.date}) : ${String(n.contenu || '').slice(0, 1200)}`).join('\n'));
  return lines.join('\n');
}

function speakerName(m) {
  if (m.agentId === 'taoufik') return 'Taoufik (fondateur)';
  const a = agentById(m.agentId);
  return a ? `${a.nom} (${a.titre || a.role || 'agent'})` : 'Agent';
}

function meetingBrief(r) {
  const people = r.participants.map(agentById).filter(Boolean).map(a => `${a.nom} (${a.titre || a.role})`).join(', ');
  let s = `RÉUNION D’ÉQUIPE : « ${r.titre} »\nAnimée par Taoufik, fondateur de l’agence.\nParticipants : ${people}.\n\nCE QUI EST SUR LA TABLE :\n${r.sujet || '(voir la question de Taoufik)'}`;
  if (r.objectif) s += `\n\nQUESTION DE TAOUFIK À L’ÉQUIPE :\n${r.objectif}`;
  return s;
}

function transcriptText(r, maxEach = 2500, last = 14) {
  return r.messages.slice(-last).map(m => `${speakerName(m)} :\n${String(m.content).slice(0, maxEach)}${String(m.content).length > maxEach ? '…' : ''}`).join('\n\n');
}

/* ---------- Déroulement de la réunion ---------- */
async function runMeeting(id, rounds) {
  let r = getMeeting(id); if (!r || RM.running) return;
  const parts = r.participants.map(agentById).filter(a => a && a.id !== 'taoufik');
  const missing = parts.filter(a => !(a.model || db.provider.modeleDefaut));
  if (!parts.length) { RM.error = 'Choisis au moins un participant.'; render(); return; }
  if (missing.length) { RM.error = `Aucun modèle choisi pour : ${missing.map(a => a.nom).join(', ')}. Choisis un modèle par défaut dans « Fournisseur de tokens ».`; render(); return; }

  RM.running = true; RM.stop = false; RM.error = ''; window.AI_BUSY = true;
  r.statut = 'En cours'; save();
  const startTour = r.messages.filter(m => m.agentId !== 'taoufik').reduce((mx, m) => Math.max(mx, m.tour || 0), 0);
  const total = rounds * parts.length + 1; let step = 0;
  try {
    for (let t = 1; t <= rounds; t++) {
      const tour = startTour + t;
      for (const a of parts) {
        if (RM.stop) throw new Error('Réunion arrêtée par Taoufik.');
        step++; RM.speaking = a.id; RM.progress = `${a.nom} prend la parole… (${step}/${total})`; render();
        r = getMeeting(id);
        const firstTime = !r.messages.some(m => m.agentId !== 'taoufik');
        const lastIsTaoufik = r.messages.length && r.messages[r.messages.length - 1].agentId === 'taoufik';
        const instr = `C’est ton tour de parole, ${a.nom}. ` +
          (firstTime || tour === 1
            ? `En tant que ${a.titre || a.role}, donne ton analyse du sujet sous ton angle d’expertise : constats, risques et recommandations concrètes.`
            : `Réagis à ce que tes collègues viennent de dire : complète, nuance ou contredis si nécessaire, et propose des actions concrètes.`) +
          (lastIsTaoufik || r.messages.some(m => m.agentId === 'taoufik' && m.tour === tour - 1) ? ' Taoufik est intervenu : réponds d’abord à sa remarque.' : '') +
          ` Maximum ${MEET_WORDS} mots. Ne répète pas ce qui a déjà été dit. Parle à la première personne, sans formule d’introduction ni signature.`;
        const msgs = [
          { role: 'system', content: agentSystem(a) },
          { role: 'user', content: `${meetingBrief(r)}\n\nTRANSCRIPTION JUSQU’ICI :\n${transcriptText(r) || '(personne n’a encore parlé)'}\n\n${instr}` }
        ];
        const res = await callAgentApi('POST', '', { model: a.model || db.provider.modeleDefaut, temperature: a.temperature, messages: msgs, max_tokens: 700 });
        const tokens = addUsage(a, res.usage);
        r = getMeeting(id); if (!r) throw new Error('Réunion supprimée.');
        r.messages.push({ id: uid(), agentId: a.id, tour, content: res.content, tokens, date: new Date().toISOString() });
        save(); render(); scrollMeeting();
      }
    }
    // Compte rendu
    if (RM.stop) throw new Error('Réunion arrêtée par Taoufik.');
    r = getMeeting(id);
    const sec = agentById(r.secretaire) || parts[0];
    step++; RM.speaking = sec.id; RM.progress = `${sec.nom} rédige le compte rendu… (${step}/${total})`; render();
    const instr = `Tu rédiges maintenant le compte rendu de cette réunion pour Taoufik, en français clair, avec exactement ces sections :
## Résumé
(3 phrases maximum)
## Décisions et recommandations
## Plan d’action
(une ligne par action : action — responsable (un membre de l’équipe ou Taoufik) — échéance proposée)
## Risques et points de vigilance
## Questions pour Taoufik
N’invente aucun chiffre ni aucun fait qui n’a pas été dit.
Après les sections, ajoute un bloc qui reprend chaque action du plan, exactement dans ce format (une action par ligne, sans gras) :
ACTIONS :
- titre court de l’action | responsable (Taoufik ou un prénom de l’équipe) | échéance (ex. vendredi, dans 2 semaines, 2026-12-15)
Termine par une dernière ligne qui commence exactement par « MÉMO : » et qui résume les décisions en une seule phrase.`;
    const res = await callAgentApi('POST', '', {
      model: sec.model || db.provider.modeleDefaut, temperature: 0.3, max_tokens: 1800,
      messages: [{ role: 'system', content: agentSystem(sec) }, { role: 'user', content: `${meetingBrief(r)}\n\nTRANSCRIPTION COMPLÈTE :\n${transcriptText(r)}\n\n${instr}` }]
    });
    addUsage(sec, res.usage);
    r = getMeeting(id);
    const memo = res.content.match(/^\s*\**\s*MÉMO\s*:\s*\**\s*(.+)$/mi);
    r.memo = memo ? memo[1].replace(/\*+$/, '').trim() : '';
    const block = extractActionsBlock(res.content);
    r.resultat = block.text.replace(/^\s*\**\s*MÉMO\s*:.*$/mi, '').trim();
    r.resultatPar = sec.id; r.statut = 'Terminée'; r.maj = new Date().toISOString();
    const kept = (r.actionsProposees || []).filter(x => x.statut !== 'proposée');
    const found = block.actions.length ? block.actions : parseActions(r.resultat);
    r.actionsProposees = [...kept, ...found.map(x => ({ id: uid(), ...x, statut: 'proposée' }))];
    RM.justFinished = id;
    save();
    toast('Compte rendu prêt ✓');
  } catch (e) {
    RM.error = e.message;
    r = getMeeting(id); if (r) { r.statut = r.resultat ? 'Terminée' : 'Interrompue'; save(); }
  }
  RM.running = false; RM.speaking = null; RM.progress = ''; window.AI_BUSY = false;
  render(); scrollMeeting();
  if (RM.justFinished === id) {
    RM.justFinished = null;
    const m = getMeeting(id);
    if (m && (m.actionsProposees || []).some(x => x.statut === 'proposée')) openActionsModal(id);
  }
}

function scrollMeeting() { const el = $('#rm-transcript'); if (el) el.scrollTop = el.scrollHeight; }

/* ---------- Vues ---------- */
VIEWS.reunions = () => {
  if (RM.view === 'new') return newMeetingView();
  if (RM.view === 'meeting' && getMeeting(RM.id)) return meetingView(getMeeting(RM.id));
  RM.view = 'list';
  const list = [...db.reunions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `
  ${!Cloud.user ? '<div class="info">Les réunions utilisent les agents : connecte-toi (mode en ligne) et configure le fournisseur de tokens.</div>' : ''}
  <div class="rm-hero">
    <div>
      <h2>Salle de réunion</h2>
      <p>Pose un projet sur la table. ${db.agents.map(a => esc(a.nom)).join(', ')} en discutent à tour de rôle, réagissent entre eux, puis te remettent un compte rendu avec un plan d’action.</p>
      <button class="btn primary" data-rm-new>＋ Nouvelle réunion</button>
    </div>
    <div class="rm-hero-team">${db.agents.map(a => avatar(a, 'lg')).join('')}</div>
  </div>
  <div class="rm-list">
    ${list.map(r => `<button class="rm-card" data-rm-open="${r.id}">
      <div class="rm-card-top"><b>${esc(r.titre)}</b>${badge(r.statut || 'Terminée')}</div>
      <div class="muted small">${esc(fmtDate(r.date))}${r.projet ? ' · ' + esc(r.projet) : ''} · ${r.messages.filter(m => m.agentId !== 'taoufik').length} interventions</div>
      ${r.memo ? `<p class="rm-memo">${esc(r.memo)}</p>` : r.objectif ? `<p class="rm-memo muted">${esc(r.objectif.slice(0, 160))}</p>` : ''}
      <div class="stack">${r.participants.map(agentById).filter(Boolean).map(a => avatar(a, 'xs')).join('')}</div>
    </button>`).join('') || '<div class="empty card">Aucune réunion pour l’instant. Lance la première !</div>'}
  </div>`;
};

function newMeetingView() {
  const projets = db.projets.filter(p => p.statut !== 'Terminé');
  const defSec = (db.agents.find(a => a.key === 'rapports') || db.agents[0]).id;
  const calls = n => n * db.agents.length + 1;
  return `
  <div class="rm-top"><button class="btn ghost-dark" data-rm-back>← Toutes les réunions</button></div>
  <div class="card rm-setup">
    <h3>🪑 Préparer la réunion</h3>
    <form id="rm-new" class="form-grid">
      <label class="full">Ce que tu poses sur la table
        <select name="projet"><option value="">— Sujet libre —</option>${projets.map(p => `<option value="${p.id}">${esc(p.nom)} · ${esc(p.statut || '')}</option>`).join('')}</select></label>
      <label class="full">Titre de la réunion<input name="titre" required placeholder="ex. Comment décrocher le contrat de l’usine ?"></label>
      <label class="full">Détails ou contexte (facultatif si un projet est choisi)<textarea name="sujet" placeholder="Ce que l’équipe doit savoir : situation, chiffres, contraintes…"></textarea></label>
      <label class="full">Ta question à l’équipe<textarea name="objectif" placeholder="ex. Quelle offre et quel prix proposer ? Que dois-je faire cette semaine ?"></textarea></label>
      <div class="full"><div class="lbl">Participants</div>
        <div class="pick">${db.agents.map(a => `<label class="pick-item"><input type="checkbox" name="p" value="${a.id}" checked>${avatar(a, 'sm')}<span><b>${esc(a.nom)}</b><small>${esc(a.titre || '')}</small></span></label>`).join('')}</div>
      </div>
      <label>Tours de parole
        <select name="tours"><option value="1">1 tour — rapide (${calls(1)} appels)</option><option value="2" selected>2 tours — ils réagissent entre eux (${calls(2)} appels)</option><option value="3">3 tours — approfondi (${calls(3)} appels)</option></select></label>
      <label>Compte rendu rédigé par
        <select name="secretaire">${db.agents.map(a => `<option value="${a.id}" ${a.id === defSec ? 'selected' : ''}>${esc(a.nom)} — ${esc(a.titre || '')}</option>`).join('')}</select></label>
      ${RM.error ? `<div class="ag-error full">⚠ ${esc(RM.error)}</div>` : ''}
      <div class="modal-actions full"><span class="sp"></span><button type="button" class="btn" data-rm-back>Annuler</button><button class="btn primary">🚀 Lancer la réunion</button></div>
    </form>
  </div>`;
}

function seatsHTML(r) {
  const people = [TAOUFIK, ...r.participants.map(agentById).filter(a => a && a.id !== 'taoufik')];
  const n = people.length;
  return people.map((a, i) => {
    const ang = (90 + i * 360 / n) * Math.PI / 180;
    const left = 50 + 44 * Math.cos(ang), top = 50 + 40 * Math.sin(ang);
    const spoke = r.messages.some(m => m.agentId === a.id);
    const speaking = RM.running && RM.id === r.id && RM.speaking === a.id;
    return `<div class="seat ${speaking ? 'speaking' : ''} ${spoke ? 'spoke' : ''}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">
      ${avatar(a, 'lg')}<span class="seat-name">${esc(a.nom)}</span>${speaking ? '<span class="seat-talk">parle…</span>' : ''}</div>`;
  }).join('');
}

function meetingView(r) {
  const running = RM.running && RM.id === r.id;
  let lastTour = 0;
  const transcript = r.messages.map(m => {
    const a = agentById(m.agentId) || { nom: 'Agent', key: 'x' };
    let head = '';
    if (m.agentId !== 'taoufik' && m.tour && m.tour !== lastTour) { lastTour = m.tour; head = `<div class="tour-sep"><span>Tour ${m.tour}</span></div>`; }
    return `${head}<div class="tmsg ${m.agentId === 'taoufik' ? 'me' : ''}">${avatar(a, 'sm')}
      <div class="tbody"><div class="cmeta"><b>${esc(a.nom)}</b> · ${esc(a.titre || '')}${m.tokens ? ` · ${m.tokens.toLocaleString('fr-CA')} tokens` : ''}</div><div class="cbubble">${md(m.content)}</div></div></div>`;
  }).join('');
  const sec = agentById(r.resultatPar);
  return `
  <div class="rm-top">
    <button class="btn ghost-dark" data-rm-back>← Toutes les réunions</button>
    <div class="rm-title"><h2>${esc(r.titre)}</h2><span class="muted small">${esc(fmtDate(r.date))}${r.projet ? ' · ' + esc(r.projet) : ''}</span> ${badge(r.statut || '')}</div>
  </div>
  <div class="rm-layout">
    <div class="rm-left">
      <div class="rtable-wrap card">
        <div class="rtable">
          <div class="rtable-top"><span class="rt-label">Sur la table</span><b>${esc(r.projet || r.titre)}</b>${r.objectif ? `<p>${esc(r.objectif.slice(0, 140))}${r.objectif.length > 140 ? '…' : ''}</p>` : ''}</div>
          ${seatsHTML(r)}
        </div>
        ${running ? `<div class="rm-progress"><span class="dot-live"></span>${esc(RM.progress)} <button class="btn small danger" data-rm-stop>⏹ Arrêter</button></div>` : ''}
        ${RM.error && RM.id === r.id && !running ? `<div class="ag-error">⚠ ${esc(RM.error)}</div>` : ''}
      </div>
      ${r.resultat ? `
      <div class="card rm-result">
        <div class="rm-result-head"><h3>📋 Compte rendu</h3>${sec ? `<span class="muted small">rédigé par ${avatar(sec, 'xs')} ${esc(sec.nom)}</span>` : ''}</div>
        ${r.memo ? `<div class="rm-memo-box"><b>En une phrase :</b> ${esc(r.memo)}</div>` : ''}
        <div class="report-body">${md(r.resultat)}</div>
        <div class="rm-actions">
          <button class="btn" data-rm-act="memoire">🧠 Mémoriser pour l’équipe</button>
          <button class="btn" data-rm-act="note">📝 Enregistrer dans Notes</button>
          ${r.projetId && db.projets.find(p => p.id === r.projetId) ? '<button class="btn" data-rm-act="projet">📁 Ajouter au projet</button>' : ''}
          <button class="btn" data-rm-act="pdf">🖨 PDF (avec la discussion)</button>
          <button class="btn" data-rm-act="copier">⧉ Copier</button>
        </div>
      </div>
      ${actionsApprovalCard(r)}
      ${clientReportCard(r)}` : ''}
    </div>
    <div class="rm-right card">
      <h3>💬 La discussion</h3>
      <div class="rm-transcript" id="rm-transcript">${transcript || '<div class="empty">La réunion va commencer…</div>'}
        ${running ? `<div class="tmsg">${avatar(agentById(RM.speaking) || TAOUFIK, 'sm')}<div class="tbody"><div class="cbubble typing"><span></span><span></span><span></span></div></div></div>` : ''}
      </div>
      <form id="rm-intervene" class="composer2">
        <textarea name="t" rows="1" placeholder="${r.resultat ? 'Intervenir : une remarque, une nouvelle question…' : 'Ta remarque pour l’équipe…'}" ${running ? 'disabled' : ''}></textarea>
        <button class="send-btn" ${running ? 'disabled' : ''} title="Relancer un tour de parole">➤</button>
      </form>
      <p class="muted small hint">Ton intervention relance un tour de parole, puis un nouveau compte rendu.</p>
      <div style="text-align:right;margin-top:6px"><button class="btn small danger" data-rm-del ${running ? 'disabled' : ''}>Supprimer la réunion</button></div>
    </div>
  </div>`;
}

/* ---------- Impression ---------- */
function printMeeting(r) {
  const people = r.participants.map(agentById).filter(Boolean).map(a => `${a.nom} (${a.titre || ''})`).join(', ');
  const transcript = r.messages.map(m => `**${speakerName(m)}**${m.tour && m.agentId !== 'taoufik' ? ` — tour ${m.tour}` : ''}\n${m.content}`).join('\n\n');
  const text = `## ${r.titre}\n**Date :** ${fmtDate(r.date)} · **Participants :** Taoufik, ${people}\n${r.objectif ? `**Question :** ${r.objectif}\n` : ''}\n${r.resultat || ''}\n\n## Transcription de la discussion\n${transcript}`;
  printReport(text, { nom: 'Réunion d’équipe' });
}

/* ---------- Événements ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || $('#modal-backdrop').contains(t)) return;
  const d = t.dataset;
  if ('rmNew' in d) { RM.view = 'new'; RM.error = ''; render(); }
  else if ('rmBack' in d) { RM.view = 'list'; RM.error = ''; render(); }
  else if (d.rmOpen) { RM.view = 'meeting'; RM.id = d.rmOpen; if (!RM.running) RM.error = ''; render(); scrollMeeting(); }
  else if ('rmStop' in d) { RM.stop = true; t.disabled = true; t.textContent = 'Arrêt après cette intervention…'; }
  else if ('rmDel' in d) {
    if (!t.classList.contains('confirm')) { t.classList.add('confirm'); t.textContent = 'Confirmer la suppression'; return; }
    db.reunions = db.reunions.filter(r => r.id !== RM.id); RM.view = 'list'; save(); render(); toast('Réunion supprimée');
  }
  else if (d.rmAct) {
    const r = getMeeting(RM.id); if (!r) return;
    if (d.rmAct === 'memoire') {
      const txt = `Réunion « ${r.titre} » (${r.date}) : ${r.memo || r.resultat.slice(0, 400)}`;
      r.participants.map(agentById).filter(a => a && a.memoire).forEach(a => a.memoire.push({ id: uid(), date: todayISO(), texte: txt }));
      save(); toast('Ajouté à la mémoire de chaque participant ✓');
    } else if (d.rmAct === 'note') {
      db.notes.push({ id: uid(), titre: `Réunion — ${r.titre}`.slice(0, 120), date: todayISO(), source: 'Agent IA', projet: r.projet || '', tags: 'réunion, agents', contenu: r.resultat });
      save(); toast('Enregistré dans Notes ✓');
    } else if (d.rmAct === 'projet') {
      const p = db.projets.find(x => x.id === r.projetId);
      if (p) { p.notes = `${p.notes ? p.notes + '\n\n' : ''}[Réunion du ${r.date}] ${r.memo || ''}`.trim(); if (r.memo) p.prochaine = p.prochaine || r.memo.slice(0, 140); save(); toast('Ajouté aux notes du projet ✓'); }
    } else if (d.rmAct === 'pdf') printMeeting(r);
    else if (d.rmAct === 'copier') {
      (navigator.clipboard ? navigator.clipboard.writeText(r.resultat) : Promise.reject()).then(() => toast('Copié ✓'), () => toast('Copie impossible : sélectionne le texte à la main.'));
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.name === 'projet' && e.target.closest('#rm-new')) {
    const p = db.projets.find(x => x.id === e.target.value); const f = e.target.form;
    if (p && !f.elements.titre.value.trim()) f.elements.titre.value = `Réunion — ${p.nom}`;
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'rm-new') {
    e.preventDefault(); const el = f.elements;
    const p = db.projets.find(x => x.id === el.projet.value);
    const details = el.sujet.value.trim(), objectif = el.objectif.value.trim();
    const participants = $$('input[name="p"]:checked', f).map(i => i.value);
    if (!p && !details && !objectif) { RM.error = 'Choisis un projet, ou décris le sujet ou ta question.'; render(); return; }
    if (!participants.length) { RM.error = 'Choisis au moins un participant.'; render(); return; }
    const sujet = [p ? projectBrief(p) : '', details ? (p ? 'Précisions de Taoufik :\n' : '') + details : ''].filter(Boolean).join('\n\n');
    const r = {
      id: uid(), titre: el.titre.value.trim(), date: todayISO(), projetId: p ? p.id : '', projet: p ? p.nom : '',
      sujet, objectif, participants, secretaire: el.secretaire.value, tours: Number(el.tours.value) || 2,
      messages: [], resultat: '', memo: '', statut: 'En cours'
    };
    db.reunions.push(r); save();
    RM.view = 'meeting'; RM.id = r.id; RM.error = '';
    render(); runMeeting(r.id, r.tours);
  } else if (f.id === 'rm-intervene') {
    e.preventDefault(); const v = f.elements.t.value.trim(); if (!v || RM.running) return;
    const r = getMeeting(RM.id); if (!r) return;
    const tour = r.messages.reduce((mx, m) => Math.max(mx, m.tour || 0), 0);
    r.messages.push({ id: uid(), agentId: 'taoufik', tour, content: v, date: new Date().toISOString() });
    save(); runMeeting(r.id, 1);
  }
});

document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('#rm-intervene') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#rm-intervene').requestSubmit(); }
});

/* =========================================================
   ACTIONS : extraites du plan d'action, approuvées par Taoufik
   ========================================================= */
SCHEMAS.actions = {
  single: 'action', filter: 'statut',
  cols: ['titre', 'responsable', 'statut', 'echeance', 'projet'],
  fields: [
    { k: 'titre', l: 'Action', t: 'text', req: true, full: true },
    { k: 'responsable', l: 'Responsable', t: 'select', get o() { return ['Taoufik', ...db.agents.map(a => a.nom)]; }, def: 'Taoufik' },
    { k: 'statut', l: 'Statut', t: 'select', o: ['À faire', 'En cours', 'Fait'], def: 'À faire' },
    { k: 'priorite', l: 'Priorité', t: 'select', o: ['Haute', 'Normale', 'Basse'], def: 'Normale' },
    { k: 'echeance', l: 'Échéance', t: 'date' },
    { k: 'projet', l: 'Projet', t: 'projet' },
    { k: 'source', l: 'Source', t: 'text', full: true },
    { k: 'notes', l: 'Notes', t: 'textarea', full: true }
  ]
};
NAV.splice(NAV.findIndex(n => n[0] === 'projets') + 1, 0, ['actions', 'Actions à faire', '✅']);

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// Transforme « vendredi », « demain », « dans 2 semaines », « 2026-12-05 »… en date (ou '')
function guessDate(txt) {
  const s = String(txt || '').toLowerCase();
  const iso = s.match(/\d{4}-\d{2}-\d{2}/); if (iso) return iso[0];
  if (/aujourd/.test(s)) return todayISO();
  if (/demain/.test(s)) return addDays(1);
  const dans = s.match(/dans\s+(\d+)\s*(jour|semaine|mois)/);
  if (dans) return addDays(Number(dans[1]) * (dans[2].startsWith('semaine') ? 7 : dans[2] === 'mois' ? 30 : 1));
  if (/semaine prochaine/.test(s)) return addDays(7);
  if (/cette semaine|fin de semaine/.test(s)) { const d = new Date(); return addDays((5 - d.getDay() + 7) % 7 || 0); }
  if (/fin du mois/.test(s)) { const d = new Date(); return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  const wd = WEEKDAYS.findIndex(w => s.includes(w));
  if (wd >= 0) { const d = new Date(); return addDays(((wd - d.getDay() + 7) % 7) || 7); }
  return '';
}

function matchResponsable(txt) {
  const s = String(txt || '').toLowerCase();
  const names = ['Taoufik', ...db.agents.map(a => a.nom)];
  return names.find(n => s.includes(n.toLowerCase())) || 'Taoufik';
}

function parseActions(text) {
  const sec = String(text || '').split(/^#{2,3}\s+/m).find(s => /^plan d[’']action/i.test(s.trim()));
  if (!sec) return [];
  const lines = sec.split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  const out = [];
  for (let l of lines) {
    if (/^\|[\s:|-]+\|?$/.test(l)) continue;                         // séparateur de tableau
    if (l.startsWith('|')) {                                            // ligne de tableau
      const c = l.replace(/^\||\|$/g, '').split('|').map(x => x.replace(/\*\*/g, '').trim());
      if (!c[0] || /^action$/i.test(c[0])) continue;
      out.push({ titre: c[0], responsable: matchResponsable(c[1]), echeanceTexte: c[2] || '', echeance: guessDate(c[2]) });
      continue;
    }
    if (!/^([-*•]|\d+[.)])\s+/.test(l)) continue;
    l = l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim();
    const parts = l.split(/\s+[—–]\s+/).length > 1 ? l.split(/\s+[—–]\s+/) : l.split(/\s+-\s+/);
    out.push({ titre: parts[0].trim(), responsable: matchResponsable(parts[1]), echeanceTexte: (parts.slice(2).join(' — ') || '').trim(), echeance: guessDate(parts.slice(2).join(' ')) });
  }
  return out.filter(x => x.titre).slice(0, 15);
}

function actionsApprovalCard(r) {
  const list = r.actionsProposees || [];
  if (!list.length) return `<div class="card pa-card"><div class="rm-result-head"><h3>✅ Actions de la réunion</h3></div>
    <p class="muted small">Aucune action détectée automatiquement dans ce compte rendu.</p>
    <button class="btn primary" data-pa-extract="${r.id}" ${PA.busy ? 'disabled' : ''}>${PA.busy ? 'Recherche des actions…' : '🔍 Extraire les actions du compte rendu'}</button>
    ${PA.error ? `<div class="ag-error">⚠ ${esc(PA.error)}</div>` : ''}</div>`;
  const pending = list.filter(x => x.statut === 'proposée');
  const names = ['Taoufik', ...db.agents.map(a => a.nom)];
  return `<div class="card pa-card">
    <div class="rm-result-head"><h3>✅ Actions proposées</h3>${pending.length ? `<button class="btn small primary" data-pa-modal="${r.id}">Choisir les actions à ajouter (${pending.length})</button>` : ''}</div>
    <p class="muted small">Vérifie, ajuste si besoin, puis approuve : l’action est ajoutée à « Actions à faire ».</p>
    ${list.map(x => x.statut === 'proposée' ? `
      <div class="pa-row" data-pa-row="${x.id}">
        <input class="pa-title" value="${esc(x.titre)}">
        <select class="pa-resp">${names.map(n => `<option ${n === x.responsable ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <input class="pa-date" type="date" value="${esc(x.echeance || '')}" title="${esc(x.echeanceTexte || '')}">
        <button class="btn small ok" data-pa-ok="${x.id}" title="Approuver">✓ Approuver</button>
        <button class="btn small" data-pa-no="${x.id}" title="Rejeter">✕</button>
      </div>` : `
      <div class="pa-row done ${x.statut === 'rejetée' ? 'rejected' : ''}">
        <span>${x.statut === 'approuvée' ? '✅' : '⛔'} ${esc(x.titre)}</span>
        <span class="muted small">${x.statut === 'approuvée' ? `ajoutée · ${esc(x.responsable)}${x.echeance ? ' · ' + esc(fmtDate(x.echeance)) : ''}` : 'rejetée'}</span>
        ${x.statut === 'rejetée' ? `<button class="btn small" data-pa-undo="${x.id}">Reconsidérer</button>` : ''}
      </div>`).join('')}
  </div>`;
}

function approveAction(r, x) {
  const row = $(`[data-pa-row="${x.id}"]`);
  if (row) { x.titre = $('.pa-title', row).value.trim() || x.titre; x.responsable = $('.pa-resp', row).value; x.echeance = $('.pa-date', row).value; }
  const a = { id: uid(), titre: x.titre, responsable: x.responsable, statut: 'À faire', priorite: 'Normale', echeance: x.echeance || '', projet: r.projet || '', source: `Réunion « ${r.titre} » du ${r.date}`, reunionId: r.id, notes: x.echeanceTexte ? `Échéance proposée : ${x.echeanceTexte}` : '' };
  db.actions.push(a); x.statut = 'approuvée'; x.actionId = a.id;
}

function pendingProposals() {
  return db.reunions.flatMap(r => (r.actionsProposees || []).filter(x => x.statut === 'proposée').map(x => ({ r, x })));
}

VIEWS.actions = () => {
  const st = ui.actions || (ui.actions = { q: '', f: '', who: '' });
  const pend = pendingProposals();
  const byMeeting = [...new Set(pend.map(p => p.r.id))].map(id => getMeeting(id));
  let items = db.actions.filter(a => !st.q || Object.values(a).join(' ').toLowerCase().includes(st.q.toLowerCase()))
    .filter(a => !st.who || a.responsable === st.who);
  const prio = { Haute: 0, Normale: 1, Basse: 2 };
  items.sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || (prio[a.priorite] ?? 1) - (prio[b.priorite] ?? 1));
  const groups = ['À faire', 'En cours', 'Fait'];
  const who = ['Taoufik', ...db.agents.map(a => a.nom)];
  const person = n => n === 'Taoufik' ? TAOUFIK : (db.agents.find(a => a.nom === n) || { nom: n || '?', key: 'x', id: n });
  return `
  ${byMeeting.length ? `<div class="info">🕓 ${pend.length} action${pend.length > 1 ? 's' : ''} proposée${pend.length > 1 ? 's' : ''} en attente d’approbation : ${byMeeting.map(m => `<button class="btn small primary" data-pa-review="${m.id}">Choisir — ${esc(m.titre)}</button>`).join(' ')}</div>` : ''}
  <div class="toolbar">
    <input class="search" data-col="actions" placeholder="Rechercher…" value="${esc(st.q)}">
    <select id="act-who"><option value="">Responsable : tous</option>${who.map(n => `<option ${n === st.who ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <button class="btn primary" data-add="actions">+ Ajouter</button>
  </div>
  <div class="act-groups">${groups.map(g => {
    const list = items.filter(a => (a.statut || 'À faire') === g);
    return `<div class="act-group ${g === 'Fait' ? 'is-done' : ''}">
      <div class="act-head">${g} <span class="muted">(${list.length})</span></div>
      ${list.map(a => {
        const d = a.echeance ? daysUntil(a.echeance) : null;
        return `<div class="act-item" data-edit="actions" data-id="${a.id}">
          <button class="act-check ${a.statut === 'Fait' ? 'on' : ''}" data-act-toggle="${a.id}" title="Marquer comme fait">${a.statut === 'Fait' ? '✓' : ''}</button>
          <div class="act-main"><div class="act-title">${esc(a.titre)}</div>
            <div class="act-meta">${avatar(person(a.responsable), 'xs')} ${esc(a.responsable || '')}
              ${a.echeance ? `<span class="badge ${a.statut !== 'Fait' && d < 0 ? 'red' : a.statut !== 'Fait' && d <= 3 ? 'orange' : ''}">${esc(fmtDate(a.echeance))}${a.statut !== 'Fait' && d < 0 ? ' · en retard' : ''}</span>` : ''}
              ${a.priorite === 'Haute' ? '<span class="badge red">priorité haute</span>' : ''}
              ${a.projet ? `<span class="badge">▦ ${esc(a.projet)}</span>` : ''}
              ${a.source ? `<span class="muted small">${esc(a.source)}</span>` : ''}</div></div>
        </div>`;
      }).join('') || '<div class="empty small">Rien ici.</div>'}
    </div>`;
  }).join('')}</div>`;
};

/* =========================================================
   RAPPORT CLIENT OFFICIEL (à partir d'une réunion)
   ========================================================= */
const RC = { busyId: null, error: '' };

function clientReportCard(r) {
  const rc = r.rapportClient;
  const busy = RC.busyId === r.id;
  return `<div class="card rc-card">
    <div class="rm-result-head"><h3>📄 Rapport client officiel</h3>
      ${rc ? `<span class="muted small">généré le ${esc(fmtDate(rc.date))}</span>` : ''}</div>
    ${!rc ? `<p class="muted">Transforme cette réunion en rapport professionnel pour ton client, aux couleurs de <b>${esc(db.marque.nom || 'Stony Automation')}</b> : page couverture, résumé exécutif, analyse, recommandations priorisées, plan de mise en œuvre et prochaines étapes. La discussion interne et les prénoms des agents n’y apparaissent pas.</p>
      <div class="rc-gen"><label>Nom du client<input id="rc-client" value="${esc((db.projets.find(p => p.id === r.projetId) || {}).client || '')}" placeholder="ex. Usinage Deux Rives inc."></label>
      <button class="btn primary" data-rc-gen="${r.id}" ${busy || RM.running ? 'disabled' : ''}>${busy ? 'Rédaction en cours… (1 à 4 min)' : '✨ Générer le rapport client'}</button></div>`
    : `<div class="rc-preview report-body">${md(rc.contenu.slice(0, 1800))}${rc.contenu.length > 1800 ? '<p class="muted">… (suite dans le PDF)</p>' : ''}</div>
      <div class="rm-actions">
        <button class="btn primary" data-rc-print="${r.id}">🖨 PDF officiel</button>
        <button class="btn" data-rc-edit="${r.id}">✏️ Modifier</button>
        <button class="btn" data-rc-note="${r.id}">📝 Enregistrer dans Notes</button>
        <button class="btn" data-rc-gen="${r.id}" ${busy || RM.running ? 'disabled' : ''}>${busy ? 'Rédaction…' : '🔄 Régénérer'}</button>
      </div>`}
    ${RC.error && busy === false && RC.lastId === r.id ? `<div class="ag-error">⚠ ${esc(RC.error)}</div>` : ''}
  </div>`;
}

async function generateClientReport(id) {
  const r = getMeeting(id); if (!r || RC.busyId) return;
  const sec = agentById(r.secretaire) && r.secretaire !== 'taoufik' ? agentById(r.secretaire) : (db.agents.find(a => a.key === 'rapports') || db.agents[0]);
  const client = ($('#rc-client') && $('#rc-client').value.trim()) || (r.rapportClient && r.rapportClient.client) || '';
  if (!(sec.model || db.provider.modeleDefaut)) { RC.error = 'Choisis d’abord un modèle par défaut dans « Fournisseur de tokens ».'; RC.lastId = id; render(); return; }
  RC.busyId = id; RC.error = ''; RC.lastId = id; window.AI_BUSY = true; render();
  const brand = db.marque.nom || 'Stony Automation';
  const instr = `Rédige maintenant un RAPPORT OFFICIEL destiné au client${client ? ` « ${client} »` : ''}, au nom de ${brand}.
Règles :
- Vouvoiement, ton professionnel, français québécois clair. Phrases courtes, pas de jargon.
- Ne mentionne JAMAIS la réunion interne, les agents, leurs prénoms ni « l’équipe IA » : l’analyse est présentée comme celle de ${brand}.
- N’invente aucun chiffre, aucun nom, aucun résultat : quand une donnée manque, écris [À COMPLÉTER : …].
- Analyse claire : pour chaque constat, explique la cause et l’impact pour l’entreprise.
Structure exacte (Markdown) :
## Résumé exécutif
(4 à 6 phrases : situation, enjeu principal, recommandation clé, bénéfice attendu)
## Contexte et objectifs
## Analyse de la situation
### Constats
### Opportunités
### Risques
## Recommandations
(un tableau Markdown : | Priorité | Recommandation | Impact attendu | Effort |)
## Plan de mise en œuvre
(étapes numérotées avec durée estimée)
## Investissement et retour sur investissement
(méthode de calcul ; utilise [À COMPLÉTER] pour les montants inconnus)
## Prochaines étapes
Ne mets pas de titre principal ni de signature : ils sont ajoutés automatiquement.`;
  try {
    const res = await callAgentApi('POST', '', {
      model: sec.model || db.provider.modeleDefaut, temperature: 0.3, max_tokens: 3000,
      messages: [{ role: 'system', content: agentSystem(sec) },
        { role: 'user', content: `${meetingBrief(r)}\n\nCOMPTE RENDU INTERNE (source principale) :\n${r.resultat}\n\nEXTRAITS DE LA DISCUSSION :\n${transcriptText(r, 700, 10)}\n\n${instr}` }]
    });
    addUsage(sec, res.usage);
    const m = getMeeting(id);
    m.rapportClient = { contenu: res.content.trim(), date: todayISO(), client, titre: m.projet ? `${m.projet}` : m.titre, par: sec.id };
    save(); toast('Rapport client prêt ✓');
  } catch (e) { RC.error = e.message; }
  RC.busyId = null; window.AI_BUSY = false; render();
}

function editClientReport(id) {
  const r = getMeeting(id); if (!r || !r.rapportClient) return;
  const rc = r.rapportClient;
  modal(`<h2>Modifier le rapport client</h2>
    <form id="rc-f">
      <label>Titre du rapport<input name="titre" value="${esc(rc.titre || '')}"></label>
      <label>Client<input name="client" value="${esc(rc.client || '')}"></label>
      <label>Contenu (Markdown : ## titres, - listes, | tableaux |, **gras**)<textarea name="contenu" style="min-height:380px;font-family:ui-monospace,monospace;font-size:12.5px">${esc(rc.contenu)}</textarea></label>
      <div class="modal-actions"><span class="sp"></span><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`);
  $('#rc-f').onsubmit = e => {
    e.preventDefault(); const el = e.target.elements;
    rc.titre = el.titre.value.trim(); rc.client = el.client.value.trim(); rc.contenu = el.contenu.value;
    save(); closeModal(); render(); toast('Rapport enregistré ✓');
  };
}

/* ---------- Section : Rapports clients ---------- */
NAV.splice(NAV.findIndex(n => n[0] === 'reunions') + 1, 0, ['rapports', 'Rapports clients', '📄']);
VIEWS.rapports = () => {
  const list = db.reunions.filter(r => r.rapportClient).sort((a, b) => (b.rapportClient.date || '').localeCompare(a.rapportClient.date || ''));
  return `
  <div class="info">Un rapport client se crée à partir d’une réunion terminée : ouvre la réunion, puis clique sur <b>✨ Générer le rapport client</b>.</div>
  <div class="rm-list">${list.map(r => `
    <div class="rm-card rc-list-card">
      <div class="rc-mini-cover">${logoSVG(28, true)}<span>${esc(r.rapportClient.titre || r.titre)}</span></div>
      <b>${esc(r.rapportClient.client || 'Client non précisé')}</b>
      <div class="muted small">${esc(fmtDate(r.rapportClient.date))} · réunion « ${esc(r.titre)} »</div>
      <div class="rm-actions" style="border:0;padding:0;margin-top:6px">
        <button class="btn small primary" data-rc-print="${r.id}">🖨 PDF</button>
        <button class="btn small" data-rc-edit="${r.id}">✏️ Modifier</button>
        <button class="btn small" data-rm-goto="${r.id}">Ouvrir la réunion</button>
      </div>
    </div>`).join('') || '<div class="empty card">Aucun rapport client pour l’instant.</div>'}</div>`;
};

/* ---------- Événements (actions + rapports) ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || $('#modal-backdrop').contains(t)) return;
  const d = t.dataset;
  if (d.actToggle) {
    e.stopPropagation();
    const a = db.actions.find(x => x.id === d.actToggle);
    if (a) { a.statut = a.statut === 'Fait' ? 'À faire' : 'Fait'; if (a.statut === 'Fait') a.faitLe = todayISO(); save(); render(); toast(a.statut === 'Fait' ? 'Bravo, action terminée ✓' : 'Action rouverte'); }
    return;
  }
  if (d.rmGoto) { RM.view = 'meeting'; RM.id = d.rmGoto; location.hash = 'reunions'; render(); return; }
  const r = getMeeting(RM.id);
  if (d.paOk && r) { const x = r.actionsProposees.find(y => y.id === d.paOk); if (x) { approveAction(r, x); save(); render(); toast('Action ajoutée à « Actions à faire » ✓'); } }
  else if (d.paNo && r) { const x = r.actionsProposees.find(y => y.id === d.paNo); if (x) { x.statut = 'rejetée'; save(); render(); } }
  else if (d.paUndo && r) { const x = r.actionsProposees.find(y => y.id === d.paUndo); if (x) { x.statut = 'proposée'; save(); render(); } }
  else if ('paAll' in d && r) { const n = r.actionsProposees.filter(y => y.statut === 'proposée'); n.forEach(x => approveAction(r, x)); save(); render(); toast(`${n.length} actions ajoutées ✓`); }
  else if (d.rcGen) generateClientReport(d.rcGen);
  else if (d.rcPrint) { const m = getMeeting(d.rcPrint); if (m) printClientReport(m); }
  else if (d.rcEdit) editClientReport(d.rcEdit);
  else if (d.rcNote) {
    const m = getMeeting(d.rcNote);
    if (m && m.rapportClient) { db.notes.push({ id: uid(), titre: `Rapport client — ${m.rapportClient.client || m.titre}`.slice(0, 120), date: todayISO(), source: 'Agent IA', projet: m.projet || '', tags: 'rapport client', contenu: m.rapportClient.contenu }); save(); toast('Enregistré dans Notes ✓'); }
  }
}, true);

document.addEventListener('change', e => {
  if (e.target.id === 'act-who') { (ui.actions || (ui.actions = { q: '', f: '', who: '' })).who = e.target.value; render(); }
});

/* =========================================================
   Actions de réunion : extraction fiable + fenêtre de choix
   ========================================================= */
const PA = { busy: false, error: '' };

// Lit le bloc « ACTIONS : » (titre | responsable | échéance) et le retire du texte affiché
function extractActionsBlock(text) {
  const t = String(text || '');
  const m = t.match(/^\s*\**\s*ACTIONS\s*\**\s*:?\s*\**\s*$/mi);
  if (!m) return { text: t, actions: [] };
  const start = m.index;
  const rest = t.slice(start + m[0].length);
  const stop = rest.search(/^\s*\**\s*MÉMO\s*:/mi);
  const blockBody = stop >= 0 ? rest.slice(0, stop) : rest;
  const actions = blockBody.split('\n').map(l => l.trim()).filter(l => /^([-*•]|\d+[.)])\s+/.test(l)).map(l => {
    const c = l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').split('|').map(s => s.trim());
    return { titre: c[0], responsable: matchResponsable(c[1]), echeanceTexte: c[2] || '', echeance: guessDate(c[2]) };
  }).filter(a => a.titre);
  const cleaned = (t.slice(0, start) + (stop >= 0 ? rest.slice(stop) : '')).trim();
  return { text: cleaned, actions };
}

// Version plus tolérante de l'analyse du « Plan d'action » (listes, numéros, tableaux, sous-lignes « Responsable : »)
const _parseActionsBase = parseActions;
parseActions = function (text) {
  const sec = String(text || '').split(/^#{2,4}\s+/m).find(s => /^(plan d[’']action|actions? (à faire|retenues|proposées)?|prochaines étapes)/i.test(s.trim()));
  if (!sec) return [];
  if (/^\s*\|/m.test(sec)) return _parseActionsBase(text);        // tableau : analyse d'origine
  const out = []; let cur = null;
  for (const raw of sec.split('\n').slice(1)) {
    const l = raw.replace(/\*\*/g, '').trim(); if (!l) continue;
    // sous-ligne « Responsable : … » ou « Échéance : … » rattachée à l'action précédente
    const sub = l.match(/^(?:[-*•]\s*)?(responsable|qui|porteur|échéance|echeance|quand|date|délai)\s*:\s*(.+)$/i);
    if (sub) {
      if (cur) {
        if (/responsable|qui|porteur/i.test(sub[1])) cur.responsable = matchResponsable(sub[2]);
        else { cur.echeanceTexte = sub[2].trim(); cur.echeance = guessDate(sub[2]); }
      }
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(l) || /^action\s*\d*\s*:/i.test(l)) {
      const body = l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/^action\s*\d*\s*:\s*/i, '');
      const parts = body.split(/\s+[—–|]\s+/);
      cur = { titre: parts[0].replace(/[:;,.]\s*$/, '').trim(), responsable: parts[1] ? matchResponsable(parts[1]) : 'Taoufik',
        echeanceTexte: (parts[2] || '').trim(), echeance: guessDate(parts[2] || '') };
      out.push(cur);
    }
  }
  return out.filter(a => a.titre).slice(0, 15);
};

// Si rien n'est trouvé : on demande au rédacteur d'extraire les actions
async function extractActionsWithAI(id) {
  const r = getMeeting(id); if (!r || PA.busy) return;
  let found = parseActions(r.resultat);
  if (!found.length) {
    const sec = (agentById(r.secretaire) && r.secretaire !== 'taoufik') ? agentById(r.secretaire) : (db.agents.find(a => a.key === 'rapports') || db.agents[0]);
    if (!(sec.model || db.provider.modeleDefaut)) { PA.error = 'Choisis d’abord un modèle par défaut dans « Fournisseur de tokens ».'; render(); return; }
    PA.busy = true; PA.error = ''; window.AI_BUSY = true; render();
    try {
      const res = await callAgentApi('POST', '', {
        model: sec.model || db.provider.modeleDefaut, temperature: 0, max_tokens: 800,
        messages: [{ role: 'system', content: 'Tu extrais des actions à faire à partir d’un compte rendu de réunion. Réponds uniquement avec la liste demandée, rien d’autre.' },
          { role: 'user', content: `Compte rendu :\n${r.resultat}\n\nListe toutes les actions concrètes à faire, une par ligne, exactement dans ce format :\nACTIONS :\n- titre court | responsable (Taoufik, ${db.agents.map(a => a.nom).join(', ')}) | échéance (ex. vendredi, dans 2 semaines)\nSi aucune action, écris seulement : ACTIONS :` }]
      });
      addUsage(sec, res.usage);
      const b = extractActionsBlock(res.content.includes('ACTIONS') ? res.content : 'ACTIONS :\n' + res.content);
      found = b.actions;
    } catch (e) { PA.error = e.message; }
    PA.busy = false; window.AI_BUSY = false;
  }
  const m = getMeeting(id);
  if (found.length) {
    m.actionsProposees = [...(m.actionsProposees || []).filter(x => x.statut !== 'proposée'), ...found.map(x => ({ id: uid(), ...x, statut: 'proposée' }))];
    save(); render(); openActionsModal(id);
  } else { if (!PA.error) PA.error = 'Aucune action concrète trouvée dans ce compte rendu.'; render(); }
}

// Fenêtre : Taoufik coche les actions à ajouter
function openActionsModal(id) {
  const r = getMeeting(id); if (!r) return;
  const pending = (r.actionsProposees || []).filter(x => x.statut === 'proposée');
  if (!pending.length) { toast('Aucune action en attente.'); return; }
  const names = ['Taoufik', ...db.agents.map(a => a.nom)];
  modal(`<h2>✅ Actions décidées en réunion</h2>
    <p class="muted">« ${esc(r.titre)} » — coche les actions à ajouter à <b>Actions à faire</b>. Tu peux modifier le texte, le responsable et la date.</p>
    <form id="pa-modal">
      <div class="pam-tools"><label class="chk"><input type="checkbox" id="pam-all" checked> Tout cocher / décocher</label></div>
      <div class="pam-list">${pending.map(x => `
        <div class="pam-row" data-id="${x.id}">
          <input type="checkbox" class="pam-check" checked>
          <div class="pam-fields">
            <input class="pam-title" value="${esc(x.titre)}">
            <div class="pam-sub">
              <select class="pam-resp">${names.map(n => `<option ${n === x.responsable ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
              <input class="pam-date" type="date" value="${esc(x.echeance || '')}">
              ${x.echeanceTexte ? `<span class="muted small">proposé : ${esc(x.echeanceTexte)}</span>` : ''}
            </div>
          </div>
        </div>`).join('')}</div>
      <p class="muted small">Les actions non cochées sont mises de côté : tu pourras les reconsidérer plus tard dans la réunion.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Plus tard</button><span class="sp"></span><button class="btn primary" id="pam-go">Ajouter ${pending.length} action${pending.length > 1 ? 's' : ''}</button></div>
    </form>`);
  const count = () => { const n = $$('.pam-check:checked').length; $('#pam-go').textContent = n ? `Ajouter ${n} action${n > 1 ? 's' : ''}` : 'Ne rien ajouter'; };
  $('#pam-all').onchange = e => { $$('.pam-check').forEach(c => { c.checked = e.target.checked; }); count(); };
  $$('.pam-check').forEach(c => { c.onchange = count; });
  $('#pa-modal').onsubmit = e => {
    e.preventDefault(); let added = 0;
    $$('.pam-row').forEach(row => {
      const x = r.actionsProposees.find(y => y.id === row.dataset.id); if (!x) return;
      x.titre = $('.pam-title', row).value.trim() || x.titre;
      x.responsable = $('.pam-resp', row).value; x.echeance = $('.pam-date', row).value;
      if ($('.pam-check', row).checked) { approveActionDirect(r, x); added++; } else x.statut = 'rejetée';
    });
    save(); closeModal(); render();
    toast(added ? `${added} action${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à « Actions à faire » ✓` : 'Aucune action ajoutée');
  };
}

function approveActionDirect(r, x) {
  const a = { id: uid(), titre: x.titre, responsable: x.responsable, statut: 'À faire', priorite: 'Normale', echeance: x.echeance || '', projet: r.projet || '', source: `Réunion « ${r.titre} » du ${r.date}`, reunionId: r.id, notes: x.echeanceTexte ? `Échéance proposée : ${x.echeanceTexte}` : '' };
  db.actions.push(a); x.statut = 'approuvée'; x.actionId = a.id;
}

// Pastille dans le menu : nombre d'actions en attente de ta décision
function decorateNav() {
  const link = $('#nav a[href="#actions"]'); if (!link) return;
  const n = pendingProposals().length;
  let b = $('.nav-badge', link);
  if (n) { if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; link.appendChild(b); } b.textContent = n; }
  else if (b) b.remove();
}

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || $('#modal-backdrop').contains(t)) return;
  if (t.dataset.paModal) openActionsModal(t.dataset.paModal);
  else if (t.dataset.paExtract) extractActionsWithAI(t.dataset.paExtract);
  else if (t.dataset.paReview) openActionsModal(t.dataset.paReview);
});
