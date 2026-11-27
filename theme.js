'use strict';
/* =========================================================
   Mode nuit : Jour / Nuit / Auto (suit le réglage de l'appareil).
   Le choix est gardé sur chaque appareil (navigateur).
   ========================================================= */
const THEME_KEY = 'stony-theme';
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

function getThemeChoice() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function applyTheme() {
  const choice = getThemeChoice();
  const dark = choice === 'dark' || (choice === 'auto' && darkQuery && darkQuery.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#0d1115' : '#1F2933';
  document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('active', b.dataset.themeSet === choice));
}
function setTheme(choice) {
  try { localStorage.setItem(THEME_KEY, choice); } catch (e) { /* navigation privée : thème non mémorisé */ }
  applyTheme();
  toast(choice === 'dark' ? '🌙 Mode nuit' : choice === 'light' ? '☀️ Mode jour' : '🖥 Thème automatique (suit ton appareil)');
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet); });
if (darkQuery) (darkQuery.addEventListener ? darkQuery.addEventListener('change', applyTheme) : darkQuery.addListener(applyTheme));
// Raccourci clavier : Alt + N bascule jour / nuit
document.addEventListener('keydown', e => {
  if (e.altKey && (e.key === 'n' || e.key === 'N') && !/input|textarea|select/i.test(e.target.tagName)) {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }
});
applyTheme();
