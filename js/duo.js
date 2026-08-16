// ============================================================
// SoundTruth · 双人归属标签 + 作品筛选
//   纯前端、只读 DOM：不改动 player.js，靠它渲染出来的 data-id 反查数据。
//   归属来源，按优先级：
//     1) 作品自己的 who 字段（管理面板「归属」下拉，值 justin/kinwah/both）
//     2) 没有 who 时，从「角色 / 标签」里正则猜人名
//     3) 还猜不出来 → 落到 DEFAULT_WHO（见下），不留「无归属」的孤儿
//   本文件把归属变成 .who-chip 标签，并驱动作品页顶部的 #works-who 筛选条。
// ============================================================
(function () {
  const STORE = "st-who-filter";
  const HOSTS = ["#works-cats", "#catdetail-strip"];

  const PAT = {
    justin: /justin|张百星|百星|振钧/i,
    kinwah: /kin\s*[-·]?\s*wah|kinwah/i
  };
  const LABEL = { justin: "Justin", kinwah: "KinWah" };
  // 筛选后某个分类一条都不剩时的占位话术（分类本身不隐藏，保证三个人的分区结构一样）
  const EMPTY_TIP = {
    justin: "这个分类还没有张百星 Justin 的作品。",
    kinwah: "这个分类还没有 KinWah 的作品。",
    both: "这个分类还没有双人合作的作品。"
  };
  // 没标归属、正则也猜不出来时的兜底归属。
  // 站点原有的 15 条作品都是张百星 Justin 的，who 字段又只能在管理面板里逐条补，
  // 所以这里直接兜底成 justin：不标注 = 归 Justin，「全部」和「张百星 Justin」两个
  // 筛选下看到的东西一致。以后 KinWah 的作品在面板里明确选一次归属即可覆盖它。
  const DEFAULT_WHO = "justin";

  // 从 meta 行里剥掉名字（标签已经单独显示，避免重复）
  const STRIP = /(justin|张百星|百星|振钧|kin\s*[-·]?\s*wah|kinwah)/gi;
  // 同一个模式的非全局版，只用来判断「这条 meta 里到底有没有人名」（/g 的 test 有 lastIndex 状态，不能复用）
  const HAS_NAME = /(justin|张百星|百星|振钧|kin\s*[-·]?\s*wah|kinwah)/i;

  let busy = false;   // 自己改 DOM 时别让 observer 递归

  // 把 meta 行按「·」切开，扔掉只剩名字的那几段，再用「 · 」接回去
  function tidy(s) {
    return String(s)
      .split(/[·|、]/)
      .map((part) => part.replace(STRIP, "").replace(/\s*\/\s*/g, " / ").replace(/^[\s\/]+|[\s\/]+$/g, "").replace(/\s{2,}/g, " ").trim())
      .filter(Boolean)
      .join(" · ");
  }

  function whoOf(text) {
    const j = PAT.justin.test(text);
    const k = PAT.kinwah.test(text);
    if (j && k) return "both";
    if (j) return "justin";
    if (k) return "kinwah";
    return "none";
  }

  // ---- 真字段：id → who 的查询表 ----
  // 已发布作品从 SITE_PUBLISHED 直接读（同步，够页面首次渲染用）；
  // 本地草稿只在 IndexedDB 里，靠 musicLib.getVisible() 异步补齐，补到了就重新贴一次标签。
  const whoMap = new Map();
  const VALID = { justin: 1, kinwah: 1, both: 1 };

  function seedMap() {
    (window.SITE_PUBLISHED || []).forEach((t) => {
      if (t && t.id && VALID[t.who]) whoMap.set(t.id, t.who);
    });
  }

  let mapPending = null;
  function refreshMap() {
    if (!window.musicLib || !window.musicLib.getVisible) return Promise.resolve(false);
    if (mapPending) return mapPending;
    mapPending = window.musicLib.getVisible().then((all) => {
      let changed = false;
      (all || []).forEach((t) => {
        if (!t || !t.id || !VALID[t.who]) return;
        if (whoMap.get(t.id) !== t.who) { whoMap.set(t.id, t.who); changed = true; }
      });
      mapPending = null;
      return changed;
    }).catch(() => { mapPending = null; return false; });
    return mapPending;
  }

  function whoOfItem(item) {
    const real = whoMap.get(item.dataset.id || "");
    if (real) return real;                        // 真字段优先
    const meta = item.querySelector(".work-meta");
    const guess = whoOf(meta ? meta.textContent : "");
    return guess === "none" ? DEFAULT_WHO : guess;   // 猜不出来就兜底，不返回 none
  }

  function chip(kind) {
    const el = document.createElement("span");
    el.className = "who-chip";
    el.dataset.who = kind;
    el.textContent = LABEL[kind];
    return el;
  }

  function tagItems() {
    HOSTS.forEach((sel) => {
      const host = document.querySelector(sel);
      if (!host) return;
      host.querySelectorAll(".work-item").forEach((item) => {
        if (item.dataset.whoDone === "1") return;
        const meta = item.querySelector(".work-meta");
        const who = whoOfItem(item);
        item.dataset.who = who;
        item.dataset.whoDone = "1";
        if (who === "none") return;
        const title = item.querySelector(".work-title");
        if (title) {
          const wrap = document.createElement("span");
          wrap.className = "who-chips";
          (who === "both" ? ["justin", "kinwah"] : [who]).forEach((k) => wrap.appendChild(chip(k)));
          title.appendChild(wrap);
        }
        // 只有 meta 里真的写了人名才需要剥（标签已经单独显示了，避免重复）。
        // 没写人名的就别碰，否则 tidy() 会把「制作人/编曲/混音」重排成「制作人 / 编曲 / 混音」。
        if (meta && HAS_NAME.test(meta.textContent)) {
          const rest = tidy(meta.textContent);
          if (rest) meta.textContent = rest;
          else meta.remove();
        }
      });
    });
  }

  // 一个分区（作品页的 .work-cat，或分类详情页的整块 strip）在当前筛选下空了：
  // 不隐藏分区，补一条筛选口径的占位；分类本来就没作品时，把 player.js 那条原生占位
  // 暂时藏起来换成筛选口径的说法，切回「全部」再还原。
  function markEmpty(box, total, shown, who) {
    const native = box.querySelector(":scope > .work-empty:not(.is-who-empty)");
    let ph = box.querySelector(":scope > .work-empty.is-who-empty");
    // 一条作品都没有、连 player.js 的原生占位也没有 = 这块还没渲染（分类详情页初次进入），别乱贴
    if (total === 0 && !native) { if (ph) ph.remove(); return; }
    if (shown > 0 || who === "all") {
      if (ph) ph.remove();
      if (native) native.hidden = false;
      return;
    }
    if (native) native.hidden = true;
    if (!ph) {
      ph = document.createElement("p");
      ph.className = "work-empty is-who-empty";
      box.appendChild(ph);
    }
    const msg = EMPTY_TIP[who] || "";
    if (ph.textContent !== msg) ph.textContent = msg;   // 同文案不重写，免得又触发 observer
  }

  function apply(who) {
    const prev = busy;
    busy = true;                                        // 下面会动 DOM，别让 observer 递归
    document.querySelectorAll(".who-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.who === who);
      b.setAttribute("aria-pressed", b.dataset.who === who ? "true" : "false");
    });
    HOSTS.forEach((sel) => {
      const host = document.querySelector(sel);
      if (!host) return;
      host.querySelectorAll(".work-item").forEach((item) => {
        const w = item.dataset.who || "none";
        let show = true;
        if (who === "justin") show = w === "justin" || w === "both";
        else if (who === "kinwah") show = w === "kinwah" || w === "both";
        else if (who === "both") show = w === "both";
        item.classList.toggle("is-filtered", !show);
      });
      const cats = host.querySelectorAll(".work-cat");
      const boxes = cats.length ? cats : [host];   // 分类详情页没有 .work-cat，整块 strip 当一个分区
      boxes.forEach((box) => {
        markEmpty(
          box,
          box.querySelectorAll(".work-item").length,
          box.querySelectorAll(".work-item:not(.is-filtered)").length,
          who
        );
      });
    });
    busy = prev;
  }

  function current() {
    try { return localStorage.getItem(STORE) || "all"; } catch (e) { return "all"; }
  }

  // 查询表补齐了新的归属（本地草稿）→ 清掉已贴的标签重贴一次
  function retag() {
    busy = true;
    HOSTS.forEach((sel) => {
      const host = document.querySelector(sel);
      if (!host) return;
      host.querySelectorAll(".work-item").forEach((item) => {
        item.querySelectorAll(".who-chips").forEach((n) => n.remove());
        delete item.dataset.whoDone;
      });
    });
    tagItems();
    apply(current());
    busy = false;
  }

  function sync() {
    if (busy) return;
    busy = true;
    tagItems();
    apply(current());
    busy = false;
    // 草稿里的归属要读 IndexedDB，回来晚了就补贴一次（没新东西就什么都不做）
    refreshMap().then((changed) => { if (changed) retag(); });
  }

  function wireFilter() {
    const bar = document.getElementById("works-who");
    if (!bar) return;
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest(".who-btn");
      if (!btn) return;
      const who = btn.dataset.who || "all";
      try { localStorage.setItem(STORE, who); } catch (err) {}
      apply(who);
    });
  }

  function observe() {
    HOSTS.forEach((sel) => {
      const host = document.querySelector(sel);
      if (!host) return;
      new MutationObserver(() => {
        if (busy) return;
        requestAnimationFrame(sync);
      }).observe(host, { childList: true, subtree: true });
    });
  }

  // 页面标题里的旧站名（在 router.js 里写死）替换成组合名，不动 router.js
  function siteName() {
    const t = window.textLib;
    if (!t) return "SoundTruth";
    const main = (t.get("site.name.main") || "").trim();
    const sub = (t.get("site.name.sub") || "").trim();
    if (!main) return sub || "SoundTruth";
    return sub ? main + "\u00b7" + sub : main;   // \u4e0e\u5bfc\u822a\u5de6\u4e0a\u89d2\u4e00\u81f4\uff1a\u4e3b\u540d\u00b7\u526f\u540d
  }

  function fixTitle() {
    if (document.title.indexOf("Justin\u2019s Space") >= 0) {
      // \u7ad9\u540d\u53ef\u4ee5\u5728\u9762\u677f\u91cc\u6539\uff0c\u6d4f\u89c8\u5668\u6807\u9898\u8ddf\u7740\u8d70
      document.title = document.title.replace("Justin\u2019s Space", siteName());
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    seedMap();
    wireFilter();
    observe();
    sync();
    setTimeout(sync, 400);   // 曲库是异步渲染的，补一次
    fixTitle();
    window.addEventListener("hashchange", () => setTimeout(fixTitle, 0));
  });
})();
