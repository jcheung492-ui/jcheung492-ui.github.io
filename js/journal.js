// ============================================================
// 随笔 Journal —— 把「写死的 3 篇」改成 journalLib 驱动的可增删列表
//   合并「默认 + 已发布 + 本地草稿」渲染进 #writing-list
//   想换默认内容:改 js/data.js 里的 SITE_JOURNAL；线上内容用管理面板维护
// ============================================================
(function () {
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  async function render() {
    const list = document.getElementById("writing-list");
    if (!list) return;
    let items;
    try {
      items = window.journalLib ? await window.journalLib.getVisible() : (window.SITE_JOURNAL || []);
    } catch (e) {
      items = window.SITE_JOURNAL || [];
    }
    if (!items.length) {
      list.innerHTML = '<p class="writing-empty">还没有随笔 —— 进入管理面板「随笔」添加。</p>';
      return;
    }
    list.innerHTML = items.map((j) =>
      '<article class="writing-item">' +
        '<div class="writing-date">' + esc(j.date) + "</div>" +
        '<div class="writing-body">' +
          "<h3>" + esc(j.title) + "</h3>" +
          "<p>" + esc(j.body) + "</p>" +
        "</div>" +
      "</article>"
    ).join("");
  }

  document.addEventListener("DOMContentLoaded", render);
  window.journalApp = { render };
})();
