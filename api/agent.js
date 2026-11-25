// =============================================================
// Fonction serveur Vercel : /api/agent
//
// Rôle : envoyer les messages des agents au fournisseur de tokens
// (Yonsepo ou tout autre service au format OpenAI) SANS jamais
// montrer la clé API dans le navigateur.
//
// Sécurité :
//   1. La clé API est lue dans les variables d'environnement Vercel.
//   2. Chaque appel doit venir d'un utilisateur connecté (Supabase) :
//      sinon, n'importe qui pourrait utiliser tes tokens.
//
// Variables d'environnement à créer dans Vercel (Settings → Environment Variables) :
//   SUPABASE_URL              la même adresse que dans config.js          (obligatoire)
//   SUPABASE_ANON_KEY         la même clé publishable que config.js       (obligatoire)
//   SUPABASE_SERVICE_ROLE_KEY clé « service_role » ou « secret » Supabase (pour lire la clé
//                             API enregistrée depuis le tableau de bord)
//   PROVIDER_API_KEY          (facultatif) clé de secours si aucune clé n'est enregistrée
//                             dans le tableau de bord
//   PROVIDER_BASE_URL         (facultatif) adresse de secours, ex. https://yonsepo.tech/v1
//
// Ordre utilisé : clé/adresse du tableau de bord, sinon variables Vercel.
// =============================================================

const MAX_MESSAGES = 60;
const MAX_CHARS = 200000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}

function providerError(data, text) {
  if (data && data.error) return typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
  if (data && data.message) return data.message;
  return String(text || '').slice(0, 500);
}

module.exports = async function handler(req, res) {
  const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY || '';
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const missing = [!SUPA_URL && 'SUPABASE_URL', !SUPA_KEY && 'SUPABASE_ANON_KEY'].filter(Boolean);
  if (missing.length) return send(res, 500, { error: 'Configuration manquante dans Vercel : ' + missing.join(', ') + '. Ajoute ces variables puis redéploie.' });

  // 1) Vérifier que la personne est connectée
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return send(res, 401, { error: 'Connexion requise.' });
  let user;
  try {
    const u = await fetch(SUPA_URL + '/auth/v1/user', { headers: { Authorization: auth, apikey: SUPA_KEY } });
    if (!u.ok) return send(res, 401, { error: 'Session expirée ou invalide : reconnecte-toi.' });
    user = await u.json();
  } catch (e) {
    return send(res, 502, { error: 'Impossible de vérifier la connexion auprès de Supabase.' });
  }
  if (!user || !user.id) return send(res, 401, { error: 'Session invalide : reconnecte-toi.' });

  // 2) Trouver la clé API : d'abord celle du tableau de bord, sinon celle de Vercel
  let KEY = '', BASE = '', source = '';
  if (SERVICE) {
    try {
      const h = { apikey: SERVICE };
      if (!SERVICE.startsWith('sb_')) h.Authorization = 'Bearer ' + SERVICE; // ancienne clé « service_role » (JWT)
      const r = await fetch(SUPA_URL + '/rest/v1/provider_secrets?select=api_key,base_url&user_id=eq.' + encodeURIComponent(user.id), { headers: h });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0] && rows[0].api_key) { KEY = rows[0].api_key; BASE = rows[0].base_url || ''; source = 'tableau de bord'; }
      } else if (r.status === 401 || r.status === 403) {
        return send(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY refusée par Supabase : recopie la clé « service_role » ou « secret » dans Vercel, puis redéploie.' });
      } else if (r.status === 404) {
        return send(res, 500, { error: 'Table provider_secrets introuvable : exécute le fichier supabase-cle-api.sql dans Supabase.' });
      }
    } catch (e) { /* on essaie la clé de secours */ }
  }
  if (!KEY && process.env.PROVIDER_API_KEY) { KEY = process.env.PROVIDER_API_KEY; source = 'Vercel'; }
  BASE = (BASE || process.env.PROVIDER_BASE_URL || 'https://yonsepo.tech/v1').replace(/\/+$/, '');
  if (!KEY) {
    return send(res, 400, { error: SERVICE
      ? 'Aucune clé API enregistrée : ajoute-la dans « Fournisseur de tokens ».'
      : 'Aucune clé API : ajoute SUPABASE_SERVICE_ROLE_KEY dans Vercel (puis redéploie) pour pouvoir enregistrer la clé depuis le tableau de bord.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || 'chat';

  // 2) Liste des modèles (sert aussi de test de connexion)
  if (req.method === 'GET' && action === 'models') {
    try {
      const r = await fetch(BASE + '/models', { headers: { Authorization: 'Bearer ' + KEY } });
      const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { /* pas du JSON */ }
      if (!r.ok) return send(res, 502, { error: 'Le fournisseur a répondu ' + r.status, details: providerError(data, text), baseUrl: BASE });
      const list = Array.isArray(data && data.data) ? data.data : Array.isArray(data) ? data : [];
      return send(res, 200, { ok: true, baseUrl: BASE, keySource: source, models: list.map(m => (m && (m.id || m.name)) || String(m)).filter(Boolean).sort() });
    } catch (e) {
      return send(res, 502, { error: 'Fournisseur injoignable à l’adresse ' + BASE, details: String(e.message || e) });
    }
  }

  // 3) Discussion
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non permise.' });
  const body = await readBody(req);
  const { model, messages } = body;
  const temperature = Number.isFinite(Number(body.temperature)) ? Math.min(2, Math.max(0, Number(body.temperature))) : 0.7;
  const max_tokens = Number.isFinite(Number(body.max_tokens)) ? Math.min(8000, Math.max(100, Number(body.max_tokens))) : 2000;

  if (!model || typeof model !== 'string') return send(res, 400, { error: 'Aucun modèle choisi pour cet agent (onglet Réglages).' });
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return send(res, 400, { error: 'Messages invalides.' });
  let chars = 0;
  for (const m of messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return send(res, 400, { error: 'Format de message invalide.' });
    chars += m.content.length;
  }
  if (chars > MAX_CHARS) return send(res, 413, { error: 'Discussion trop longue : commence une nouvelle discussion.' });

  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content })), temperature, max_tokens, stream: false })
    });
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { /* pas du JSON */ }
    if (!r.ok) return send(res, 502, { error: 'Le fournisseur a répondu ' + r.status, details: providerError(data, text) });
    const choice = data && data.choices && data.choices[0];
    const content = (choice && choice.message && choice.message.content) || (choice && choice.text) || '';
    if (!content) return send(res, 502, { error: 'Réponse vide ou dans un format inattendu.', details: String(text).slice(0, 500) });
    return send(res, 200, { content, usage: (data && data.usage) || null, model: (data && data.model) || model });
  } catch (e) {
    return send(res, 502, { error: 'Fournisseur injoignable à l’adresse ' + BASE, details: String(e.message || e) });
  }
};
