// ============================================================
// 作品评论区 —— 专辑 / 广告配乐 / 游戏配乐 每首旁边各一个
// 访客自行命名:第一次引导填写,之后自动沿用同一个名字
// 数据存在访客自己的浏览器(localStorage);接后端时改 load()/save()
// ============================================================
(function () {
  const PREFIX = "bx-comments-";
  const NAME_KEY = "bx-visitor-name";

  const mounted = [];   // 已挂载的评论区,改名时统一刷新身份显示

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function load(id) {
    try { return JSON.parse(localStorage.getItem(PREFIX + id) || "[]"); }
    catch (e) { return []; }
  }
  function save(id, list) { localStorage.setItem(PREFIX + id, JSON.stringify(list)); }

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

  const ICON = '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M2 2.6C2 2 2.5 1.5 3.1 1.5h9.8c.6 0 1.1.5 1.1 1.1v6.6c0 .6-.5 1.1-1.1 1.1H6.4l-3 2.6c-.4.3-.9 0-.9-.5v-2.1h-.4C2 10.3 2 9.8 2 9.2V2.6z" fill="currentColor"></path></svg>';

  function renderList(box, id) {
    const list = load(id).slice().reverse();
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

  // 身份行:有名字时显示「以 X 的身份 · 改名」,否则引导第一次填写
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

  function mount(container) {
    if (container.dataset.mounted === "1") return;
    container.dataset.mounted = "1";
    mounted.push(container);
    const id = container.dataset.track;
    const count = load(id).length;

    container.innerHTML =
      '<button class="wc-toggle" type="button" aria-expanded="false">' +
        ICON + '<span class="wc-label">评论</span>' +
        '<span class="wc-count">' + count + "</span>" +
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
        "</form>" +
      "</div>";

    const toggle = container.querySelector(".wc-toggle");
    const panel = container.querySelector(".wc-panel");
    const list = container.querySelector(".wc-list");
    const countEl = container.querySelector(".wc-count");
    const form = container.querySelector(".wc-form");

    renderIdent(container);

    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("is-open", open);
      if (open) { renderList(list, id); renderIdent(container); }
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const textEl = container.querySelector(".wc-text");
      const text = textEl.value.trim();
      if (!text) return;
      // 名字:优先用身份行里临时输入的(第一次),否则用已记住的
      const nameInput = container.querySelector(".wc-name");
      let name = (nameInput ? nameInput.value.trim() : "") || getName() || "无名的旅人";
      setName(name === "无名的旅人" ? getName() : name); // 记住这次的名字(除非用了默认)
      const arr = load(id);
      arr.push({ name: name, text: text, t: Date.now() });
      save(id, arr);
      textEl.value = "";
      countEl.textContent = arr.length;
      renderList(list, id);
      refreshAllIdents();
    });
  }

  window.commentsApp = {
    mountAll() {
      // 网格重建后旧引用作废,只保留仍在文档里的
      for (let i = mounted.length - 1; i >= 0; i--) {
        if (!document.body.contains(mounted[i])) mounted.splice(i, 1);
      }
      document.querySelectorAll(".work-comments[data-track]").forEach(mount);
    }
  };
})();
