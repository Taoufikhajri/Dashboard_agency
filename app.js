'use strict';
/* =========================================================
   Tableau de bord — Agence IA
   Application 100 % navigateur : les données sont gardées
   dans le localStorage du navigateur (pas de serveur).
   ========================================================= */

const KEY = 'agence-tdb-v1';

/* ---------- Petits utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isoOf = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const todayISO = () => isoOf(new Date());
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return isoOf(d); };
const money = n => (Number(n) || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const hm = min => { min = Math.round(Number(min) || 0); const h = Math.floor(min / 60), m = min % 60; return `${h} h ${String(m).padStart(2, '0')}`; };
const daysUntil = s => Math.round((new Date(s + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
const monthKey = s => (s || '').slice(0, 7);
const weekStart = (d = new Date()) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return isoOf(x); };
const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
// Montant avec cents (coûts des agents, souvent petits)
const money2 = n => { n = Number(n) || 0; if (n > 0 && n < 0.01) return '< 0,01 $'; return n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
// Durée lisible (les agents travaillent parfois moins d'une minute)
const fmtDur = min => { const s = Math.round((Number(min) || 0) * 60); if (s < 60) return `${s} s`; if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ' ' + String(s % 60).padStart(2, '0') + ' s' : ''}`; return hm(s / 60); };
// Le temps de Taoufik (entrée sans « qui » = Taoufik)
const isMine = t => !t.qui || t.qui === 'Taoufik';
// Coût d'une entrée de temps : agents = coût des tokens enregistré ; Taoufik = durée × taux horaire
const entryCost = t => isMine(t) ? (Number(t.minutes) || 0) / 60 * (Number(db.settings.tauxHoraire) || 0) : (Number(t.cout) || 0);

/* ---------- Schémas des collections ---------- */
const STATUTS_PROJET = ['Prospect', 'En cours', 'Actif (récurrent)', 'En pause', 'Terminé'];
const NICHES = ['Construction / services', 'Usine / maintenance', 'Admin PME', 'Interne', 'Autre'];

const SCHEMAS = {
  projets: {
    single: 'projet', filter: 'type',
    cols: ['nom', 'client', 'statut', 'niche', 'valeur', 'echeance', 'prochaine'],
    fields: [
      { k: 'nom', l: 'Nom du projet', t: 'text', req: true, full: true },
      { k: 'client', l: 'Client', t: 'text' },
      { k: 'statut', l: 'Statut', t: 'select', o: STATUTS_PROJET, def: 'Prospect' },
      { k: 'type', l: 'Type', t: 'select', o: ['Client', 'Démo', 'Interne'], def: 'Client' },
      { k: 'niche', l: 'Niche', t: 'select', o: NICHES },
      { k: 'valeur', l: 'Valeur du contrat ($)', t: 'number', money: true },
      { k: 'mensuel', l: 'Revenu mensuel ($/mois)', t: 'number', money: true },
      { k: 'debut', l: 'Début', t: 'date' },
      { k: 'echeance', l: 'Échéance', t: 'date' },
      { k: 'prochaine', l: 'Prochaine action', t: 'text', full: true },
      { k: 'notes', l: 'Notes', t: 'textarea', full: true }
    ]
  },
  temps: {
    single: 'entrée de temps', filter: 'categorie',
    cols: ['date', 'qui', 'projet', 'categorie', 'minutes', 'cout', 'description'],
    sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
    fields: [
      { k: 'date', l: 'Date', t: 'date', def: 'today' },
      { k: 'minutes', l: 'Durée (minutes)', t: 'number', req: true },
      { k: 'qui', l: 'Qui', t: 'select', get o() { return ['Taoufik', ...((typeof db !== 'undefined' && db.agents) || []).map(a => a.nom)]; }, def: 'Taoufik' },
      { k: 'projet', l: 'Projet', t: 'projet' },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Livraison client', 'Prospection / vente', 'Formation', 'Démo / construction', 'Admin / juridique / finances', 'Travail agent IA', 'Réunion d’équipe (IA)'], def: 'Démo / construction' },
      { k: 'description', l: 'Description', t: 'text', full: true },
      { k: 'cout', l: 'Coût', t: 'number', money: true, hidden: true }
    ]
  },
  transactions: {
    single: 'transaction', filter: 'type',
    cols: ['date', 'type', 'description', 'categorie', 'projet', 'montant'],
    sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
    fields: [
      { k: 'date', l: 'Date', t: 'date', def: 'today' },
      { k: 'type', l: 'Type', t: 'select', o: ['Revenu', 'Dépense'], def: 'Dépense' },
      { k: 'description', l: 'Description', t: 'text', req: true, full: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Services clients', 'Forfait mensuel', 'Logiciels / API', 'Formation', 'Juridique / assurance', 'Marketing / site web', 'Matériel', 'Frais bancaires', 'Autre'] },
      { k: 'montant', l: 'Montant ($ CA, taxes incluses)', t: 'number', money: true, req: true },
      { k: 'projet', l: 'Projet', t: 'projet' },
      { k: 'notes', l: 'Notes (no de facture, reçu…)', t: 'textarea', full: true }
    ]
  },
  juridique: {
    single: 'élément juridique', filter: 'statut',
    cols: ['tache', 'categorie', 'statut', 'echeance'],
    sort: (a, b) => (a.statut === 'Fait') - (b.statut === 'Fait') || (a.echeance || '9').localeCompare(b.echeance || '9'),
    fields: [
      { k: 'tache', l: 'Tâche / obligation', t: 'text', req: true, full: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Entreprise (Registraire)', 'Fiscalité (TPS/TVQ, impôt)', 'Assurance', 'Contrats', 'Vie privée (Loi 25)', 'Banque', 'Autre'] },
      { k: 'statut', l: 'Statut', t: 'select', o: ['À faire', 'En cours', 'À vérifier', 'Fait'], def: 'À faire' },
      { k: 'echeance', l: 'Échéance', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea', full: true }
    ]
  },
  formations: {
    single: 'formation', filter: 'statut',
    cols: ['titre', 'plateforme', 'statut', 'progression', 'heures', 'lien'],
    fields: [
      { k: 'titre', l: 'Titre', t: 'text', req: true, full: true },
      { k: 'plateforme', l: 'Plateforme', t: 'text' },
      { k: 'statut', l: 'Statut', t: 'select', o: ['À faire', 'En cours', 'Terminé'], def: 'À faire' },
      { k: 'progression', l: 'Progression (%)', t: 'number' },
      { k: 'heures', l: 'Durée estimée (h)', t: 'number' },
      { k: 'cout', l: 'Coût ($)', t: 'number', money: true },
      { k: 'lien', l: 'Lien', t: 'url', full: true },
      { k: 'notes', l: 'Ce que j’ai appris / à appliquer', t: 'textarea', full: true }
    ]
  },
  ressources: {
    single: 'ressource', filter: 'categorie',
    cols: ['nom', 'categorie', 'frequence', 'cout', 'lien'],
    fields: [
      { k: 'nom', l: 'Nom', t: 'text', req: true, full: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Outil / abonnement', 'Formation', 'Organisme / soutien', 'Contact / partenaire', 'Document / modèle', 'Lecture'] },
      { k: 'frequence', l: 'Coût', t: 'select', o: ['Gratuit', 'Mensuel', 'Annuel', 'Unique', 'À vérifier'], def: 'Gratuit' },
      { k: 'cout', l: 'Montant ($)', t: 'number', money: true },
      { k: 'lien', l: 'Lien', t: 'url', full: true },
      { k: 'notes', l: 'Notes', t: 'textarea', full: true }
    ]
  },
  notes: {
    single: 'note', filter: 'source',
    fields: [
      { k: 'titre', l: 'Titre', t: 'text', req: true, full: true },
      { k: 'date', l: 'Date', t: 'date', def: 'today' },
      { k: 'source', l: 'Source', t: 'select', o: ['Clavier', 'reMarkable'], def: 'Clavier' },
      { k: 'projet', l: 'Projet lié', t: 'projet' },
      { k: 'tags', l: 'Étiquettes (séparées par des virgules)', t: 'text' },
      { k: 'contenu', l: 'Contenu', t: 'textarea', full: true, big: true }
    ]
  },
  idees: {
    single: 'idée', filter: 'niche',
    cols: ['titre', 'niche', 'difficulte', 'statut', 'priorite'],
    sort: (a, b) => (Number(a.priorite) || 99) - (Number(b.priorite) || 99),
    fields: [
      { k: 'titre', l: 'Idée', t: 'text', req: true, full: true },
      { k: 'niche', l: 'Niche', t: 'select', o: NICHES },
      { k: 'difficulte', l: 'Difficulté', t: 'select', o: ['⭐', '⭐⭐', '⭐⭐⭐'], def: '⭐' },
      { k: 'statut', l: 'Statut', t: 'select', o: ['Banque d’idées', 'Priorité', 'Démo faite', 'Vendue'], def: 'Banque d’idées' },
      { k: 'priorite', l: 'Ordre de priorité (1 = en premier)', t: 'number' },
      { k: 'description', l: 'Problème → solution', t: 'textarea', full: true }
    ]
  }
};

const field = (col, k) => SCHEMAS[col].fields.find(f => f.k === k);

const DEFAULT_SETTINGS = {
  agence: 'Stony Automation',
  objectifHeures: 14,
  tauxHoraire: 30,
  budgetInitial: 4100,
  revenuCible: 3000,
  timer: null
};

/* ---------- Données de départ ---------- */
function seed() {
  const p = (nom, o) => ({ id: uid(), nom, ...o });
  const db = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    projets: [
      p('Démo appels manqués — client construction', { client: 'Entrepreneur en construction', statut: 'En cours', type: 'Démo', niche: 'Construction / services', debut: todayISO(), echeance: addDays(21), prochaine: 'Lui faire noter chaque appel manqué pendant 2 semaines', notes: 'Environ 10 appels manqués par semaine.\nCommission de 10 % convenue → proposer plutôt : étude de cas + témoignage, puis prix fixe.\nÀ demander : valeur moyenne d’un contrat, taux de conversion.' }),
      p('Gestionnaire de projets — usine (ancien collègue)', { client: 'Usine (collègue)', statut: 'Prospect', type: 'Client', niche: 'Usine / maintenance', prochaine: 'Café de 30 min : poser les 6 questions, voir comment ils gèrent leurs projets aujourd’hui', notes: 'Pas de GMAO. Veulent une GMAO plus tard. 1er projet = gestionnaire de projets.\nConfigurer un outil existant (pas d’application maison).\nPréparer : liste des équipements avec numéros, catégories (préventif, correctif, amélioration, projet).' }),
      ...['SaaS LibreChat', 'DigiNest', 'Bot Telegram', 'Plugin de migration WordPress', 'Application Team Tasks', 'Plateforme d’arabe et de Coran'].map(n =>
        p(n, { statut: 'En pause', type: 'Interne', niche: 'Interne', prochaine: 'Pause de 90 jours — focus sur l’agence', echeance: addDays(90) }))
    ],
    temps: [],
    transactions: [],
    juridique: [
      { tache: 'Régulariser les déclarations annuelles au Registraire des entreprises', categorie: 'Entreprise (Registraire)', statut: 'À faire', echeance: addDays(7), notes: 'Nécessaire avant de facturer. Si c’est compliqué : demander à IDE Trois-Rivières.' },
      { tache: 'Ouvrir un compte bancaire séparé pour l’agence', categorie: 'Banque', statut: 'À faire', echeance: addDays(30) },
      { tache: 'Obtenir une soumission d’assurance responsabilité professionnelle', categorie: 'Assurance', statut: 'À faire', notes: 'Avant le premier contrat payant.' },
      { tache: 'Préparer un modèle de contrat / énoncé des travaux et le faire réviser par un avocat', categorie: 'Contrats', statut: 'À faire', notes: 'Inclure : livrables, prix, limites de responsabilité, propriété du travail, confidentialité, données.' },
      { tache: 'Loi 25 : désigner la personne responsable des renseignements personnels et rédiger une politique de confidentialité', categorie: 'Vie privée (Loi 25)', statut: 'À vérifier', notes: 'Vérifier aussi où les outils (API IA, n8n) stockent les données des clients.' },
      { tache: 'TPS/TVQ : surveiller le seuil de petit fournisseur (30 000 $)', categorie: 'Fiscalité (TPS/TVQ, impôt)', statut: 'À vérifier', notes: 'Voir le suivi dans Finances. À confirmer avec un comptable.' },
      { tache: 'Conserver toutes les factures et tous les reçus (au moins 6 ans)', categorie: 'Fiscalité (TPS/TVQ, impôt)', statut: 'En cours' }
    ].map(x => ({ id: uid(), ...x })),
    formations: [
      { titre: 'n8n — Quickstart', plateforme: 'n8n Academy', statut: 'À faire', progression: 0, lien: 'https://learn.n8n.io/', cout: 0 },
      { titre: 'n8n — programme Foundations', plateforme: 'n8n Academy', statut: 'À faire', progression: 0, lien: 'https://learn.n8n.io/', cout: 0 },
      { titre: 'AI Fluency: Framework & Foundations', plateforme: 'Anthropic Academy', statut: 'À faire', progression: 0, lien: 'https://anthropic.skilljar.com/', cout: 0 },
      { titre: 'AI Fluency for Small Businesses', plateforme: 'Anthropic Academy / Coursera', statut: 'À faire', progression: 0, heures: 4, lien: 'https://anthropic.skilljar.com/', cout: 0 },
      { titre: 'Cartographie des processus et Lean (cours à choisir)', plateforme: 'À choisir', statut: 'À faire', progression: 0 }
    ].map(x => ({ id: uid(), ...x })),
    ressources: [
      { nom: 'IDE Trois-Rivières', categorie: 'Organisme / soutien', frequence: 'Gratuit', lien: 'https://www.idetr.com', notes: 'Démarrage, financement, mise en relation. Demander les cellules de mentorat actives.' },
      { nom: 'Réseau accès PME (ancien Accès entreprise Québec)', categorie: 'Organisme / soutien', frequence: 'Gratuit', lien: 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/accompagnement-services/points-service' },
      { nom: 'CAE Laprade Trois-Rivières', categorie: 'Organisme / soutien', frequence: 'Gratuit', notes: 'Financement et conseil, Grand Trois-Rivières.' },
      { nom: 'n8n Academy', categorie: 'Formation', frequence: 'Gratuit', lien: 'https://learn.n8n.io/' },
      { nom: 'Anthropic Academy', categorie: 'Formation', frequence: 'Gratuit', lien: 'https://anthropic.skilljar.com/' },
      { nom: 'Rapport FCEI–IQ : L’automatisation, un levier de productivité (oct. 2025)', categorie: 'Lecture', frequence: 'Gratuit', lien: 'https://www.cfib-fcei.ca/fr/rapports-de-recherche/lautomatisation-un-levier-de-productivit%C3%A9-pour-les-pme-qu%C3%A9b%C3%A9coises' },
      { nom: 'ISQ : L’intelligence artificielle dans les entreprises au Québec', categorie: 'Lecture', frequence: 'Gratuit', lien: 'https://statistique.quebec.ca/fr/document/intelligence-artificielle-entreprises-quebec' },
      { nom: 'n8n (cloud ou auto-hébergé)', categorie: 'Outil / abonnement', frequence: 'À vérifier' },
      { nom: 'Numéro de téléphone virtuel (ex. Twilio) pour la démo SMS', categorie: 'Outil / abonnement', frequence: 'À vérifier' }
    ].map(x => ({ id: uid(), ...x })),
    notes: [
      { titre: 'Comment utiliser reMarkable avec ce tableau de bord', date: todayISO(), source: 'Clavier', tags: 'mode d’emploi', contenu: 'VERS le reMarkable :\n1. Bouton « Imprimer pour reMarkable » (une note, la fiche de rencontre ou le plan de la semaine).\n2. Dans la fenêtre d’impression, choisir « Enregistrer en PDF ».\n3. Envoyer le PDF dans le reMarkable avec l’application reMarkable (ordinateur ou téléphone).\n\nDEPUIS le reMarkable :\n1. Sur la tablette, convertir l’écriture en texte.\n2. Envoyer ou copier le texte (courriel, application reMarkable).\n3. Ici : « Importer depuis reMarkable » → coller le texte ou choisir un fichier .txt / .md.' }
    ].map(x => ({ id: uid(), ...x })),
    idees: [
      ['Rappel automatique des appels manqués (SMS)', 'Construction / services', '⭐', 'Priorité', 1, 'L’entrepreneur manque l’appel sur le chantier → SMS automatique, collecte de la demande, notification, tout est noté dans un tableau.'],
      ['Relance automatique des soumissions', 'Construction / services', '⭐', 'Priorité', 2, 'Soumission envoyée puis oubliée → relances polies à 3 et 7 jours, arrêt dès que le client répond.'],
      ['Bons de travail par la voix ou par photo', 'Usine / maintenance', '⭐⭐', 'Priorité', 3, 'Bons papier mal remplis → le technicien dicte ou prend une photo, l’IA remplit un formulaire structuré.'],
      ['Qualification des demandes par IA', 'Construction / services', '⭐⭐', 'Banque d’idées', 4, 'L’IA pose 3-4 questions (travaux, adresse, budget, délai) et classe : chaud / tiède / à refuser.'],
      ['Demande d’avis Google après le chantier', 'Construction / services', '⭐', 'Banque d’idées', 5, 'Chantier terminé → SMS de remerciement avec lien vers la page d’avis.'],
      ['Soumission à partir d’une note vocale', 'Construction / services', '⭐⭐', 'Banque d’idées', 6, 'Note vocale sur place → brouillon de soumission dans son modèle.'],
      ['Rappels de rendez-vous et confirmations', 'Construction / services', '⭐', 'Banque d’idées', 7, 'SMS la veille de la visite → moins de déplacements pour rien.'],
      ['Assistant de documentation technique (RAG)', 'Usine / maintenance', '⭐⭐⭐', 'Banque d’idées', 8, 'Manuels et historique dispersés → assistant qui répond avec la page du manuel.'],
      ['Rapport de production automatique', 'Usine / maintenance', '⭐⭐', 'Banque d’idées', 9, 'Compilation Excel quotidienne → résumé clair envoyé chaque matin.'],
      ['Analyse Pareto de l’historique des pannes', 'Usine / maintenance', '⭐⭐', 'Banque d’idées', 10, 'Chaque mois : top 5 des équipements qui causent le plus d’arrêts et pannes récurrentes.'],
      ['Documents qualité et inspections', 'Usine / maintenance', '⭐⭐', 'Banque d’idées', 11, 'Formulaires d’inspection sur tablette, rapports de non-conformité, alertes.'],
      ['Alertes de pièces de rechange', 'Usine / maintenance', '⭐⭐', 'Banque d’idées', 12, 'Pièce critique sous le seuil → alerte + brouillon de demande d’achat. Jamais toucher au contrôle machine.'],
      ['Lecture des factures fournisseurs', 'Admin PME', '⭐⭐', 'Banque d’idées', 13, 'Facture PDF reçue par courriel → l’IA prépare la saisie comptable.'],
      ['Tri des courriels', 'Admin PME', '⭐', 'Banque d’idées', 14, 'Classement urgent / client / fournisseur + brouillons de réponse.'],
      ['Relance des factures impayées', 'Admin PME', '⭐', 'Banque d’idées', 15, 'Rappels polis automatiques à 15, 30 et 45 jours.'],
      ['Accueil des nouveaux employés', 'Admin PME', '⭐⭐', 'Banque d’idées', 16, 'Documents, formation et liste de vérification envoyés automatiquement.']
    ].map(([titre, niche, difficulte, statut, priorite, description]) => ({ id: uid(), titre, niche, difficulte, statut, priorite, description }))
  };
  return migrate(db);
}

/* ---------- Stockage ---------- */
function migrate(d) {
  for (const k of Object.keys(SCHEMAS)) if (!Array.isArray(d[k])) d[k] = [];
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  if (typeof ensureAgentData === 'function') ensureAgentData(d); // agents.js
  return d;
}
let storageKey = KEY; // devient « KEY:idUtilisateur » une fois connecté
function loadFrom(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key));
    if (d && d.version) return migrate(d);
  } catch (e) { /* données illisibles */ }
  return null;
}
function load() { return loadFrom(storageKey) || seed(); }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(db)); }
  catch (e) { toast('⚠ Impossible d’enregistrer (stockage du navigateur plein ou bloqué).'); }
  Cloud.queueSave();
}

/* ---------- Base de données en ligne (Supabase) ---------- */
const CFG = window.AGENCE_CONFIG || {};
const TABLE = 'agence_data';
const Cloud = {
  configured: !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
  client: null,
  user: null,
  ready: false,    // true quand les données en ligne ont été lues (évite d'écraser avec une vieille copie)
  dirty: false,    // changements pas encore envoyés
  saving: false,
  timer: null,
  lastRemote: null,

  init() {
    if (!this.configured) return true;
    if (!window.supabase || !window.supabase.createClient) return false;
    this.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    return true;
  },
  lastError: '',
  status(text, cls = '') {
    const el = $('#sync-status'); if (!el) return;
    el.textContent = text + (cls === 'err' ? ' (détails)' : '');
    el.className = 'sync ' + cls; el.style.cursor = cls === 'err' ? 'pointer' : '';
    if (cls !== 'err') this.lastError = '';
  },
  fail(text, err) {
    this.lastError = describeError(err);
    console.error('[Synchro]', err);
    this.status(text, 'err');
  },
  queueSave() {
    if (!this.user) return;
    this.dirty = true;
    if (!this.ready) { this.status('⚠ Hors ligne — gardé sur cet appareil', 'err'); return; }
    this.status('Enregistrement…', 'busy');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 800);
  },
  async push() {
    if (!this.user || !this.ready) return false;
    if (this.saving) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 800); return false; }
    this.saving = true; this.dirty = false;
    const updated_at = new Date().toISOString();
    let error;
    try { ({ error } = await this.client.from(TABLE).upsert({ user_id: this.user.id, data: db, updated_at })); }
    catch (e) { error = e; }
    this.saving = false;
    if (error) {
      this.dirty = true;
      this.fail('⚠ Pas synchronisé — nouvel essai bientôt', error);
      clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 10000);
      return false;
    }
    this.lastRemote = updated_at;
    if (this.dirty) this.queueSave(); else this.status('☁ Synchronisé', 'ok');
    return true;
  },
  async pull() {
    const { data, error } = await this.client.from(TABLE).select('data, updated_at').eq('user_id', this.user.id).maybeSingle();
    if (error) throw error;
    return data;
  },
  // Lit les données en ligne. Si aucune n'existe encore, envoie celles de cet appareil.
  async sync(firstLoad = false) {
    const remote = await this.pull();
    if (remote && remote.data && remote.data.version) {
      if (firstLoad || remote.updated_at !== this.lastRemote) {
        db = migrate(remote.data);
        try { localStorage.setItem(storageKey, JSON.stringify(db)); } catch (e) { /* ignore */ }
        this.lastRemote = remote.updated_at;
        this.ready = true;
        this.status('☁ Synchronisé', 'ok');
        return 'remote';
      }
      this.ready = true; this.status('☁ Synchronisé', 'ok');
      return 'same';
    }
    // Première connexion : on envoie les données de cet appareil (ou les données de départ)
    this.ready = true;
    await this.push();
    return 'uploaded';
  }
};

let db = loadFrom(KEY) || seed();

/* ---------- Interface générale ---------- */
const NAV = [
  ['dashboard', 'Tableau de bord', '◧'],
  ['projets', 'Projets', '▦'],
  ['temps', 'Gestion du temps', '◷'],
  ['finances', 'Finances', '$'],
  ['juridique', 'Juridique', '§'],
  ['formations', 'Formation', '✎'],
  ['ressources', 'Ressources', '☰'],
  ['notes', 'Notes et reMarkable', '✐'],
  ['idees', 'Idées d’automatisation', '✦']
];
const ui = {};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
function modal(html) { $('#modal').innerHTML = html; $('#modal-backdrop').classList.remove('hidden'); const f = $('#modal input, #modal textarea'); if (f) f.focus(); }
function closeModal() { $('#modal-backdrop').classList.add('hidden'); $('#modal').innerHTML = ''; }
$('#modal-backdrop').addEventListener('mousedown', e => { if (e.target.id === 'modal-backdrop') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });

function badge(v) {
  const map = {
    'En cours': 'blue', 'Prospect': 'blue', 'Actif (récurrent)': 'green', 'Fait': 'green', 'Terminé': 'green', 'Revenu': 'green', 'Vendue': 'green', 'Démo faite': 'green',
    'En pause': '', 'À valider': 'orange', 'À faire': 'orange', 'À vérifier': 'orange', 'Priorité': 'orange', 'Dépense': 'red', 'reMarkable': 'blue'
  };
  return `<span class="badge ${map[v] ?? ''}">${esc(v)}</span>`;
}

function cell(col, k, it) {
  const f = field(col, k); const v = it[k];
  if ((v === undefined || v === null || v === '') && !(col === 'temps' && (k === 'cout' || k === 'qui'))) return '<span class="muted">—</span>';
  if (col === 'temps' && k === 'cout') return `<span class="${isMine(it) ? '' : 'ai-cost'}">${money2(entryCost(it))}</span>`;
  if (col === 'temps' && k === 'qui') return isMine(it) ? 'Taoufik' : `🤖 ${esc(v)}`;
  if (k === 'minutes') return col === 'temps' && !isMine(it) ? fmtDur(v) : hm(v);
  if (k === 'progression') return `<div style="min-width:90px">${esc(v)} %<div class="bar ${Number(v) >= 100 ? 'ok' : ''}"><span style="width:${pct(v, 100)}%"></span></div></div>`;
  if (k === 'montant') return `<span class="${it.type === 'Revenu' ? 'pos' : 'neg'}">${it.type === 'Revenu' ? '+' : '−'} ${money(v)}</span>`;
  if (f.t === 'date') {
    const d = daysUntil(v); const late = d < 0 && !['Fait', 'Terminé'].includes(it.statut) && (col === 'juridique' || col === 'projets');
    return `${fmtDate(v)}${late ? ' <span class="badge red">en retard</span>' : ''}`;
  }
  if (f.money) return money(v);
  if (f.t === 'url') return `<a href="${esc(v)}" target="_blank" rel="noopener">Ouvrir ↗</a>`;
  if (f.t === 'select' && ['statut', 'type', 'source'].includes(k)) return badge(v);
  return esc(v);
}

function projectNames() { return db.projets.map(p => p.nom); }

function inputFor(f, v) {
  if (f.hidden) return '';
  const val = v ?? '';
  const req = f.req ? 'required' : '';
  let input;
  if (f.t === 'textarea') input = `<textarea name="${f.k}" ${req} style="${f.big ? 'min-height:260px' : ''}">${esc(val)}</textarea>`;
  else if (f.t === 'select') input = `<select name="${f.k}"><option value=""></option>${f.o.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.t === 'projet') input = `<select name="${f.k}"><option value="">— Aucun —</option>${projectNames().map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else input = `<input name="${f.k}" type="${f.t === 'url' ? 'url' : f.t}" ${f.t === 'number' ? 'step="any"' : ''} value="${esc(val)}" ${req}>`;
  return `<label class="${f.full ? 'full' : ''}">${esc(f.l)}${f.req ? ' *' : ''}${input}</label>`;
}

function readForm(form, S) {
  const data = {};
  for (const f of S.fields) {
    if (f.hidden) continue;
    const el = form.elements[f.k]; if (!el) continue;
    let v = el.value.trim();
    if (f.t === 'number') v = v === '' ? '' : Number(v);
    data[f.k] = v;
  }
  return data;
}

function defaults(col) {
  const o = {};
  for (const f of SCHEMAS[col].fields) if (f.def !== undefined) o[f.k] = f.def === 'today' ? todayISO() : f.def;
  return o;
}

function openForm(col, id, preset = {}) {
  const S = SCHEMAS[col];
  const it = id ? db[col].find(x => x.id === id) : { ...defaults(col), ...preset };
  if (!it) return;
  modal(`<h2>${id ? 'Modifier' : 'Ajouter'} : ${esc(S.single)}</h2>
    <form id="f" class="form-grid">${S.fields.map(f => inputFor(f, it[f.k])).join('')}
      <div class="modal-actions full">
        ${id ? '<button type="button" class="btn danger" id="del">Supprimer</button>' : ''}
        ${id && col === 'notes' ? '<button type="button" class="btn" id="print-note">🖨 Imprimer pour reMarkable</button>' : ''}
        <span class="sp"></span>
        <button type="button" class="btn" data-close>Annuler</button>
        <button class="btn primary">Enregistrer</button>
      </div>
    </form>`);
  $('#f').onsubmit = e => {
    e.preventDefault();
    const data = readForm(e.target, S);
    if (id) Object.assign(it, data); else db[col].push({ id: uid(), ...data });
    save(); closeModal(); render(); toast('Enregistré ✓');
  };
  if (id) {
    const del = $('#del');
    del.onclick = () => {
      if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.textContent = 'Confirmer la suppression'; return; }
      if (typeof removeItemDocs === 'function') removeItemDocs(col, it);
      db[col] = db[col].filter(x => x.id !== id); save(); closeModal(); render(); toast('Supprimé');
    };
  }
  if ($('#print-note')) $('#print-note').onclick = () => { const data = { ...it, ...readForm($('#f'), S) }; printNote(data); };
  if (typeof attachDocsUI === 'function') attachDocsUI(col, id); // documents.js
}

/* ---------- Vue liste générique ---------- */
function filteredItems(col) {
  const S = SCHEMAS[col]; const st = ui[col] || (ui[col] = { q: '', f: '' });
  let items = db[col].filter(it => !st.q || Object.values(it).join(' ').toLowerCase().includes(st.q.toLowerCase()))
    .filter(it => !st.f || it[S.filter] === st.f);
  if (S.sort) items = [...items].sort(S.sort);
  return items;
}

function toolbar(col, extra = '') {
  const S = SCHEMAS[col]; const st = ui[col] || (ui[col] = { q: '', f: '' });
  const ff = S.filter && field(col, S.filter);
  return `<div class="toolbar">
    <input class="search" data-col="${col}" placeholder="Rechercher…" value="${esc(st.q)}">
    ${ff ? `<select class="filter" data-col="${col}"><option value="">${esc(ff.l)} : tous</option>${ff.o.map(o => `<option ${o === st.f ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
    ${extra}
    <button class="btn primary" data-add="${col}">+ Ajouter</button>
  </div>`;
}

function listView(col) {
  const S = SCHEMAS[col]; const items = filteredItems(col);
  return `${toolbar(col)}
  <div class="table-wrap"><table>
    <thead><tr>${S.cols.map(k => `<th>${esc(field(col, k).l)}</th>`).join('')}</tr></thead>
    <tbody>${items.map(it => `<tr data-edit="${col}" data-id="${it.id}">${S.cols.map(k => `<td class="${['montant', 'valeur', 'cout'].includes(k) ? 'num' : ''}">${cell(col, k, it)}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${S.cols.length}" class="empty">Rien pour l’instant. Clique sur « + Ajouter ».</td></tr>`}</tbody>
  </table></div>`;
}

/* ---------- Calculs ---------- */
function minutesThisWeek() { const ws = weekStart(); return db.temps.filter(t => isMine(t) && (t.date || '') >= ws).reduce((s, t) => s + (Number(t.minutes) || 0), 0); }
function sumTx(type, pred = () => true) { return db.transactions.filter(t => t.type === type && pred(t)).reduce((s, t) => s + (Number(t.montant) || 0), 0); }
function mrr() { return db.projets.filter(p => p.statut === 'Actif (récurrent)').reduce((s, p) => s + (Number(p.mensuel) || 0), 0); }
function lastMonths(n) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(isoOf(x).slice(0, 7)); }
  return out;
}
const monthLabel = k => new Date(k + '-15T12:00:00').toLocaleDateString('fr-CA', { month: 'short' });

function deadlines() {
  const out = [];
  db.projets.filter(p => p.echeance && !['Terminé', 'En pause'].includes(p.statut)).forEach(p => out.push({ date: p.echeance, label: p.nom, kind: 'Projet', col: 'projets', id: p.id }));
  db.juridique.filter(j => j.echeance && j.statut !== 'Fait').forEach(j => out.push({ date: j.echeance, label: j.tache, kind: 'Juridique', col: 'juridique', id: j.id }));
  (db.actions || []).filter(x => x.echeance && x.statut !== 'Fait').forEach(x => out.push({ date: x.echeance, label: `${x.titre}${x.responsable ? ' (' + x.responsable + ')' : ''}`, kind: 'Action', col: 'actions', id: x.id }));
  return out.filter(x => daysUntil(x.date) <= 30).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Vues ---------- */
const VIEWS = {};

VIEWS.dashboard = () => {
  const s = db.settings;
  const mois = monthKey(todayISO());
  const revMois = sumTx('Revenu', t => monthKey(t.date) === mois);
  const depMois = sumTx('Dépense', t => monthKey(t.date) === mois);
  const treso = (Number(s.budgetInitial) || 0) + sumTx('Revenu') - sumTx('Dépense');
  const actifs = db.projets.filter(p => ['En cours', 'Actif (récurrent)'].includes(p.statut));
  const prospects = db.projets.filter(p => p.statut === 'Prospect');
  const minW = minutesThisWeek(); const goal = (Number(s.objectifHeures) || 0) * 60;
  const recurring = mrr();
  const dl = deadlines();
  const nexts = db.projets.filter(p => ['Prospect', 'En cours', 'Actif (récurrent)'].includes(p.statut) && p.prochaine);
  const forms = db.formations.filter(f => f.statut !== 'Terminé');

  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Projets actifs</div><div class="value">${actifs.length}</div><div class="sub">${prospects.length} prospect(s) · ${db.projets.filter(p => p.statut === 'En pause').length} en pause</div></div>
    <div class="card kpi"><div class="label">Heures cette semaine</div><div class="value">${hm(minW)}</div><div class="sub">objectif ${s.objectifHeures} h</div><div class="bar ${minW >= goal ? 'ok' : ''}"><span style="width:${pct(minW, goal)}%"></span></div></div>
    <div class="card kpi"><div class="label">Revenus ce mois</div><div class="value pos">${money(revMois)}</div><div class="sub">dépenses : ${money(depMois)}</div></div>
    <div class="card kpi"><div class="label">Revenu récurrent</div><div class="value">${money(recurring)}<span class="muted" style="font-size:13px"> /mois</span></div><div class="sub">cible ${money(s.revenuCible)} /mois</div><div class="bar ok"><span style="width:${pct(recurring, s.revenuCible)}%"></span></div></div>
    <div class="card kpi"><div class="label">Trésorerie estimée</div><div class="value ${treso < 0 ? 'neg' : ''}">${money(treso)}</div><div class="sub">budget de départ + revenus − dépenses</div></div>
    <div class="card kpi"><div class="label">Coût IA ce mois</div><div class="value">${money2((db.agents || []).reduce((x, a) => x + ((a.usage && a.usage.coutMois && a.usage.coutMois[monthKey(todayISO())]) || 0), 0))}</div><div class="sub">estimé · ton temps : ${money2(minW / 60 * (Number(s.tauxHoraire) || 0))} cette semaine</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card"><h3>📅 Échéances (30 prochains jours et retards)</h3>
      <ul class="list">${dl.map(x => { const d = daysUntil(x.date); return `<li class="clickable" data-edit="${x.col}" data-id="${x.id}"><span>${badge(x.kind)} ${esc(x.label)}</span><span class="badge ${d < 0 ? 'red' : d <= 7 ? 'orange' : ''}">${d < 0 ? `${-d} j de retard` : d === 0 ? 'aujourd’hui' : `dans ${d} j`}</span></li>`; }).join('') || '<li class="muted">Aucune échéance proche.</li>'}</ul>
    </div>
    <div class="card"><h3>➡️ Prochaines actions</h3>
      <ul class="list">${nexts.map(p => `<li class="clickable" data-edit="projets" data-id="${p.id}"><span><b>${esc(p.nom)}</b><br><span class="muted">${esc(p.prochaine)}</span></span>${badge(p.statut)}</li>`).join('') || '<li class="muted">Ajoute une « prochaine action » à tes projets.</li>'}</ul>
    </div>
    <div class="card"><h3>✎ Formation en cours</h3>
      <ul class="list">${forms.map(f => `<li class="clickable" data-edit="formations" data-id="${f.id}"><span style="flex:1">${esc(f.titre)}<div class="bar"><span style="width:${pct(f.progression, 100)}%"></span></div></span><span class="muted">${Number(f.progression) || 0} %</span></li>`).join('') || '<li class="muted">Aucune formation en cours.</li>'}</ul>
    </div>
    <div class="card"><h3>◷ Temps par catégorie (cette semaine)</h3>${timeByCategory()}</div>
  </div>`;
};

function timeByCategory() {
  const ws = weekStart(); const cats = field('temps', 'categorie').o;
  const per = cats.filter(c => !/agent|IA\)/.test(c)).map(c => [c, db.temps.filter(t => isMine(t) && t.date >= ws && t.categorie === c).reduce((s, t) => s + (Number(t.minutes) || 0), 0)]);
  const max = Math.max(1, ...per.map(x => x[1]));
  return `<ul class="list">${per.map(([c, m]) => `<li><span style="flex:1">${esc(c)}<div class="bar"><span style="width:${pct(m, max)}%"></span></div></span><span class="muted">${hm(m)}</span></li>`).join('')}</ul>`;
}

VIEWS.projets = () => {
  const st = ui.projets || (ui.projets = { q: '', f: '' });
  const items = filteredItems('projets');
  return `${toolbar('projets')}
  <p class="muted" style="margin-top:-4px">Astuce : glisse une carte d’une colonne à l’autre pour changer son statut (sur ordinateur). Clique sur une carte pour la modifier.</p>
  <div class="kanban">${STATUTS_PROJET.map(s => {
    const list = items.filter(p => (p.statut || 'Prospect') === s);
    return `<div class="kcol" data-status="${esc(s)}">
      <div class="kcol-head"><span>${esc(s)} <span class="muted">(${list.length})</span></span><button class="btn small" data-add="projets" data-preset-statut="${esc(s)}">+</button></div>
      ${list.map(p => `<div class="kcard st-${esc(s.replace(/[()]/g, '').replace(/\s+/g, '-'))}" draggable="true" data-edit="projets" data-id="${p.id}">
        <div class="t">${esc(p.nom)}</div>
        <div class="m">${[p.client, p.niche].filter(Boolean).map(esc).join(' · ')}</div>
        ${p.valeur || p.mensuel ? `<div class="m">${p.valeur ? money(p.valeur) : ''}${p.valeur && p.mensuel ? ' + ' : ''}${p.mensuel ? money(p.mensuel) + '/mois' : ''}</div>` : ''}
        ${p.echeance ? `<div class="m">Échéance : ${fmtDate(p.echeance)}${daysUntil(p.echeance) < 0 && s !== 'Terminé' && s !== 'En pause' ? ' <span class="badge red">en retard</span>' : ''}</div>` : ''}
        ${p.prochaine ? `<div class="next">➡️ ${esc(p.prochaine)}</div>` : ''}
        ${(p.documents || []).length ? `<div class="m">📎 ${p.documents.length} document${p.documents.length > 1 ? 's' : ''}</div>` : ''}
        ${(() => { const t = projectTotals(p.nom); return t.minMe || t.minAI ? `<div class="m">⏱ ${hm(t.minMe)}${t.minAI ? ' + 🤖 ' + fmtDur(t.minAI) : ''} · <b>${money2(t.coutMe + t.coutAI)}</b></div>` : ''; })()}
      </div>`).join('')}
    </div>`;
  }).join('')}</div>`;
};

function timeCostsCards() {
  const taux = Number(db.settings.tauxHoraire) || 0;
  const mois = monthKey(todayISO());
  const tm = db.temps.filter(t => monthKey(t.date) === mois);
  const meMin = tm.filter(isMine).reduce((s, t) => s + (Number(t.minutes) || 0), 0);
  const aiMin = tm.filter(t => !isMine(t)).reduce((s, t) => s + (Number(t.minutes) || 0), 0);
  const aiCost = (db.agents || []).reduce((s, a) => s + ((a.usage && a.usage.coutMois && a.usage.coutMois[mois]) || 0), 0);
  const names = [...new Set([...db.projets.map(p => p.nom), ...db.temps.map(t => t.projet || '')])];
  const rows = names.map(n => ({ n, ...projectTotals(n) })).filter(r => r.n || r.n === '').filter(r => r.minMe || r.minAI).sort((a, b) => (b.coutMe + b.coutAI) - (a.coutMe + a.coutAI));
  const agents = (db.agents || []).map(a => ({ a, min: tm.filter(t => t.qui === a.nom).reduce((s, t) => s + (Number(t.minutes) || 0), 0), cost: (a.usage.coutMois || {})[mois] || 0, tok: (a.usage.mois || {})[mois] || 0 }));
  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Ton temps ce mois</div><div class="value">${hm(meMin)}</div><div class="sub">valeur : ${money2(meMin / 60 * taux)} · <button class="linkbtn inline" data-set-rate>${taux} $/h</button></div></div>
    <div class="card kpi"><div class="label">Temps des agents ce mois</div><div class="value">${fmtDur(aiMin)}</div><div class="sub">minuteur automatique</div></div>
    <div class="card kpi"><div class="label">Coût IA ce mois (estimé)</div><div class="value">${money2(aiCost)}</div><div class="sub">selon les tokens et le prix des modèles</div></div>
    <div class="card kpi"><div class="label">Coût total ce mois</div><div class="value">${money2(meMin / 60 * taux + aiCost)}</div><div class="sub">ton temps + IA</div></div>
  </div>
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h3>📁 Temps et coût par projet</h3>
      <div class="table-wrap"><table><thead><tr><th>Projet</th><th class="num">Ton temps</th><th class="num">Agents</th><th class="num">Coût</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.n ? esc(r.n) : '<span class="muted">Sans projet</span>'}</td><td class="num">${hm(r.minMe)}<div class="muted small">${money2(r.coutMe)}</div></td><td class="num">${fmtDur(r.minAI)}<div class="muted small ai-cost">${money2(r.coutAI)}</div></td><td class="num"><b>${money2(r.coutMe + r.coutAI)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aucun temps enregistré.</td></tr>'}</tbody></table></div>
    </div>
    <div class="card"><h3>🤖 Agents ce mois</h3>
      <ul class="list">${agents.map(x => `<li><span style="display:flex;gap:8px;align-items:center">${typeof avatar === 'function' ? avatar(x.a, 'xs') : ''} ${esc(x.a.nom)} <span class="muted small">${esc(x.a.model || db.provider?.modeleDefaut || '')}</span></span><span class="muted small">${fmtDur(x.min)} · ${x.tok.toLocaleString('fr-CA')} tokens · <b class="ai-cost">${money2(x.cost)}</b></span></li>`).join('')}</ul>
      <p class="muted small">Les prix des modèles se règlent dans <a href="#fournisseur">Fournisseur de tokens</a>.</p>
    </div>
  </div>`;
}

function openRate() {
  modal(`<h2>Ton taux horaire</h2><p class="muted">Sert à estimer la valeur de ton temps sur chaque action et chaque projet.</p>
    <form id="rate-f"><label>Taux horaire ($ CA / h)<input name="r" type="number" min="0" step="1" value="${esc(db.settings.tauxHoraire)}"></label>
    <div class="modal-actions"><span class="sp"></span><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  $('#rate-f').onsubmit = e => { e.preventDefault(); db.settings.tauxHoraire = Number(e.target.elements.r.value) || 0; save(); closeModal(); render(); toast('Taux horaire enregistré ✓'); };
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-set-rate]')) openRate(); });

VIEWS.temps = () => {
  const t = db.settings.timer;
  const ws = weekStart();
  const days = [...Array(7)].map((_, i) => addDays(i, new Date(ws + 'T12:00:00')));
  const perDay = days.map(d => db.temps.filter(x => isMine(x) && x.date === d).reduce((s, x) => s + (Number(x.minutes) || 0), 0));
  const max = Math.max(60, ...perDay);
  const minW = minutesThisWeek(); const goal = (Number(db.settings.objectifHeures) || 0) * 60;
  const cats = field('temps', 'categorie').o;
  return `
  <div class="card" style="margin-bottom:14px"><h3>⏱ Minuteur</h3>
    <div class="timer-card">
      <div class="clock" id="clock">${t ? '00:00:00' : '00:00:00'}</div>
      <label>Projet<select id="t-projet" ${t ? 'disabled' : ''}><option value="">— Aucun —</option>${projectNames().map(n => `<option ${t && t.projet === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Catégorie<select id="t-cat" ${t ? 'disabled' : ''}>${cats.map(c => `<option ${t && t.categorie === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label style="flex:2">Ce que je fais<input id="t-desc" ${t ? 'disabled' : ''} value="${esc(t ? t.description : '')}" placeholder="ex. Cours n8n Quickstart"></label>
      ${t ? '<button class="btn danger confirm" id="t-stop">■ Arrêter et enregistrer</button>' : '<button class="btn ok" id="t-start">▶ Démarrer</button>'}
    </div>
  </div>
  ${timeCostsCards()}
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h3>Cette semaine : ${hm(minW)} / ${db.settings.objectifHeures} h <span class="muted small">(ton temps · ${money2(minW / 60 * (Number(db.settings.tauxHoraire) || 0))})</span></h3>
      <div class="bar ${minW >= goal ? 'ok' : ''}"><span style="width:${pct(minW, goal)}%"></span></div>
      <div class="chart">${days.map((d, i) => `<div class="col"><div class="pair"><div class="b h" title="${hm(perDay[i])}" style="height:${pct(perDay[i], max)}%"></div></div><div class="lbl">${new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'short' })}</div></div>`).join('')}</div>
    </div>
    <div class="card"><h3>Par catégorie</h3>${timeByCategory()}</div>
  </div>
  ${listView('temps')}`;
};

VIEWS.finances = () => {
  const mois = monthKey(todayISO());
  const months = lastMonths(6);
  const data = months.map(m => [sumTx('Revenu', t => monthKey(t.date) === m), sumTx('Dépense', t => monthKey(t.date) === m)]);
  const max = Math.max(1, ...data.flat());
  const since = addDays(-365);
  const rev12 = sumTx('Revenu', t => (t.date || '') >= since);
  const seuil = 30000;
  const treso = (Number(db.settings.budgetInitial) || 0) + sumTx('Revenu') - sumTx('Dépense');
  const revMois = sumTx('Revenu', t => monthKey(t.date) === mois), depMois = sumTx('Dépense', t => monthKey(t.date) === mois);
  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Revenus ce mois</div><div class="value pos">${money(revMois)}</div></div>
    <div class="card kpi"><div class="label">Dépenses ce mois</div><div class="value neg">${money(depMois)}</div></div>
    <div class="card kpi"><div class="label">Net ce mois</div><div class="value ${revMois - depMois < 0 ? 'neg' : 'pos'}">${money(revMois - depMois)}</div></div>
    <div class="card kpi"><div class="label">Trésorerie estimée</div><div class="value">${money(treso)}</div><div class="sub">départ : ${money(db.settings.budgetInitial)}</div></div>
    <div class="card kpi"><div class="label">Revenus 12 derniers mois</div><div class="value">${money(rev12)}</div><div class="sub">seuil TPS/TVQ de petit fournisseur : ${money(seuil)}</div><div class="bar ${rev12 > seuil * .8 ? 'warn' : ''}"><span style="width:${pct(rev12, seuil)}%"></span></div></div>
  </div>
  <div class="card" style="margin-bottom:14px"><h3>6 derniers mois</h3>
    <div class="chart">${months.map((m, i) => `<div class="col"><div class="pair"><div class="b in" title="Revenus ${money(data[i][0])}" style="height:${pct(data[i][0], max)}%"></div><div class="b out" title="Dépenses ${money(data[i][1])}" style="height:${pct(data[i][1], max)}%"></div></div><div class="lbl">${monthLabel(m)}</div></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--ok)"></i>Revenus</span><span><i style="background:#f08a7e"></i>Dépenses</span></div>
  </div>
  <div class="info">Garde tous tes reçus. Le seuil de 30 000 $ est calculé ici sur 12 mois glissants, ce qui est une simplification : fais confirmer tes obligations de TPS/TVQ par un comptable.</div>
  ${listView('transactions')}`;
};

VIEWS.juridique = () => `<div class="info">Ces éléments sont des rappels, pas un avis juridique. Fais vérifier les contrats et les obligations par un avocat ou un comptable.</div>${listView('juridique')}`;
VIEWS.formations = () => listView('formations');
VIEWS.ressources = () => listView('ressources');
VIEWS.idees = () => `<div class="info">⚠️ Règle en usine : on automatise la paperasse et l’information, jamais le contrôle des machines ni les systèmes de sécurité.</div>${listView('idees')}`;

VIEWS.notes = () => {
  const items = filteredItems('notes').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `${toolbar('notes', `<button class="btn" id="import-rm">⬇ Importer depuis reMarkable</button><button class="btn" id="print-menu">🖨 Imprimer pour reMarkable</button>`)}
  <div class="notes-grid">${items.map(n => `
    <div class="card note" data-edit="notes" data-id="${n.id}">
      <b>${esc(n.titre)}</b>
      <div class="meta">${fmtDate(n.date)} ${badge(n.source || 'Clavier')} ${(n.tags || '').split(',').map(s => s.trim()).filter(Boolean).map(t => `<span class="badge">#${esc(t)}</span>`).join(' ')}</div>
      ${n.projet ? `<div class="meta">▦ ${esc(n.projet)}</div>` : ''}
      <div class="excerpt">${esc((n.contenu || '').slice(0, 400))}</div>
      <div class="actions"><button class="btn small" data-print-note="${n.id}">🖨 PDF pour reMarkable</button></div>
    </div>`).join('') || '<div class="empty">Aucune note.</div>'}
  </div>`;
};

/* ---------- reMarkable : import et impression ---------- */
function openImport() {
  modal(`<h2>Importer depuis reMarkable</h2>
    <ol class="steps">
      <li>Sur ta reMarkable, ouvre la page et convertis ton écriture en texte.</li>
      <li>Envoie le texte par courriel ou copie-le depuis l’application reMarkable (selon les options de ton compte).</li>
      <li>Colle le texte ci-dessous, ou choisis un fichier <b>.txt</b> ou <b>.md</b>.</li>
    </ol>
    <form id="imp" class="form-grid">
      <label class="full">Titre *<input name="titre" required value="Notes reMarkable — ${esc(fmtDate(todayISO()))}"></label>
      <label>Projet lié<select name="projet"><option value="">— Aucun —</option>${projectNames().map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label>Étiquettes<input name="tags" placeholder="rencontre, usine"></label>
      <label class="full">Fichier (.txt, .md)<input type="file" id="imp-file" accept=".txt,.md,text/plain,text/markdown"></label>
      <label class="full">Texte<textarea name="contenu" style="min-height:200px" placeholder="Colle ici le texte converti…"></textarea></label>
      <div class="modal-actions full"><span class="sp"></span><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Importer</button></div>
    </form>`);
  $('#imp-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const ta = $('#imp').elements.contenu; ta.value = (ta.value ? ta.value + '\n\n' : '') + text;
    if ($('#imp').elements.titre.value.startsWith('Notes reMarkable')) $('#imp').elements.titre.value = file.name.replace(/\.(txt|md)$/i, '');
  };
  $('#imp').onsubmit = e => {
    e.preventDefault(); const f = e.target.elements;
    if (!f.contenu.value.trim()) { toast('Colle un texte ou choisis un fichier.'); return; }
    db.notes.push({ id: uid(), titre: f.titre.value.trim(), date: todayISO(), source: 'reMarkable', projet: f.projet.value, tags: f.tags.value.trim(), contenu: f.contenu.value.trim() });
    save(); closeModal(); render(); toast('Note importée ✓');
  };
}

function openPrintMenu() {
  modal(`<h2>Imprimer pour reMarkable</h2>
    <p>Choisis un modèle. Dans la fenêtre d’impression, sélectionne <b>« Enregistrer en PDF »</b>, puis envoie le PDF dans ta reMarkable avec l’application reMarkable (ordinateur ou téléphone).</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn" id="pr-disco">📋 Fiche de rencontre découverte (avec questions et lignes pour écrire)</button>
      <button class="btn" id="pr-week">🗓 Plan de la semaine (objectifs, actions, échéances)</button>
      <button class="btn" id="pr-ideas">✦ Banque d’idées d’automatisation</button>
    </div>
    <div class="modal-actions"><span class="sp"></span><button class="btn" data-close>Fermer</button></div>`);
  $('#pr-disco').onclick = () => { closeModal(); printDiscovery(); };
  $('#pr-week').onclick = () => { closeModal(); printWeek(); };
  $('#pr-ideas').onclick = () => { closeModal(); printIdeas(); };
}

// size : 'A5' (reMarkable) ou 'Letter' (rapports clients)
function printHTML(html, size = 'A5') {
  let st = $('#page-size'); if (!st) { st = document.createElement('style'); st.id = 'page-size'; document.head.appendChild(st); }
  st.textContent = size === 'Letter' ? '@page { size: Letter; margin: 16mm 18mm; }' : '@page { size: A5; margin: 12mm; }';
  $('#print-area').className = 'size-' + size;
  $('#print-area').innerHTML = html; setTimeout(() => window.print(), 50);
}
window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });
const lines = n => `<div class="lines">${'<div class="ln"></div>'.repeat(n)}</div>`;

function printNote(n) {
  printHTML(`<h1>${esc(n.titre)}</h1>
    <div class="pmeta">${fmtDate(n.date)}${n.projet ? ' · ' + esc(n.projet) : ''}${n.tags ? ' · ' + esc(n.tags) : ''}</div>
    <div class="content">${esc(n.contenu)}</div>
    <h2>Notes à la main</h2>${lines(14)}`);
}

function printDiscovery() {
  const qs = [
    'Qu’est-ce que vous faites chaque semaine qui vous énerve parce que c’est toujours pareil ?',
    'Comment ça se passe aujourd’hui ? (outils : Excel, papier, logiciel, courriels…)',
    'Combien de temps ça prend, et qui le fait ?',
    'Qu’est-ce que ça coûte quand ça va mal ? (retards, erreurs, clients perdus)',
    'Qui décide et qui paie pour ce genre de projet ?',
    'Si c’était réglé, qu’est-ce qui irait mieux concrètement ?',
    'Prochaine étape convenue :'
  ];
  printHTML(`<h1>Rencontre découverte</h1>
    <div class="row">Entreprise : ________________________________</div>
    <div class="row">Contact / poste : ____________________________</div>
    <div class="row">Date : ______________ Niche : ☐ Construction ☐ Usine ☐ Autre</div>
    <p class="pmeta">Rappel : écouter, prendre des notes, ne pas proposer de solution pendant la rencontre.</p>
    ${qs.map((q, i) => `<div class="pq">${i + 1}. ${esc(q)}</div>${lines(i === qs.length - 1 ? 2 : 4)}`).join('')}
    <h2>Chiffres à noter</h2>
    <div class="row">Temps perdu par semaine : ________ h · Coût estimé : ________ $</div>
    <div class="row">Valeur d’un contrat / d’une heure d’arrêt : ________ $</div>`);
}

function printWeek() {
  const ws = weekStart();
  const actifs = db.projets.filter(p => ['Prospect', 'En cours', 'Actif (récurrent)'].includes(p.statut));
  const dl = deadlines();
  printHTML(`<h1>Plan de la semaine</h1>
    <div class="pmeta">Semaine du ${fmtDate(ws)} · Objectif : ${esc(db.settings.objectifHeures)} h · Déjà fait : ${hm(minutesThisWeek())}</div>
    <h2>Mes 3 priorités</h2>
    ${[1, 2, 3].map(i => `<div class="row"><span class="box"></span>${i}. ____________________________________</div>`).join('')}
    <h2>Projets et prochaines actions</h2>
    ${actifs.map(p => `<div class="row"><span class="box"></span><b>${esc(p.nom)}</b>${p.prochaine ? ' — ' + esc(p.prochaine) : ''}</div>`).join('') || '<div class="row">Aucun projet actif.</div>'}
    <h2>Échéances</h2>
    ${dl.map(x => `<div class="row"><span class="box"></span>${fmtDate(x.date)} — ${esc(x.label)}</div>`).join('') || '<div class="row">Aucune échéance proche.</div>'}
    <h2>Notes</h2>${lines(8)}`);
}

function printIdeas() {
  const items = [...db.idees].sort(SCHEMAS.idees.sort);
  printHTML(`<h1>Banque d’idées d’automatisation</h1>
    ${NICHES.filter(n => items.some(i => i.niche === n)).map(n => `<h2>${esc(n)}</h2>${items.filter(i => i.niche === n).map(i => `<div class="row"><b>${esc(i.titre)}</b> ${esc(i.difficulte || '')}<br>${esc(i.description || '')}</div>`).join('')}`).join('')}`);
}

/* ---------- Minuteur ---------- */
function timerElapsed() { const t = db.settings.timer; return t ? Math.max(0, Date.now() - t.start) : 0; }
function fmtClock(ms) { const s = Math.floor(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); }
function tick() {
  const t = db.settings.timer; const mini = $('#timer-mini');
  if (t) {
    mini.classList.remove('hidden');
    mini.textContent = `⏱ ${fmtClock(timerElapsed())} · ${t.description || t.categorie}`;
    const c = $('#clock'); if (c) c.textContent = fmtClock(timerElapsed());
  } else mini.classList.add('hidden');
}
setInterval(tick, 1000);
$('#timer-mini').onclick = () => { location.hash = 'temps'; };

function startTimer() {
  startTimerFor({ projet: $('#t-projet').value, categorie: $('#t-cat').value, description: $('#t-desc').value.trim() });
}
// Démarre le minuteur (arrête et enregistre celui qui tourne déjà)
function startTimerFor(o) {
  if (db.settings.timer) stopTimer(true);
  db.settings.timer = { start: Date.now(), projet: o.projet || '', categorie: o.categorie || 'Livraison client', description: o.description || '', actionId: o.actionId || '' };
  save(); render(); toast(`Minuteur démarré${o.description ? ' : ' + o.description.slice(0, 40) : ''}`);
}
function stopTimer(silent) {
  const t = db.settings.timer; if (!t) return;
  const minutes = Math.max(1, Math.round(timerElapsed() / 60000));
  db.temps.push({ id: uid(), date: isoOf(new Date(t.start)), minutes, qui: 'Taoufik', projet: t.projet, categorie: t.categorie, description: t.description, actionId: t.actionId || '' });
  db.settings.timer = null; save(); render(); if (!silent) toast(`${hm(minutes)} enregistrées ✓ (${money2(minutes / 60 * (Number(db.settings.tauxHoraire) || 0))})`);
}
// Totaux par projet (temps de Taoufik et des agents, coûts)
function projectTotals(nom) {
  const list = db.temps.filter(t => (t.projet || '') === (nom || ''));
  const mine = list.filter(isMine), ai = list.filter(t => !isMine(t));
  const sum = (l, f) => l.reduce((s, t) => s + f(t), 0);
  return { minMe: sum(mine, t => Number(t.minutes) || 0), minAI: sum(ai, t => Number(t.minutes) || 0), coutMe: sum(mine, entryCost), coutAI: sum(ai, entryCost), nb: list.length };
}

/* ---------- Paramètres et sauvegarde ---------- */
function openSettings() {
  const s = db.settings;
  modal(`<h2>Paramètres et sauvegarde</h2>
    <form id="set" class="form-grid">
      <label class="full">Nom de l’agence<input name="agence" value="${esc(s.agence)}"></label>
      <label>Objectif d’heures par semaine<input name="objectifHeures" type="number" step="any" value="${esc(s.objectifHeures)}"></label>
      <label>Budget de départ ($ CA)<input name="budgetInitial" type="number" step="any" value="${esc(s.budgetInitial)}"></label>
      <label>Ton taux horaire ($ CA / h)<input name="tauxHoraire" type="number" step="any" value="${esc(s.tauxHoraire)}"></label>
      <label class="full">Revenu récurrent visé ($ CA par mois)<input name="revenuCible" type="number" step="any" value="${esc(s.revenuCible)}"></label>
      <div class="modal-actions full"><span class="sp"></span><button class="btn primary">Enregistrer</button></div>
    </form>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <h3>Sauvegarde</h3>
    <p class="muted">${Cloud.user
      ? 'Tes données sont dans la base de données en ligne. Une copie de secours (.json) chaque mois reste une bonne habitude.'
      : 'Tes données restent <b>dans ce navigateur, sur cet appareil</b>. Elles ne sont envoyées nulle part. Exporte une sauvegarde chaque semaine, et utilise « Importer » pour les retrouver sur un autre appareil.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="exp">⬇ Exporter une sauvegarde (.json)</button>
      <label class="btn" style="margin:0">⬆ Importer une sauvegarde<input type="file" id="imp-json" accept=".json,application/json" hidden></label>
      <button class="btn danger" id="reset">Tout effacer</button>
    </div>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <h3>Compte</h3>
    ${Cloud.user ? `
      <p class="muted">Connecté : <b>${esc(Cloud.user.email)}</b>. Tes données sont enregistrées en ligne et accessibles depuis tous tes appareils.</p>
      <form id="pw" class="form-grid">
        <label>Nouveau mot de passe<input name="p1" type="password" minlength="8" autocomplete="new-password" required></label>
        <label>Confirmer<input name="p2" type="password" minlength="8" autocomplete="new-password" required></label>
        <div class="modal-actions full"><button class="btn">Changer le mot de passe</button><span class="sp"></span><button type="button" class="btn danger" id="logout">Se déconnecter</button></div>
      </form>`
    : `<p class="muted">Mode local : pas de connexion, données sur cet appareil seulement. Pour activer la connexion et l’accès à distance, remplis <b>config.js</b> (voir le README).</p>`}`);
  if ($('#pw')) {
    $('#pw').onsubmit = async e => {
      e.preventDefault(); const f = e.target.elements;
      if (f.p1.value !== f.p2.value) { toast('Les deux mots de passe sont différents.'); return; }
      const { error } = await Cloud.client.auth.updateUser({ password: f.p1.value });
      if (error) toast('⚠ ' + authError(error)); else { e.target.reset(); toast('Mot de passe changé ✓'); }
    };
    $('#logout').onclick = logout;
  }
  $('#set').onsubmit = e => {
    e.preventDefault(); const f = e.target.elements;
    s.agence = f.agence.value.trim() || DEFAULT_SETTINGS.agence;
    for (const k of ['objectifHeures', 'budgetInitial', 'revenuCible', 'tauxHoraire']) s[k] = Number(f[k].value) || 0;
    save(); closeModal(); render(); toast('Paramètres enregistrés ✓');
  };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `sauvegarde-agence-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#imp-json').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !d.version || !Array.isArray(d.projets)) throw new Error('format');
      db = migrate(d); save(); closeModal(); render(); toast('Sauvegarde importée ✓');
    } catch (err) { toast('⚠ Ce fichier n’est pas une sauvegarde valide.'); }
  };
  const r = $('#reset');
  r.onclick = () => {
    if (!r.classList.contains('confirm')) { r.classList.add('confirm'); r.textContent = 'Clique encore pour tout effacer'; return; }
    db = seed(); save(); closeModal(); render(); toast('Données réinitialisées');
  };
}
$('#open-settings').onclick = openSettings;

/* ---------- Rendu et événements ---------- */
function render() {
  const v = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $('#brand-name').textContent = db.settings.agence;
  document.title = `${NAV.find(n => n[0] === v)[1]} — ${db.settings.agence}`;
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#${k}" class="${k === v ? 'active' : ''}"><span class="ico">${i}</span>${esc(l)}</a>`).join('');
  $('#view-title').textContent = NAV.find(n => n[0] === v)[1];
  $('#view-actions').innerHTML = v === 'dashboard'
    ? `<button class="btn" data-add="temps">+ Temps</button><button class="btn" data-add="transactions">+ Transaction</button><button class="btn primary" data-add="projets">+ Projet</button>`
    : '';
  $('#view').innerHTML = VIEWS[v]();
  tick();
  if (typeof applyBrandChrome === 'function') applyBrandChrome(); // brand.js
}

window.addEventListener('hashchange', render);

document.addEventListener('click', e => {
  if (e.target.closest('a[href^="http"]')) return;
  const pn = e.target.closest('[data-print-note]');
  if (pn) { e.stopPropagation(); const n = db.notes.find(x => x.id === pn.dataset.printNote); if (n) printNote(n); return; }
  const add = e.target.closest('[data-add]');
  if (add) { const preset = add.dataset.presetStatut ? { statut: add.dataset.presetStatut } : {}; openForm(add.dataset.add, null, preset); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed && !$('#modal-backdrop').contains(ed)) { openForm(ed.dataset.edit, ed.dataset.id); return; }
  if (e.target.id === 't-start') startTimer();
  if (e.target.id === 't-stop') stopTimer();
  if (e.target.id === 'import-rm') openImport();
  if (e.target.id === 'print-menu') openPrintMenu();
});

document.addEventListener('input', e => {
  if (e.target.classList.contains('search')) {
    const col = e.target.dataset.col; (ui[col] || (ui[col] = { q: '', f: '' })).q = e.target.value;
    render();
    const s = $('.search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
});
document.addEventListener('change', e => {
  if (e.target.classList.contains('filter')) { const col = e.target.dataset.col; (ui[col] || (ui[col] = { q: '', f: '' })).f = e.target.value; render(); }
});

/* Glisser-déposer des cartes de projet */
let dragId = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.kcard'); if (c) { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; } });
document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.kcol'); if (col && dragId) { e.preventDefault(); $$('.kcol').forEach(k => k.classList.toggle('over', k === col)); } });
document.addEventListener('dragend', () => { dragId = null; $$('.kcol').forEach(k => k.classList.remove('over')); });
document.addEventListener('drop', e => {
  const col = e.target.closest && e.target.closest('.kcol'); if (!col || !dragId) return;
  e.preventDefault(); const p = db.projets.find(x => x.id === dragId);
  if (p && p.statut !== col.dataset.status) { p.statut = col.dataset.status; save(); toast(`Statut : ${p.statut}`); }
  dragId = null; render();
});

/* ---------- Connexion (login) ---------- */
function authError(err) {
  const m = String((err && err.message) || err || '');
  if (/invalid login credentials/i.test(m)) return 'Courriel ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return 'Ce courriel n’est pas encore confirmé.';
  if (/password should be at least|weak/i.test(m)) return 'Mot de passe trop faible (8 caractères minimum).';
  if (/rate limit|too many/i.test(m)) return 'Trop d’essais. Attends quelques minutes.';
  if (/fetch|network/i.test(m)) return 'Pas de connexion Internet ou base de données injoignable.';
  return m || 'Erreur inconnue.';
}
function authMsg(text, cls = '') { const el = $('#auth-msg'); el.textContent = text; el.className = 'auth-msg ' + cls; }
function showAuth(which) {
  document.body.classList.add('locked');
  $('#auth').classList.remove('hidden');
  ['login-form', 'reset-form', 'newpass-form'].forEach(id => $('#' + id).classList.toggle('hidden', id !== which));
  const first = $(`#${which} input`); if (first) first.focus();
}
function hideAuth() { document.body.classList.remove('locked'); $('#auth').classList.add('hidden'); authMsg(''); }
async function busy(form, fn) {
  const b = $('button.primary', form); b.disabled = true;
  try { await fn(); } finally { b.disabled = false; }
}

$('#show-reset').onclick = () => { authMsg(''); showAuth('reset-form'); };
$('#back-login').onclick = () => { authMsg(''); showAuth('login-form'); };

$('#login-form').onsubmit = e => {
  e.preventDefault(); const f = e.target.elements;
  busy(e.target, async () => {
    authMsg('Connexion…');
    const { data, error } = await Cloud.client.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) { authMsg(authError(error), 'err'); return; }
    f.password.value = '';
    await afterLogin(data.user);
  });
};

$('#reset-form').onsubmit = e => {
  e.preventDefault(); const f = e.target.elements;
  busy(e.target, async () => {
    const { error } = await Cloud.client.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: location.origin + location.pathname });
    if (error) authMsg(authError(error), 'err');
    else authMsg('Si ce courriel a un compte, un lien vient d’être envoyé. Vérifie aussi tes courriels indésirables.', 'ok');
  });
};

$('#newpass-form').onsubmit = e => {
  e.preventDefault(); const f = e.target.elements;
  if (f.p1.value !== f.p2.value) { authMsg('Les deux mots de passe sont différents.', 'err'); return; }
  busy(e.target, async () => {
    const { data, error } = await Cloud.client.auth.updateUser({ password: f.p1.value });
    if (error) { authMsg(authError(error), 'err'); return; }
    history.replaceState(null, '', location.pathname);
    toast('Mot de passe enregistré ✓');
    await afterLogin(data.user);
  });
};

async function afterLogin(user) {
  Cloud.user = user;
  storageKey = `${KEY}:${user.id}`;
  hideAuth();
  // Copie locale de cet utilisateur, sinon données déjà sur l'appareil (mode local), sinon données de départ
  db = loadFrom(storageKey) || loadFrom(KEY) || seed();
  if (!location.hash || location.hash.includes('access_token') || location.hash.includes('type=')) history.replaceState(null, '', location.pathname + '#dashboard');
  Cloud.status('Chargement…', 'busy');
  render();
  try {
    await Cloud.sync(true);
  } catch (e) {
    Cloud.ready = false;
    Cloud.fail('⚠ Hors ligne — données de cet appareil', e);
  }
  render();
}

async function logout() {
  if (Cloud.dirty && Cloud.ready) { toast('Envoi des derniers changements…'); await Cloud.push(); }
  if (Cloud.dirty) {
    const b = $('#logout');
    if (b && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Changements non envoyés : cliquer encore pour quitter quand même'; return; }
  }
  try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
  await Cloud.client.auth.signOut();
  location.hash = '';
  location.reload();
}

// Quand on revient sur l'onglet : récupérer les changements faits sur un autre appareil
async function refreshFromCloud() {
  if (!Cloud.user || Cloud.dirty || Cloud.saving || window.AI_BUSY) return; // pas pendant un appel aux agents
  if (!$('#modal-backdrop').classList.contains('hidden')) return; // ne pas changer pendant une modification
  try {
    const wasReady = Cloud.ready;
    const r = await Cloud.sync(false);
    if (r === 'remote') { render(); if (wasReady) toast('Données mises à jour depuis un autre appareil'); }
    else if (!wasReady) render();
  } catch (e) { /* toujours hors ligne */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFromCloud(); });
window.addEventListener('online', refreshFromCloud);

/* ---------- Détails des erreurs de synchronisation ---------- */
function describeError(err) {
  if (!err) return 'Erreur inconnue.';
  const msg = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' — ') || String(err);
  let tip = '';
  if (/agence_data|PGRST205|42P01|does not exist|schema cache/i.test(msg)) tip = 'La table « agence_data » est introuvable : exécute le fichier supabase.sql dans Supabase (SQL Editor → New query → Run), puis clique sur Réessayer.';
  else if (/row-level security|42501|permission denied/i.test(msg)) tip = 'Les règles de sécurité bloquent l’accès : exécute de nouveau tout le fichier supabase.sql.';
  else if (/JWT|apikey|api key|401|Invalid API/i.test(msg)) tip = 'Clé ou adresse Supabase incorrecte dans config.js : recopie la Project URL et la clé publishable.';
  else if (/fetch|network|Failed to/i.test(msg)) tip = 'Pas de connexion Internet, ou le projet Supabase est en pause (réactive-le dans Supabase).';
  return { msg, tip };
}
function showSyncError() {
  const e = Cloud.lastError; if (!e) return;
  modal(`<h2>Problème de synchronisation</h2>
    ${e.tip ? `<div class="info">${esc(e.tip)}</div>` : ''}
    <p class="muted">Message technique (à m’envoyer si besoin) :</p>
    <pre style="white-space:pre-wrap;background:#f6f7f9;padding:10px;border-radius:8px;font-size:12px">${esc(e.msg)}</pre>
    <div class="modal-actions"><span class="sp"></span><button class="btn" data-close>Fermer</button><button class="btn primary" id="retry-sync">↻ Réessayer</button></div>`);
  $('#retry-sync').onclick = async () => {
    closeModal(); Cloud.status('Connexion…', 'busy');
    try { await Cloud.sync(!Cloud.ready); render(); if (Cloud.dirty) Cloud.queueSave(); toast('Synchronisé ✓'); }
    catch (err) { Cloud.fail('⚠ Hors ligne — données de cet appareil', err); showSyncError(); }
  };
}
$('#sync-status').addEventListener('click', showSyncError);

/* ---------- Démarrage ---------- */
async function start() {
  if (!Cloud.configured) {
    // Mode local : pas de connexion
    Cloud.status('💾 Mode local (cet appareil)');
    save(); render();
    return;
  }
  if (!Cloud.init()) {
    document.body.classList.add('locked');
    $('#auth').classList.remove('hidden');
    $$('#auth form').forEach(f => f.classList.add('hidden'));
    authMsg('Impossible de charger le module de connexion. Vérifie ta connexion Internet puis recharge la page.', 'err');
    return;
  }
  const isRecovery = /type=recovery/.test(location.hash);
  Cloud.client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { authMsg('Choisis ton nouveau mot de passe.'); showAuth('newpass-form'); }
  });
  const { data: { session } } = await Cloud.client.auth.getSession();
  if (isRecovery) { showAuth('newpass-form'); authMsg('Choisis ton nouveau mot de passe.'); return; }
  if (session && session.user) await afterLogin(session.user);
  else showAuth('login-form');
}

// Démarre quand tous les scripts (dont agents.js) sont chargés
window.addEventListener('DOMContentLoaded', start);
