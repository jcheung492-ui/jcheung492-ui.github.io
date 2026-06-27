// Studio theme toggle. Kept independent from the React/Babel Tweaks panel so the
// public static page can switch themes without relying on edit-mode tooling.
//
// 自动主题：按「实时北京时间」决定亮/暗
//   · 07:00 ~ 18:00 → Light（亮）
//   · 18:00 ~ 次日 07:00 → Studio（暗）
// 手动切换：按钮始终可用。用户手动切换后，该选择在「当前这段时间窗口」内一直生效；
//   一旦跨过下一个边界（到 07:00 或 18:00），自动按北京时间接管。
(function () {
  const OVERRIDE_KEY = "justin-site-theme-override"; // {value:'dark'|'light', baseAuto:'dark'|'light'}
  const DARK_PAPER = "#1a1714";
  const LIGHT_HOUR = 7;   // 07:00 起为亮
  const DARK_HOUR = 18;   // 18:00 起为暗

  // 当前北京时间（UTC+8），不依赖用户本地时区
  function beijingHour() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const bj = new Date(utcMs + 8 * 3600000);
    return bj.getHours();
  }

  // 按北京时间算出「应当」的主题
  function autoTheme() {
    const h = beijingHour();
    return (h >= LIGHT_HOUR && h < DARK_HOUR) ? "light" : "dark";
  }

  function getOverride() {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "null"); }
    catch (_) { return null; }
  }
  function setOverride(o) {
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); } catch (_) {}
  }
  function clearOverride() {
    try { localStorage.removeItem(OVERRIDE_KEY); } catch (_) {}
  }

  // 解析当前应展示的主题：手动覆盖仅在「设置它时所处的同一自动窗口」内有效
  function resolveTheme() {
    const auto = autoTheme();
    const ov = getOverride();
    if (ov && ov.baseAuto === auto && ov.value !== auto) {
      return ov.value; // 用户在本窗口内手动选了与自动相反的主题
    }
    if (ov) clearOverride(); // 窗口已切换或与自动一致 → 覆盖作废，自动接管
    return auto;
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
  }

  window.setStudioTheme = apply;

  function applyResolved() {
    apply(resolveTheme() === "dark");
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyResolved();

    const button = document.getElementById("theme-toggle");
    if (button) {
      button.addEventListener("click", () => {
        const nextDark = !document.body.classList.contains("theme-dark");
        const next = nextDark ? "dark" : "light";
        const auto = autoTheme();
        if (next === auto) clearOverride();           // 切回与自动一致 → 不必记覆盖
        else setOverride({ value: next, baseAuto: auto });
        apply(nextDark);
      });
    }

    // 实时跟随北京时间：每分钟复核一次，跨越 07:00 / 18:00 边界时自动切换
    setInterval(() => {
      const want = resolveTheme() === "dark";
      const isDark = document.body.classList.contains("theme-dark");
      if (want !== isDark) apply(want);
    }, 60000);
  });
})();
