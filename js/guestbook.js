// ============================================================
// 留言板 —— 数据存在 Supabase(所有访客共享);访客自行命名 + 留言
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function timeAgo(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    const d = new Date(t);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function msgHtml(name, text, t) {
    const nm = name || "无名的旅人";
    const initial = ((nm.trim().charAt(0)) || "?").toUpperCase();
    return '<div class="gb-msg">' +
        '<div class="gb-msg-head">' +
          '<span class="gb-avatar">' + esc(initial) + "</span>" +
          '<span class="gb-msg-name">' + esc(nm) + "</span>" +
          '<span class="gb-msg-time">' + timeAgo(t) + "</span>" +
        "</div>" +
        '<p class="gb-msg-text">' + esc(text) + "</p>" +
      "</div>";
  }

  async function render() {
    const box = $("#gb-list");
    if (!box) return;
    try {
      const rows = await window.supa.select("guestbook", "?select=name,text,created_at&order=created_at.desc");
      if (!rows.length) {
        box.innerHTML = '<p class="gb-empty">还没有人留言。说点什么吧,哪怕只是一句「今天也在听歌」。</p>';
        return;
      }
      box.innerHTML = rows.map((r) => msgHtml(r.name, r.text, new Date(r.created_at).getTime())).join("");
    } catch (e) {
      box.innerHTML = '<p class="gb-empty">留言加载失败,请稍后刷新页面再试。</p>';
    }
  }

  function wire() {
    const form = $("#gb-form");
    if (!form) return;
    let statusEl = form.querySelector(".gb-status");
    if (!statusEl) {
      statusEl = document.createElement("p");
      statusEl.className = "gb-status";
      form.appendChild(statusEl);
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#gb-name").value.trim() || "无名的旅人";
      const text = $("#gb-text").value.trim();
      if (!text) return;
      const btn = form.querySelector('button[type="submit"], .gb-send') || form.querySelector("button");
      if (btn) btn.disabled = true;
      statusEl.textContent = "发送中…";
      try {
        await window.supa.insert("guestbook", { name: name, text: text });
        $("#gb-text").value = "";
        statusEl.textContent = "";
        await render();
      } catch (err) {
        statusEl.textContent = "发送失败,请稍后重试。";
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    render();
  }

  window.guestbookApp = { render: render };
  document.addEventListener("DOMContentLoaded", wire);
})();
