// ============================================================
// Configuration de la base de données en ligne (Supabase)
//
// Colle ici les 2 valeurs de ton projet Supabase
// (Project Settings → API / API Keys) :
//   - supabaseUrl     : l'adresse du projet (https://xxxx.supabase.co)
//   - supabaseAnonKey : la clé « anon public » ou « publishable »
//
// Cette clé est faite pour être publique : la sécurité vient des
// règles RLS créées par supabase.sql et de la connexion obligatoire.
// NE COLLE JAMAIS ici la clé « service_role » ou « secret ».
//
// Si les 2 valeurs sont vides, l'application fonctionne en
// « mode local » (données sur cet appareil seulement, sans connexion).
// ============================================================
window.AGENCE_CONFIG = {
  supabaseUrl: 'https://cehnutqqubmqczzhaptd.supabase.co',
  supabaseAnonKey: 'sb_publishable_enPp8kHmW_C5HQiRhrwT4w_BgrVzpdU'
};
