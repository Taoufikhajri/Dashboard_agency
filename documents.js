'use strict';
/* =========================================================
   Pièces jointes : projets et actions
   - Fichiers rangés dans Supabase Storage (espace privé « documents »)
   - La liste des fichiers est gardée sur l'élément : item.documents = [...]
   - Les fichiers texte (.txt, .md, .csv, .json) sont aussi lisibles
     par les agents (extrait gardé avec le document).
   Chargé APRÈS reunions.js.
   ========================================================= */

const DOCS_BUCKET = 'documents';
const DOC_MAX = 20 * 1024 * 1024;               // 20 Mo
const DOC_TEXT_MAX = 15000;                      // caractères gardés pour les agents
const DOC_COLS = ['projets', 'actions'];
const DOCS = { busy: {}, error: {} };

const fmtSize = n => n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1)} Mo`;
function docIcon(d) {
  const n = (d.nom || '').toLowerCase();
  if (/\.(pdf)$/.test(n)) return '📕';
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/.test(n)) return '🖼';
  if (/\.(xlsx?|csv|ods)$/.test(n)) return '📊';
  if (/\.(docx?|odt|rtf)$/.test(n)) return '📘';
  if (/\.(pptx?|odp|key)$/.test(n)) return '📙';
  if (/\.(txt|md|json)$/.test(n)) return '📄';
  if (/\.(zip|rar|7z)$/.test(n)) return '🗜';
  return '📎';
}
const isTextFile = f => /^text\//.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name);
const safeName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);

function storageError(e) {
  const m = String((e && (e.message || e.error)) || e || '');
  if (/bucket not found|not found/i.test(m)) return 'Espace de stockage introuvable : exécute le fichier supabase-documents.sql dans Supabase (SQL Editor → New query → Run).';
  if (/row-level security|unauthorized|403/i.test(m)) return 'Accès refusé par Supabase : exécute de nouveau supabase-documents.sql, puis reconnecte-toi.';
  if (/exceeded|too large|413|maximum allowed size/i.test(m)) return 'Fichier trop gros (20 Mo maximum).';
  return m || 'Erreur inconnue.';
}

/* ---------- Bloc « Documents » (dans les fenêtres) ---------- */
function docsBlockHTML(col, item) {
  const docs = item.documents || [];
  const key = col + ':' + item.id;
  if (!Cloud.user) return `<div class="docs-block"><div class="docs-head">📎 Documents</div><p class="muted small">Les pièces jointes fonctionnent en mode en ligne (connecté à Supabase).</p></div>`;
  return `<div class="docs-block" data-docs-col="${col}" data-docs-id="${item.id}">
    <div class="docs-head">📎 Documents <span class="muted">(${docs.length})</span></div>
    ${docs.length ? `<ul class="docs-list">${docs.map(d => `
      <li>
        <span class="doc-ico">${docIcon(d)}</span>
        <span class="doc-name"><button type="button" class="linkbtn" data-doc-open="${d.id}">${esc(d.nom)}</button>
          <span class="muted small">${fmtSize(d.taille || 0)} · ${esc(fmtDate(d.date))}${d.texte ? ' · 📖 lisible par les agents' : ''}</span></span>
        <button type="button" class="btn small danger" data-doc-del="${d.id}" title="Supprimer">✕</button>
      </li>`).join('')}</ul>` : ''}
    <label class="docs-drop ${DOCS.busy[key] ? 'busy' : ''}">
      <input type="file" multiple data-doc-input hidden>
      ${DOCS.busy[key] ? `<span>⏳ ${esc(DOCS.busy[key])}</span>` : '<span><b>Ajouter des fichiers</b> — clique ou glisse-les ici (20 Mo max. chacun)</span>'}
    </label>
    ${DOCS.error[key] ? `<div class="ag-error">⚠ ${esc(DOCS.error[key])}</div>` : ''}
  </div>`;
}

function findItem(col, id) { return (db[col] || []).find(x => x.id === id); }

// Insère ou met à jour le bloc dans la fenêtre ouverte
function attachDocsUI(col, id) {
  if (!DOC_COLS.includes(col)) return;
  const item = findItem(col, id);
  const modalEl = $('#modal'); if (!modalEl) return;
  let slot = $('#docs-slot', modalEl);
  if (!slot) {
    slot = document.createElement('div'); slot.id = 'docs-slot'; slot.className = 'full';
    const anchor = $('.work-foot', modalEl) || $('.modal-actions', modalEl);
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor); else modalEl.appendChild(slot);
  }
  slot.innerHTML = item ? docsBlockHTML(col, item) : `<div class="docs-block"><div class="docs-head">📎 Documents</div><p class="muted small">Enregistre d’abord, puis rouvre pour ajouter des documents.</p></div>`;
}
function refreshDocs(col, id) {
  const block = $(`.docs-block[data-docs-col="${col}"][data-docs-id="${id}"]`);
  if (block) attachDocsUI(col, id);
  render();
}

/* ---------- Actions sur les fichiers ---------- */
async function uploadDocs(col, id, files) {
  const item = findItem(col, id); if (!item || !Cloud.user) return;
  const key = col + ':' + id;
  item.documents = item.documents || [];
  delete DOCS.error[key];
  for (const f of files) {
    if (f.size > DOC_MAX) { DOCS.error[key] = `« ${f.name} » dépasse 20 Mo.`; continue; }
    DOCS.busy[key] = `Envoi de « ${f.name} »…`; refreshDocs(col, id);
    const docId = uid();
    const path = `${Cloud.user.id}/${col}/${id}/${docId}-${safeName(f.name)}`;
    try {
      const { error } = await Cloud.client.storage.from(DOCS_BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) throw error;
      const doc = { id: docId, nom: f.name, taille: f.size, type: f.type || '', path, date: todayISO() };
      if (isTextFile(f)) { try { doc.texte = (await f.text()).slice(0, DOC_TEXT_MAX); } catch (e) { /* ignore */ } }
      const it = findItem(col, id); if (it) { it.documents = it.documents || []; it.documents.push(doc); }
      save();
    } catch (e) { DOCS.error[key] = storageError(e); }
  }
  delete DOCS.busy[key]; refreshDocs(col, id);
  if (!DOCS.error[key]) toast('Document ajouté ✓');
}

async function openDoc(col, id, docId) {
  const d = (findItem(col, id)?.documents || []).find(x => x.id === docId); if (!d) return;
  const w = window.open('', '_blank');               // ouvert tout de suite (évite le blocage des fenêtres)
  try {
    const { data, error } = await Cloud.client.storage.from(DOCS_BUCKET).createSignedUrl(d.path, 300);
    if (error) throw error;
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  } catch (e) { if (w) w.close(); toast('⚠ ' + storageError(e)); }
}

async function deleteDoc(col, id, docId, btn) {
  if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.textContent = 'Supprimer ?'; return; }
  const item = findItem(col, id); const d = (item?.documents || []).find(x => x.id === docId); if (!d) return;
  const { error } = await Cloud.client.storage.from(DOCS_BUCKET).remove([d.path]);
  if (error && !/not found/i.test(error.message || '')) { DOCS.error[col + ':' + id] = storageError(error); refreshDocs(col, id); return; }
  item.documents = item.documents.filter(x => x.id !== docId); save(); refreshDocs(col, id); toast('Document supprimé');
}

// Quand un projet ou une action est supprimé : on retire aussi ses fichiers
async function removeItemDocs(col, item) {
  if (!DOC_COLS.includes(col) || !item || !(item.documents || []).length || !Cloud.user) return;
  try { await Cloud.client.storage.from(DOCS_BUCKET).remove(item.documents.map(d => d.path)); } catch (e) { /* fichiers orphelins : sans gravité */ }
}

/* ---------- Texte des documents pour les agents ---------- */
function docsForAgents(item, label) {
  const docs = (item && item.documents || []);
  if (!docs.length) return '';
  const list = docs.map(d => `- ${d.nom} (${fmtSize(d.taille || 0)})`).join('\n');
  const texts = docs.filter(d => d.texte).map(d => `--- ${d.nom} ---\n${d.texte.slice(0, 6000)}`).join('\n\n');
  return `DOCUMENTS JOINTS ${label} :\n${list}${texts ? `\n\nCONTENU DES DOCUMENTS TEXTE :\n${texts}` : '\n(Seuls les noms sont connus : le contenu des PDF, images et fichiers Office n’est pas lisible par les agents.)'}`;
}

// Ajoute les documents au contexte des tâches des agents et des réunions
const _taskContextBase = taskContext;
taskContext = function (a) {
  const base = _taskContextBase(a);
  const p = db.projets.find(x => x.nom === a.projet);
  return [base, docsForAgents(a, 'À CETTE ACTION'), p ? docsForAgents(p, 'AU PROJET') : ''].filter(Boolean).join('\n\n');
};
const _projectBriefBase = projectBrief;
projectBrief = function (p) { return [_projectBriefBase(p), docsForAgents(p, 'AU PROJET')].filter(Boolean).join('\n\n'); };

/* ---------- Événements ---------- */
function docsCtx(el) { const b = el.closest('.docs-block[data-docs-col]'); return b ? [b.dataset.docsCol, b.dataset.docsId] : [null, null]; }

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const [col, id] = docsCtx(t); if (!col) return;
  if (t.dataset.docOpen) { e.preventDefault(); openDoc(col, id, t.dataset.docOpen); }
  else if (t.dataset.docDel) { e.preventDefault(); deleteDoc(col, id, t.dataset.docDel, t); }
});
document.addEventListener('change', e => {
  if (!e.target.matches('[data-doc-input]')) return;
  const [col, id] = docsCtx(e.target); if (!col) return;
  const files = [...e.target.files]; e.target.value = '';
  if (files.length) uploadDocs(col, id, files);
});
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
  const z = e.target.closest && e.target.closest('.docs-drop'); if (!z) return;
  e.preventDefault(); z.classList.add('over');
}));
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('.docs-drop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => {
  const z = e.target.closest && e.target.closest('.docs-drop'); if (!z) return;
  e.preventDefault(); z.classList.remove('over');
  const [col, id] = docsCtx(z); if (col && e.dataTransfer.files.length) uploadDocs(col, id, [...e.dataTransfer.files]);
});
