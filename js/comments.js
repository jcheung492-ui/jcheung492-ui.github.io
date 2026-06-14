// ============================================================
// 作品评论区 —— 专辑 / 广告配乐 / 游戏配乐 每首旁边各一个
// 数据存在 Supabase(所有访客共享);访客自行命名(本地记住)
//   一次性拉取全部评论,按 track_id 分组缓存在内存,发评论后即时刷新。
// ============================================================
(function () {
  const NAME_KEY = "bx-visitor-name";
  const mounted = [];          // 已挂载的评论区
  let cache = {};              // track_id -> [{name,text,t}]
  let loadPromise = null;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function getName() { return (localStorage.getItem(NAME_KEY) || "").trim(); }
  function setName(n) { localStorage.setItem(NAME_KEY, (n || "").trim()); }

  function timeAgo(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    const d = new Date(t);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function mapRow(r) {
    return { name: r.name || "无名的旅人", text: r.text, t: new Date(r.created_at).getTime() };
  }
  function listFor(id) { return cache[id] || []; }

  // 一次性拉取全部评论(失败则下次可重试)
  function ensureLoaded(force) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = window.supa
      .select("comments", "?select=track_id,name,text,created_at&order=created_at.asc")
      .then((rows) => {
        cache = {};
        rows.forEach((r) => { (cache[r.track_id] = cache[r.track_id] || []).push(mapRow(r)); });
      })
      .catch((e) => { loadPromise = null; throw e; });
    return loadPromise;
  }

  const ICON = '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M2 2.6C2 2 2.5 1.5 3.1 1.5h9.8c.6 0 1.1.5 1.1 1.1v6.6c0 .6-.5 1.1-1.1 1.1H6.4l-3 2.6c-.4.3-.9 0-.9-.5v-2.1h-.4C2 10.3 2 9.8 2 9.2V2.6z" fill="currentColor"></path></svg>';

  function renderList(box, id) {
    const list = listFor(id).slice().reverse();
    if (!list.length) {
      box.innerHTML = '<p class="wc-empty">还没有评论。听完了的话，留一句吧。</p>';
      return;
    }
    box.innerHTML = list.map((m) =>
      '<div class="wc-msg">' +
        '<div class="wc-msg-head">' +
          '<span class="wc-msg-name">' + esc(m.name) + "</span>" +
          '<span class="wc-msg-time">' + timeAgo(m.t) + "</span>" +
        "</div>" +
        '<p class="wc-msg-text">' + esc(m.text) + "</p>" +
      "</div>"
    ).join("");
  }

  // 身份行
  function renderIdent(container) {
    const slot = container.querySelector(".wc-ident");
    if (!slot) return;
    const name = getName();
    if (name) {
      slot.innerHTML =
        '以 <span class="wc-me">' + esc(name) + '</span> 的身份评论 · ' +
        '<button type="button" class="wc-rename">改名</button>';
      slot.querySelector(".wc-rename").addEventListener("click", () => editName(container));
    } else {
      slot.innerHTML =
        '<input type="text" class="wc-name" placeholder="第一次来，先给自己起个名字吧（可不填）" autocomplete="off">';
    }
  }

  function editName(container) {
    const slot = container.querySelector(".wc-ident");
    slot.innerHTML =
      '<input type="text" class="wc-name" value="' + esc(getName()) + '" autocomplete="off">' +
      '<button type="button" class="wc-namesave">确定</button>';
    const input = slot.querySelector(".wc-name");
    input.focus(); input.select();
    const commit = () => { setName(input.value.trim()); refreshAllIdents(); };
    slot.querySelector(".wc-namesave").addEventListener("click", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
  }

  function refreshAllIdents() { mounted.forEach(renderIdent); }

  // 刷新所有已挂载评论区的计数(数据加载完或发评论后调用)
  function refreshCounts() {
    mounted.forEach((c) => {
      if (!document.body.contains(c)) return;
      const id = c.dataset.track;
      const countEl = c.querySelector(".wc-count");
      if (countEl) countEl.textContent = listFor(id).length;
      const list = c.querySelector(".wc-list");
      const panel = c.querySelector(".wc-panel");
      if (list && panel && !panel.hidden) renderList(list, id);
    });
  }

  function mount(container) {
    if (container.dataset.mounted === "1") return;
    container.dataset.mounted = "1";
    mounted.push(container);
    const id = container.dataset.track;

    container.innerHTML =
      '<button class="wc-toggle" type="button" aria-expanded="false">' +
        ICON + '<span class="wc-label">评论</span>' +
        '<span class="wc-count">' + listFor(id).length + "</span>" +
        '<span class="wc-caret">▾</span>' +
      "</button>" +
      '<div class="wc-panel" hidden>' +
        '<div class="wc-list"></div>' +
        '<form class="wc-form">' +
          '<div class="wc-ident"></div>' +
          '<div class="wc-row">' +
            '<input type="text" class="wc-text" placeholder="写下你的评论…" autocomplete="off">' +
            '<button type="submit" class="wc-send">发布</button>' +
          "</div>" +
          '<p class="wc-status"></p>' +
        "</form>" +
      "</div>";

    const toggle = container.querySelector(".wc-toggle");
    const panel = container.querySelector(".wc-panel");
    const list = container.querySelector(".wc-list");
    const countEl = container.querySelector(".wc-count");
    const form = container.querySelector(".wc-form");
    const statusEl = container.querySelector(".wc-status");

    renderIdent(container);

    toggle.addEventListener("click", async () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("is-open", open);
      if (open) {
        renderIdent(container);
        list.innerHTML = '<p class="wc-empty">加载中…</p>';
        try { await ensureLoaded(); } catch (e) {}
        renderList(list, id);
        countEl.textContent = listFor(id).length;
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const textEl = container.querySelector(".wc-text");
      const text = textEl.value.trim();
      if (!text) return;
      const nameInput = container.querySelector(".wc-name");
      let name = (nameInput ? nameInput.value.trim() : "") || getName() || "无名的旅人";
      if (name !== "无名的旅人") setName(name);
      const sendBtn = form.querySelector(".wc-send");
      sendBtn.disabled = true; statusEl.textContent = "发送中…";
      try {
        const saved = await window.supa.insert("comments", { track_id: id, name: name, text: text });
        const row = Array.isArray(saved) ? saved[0] : saved;
        (cache[id] = cache[id] || []).push(mapRow(row));
        textEl.value = "";
        statusEl.textContent = "";
        renderList(list, id);
        countEl.textContent = listFor(id).length;
        refreshAllIdents();
      } catch (err) {
        statusEl.textContent = "发送失败,请稍后重试。";
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  window.commentsApp = {
    mountAll() {
      for (let i = mounted.length - 1; i >= 0; i--) {
        if (!document.body.contains(mounted[i])) mounted.splice(i, 1);
      }
      document.querySelectorAll(".work-comments[data-track]").forEach(mount);
      // 后台拉取一次,加载完刷新计数
      ensureLoaded().then(refreshCounts).catch(() => {});
    }
  };
})();
