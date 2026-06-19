// ============================================================
// 歌词 / 详情面板 lyricsApp —— 点作品「歌词 / 详情」弹出玻璃大窗
//   · 制作名单 credits（纯文本，一行一条；支持「词：xxx」加粗前缀）
//   · 歌词 lyrics：
//       - 带时间轴 [mm:ss.xx] → A 方案：跟随常驻播放器滚动高亮、点行跳转
//       - 纯文本               → B 方案：静态展示，可手动滚动
//   复用常驻播放器的同一个 audio（window.playerApp），不另起声音
// ============================================================
(function () {
  let box, coverImg, titleEl, metaEl, creditsEl, scrollEl, playBtn;
  let openedId = null;       // 当前面板对应的作品 id
  let timed = [];            // [{t, text}]，有时间轴时非空
  let lineEls = [];          // 歌词行 DOM
  let lastActive = -1;
  let userScrolling = 0;     // 用户手动滚动后暂停自动吸附的时间戳

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function audio() { return window.playerApp && window.playerApp.audio; }
  function isCurrent() {
    return window.playerApp && window.playerApp.currentId && window.playerApp.currentId() === openedId;
  }

  // ---- 解析歌词：返回 {timed:[{t,text}], plain:[string]} ----
  const TS = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  function parseLyrics(raw) {
    const text = String(raw || "");
    const out = [];
    let hasTime = false;
    text.split(/\r?\n/).forEach((line) => {
      TS.lastIndex = 0;
      const stamps = [];
      let m, body = line;
      while ((m = TS.exec(line))) {
        hasTime = true;
        const cs = m[3] ? parseInt((m[3] + "00").slice(0, 3), 10) / 1000 : 0;
        stamps.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + cs);
      }
      body = line.replace(TS, "").trim();
      if (stamps.length) stamps.forEach((t) => out.push({ t: t, text: body }));
      else if (body) out.push({ t: null, text: body });
    });
    out.sort((a, b) => (a.t == null ? 1e9 : a.t) - (b.t == null ? 1e9 : b.t));
    return { hasTime: hasTime, lines: out };
  }

  function buildModal() {
    box = document.createElement("div");
    box.className = "lyr-box";
    box.id = "lyrics-box";
    box.hidden = true;
    box.innerHTML =
      '<button class="lyr-close" type="button" aria-label="关闭">✕</button>' +
      '<div class="lyr-frame glass-dark">' +
        '<div class="lyr-left">' +
          '<div class="lyr-cover"><img id="lyr-cover" alt=""></div>' +
          '<button class="lyr-play" id="lyr-play" type="button">▶ 播放</button>' +
          '<h3 class="lyr-title" id="lyr-title"></h3>' +
          '<p class="lyr-meta" id="lyr-meta"></p>' +
          '<div class="lyr-credits" id="lyr-credits"></div>' +
        "</div>" +
        '<div class="lyr-right" id="lyr-scroll"></div>' +
      "</div>";
    document.body.appendChild(box);
    coverImg = box.querySelector("#lyr-cover");
    titleEl = box.querySelector("#lyr-title");
    metaEl = box.querySelector("#lyr-meta");
    creditsEl = box.querySelector("#lyr-credits");
    scrollEl = box.querySelector("#lyr-scroll");
    playBtn = box.querySelector("#lyr-play");

    box.querySelector(".lyr-close").addEventListener("click", close);
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => { if (!box.hidden && e.key === "Escape") close(); });
    scrollEl.addEventListener("scroll", () => { userScrolling = Date.now(); }, { passive: true });
    playBtn.addEventListener("click", () => {
      const a = audio();
      if (isCurrent() && a && !a.paused) { a.pause(); }
      else if (window.playerApp && window.playerApp.playId) { window.playerApp.playId(openedId); }
    });
  }

  function renderCredits(credits) {
    if (!credits) { creditsEl.innerHTML = ""; creditsEl.hidden = true; return; }
    creditsEl.hidden = false;
    creditsEl.innerHTML = '<p class="lyr-credits-h">制作名单</p>' +
      String(credits).split(/\r?\n/).filter((l) => l.trim()).map((l) => {
        const m = l.match(/^\s*([^：:]{1,8})\s*[：:]\s*(.+)$/);
        return m
          ? '<p class="lyr-cr"><b>' + esc(m[1]) + "</b> " + esc(m[2]) + "</p>"
          : '<p class="lyr-cr">' + esc(l) + "</p>";
      }).join("");
  }

  function renderLyrics(parsed) {
    lineEls = [];
    lastActive = -1;
    if (!parsed.lines.length) {
      scrollEl.classList.remove("is-timed");
      scrollEl.innerHTML = '<p class="lyr-empty">这首暂时没有歌词。</p>';
      return;
    }
    timed = parsed.hasTime ? parsed.lines.filter((l) => l.t != null) : [];
    scrollEl.classList.toggle("is-timed", parsed.hasTime);
    scrollEl.innerHTML =
      '<div class="lyr-pad"></div>' +
      parsed.lines.map((l, i) =>
        '<p class="lyr-line" data-i="' + i + '"' +
          (l.t != null ? ' data-t="' + l.t + '"' : "") + ">" + esc(l.text || "·") + "</p>"
      ).join("") +
      '<div class="lyr-pad"></div>';
    lineEls = [...scrollEl.querySelectorAll(".lyr-line")];

    // 点歌词行 → 跳转到该时间（仅时间轴歌词）
    lineEls.forEach((el) => {
      const t = el.dataset.t;
      if (t == null) return;
      el.classList.add("seekable");
      el.addEventListener("click", () => seekTo(parseFloat(t)));
    });
  }

  function seekTo(t) {
    const a = audio();
    if (!a) return;
    if (!isCurrent()) {
      if (window.playerApp && window.playerApp.playId) window.playerApp.playId(openedId);
      const once = () => { a.currentTime = t; a.removeEventListener("loadedmetadata", once); };
      a.addEventListener("loadedmetadata", once);
      // 已经是同一首但元数据已就绪时直接设
      if (a.readyState >= 1) { a.currentTime = t; a.removeEventListener("loadedmetadata", once); }
    } else {
      a.currentTime = t;
      if (a.paused) a.play().catch(() => {});
    }
  }

  // 跟随播放进度高亮 + 自动滚动
  function tick() {
    if (box.hidden || !timed.length || !isCurrent()) return;
    const a = audio();
    if (!a) return;
    const now = a.currentTime;
    let idx = 0;
    for (let i = 0; i < timed.length; i++) { if (timed[i].t <= now + 0.15) idx = i; else break; }
    // timed 数组与渲染行一一对应（hasTime 时所有行都有 t）
    if (idx === lastActive) return;
    lastActive = idx;
    lineEls.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    const el = lineEls[idx];
    if (el && Date.now() - userScrolling > 1600) {
      scrollEl.scrollTo({ top: el.offsetTop - scrollEl.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
    }
  }

  function syncPlayBtn() {
    if (!box || box.hidden) return;
    const a = audio();
    const playing = isCurrent() && a && !a.paused;
    playBtn.textContent = playing ? "❚❚ 暂停" : "▶ 播放";
    playBtn.classList.toggle("is-playing", !!playing);
  }

  function attach() {
    const a = audio();
    if (!a) return;
    a.addEventListener("timeupdate", tick);
    a.addEventListener("play", syncPlayBtn);
    a.addEventListener("pause", syncPlayBtn);
  }
  function detach() {
    const a = audio();
    if (!a) return;
    a.removeEventListener("timeupdate", tick);
    a.removeEventListener("play", syncPlayBtn);
    a.removeEventListener("pause", syncPlayBtn);
  }

  async function findTrack(id) {
    const all = await window.musicLib.getVisible();
    let t = all.find((x) => x.id === id);
    if (t) return t;
    const all2 = await window.musicLib.getAllWithHidden();
    return all2.find((x) => x.id === id) || null;
  }

  async function open(id) {
    if (!box) buildModal();
    const t = await findTrack(id);
    if (!t) return;
    openedId = id;
    coverImg.src = t.cover || "covers/morning-mist.png";
    titleEl.textContent = t.title || "";
    metaEl.textContent = [t.year, t.role].filter(Boolean).join(" · ");
    renderCredits(t.credits);
    renderLyrics(parseLyrics(t.lyrics));
    playBtn.hidden = !t.src;        // 没有音源就不显示试听
    box.hidden = false;
    document.body.style.overflow = "hidden";
    attach();
    syncPlayBtn();
    requestAnimationFrame(() => { lastActive = -1; tick(); });
  }

  function close() {
    if (!box) return;
    detach();
    box.hidden = true;
    document.body.style.overflow = "";
    openedId = null;
  }

  window.lyricsApp = { open, close };
})();
