// Studio theme toggle. Kept independent from the React/Babel Tweaks panel so the
// public static page can switch themes without relying on edit-mode tooling.
(function () {
  const KEY = "justin-site-studio-theme";
  const DARK_PAPER = "#1a1714";

  function getStored() {
    try { return localStorage.getItem(KEY) === "dark"; }
    catch (_) { return false; }
  }

  function persist(dark) {
    try { localStorage.setItem(KEY, dark ? "dark" : "light"); }
    catch (_) {}
  }

  function apply(dark, options = {}) {
    const root = document.documentElement.style;
    const button = document.getElementById("theme-toggle");
    document.body.classList.toggle("theme-dark", !!dark);
    root.setProperty("--paper", dark ? DARK_PAPER : (options.paper || "#f7f3ec"));
    if (button) {
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      button.textContent = dark ? "Light" : "Studio";
    }
    if (options.persist !== false) persist(!!dark);
  }

  window.setStudioTheme = apply;

  document.addEventListener("DOMContentLoaded", () => {
    apply(getStored(), { persist: false });
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    button.addEventListener("click", () => {
      apply(!document.body.classList.contains("theme-dark"));
    });
  });
})();
