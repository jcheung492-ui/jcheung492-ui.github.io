// ============================================================
// 作品渲染 + 播放器 —— 分类(专辑/广告/游戏 可听,电影只看)
// 播放器是常驻的:切换页面不打断播放
// ============================================================
(function () {
  const audio = new Audio();
  audio.preload = "metadata";

  let queue = [];      // 可听曲目(album+ad+game),底部播放条按这个队列走
  let index = -1;      // 正在播放的下标
  let seeking = false;

  const $ = (s) => document.querySelector(s);

  const ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M3 1.7v12.6c0 .6.6.9 1.1.6l10-6.3c.5-.3.5-1 0-1.3l-10-6.3C3.6.8 3 1.1 3 1.7z"></path></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16"><rect x="2.5" y="1.5" width="3.6" height="13" rx="0.8"></rect><rect x="9.9" y="1.5" width="3.6" height="13" rx="0.8"></rect></svg>';
  const ICON_NOTE = '<svg viewBox="0 0 16 16"><path d="M13 1.6 5.4 3.2v7.1a2.6 2.6 0 1 0 1.2 2.2V6.2l5.2-1.1v3.8a2.6 2.6 0 1 0 1.2 2.2V1.6z"></path></svg>';

  function fmt(t) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function metaLine(t) {
    return [t.year, t.role].filter(Boolean).join(" · ");
  }

  // 分类介绍：默认值收归 textLib（管理面板可编辑）；textLib 缺席时退回 data.js 里的 c.intro
  function catIntro(c) {
    if (window.textLib) return window.textLib.get("cat." + c.key + ".intro");
    return c.intro || "";
  }

  // 解析视频来源：本地文件 / B站·YouTube 内嵌 / 其余平台跳转
  //   返回 null 表示这条作品没有视频
  function parseVideo(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    // 不是 http(s) 链接 → 当作本地文件/blob，用 <video> 播
    if (!/^https?:\/\//i.test(s)) return { kind: "file", src: s, platform: "本地视频" };
    let m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return { kind: "embed", platform: "YouTube", embed: "https://www.youtube.com/embed/" + m[1] };
    m = s.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i);
    if (m) return { kind: "embed", platform: "B站", embed: "https://player.bilibili.com/player.html?bvid=" + m[1] + "&page=1&high_quality=1&danmaku=0&autoplay=0" };
    m = s.match(/bilibili\.com\/video\/av(\d+)/i);
    if (m) return { kind: "embed", platform: "B站", embed: "https://player.bilibili.com/player.html?aid=" + m[1] + "&page=1&high_quality=1&danmaku=0&autoplay=0" };
    let platform = "站外视频";
    if (/xiaohongshu\.com|xhslink\.com/i.test(s)) platform = "小红书";
    else if (/douyin\.com|iesdouyin\.com/i.test(s)) platform = "抖音";
    else if (/weixin\.qq\.com|channels\.weixin|\/finder/i.test(s)) platform = "视频号";
    return { kind: "link", platform: platform, href: s };
  }

  // 作品封面区内容：有视频时显示视频海报（点开内嵌或跳转），否则维持原音频/海报
  function coverInner(t, pv, playable, playing) {
    const img = '<img src="' + t.cover + '" alt="' + esc(t.title) + ' 封面" loading="lazy">';
    if (pv) {
      if (pv.kind === "link") {
        return img +
          '<a class="work-videolink" href="' + esc(pv.href) + '" target="_blank" rel="noopener noreferrer">▶ 前往' + esc(pv.platform) + '观看</a>';
      }
      const dataAttr = (pv.kind === "embed"
        ? ' data-embed="' + esc(pv.embed) + '"'
        : ' data-file="' + esc(pv.src) + '"') +
        ' data-title="' + esc(t.title) + '"' +
        (pv.platform ? ' data-platform="' + esc(pv.platform) + '"' : "");
      return '<div class="work-videohost"' + dataAttr + '>' + img +
        '<button class="work-videoplay" type="button" aria-label="播放视频">' + ICON_PLAY + '</button>' +
        '</div>';
    }
    if (playable) {
      return img + '<button class="work-play" type="button" aria-label="播放">' +
        (playing ? ICON_PAUSE : ICON_PLAY) + '</button>';
    }
    return img + '<span class="work-filmtag">封面 / Poster</span>';
  }

  // ---- 视频灯箱：点海报弹出大窗播放（暗背景 + 模糊，复用图廊灯箱观感）----
  let vbox, vstage;
  function buildVideoModal() {
    vbox = document.createElement("div");
    vbox.className = "vlightbox";
    vbox.id = "video-lightbox";
    vbox.hidden = true;
    vbox.innerHTML =
      '<button class="vlb-close" type="button" aria-label="关闭">✕</button>' +
      '<div class="vlb-frame">' +
        '<div class="vlb-stage" id="vlb-stage"></div>' +
        '<div class="vlb-cap">' +
          '<span class="vlb-title" id="vlb-title"></span>' +
          '<span class="vlb-plat" id="vlb-plat"></span>' +
        "</div>" +
      "</div>";
    document.body.appendChild(vbox);
    vstage = vbox.querySelector("#vlb-stage");
    vbox.querySelector(".vlb-close").addEventListener("click", closeVideoModal);
    vbox.addEventListener("click", (e) => { if (e.target === vbox) closeVideoModal(); });
    document.addEventListener("keydown", (e) => {
      if (!vbox.hidden && e.key === "Escape") closeVideoModal();
    });
  }

  function openVideoModal(opts) {
    if (!vbox) buildVideoModal();
    audio.pause();   // 别和音频试听抢着出声
    let media = "";
    if (opts.embed) {
      const sep = opts.embed.indexOf("?") >= 0 ? "&" : "?";
      media = '<iframe src="' + opts.embed + sep + 'autoplay=1" ' +
        'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen scrolling="no" frameborder="0"></iframe>';
    } else if (opts.file) {
      media = '<video src="' + window.resolveMedia(opts.file) + '" controls autoplay playsinline></video>';
    }
    vstage.innerHTML = media;
    vbox.querySelector("#vlb-title").textContent = opts.title || "";
    vbox.querySelector("#vlb-plat").textContent = opts.platform || "";
    vbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeVideoModal() {
    if (!vbox) return;
    vstage.innerHTML = "";   // 销毁 iframe/video，立即停止播放与声音
    vbox.hidden = true;
    document.body.style.overflow = "";
  }

  // 一条「作品」—— 封面 + 文字介绍;可听的带播放按钮;专辑带评论区
  function workItem(t, qi) {
    const playable = qi >= 0;
    const pv = parseVideo(t.video);
    const current = playable && qi === index;
    const playing = current && !audio.paused;
    const hasMedia = playable || !!pv;
    return (
      '<article class="work-item' + (current ? " is-current" : "") + '"' +
        ' data-id="' + esc(t.id) + '"' +
        (playable ? ' data-i="' + qi + '"' : "") + '>' +
        '<div class="work-cover' + (pv ? " has-video" : "") + '">' +
          coverInner(t, pv, playable, playing) +
        "</div>" +
        '<div class="work-body">' +
          (t.en ? '<p class="work-en">' + esc(t.en) + "</p>" : "") +
          '<h3 class="work-title">' + esc(t.title) +
            (t.source === "draft" ? '<span class="work-tag">草稿</span>' : "") + "</h3>" +
          (metaLine(t) ? '<p class="work-meta">' + esc(metaLine(t)) + "</p>" : "") +
          (t.desc ? '<p class="work-desc">' + esc(t.desc) + "</p>" : "") +
          (playable
            ? '<button class="work-listen" type="button" data-i="' + qi + '">' +
                (playing ? "❚❚ 暂停" : "▶ 播放") + "</button>"
            : "") +
          ((t.credits || t.lyrics)
            ? '<button class="work-detail" type="button" data-id="' + esc(t.id) + '">歌词 / 详情</button>'
            : "") +
          // 可听 / 有视频的作品旁边的评论区
          (hasMedia
            ? '<div class="work-comments" data-track="' + esc(t.id) + '"></div>'
            : "") +
        "</div>" +
      "</article>"
    );
  }

  // 统一队列 = 所有可听作品(专辑/广告/游戏/随手录),底部播放条按此顺序走
  function buildQueue(all) {
    queue = [];
    ["album", "ad", "game", "sketch"].forEach((k) => {
      all.filter((t) => t.category === k && t.src).forEach((t) => queue.push(t));
    });
  }

  let lastAll = [];   // 最近一次的完整曲库,供分类详情页用

  function wireWorkButtons(host) {
    host.querySelectorAll(".work-play, .work-listen").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = Number(b.dataset.i ?? b.closest(".work-item").dataset.i);
        if (i === index) toggle(); else playAt(i);
      });
    });
    host.querySelectorAll(".work-detail").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.lyricsApp) window.lyricsApp.open(b.dataset.id);
      });
    });
    host.querySelectorAll(".work-videohost").forEach((vh) => {
      vh.addEventListener("click", (e) => {
        e.stopPropagation();
        openVideoModal({
          embed: vh.getAttribute("data-embed") || "",
          file: vh.getAttribute("data-file") || "",
          title: vh.getAttribute("data-title") || "",
          platform: vh.getAttribute("data-platform") || ""
        });
      });
    });
    if (window.commentsApp) window.commentsApp.mountAll();
  }

  function listHTML(items) {
    const qIndexOf = (t) => queue.indexOf(t);
    return '<div class="work-list">' + items.map((t) => {
      const qi = t.src ? qIndexOf(t) : -1;
      return workItem(t, qi);
    }).join("") + "</div>";
  }

  // Works 页:保留分栏(专辑/广告/游戏/电影),但暂时去掉「每栏只显 Top 3 + Learn more」,
  // 每个分区直接铺开该类全部作品
  function renderWorks(all) {
    lastAll = all;
    const host = $("#works-cats");
    if (!host) return;
    const cats = window.SITE_CATEGORIES || [];

    host.innerHTML = cats.map((c) => {
      const items = all.filter((t) => t.category === c.key);
      const inner = items.length
        ? listHTML(items)
        : '<p class="work-empty">这个分类还没有作品 —— 在页脚打开「管理」就能添加。</p>';
      return (
        '<section class="work-cat" id="cat-' + c.key + '">' +
          '<div class="work-cat-head">' +
            '<p class="kicker">' + esc(c.en) + "</p>" +
            '<h2 class="work-cat-title">' + esc(c.label) + "</h2>" +
            (catIntro(c) ? '<p class="work-cat-intro">' + esc(catIntro(c)) + "</p>" : "") +
          "</div>" +
          inner +
        "</section>"
      );
    }).join("");

    wireWorkButtons(host);
  }

  // 分类详情页(点「查看更多」后):同样排版,铺开全部
  function renderCategoryPage(key) {
    const host = $("#catdetail-strip");
    if (!host) return;
    const c = (window.SITE_CATEGORIES || []).find((x) => x.key === key);
    const headEl = $("#catdetail-head");
    if (!c) { host.innerHTML = ""; return; }
    const items = lastAll.filter((t) => t.category === key);
    if (headEl) {
      headEl.innerHTML =
        '<a class="catdetail-back" href="#/works">← 返回作品</a>' +
        '<p class="kicker">' + esc(c.en) + "</p>" +
        '<h1 class="page-title">' + esc(c.label) + "</h1>" +
        (catIntro(c) ? '<p class="page-sub">' + esc(catIntro(c)) + "</p>" : "");
    }
    host.innerHTML = items.length
      ? listHTML(items)
      : '<p class="work-empty">这个分类还没有作品。</p>';
    wireWorkButtons(host);
  }

  // 首页「随手录」—— 横向可滑的小卡片,封面可选
  function renderSketches(all) {
    const host = $("#sketch-strip");
    if (!host) return;
    const items = all.filter((t) => t.category === "sketch" && t.src);
    if (!items.length) {
      host.innerHTML = '<p class="sketch-empty">还没有随手录 —— 在页脚「管理」里选「随手录 / demo」就能传。</p>';
      return;
    }
    host.innerHTML = '<div class="sketch-track">' + items.map((t) => {
      const qi = queue.indexOf(t);
      const current = qi === index;
      const playing = current && !audio.paused;
      const thumb = t.cover
        ? '<img src="' + t.cover + '" alt="" loading="lazy">'
        : '<span class="sketch-glyph">' + ICON_NOTE + "</span>";
      return (
        '<article class="sketch-card' + (current ? " is-current" : "") + '" data-i="' + qi + '">' +
          '<div class="sketch-thumb">' + thumb +
            '<button class="sketch-play" type="button" aria-label="播放">' +
              (playing ? ICON_PAUSE : ICON_PLAY) + "</button>" +
          "</div>" +
          '<div class="sketch-info">' +
            (t.en ? '<p class="sketch-en">' + esc(t.en) + "</p>" : "") +
            '<h4 class="sketch-title">' + esc(t.title) +
              (t.source === "draft" ? '<span class="work-tag">草稿</span>' : "") + "</h4>" +
            (t.desc ? '<p class="sketch-desc">' + esc(t.desc) + "</p>" : "") +
          "</div>" +
        "</article>"
      );
    }).join("") + "</div>";

    host.querySelectorAll(".sketch-card").forEach((card) => {
      card.addEventListener("click", () => {
        const i = Number(card.dataset.i);
        if (i === index) toggle(); else playAt(i);
      });
    });
  }

  // 只更新各卡片的播放状态(不重建 DOM,以免清掉评论区状态)
  function updateCardStates() {
    document.querySelectorAll("#works-cats .work-item[data-i], #catdetail-strip .work-item[data-i]").forEach((el) => {
      const i = Number(el.dataset.i);
      const current = i === index;
      const playing = current && !audio.paused;
      el.classList.toggle("is-current", current);
      const playBtn = el.querySelector(".work-play");
      if (playBtn) playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      const listen = el.querySelector(".work-listen");
      if (listen) listen.textContent = playing ? "❚❚ 暂停" : "▶ 播放";
    });
    document.querySelectorAll(".sketch-card[data-i]").forEach((el) => {
      const i = Number(el.dataset.i);
      const current = i === index;
      const playing = current && !audio.paused;
      el.classList.toggle("is-current", current);
      const playBtn = el.querySelector(".sketch-play");
      if (playBtn) playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    });
  }

  function updateBar() {
    const bar = $("#player-bar");
    if (index < 0 || !queue[index]) { bar.classList.remove("is-open"); return; }
    const t = queue[index];
    bar.classList.add("is-open");
    const cov = $("#pb-cover");
    if (t.cover) { cov.src = t.cover; cov.style.display = ""; }
    else { cov.removeAttribute("src"); cov.style.display = "none"; }
    $("#pb-title").textContent = t.title;
    $("#pb-play").innerHTML = audio.paused ? ICON_PLAY : ICON_PAUSE;
  }

  function updateProgress() {
    if (seeking) return;
    const seek = $("#pb-seek");
    if (!seek) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    seek.value = pct;
    seek.style.setProperty("--pb-prog", pct + "%");
    $("#pb-time").textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
  }

  async function rerenderGrid() {
    const all = await window.musicLib.getVisible();
    buildQueue(all);
    renderWorks(all);
    renderSketches(all);
  }

  function playAt(i) {
    if (!queue[i]) return;
    index = i;
    audio.src = window.resolveMedia(queue[i].src);
    audio.load();
    audio.play().catch(() => {});
    updateCardStates(); updateBar();
  }
  function toggle() {
    if (index < 0) { if (queue.length) playAt(0); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function step(d) {
    if (!queue.length) return;
    playAt((index + d + queue.length) % queue.length);
  }

  audio.addEventListener("play", () => {
    document.body.classList.add("is-playing");
    updateCardStates(); updateBar();
  });
  audio.addEventListener("pause", () => {
    document.body.classList.remove("is-playing");
    updateCardStates(); updateBar();
  });
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("ended", () => step(1));

  function wireBar() {
    $("#pb-play").addEventListener("click", toggle);
    $("#pb-prev").addEventListener("click", () => step(-1));
    $("#pb-next").addEventListener("click", () => step(1));
    $("#pb-close").addEventListener("click", () => {
      audio.pause(); audio.removeAttribute("src"); audio.load();
      document.body.classList.remove("is-playing");
      index = -1; updateCardStates();
      $("#player-bar").classList.remove("is-open");
    });
    const seek = $("#pb-seek");
    seek.addEventListener("input", () => {
      seeking = true;
      seek.style.setProperty("--pb-prog", seek.value + "%");
      if (audio.duration) $("#pb-time").textContent =
        fmt((seek.value / 100) * audio.duration) + " / " + fmt(audio.duration);
    });
    seek.addEventListener("change", () => {
      if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
      seeking = false;
    });
  }

  // 曲库变化后刷新,尽量保住正在播的歌
  async function refresh() {
    const playingId = index >= 0 && queue[index] ? queue[index].id : null;
    const all = await window.musicLib.getVisible();
    buildQueue(all);
    renderWorks(all);
    renderSketches(all);
    index = playingId ? queue.findIndex((t) => t.id === playingId) : -1;
    if (playingId && index === -1) {
      audio.pause(); audio.removeAttribute("src"); audio.load();
      $("#player-bar").classList.remove("is-open");
    }
    if (index >= 0) updateBar();
  }

  // 给歌词面板用：播放指定 id、查询当前播放 id、直接拿到常驻 audio
  function playId(id) {
    const i = queue.findIndex((t) => t.id === id);
    if (i < 0) return false;
    if (i === index) { if (audio.paused) audio.play().catch(() => {}); }
    else playAt(i);
    return true;
  }
  function currentId() { return index >= 0 && queue[index] ? queue[index].id : null; }

  window.playerApp = { refresh, renderCategoryPage, audio, playId, currentId };
  document.addEventListener("DOMContentLoaded", () => { wireBar(); refresh(); });
})();
