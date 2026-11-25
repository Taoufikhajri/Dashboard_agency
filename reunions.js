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

function transcriptText(r) {
  return r.messages.slice(-14).map(m => `${speakerName(m)} :\n${String(m.content).slice(0, 2500)}`).join('\n\n');
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
N’invente aucun chiffre ni aucun fait qui n’a pas été dit. Termine par une dernière ligne qui commence exactement par « MÉMO : » et qui résume les décisions en une seule phrase.`;
    const res = await callAgentApi('POST', '', {
      model: sec.model || db.provider.modeleDefaut, temperature: 0.3, max_tokens: 1800,
      messages: [{ role: 'system', content: agentSystem(sec) }, { role: 'user', content: `${meetingBrief(r)}\n\nTRANSCRIPTION COMPLÈTE :\n${transcriptText(r)}\n\n${instr}` }]
    });
    addUsage(sec, res.usage);
    r = getMeeting(id);
    const memo = res.content.match(/^\s*\**\s*MÉMO\s*:\s*\**\s*(.+)$/mi);
    r.memo = memo ? memo[1].replace(/\*+$/, '').trim() : '';
    r.resultat = res.content.replace(/^\s*\**\s*MÉMO\s*:.*$/mi, '').trim();
    r.resultatPar = sec.id; r.statut = 'Terminée'; r.maj = new Date().toISOString();
    save();
    toast('Compte rendu prêt ✓');
  } catch (e) {
    RM.error = e.message;
    r = getMeeting(id); if (r) { r.statut = r.resultat ? 'Terminée' : 'Interrompue'; save(); }
  }
  RM.running = false; RM.speaking = null; RM.progress = ''; window.AI_BUSY = false;
  render(); scrollMeeting();
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
      </div>` : ''}
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
