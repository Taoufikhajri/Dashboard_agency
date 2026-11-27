// =============================================================
// Fonction serveur Vercel : /api/funnel
//
// Pages publiques des tunnels + inscriptions + courriels Brevo.
// Les tables Supabase restent privées : cette fonction utilise la clé
// secrète SUPABASE_SERVICE_ROLE_KEY (variable Vercel, jamais dans le navigateur).
//
// Actions publiques (visiteurs) :
//   GET  ?action=page&s=slug      contenu d'un tunnel publié (+ compte une visite)
//   POST ?action=optin            inscription au formulaire du tunnel
//   POST ?action=click            clic sur le bouton de la page merci
//   GET  ?action=unsub&c=..&t=..  désabonnement (lien en bas des courriels)
// Action planifiée :
//   GET  ?action=cron             envoie les courriels dus (Vercel Cron, 1 fois/jour)
// Actions réservées à toi (connecté au tableau de bord) :
//   POST ?action=run              envoie maintenant les courriels dus
//   POST ?action=test             courriel d'essai
//   POST ?action=broadcast        courriel à tous les contacts d'une étiquette
// =============================================================
const crypto = require('crypto');

const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DAY = 86400000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/* ---------- Supabase (clé secrète, côté serveur seulement) ---------- */
async function db(method, path, body, prefer) {
  const h = { apikey: SERVICE, 'Content-Type': 'application/json' };
  if (!SERVICE.startsWith('sb_')) h.Authorization = 'Bearer ' + SERVICE;
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) { const e = new Error((data && (data.message || data.hint)) || ('Erreur base de données ' + r.status)); e.status = r.status; throw e; }
  return data;
}
const q = encodeURIComponent;

async function userFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const u = await fetch(SUPA_URL + '/auth/v1/user', { headers: { Authorization: auth, apikey: ANON || SERVICE } });
  if (!u.ok) return null;
  const j = await u.json();
  return j && j.id ? j : null;
}

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}
function unsubToken(contactId) {
  return crypto.createHmac('sha256', SERVICE).update('unsub:' + contactId).digest('base64url').slice(0, 32);
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Courriels (Brevo) ---------- */
const settingsCache = new Map();
async function ownerSettings(owner) {
  if (settingsCache.has(owner)) return settingsCache.get(owner);
  const [s] = await db('GET', `email_settings?owner=eq.${q(owner)}&select=*`) || [];
  const [k] = await db('GET', `brevo_secrets?owner=eq.${q(owner)}&select=api_key`) || [];
  const out = { ...(s || {}), apiKey: k ? k.api_key : '' };
  settingsCache.set(owner, out);
  return out;
}

function fillVars(text, c) {
  const prenom = clip(c && c.prenom, 60);
  return String(text || '')
    .replace(/\{\{\s*prenom\s*\}\}/gi, prenom)
    .replace(/\{\{\s*entreprise\s*\}\}/gi, clip(c && c.entreprise, 120))
    .replace(/\{\{\s*courriel\s*\}\}/gi, clip(c && c.courriel, 200))
    .replace(/ +([,!?.])/g, '$1');
}
function bodyToHtml(text) {
  return String(text || '').split(/\n{2,}/).map(par => {
    let h = esc(par).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#2F6F57">$1</a>')
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px">${h}</p>`;
  }).join('');
}
function buildEmail(settings, contact, sujet, corps, unsubUrl) {
  const s = fillVars(sujet, contact), body = fillVars(corps, contact);
  const nom = settings.expediteur_nom || 'Stony Automation';
  const adr = settings.adresse_postale || '';
  const footer = `Vous recevez ce courriel parce que vous vous êtes inscrit(e) auprès de ${esc(nom)}.<br>${esc(nom)}${adr ? ' · ' + esc(adr) : ''}<br><a href="${esc(unsubUrl)}" style="color:#7B8794">Se désabonner</a>`;
  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;background:#F5F3EF;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1F2933">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4DED4">
<div style="background:#1F2933;padding:18px 26px;color:#ffffff;font-size:18px;font-weight:bold">${esc(nom)}</div>
<div style="padding:28px 26px;font-size:15.5px;line-height:1.6">${bodyToHtml(body)}</div></div>
<div style="max-width:600px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#7B8794;text-align:center">${footer}</div>
</body></html>`;
  const textContent = `${body}\n\n--\n${nom}${adr ? ' · ' + adr : ''}\nSe désabonner : ${unsubUrl}`;
  return { subject: s, htmlContent, textContent };
}
async function brevoSend(settings, to, mail, unsubUrl) {
  if (!settings.apiKey) throw new Error('Clé Brevo manquante (Tunnels → Courriels).');
  if (!settings.expediteur_courriel) throw new Error('Courriel d’expéditeur manquant (Tunnels → Courriels).');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': settings.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: settings.expediteur_nom || 'Stony Automation', email: settings.expediteur_courriel },
      to: [{ email: to.courriel, name: [to.prenom, to.nom].filter(Boolean).join(' ') || undefined }],
      subject: mail.subject, htmlContent: mail.htmlContent, textContent: mail.textContent,
      headers: unsubUrl ? { 'List-Unsubscribe': `<${unsubUrl}>` } : undefined
    })
  });
  if (!r.ok) {
    let m = ''; try { const j = await r.json(); m = j.message || j.code || ''; } catch (e) { }
    if (/unrecognised IP|unrecognized IP|authorised_ips|not verified/i.test(m)) throw new Error('Brevo bloque l’adresse IP de Vercel (elle change à chaque envoi). Dans Brevo : Sécurité → IP autorisées → « Désactiver le blocage » pour l’API, puis réessaie.');
    throw new Error('Brevo a refusé l’envoi' + (m ? ' : ' + m : ` (${r.status})`));
  }
}
async function logEmail(owner, contact, sujet, type, statut, erreur) {
  try { await db('POST', 'email_log', { owner, contact_id: contact && contact.id || null, courriel: contact && contact.courriel || null, sujet: clip(sujet, 300), type, statut, erreur: erreur ? clip(erreur, 500) : null }, 'return=minimal'); } catch (e) { }
}

/* ---------- Envoi des étapes de séquence dues ---------- */
async function processDue(base, { owner, enrollmentId, limit = 60 } = {}) {
  let path = `enrollments?select=*,contacts(*),sequences(*)&statut=eq.actif&prochain_envoi=lte.${q(new Date().toISOString())}&order=prochain_envoi.asc&limit=${limit}`;
  if (owner) path += `&owner=eq.${q(owner)}`;
  if (enrollmentId) path += `&id=eq.${q(enrollmentId)}`;
  const rows = await db('GET', path) || [];
  let envoyes = 0, erreurs = 0; const details = [];
  for (const en of rows) {
    const c = en.contacts, seq = en.sequences;
    if (!c || c.desabonne || !c.consentement) { await db('PATCH', `enrollments?id=eq.${q(en.id)}`, { statut: 'arrete' }, 'return=minimal'); continue; }
    if (!seq || !seq.actif) continue;
    const etapes = Array.isArray(seq.etapes) ? seq.etapes : [];
    const step = etapes[en.etape];
    if (!step) { await db('PATCH', `enrollments?id=eq.${q(en.id)}`, { statut: 'termine', prochain_envoi: null }, 'return=minimal'); continue; }
    const settings = await ownerSettings(en.owner);
    const unsub = `${base}/api/funnel?action=unsub&c=${c.id}&t=${unsubToken(c.id)}`;
    const mail = buildEmail(settings, c, step.sujet, step.corps, unsub);
    try {
      await brevoSend(settings, c, mail, unsub);
      envoyes++;
      await logEmail(en.owner, c, mail.subject, 'sequence', 'envoye');
      const next = etapes[en.etape + 1];
      await db('PATCH', `enrollments?id=eq.${q(en.id)}`, next
        ? { etape: en.etape + 1, prochain_envoi: new Date(Date.now() + Math.max(0, Number(next.delai_jours) || 0) * DAY).toISOString() }
        : { etape: en.etape + 1, statut: 'termine', prochain_envoi: null }, 'return=minimal');
    } catch (e) {
      erreurs++; details.push(e.message);
      await logEmail(en.owner, c, mail.subject, 'sequence', 'erreur', e.message);
      // on réessaiera au prochain passage (dans 1 h minimum)
      await db('PATCH', `enrollments?id=eq.${q(en.id)}`, { prochain_envoi: new Date(Date.now() + 3600000).toISOString() }, 'return=minimal');
      if (/Clé Brevo manquante|expéditeur manquant|unauthorized|Key not found|adresse IP/i.test(e.message)) break;
    }
  }
  return { traites: rows.length, envoyes, erreurs, erreur: details[0] || null };
}

/* ---------- Actions ---------- */
async function getFunnel(slug) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) return null;
  const [f] = await db('GET', `funnels?slug=eq.${q(slug)}&actif=eq.true&select=id,owner,slug,nom,config,sequence_id,vers_prospection`) || [];
  return f || null;
}
async function event(f, type) {
  try { await db('POST', 'funnel_events', { owner: f.owner, funnel_id: f.id, type }, 'return=minimal'); } catch (e) { }
}

async function optin(req, res, base) {
  const b = await readBody(req);
  if (b.site_web) return send(res, 200, { ok: true }); // robot (champ caché)
  const f = await getFunnel(String(b.slug || ''));
  if (!f) return send(res, 404, { error: 'Cette page n’est plus disponible.' });
  const courriel = clip(b.courriel, 200).toLowerCase();
  if (!EMAIL_RE.test(courriel)) return send(res, 400, { error: 'Le courriel ne semble pas valide.' });
  if (b.consentement !== true) return send(res, 400, { error: 'Merci de cocher la case de consentement.' });
  const champs = { prenom: clip(b.prenom, 60), nom: clip(b.nom, 80), telephone: clip(b.telephone, 40), entreprise: clip(b.entreprise, 160) };
  const tags = (Array.isArray(f.config && f.config.etiquettes) ? f.config.etiquettes : []).map(t => clip(t, 40)).filter(Boolean);
  const now = new Date().toISOString();

  const [old] = await db('GET', `contacts?owner=eq.${q(f.owner)}&courriel=eq.${q(courriel)}&select=*`) || [];
  let contact;
  if (old) {
    const upd = { etiquettes: Array.from(new Set([...(old.etiquettes || []), ...tags])), consentement: true, consentement_date: now, desabonne: false, desabonne_date: null };
    for (const [k, v] of Object.entries(champs)) if (v) upd[k] = v;
    [contact] = await db('PATCH', `contacts?id=eq.${q(old.id)}`, upd, 'return=representation');
  } else {
    [contact] = await db('POST', 'contacts', { owner: f.owner, courriel, ...champs, etiquettes: tags, source: 'Tunnel : ' + f.nom, funnel_id: f.id, consentement: true, consentement_date: now }, 'return=representation');
  }
  await event(f, 'inscription');

  // Séquence de courriels
  let envoi = null;
  if (f.sequence_id) {
    const [seq] = await db('GET', `sequences?id=eq.${q(f.sequence_id)}&select=id,actif,etapes`) || [];
    if (seq && seq.actif && Array.isArray(seq.etapes) && seq.etapes.length) {
      const d0 = Math.max(0, Number(seq.etapes[0].delai_jours) || 0);
      const ins = await db('POST', 'enrollments?on_conflict=contact_id,sequence_id', { owner: f.owner, contact_id: contact.id, sequence_id: seq.id, etape: 0, prochain_envoi: new Date(Date.now() + d0 * DAY).toISOString() }, 'return=representation,resolution=ignore-duplicates');
      if (Array.isArray(ins) && ins[0] && d0 === 0) {
        try { envoi = await processDue(base, { enrollmentId: ins[0].id, limit: 1 }); } catch (e) { envoi = { erreur: e.message }; }
      }
    }
  }
  // Copie dans 🎯 Prospection (table « leads »)
  if (f.vers_prospection) {
    try {
      await db('POST', 'leads', { nom: [champs.prenom, champs.nom].filter(Boolean).join(' ') || courriel, entreprise: champs.entreprise || '—', courriel, telephone: champs.telephone || null, besoin: `Inscrit au tunnel « ${f.nom} »`, consentement: true, source: 'Tunnel : ' + clip(f.nom, 80) }, 'return=minimal');
    } catch (e) { /* table leads absente : pas grave */ }
  }
  return send(res, 200, { ok: true, courriel_envoye: !!(envoi && envoi.envoyes) });
}

async function unsub(req, res) {
  const c = String(req.query.c || ''), t = String(req.query.t || '');
  const page = (titre, texte) => `<!DOCTYPE html><html lang="fr-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#F5F3EF;color:#1F2933;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border:1px solid #E4DED4;border-radius:16px;padding:36px;max-width:440px;text-align:center"><h1 style="font-size:22px">${esc(titre)}</h1><p style="color:#52606D;line-height:1.6">${texte}</p></div></body></html>`;
  if (!/^[0-9a-f-]{36}$/i.test(c) || !safeEqual(t, unsubToken(c))) return html(res, 400, page('Lien invalide', 'Ce lien de désabonnement n’est pas valide. Répondez simplement au courriel pour être retiré(e) de la liste.'));
  const [ct] = await db('PATCH', `contacts?id=eq.${q(c)}`, { desabonne: true, desabonne_date: new Date().toISOString() }, 'return=representation') || [];
  await db('PATCH', `enrollments?contact_id=eq.${q(c)}&statut=eq.actif`, { statut: 'arrete' }, 'return=minimal');
  return html(res, 200, page('Désabonnement confirmé', `${ct ? esc(ct.courriel) + ' ne recevra' : 'Vous ne recevrez'} plus nos courriels. Merci et bonne continuation!`));
}

module.exports = async function handler(req, res) {
  if (!SUPA_URL || !SERVICE) return send(res, 500, { error: 'Configuration manquante dans Vercel : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.' });
  const action = String((req.query && req.query.action) || '');
  const base = baseUrl(req);
  try {
    if (action === 'page' && req.method === 'GET') {
      const f = await getFunnel(String(req.query.s || ''));
      if (!f) return send(res, 404, { error: 'Page introuvable ou non publiée.' });
      if (req.query.vue !== '0') await event(f, 'vue');
      return send(res, 200, { nom: f.nom, slug: f.slug, config: f.config || {} });
    }
    if (action === 'optin' && req.method === 'POST') return await optin(req, res, base);
    if (action === 'click' && req.method === 'POST') {
      const b = await readBody(req); const f = await getFunnel(String(b.slug || ''));
      if (f) await event(f, 'clic');
      return send(res, 200, { ok: true });
    }
    if (action === 'unsub') return await unsub(req, res);
    if (action === 'cron') {
      const secret = process.env.CRON_SECRET;
      if (secret && req.headers.authorization !== 'Bearer ' + secret) return send(res, 401, { error: 'Non autorisé.' });
      return send(res, 200, await processDue(base, { limit: 120 }));
    }

    // ----- Actions réservées au propriétaire connecté -----
    const user = await userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Connexion requise.' });
    const b = req.method === 'POST' ? await readBody(req) : {};
    if (action === 'run') return send(res, 200, await processDue(base, { owner: user.id, limit: 60 }));
    if (action === 'test') {
      const settings = await ownerSettings(user.id);
      const to = clip(b.to || settings.expediteur_courriel || user.email, 200);
      if (!EMAIL_RE.test(to)) return send(res, 400, { error: 'Courriel de destination invalide.' });
      const fake = { id: '00000000-0000-0000-0000-000000000000', courriel: to, prenom: b.prenom || 'Taoufik', entreprise: 'Entreprise Test' };
      const unsubUrl = `${base}/api/funnel?action=unsub&c=${fake.id}&t=exemple`;
      const mail = buildEmail(settings, fake, '[TEST] ' + (b.sujet || 'Courriel d’essai'), b.corps || 'Bonjour {{prenom}},\n\nCeci est un courriel d’essai envoyé depuis ton tableau de bord Stony Automation. Si tu le reçois, Brevo est bien configuré. ✅', unsubUrl);
      await brevoSend(settings, fake, mail, unsubUrl);
      await logEmail(user.id, { courriel: to }, mail.subject, 'test', 'envoye');
      return send(res, 200, { ok: true, to });
    }
    if (action === 'broadcast') {
      const sujet = clip(b.sujet, 200), corps = clip(b.corps, 20000), tag = clip(b.etiquette, 40);
      if (!sujet || !corps) return send(res, 400, { error: 'Sujet et message obligatoires.' });
      let path = `contacts?owner=eq.${q(user.id)}&desabonne=eq.false&consentement=eq.true&select=*&order=created_at.asc&limit=280`;
      if (tag) path += `&etiquettes=cs.${q('{"' + tag.replace(/"/g, '') + '"}')}`;
      const list = await db('GET', path) || [];
      const settings = await ownerSettings(user.id);
      let envoyes = 0, erreurs = 0, erreur = null;
      for (const c of list) {
        const unsubUrl = `${base}/api/funnel?action=unsub&c=${c.id}&t=${unsubToken(c.id)}`;
        const mail = buildEmail(settings, c, sujet, corps, unsubUrl);
        try { await brevoSend(settings, c, mail, unsubUrl); envoyes++; await logEmail(user.id, c, mail.subject, 'diffusion', 'envoye'); }
        catch (e) { erreurs++; erreur = erreur || e.message; await logEmail(user.id, c, mail.subject, 'diffusion', 'erreur', e.message); if (/Clé Brevo|expéditeur|unauthorized|Key not found|adresse IP/i.test(e.message)) break; }
      }
      return send(res, 200, { total: list.length, envoyes, erreurs, erreur });
    }
    return send(res, 400, { error: 'Action inconnue.' });
  } catch (e) {
    const missing = /relation|does not exist|schema cache|PGRST205/i.test(e.message);
    return send(res, missing ? 503 : 500, { error: missing ? 'Tables des tunnels absentes : exécute supabase-tunnels.sql dans Supabase.' : e.message });
  }
};
