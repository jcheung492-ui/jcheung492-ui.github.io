// ============================================================
// 留言板 —— 访客自行命名 + 留言;保存在访客自己的浏览器(localStorage)
// ============================================================
(function () {
  const KEY = "bx-guestbook";
  const $ = (s) => document.querySelector(s);

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function timeAgo(t) {
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    const d = new Date(t);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function render() {
    const list = load().slice().reverse();
    const box = $("#gb-list");
    if (!list.length) {
      box.innerHTML = '<p class="gb-empty">还没有人留言。说点什么吧,哪怕只是一句「今天也在听歌」。</p>';
      return;
    }
    box.innerHTML = list.map((m) =>
      '<div class="gb-msg">' +
        '<div class="gb-msg-head">' +
          '<span class="gb-msg-name">' + esc(m.name) + "</span>" +
          '<span class="gb-msg-time">' + timeAgo(m.t) + "</span>" +
        "</div>" +
        '<p class="gb-msg-text">' + esc(m.text) + "</p>" +
      "</div>"
    ).join("");
  }

  function wire() {
    const form = $("#gb-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#gb-name").value.trim() || "无名的旅人";
      const text = $("#gb-text").value.trim();
      if (!text) return;
      const list = load();
      list.push({ name: name, text: text, t: Date.now() });
      save(list);
      $("#gb-text").value = "";
      render();
    });
    render();
  }

  window.guestbookApp = { render: render };
  document.addEventListener("DOMContentLoaded", wire);
})();
