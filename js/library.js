// ============================================================
// 音源库 musicLib —— 合并三种来源,统一供播放器 / 管理面板使用
//   1) 默认占位  window.SITE_TRACKS    (js/data.js,手写;可「下架」)
//   2) 已发布    window.SITE_PUBLISHED (js/published.js,面板维护;封面/音频在仓库里)
//   3) 本地草稿  IndexedDB             (面板里暂存、尚未发布的内容,只在本机可见)
//
// 「未发布的本地改动」分四种,都先记在本机,点「发布」后才对所有人生效:
//   · 新增草稿作品        -> IndexedDB
//   · 下架默认作品        -> localHidden
//   · 恢复(已发布的)下架  -> pendingUnhide
//   · 删除已发布作品      -> pendingDelete
// ============================================================
(function () {
  const DB_NAME = "bx-music";
  const STORE = "tracks";
  const GAL_STORE = "gallery";               // 光影图廊的本地草稿
  const JOUR_STORE = "journal";              // 随笔的本地草稿
  const HIDDEN_KEY = "bx-hidden-builtins";   // 草稿:待下架的默认作品 id
  const UNHIDE_KEY = "bx-pending-unhide";    // 草稿:待恢复上架的(已发布下架的)默认作品 id
  const DELETE_KEY = "bx-pending-delete";    // 草稿:待删除的已发布作品 id
  const ORDER_KEY  = "bx-order-draft";       // 草稿:自定义展示顺序(id 数组),发布后写进 SITE_ORDER
  // 光影图廊用的同类 localStorage 键
  const GAL_HIDDEN_KEY = "bx-gal-hidden";    // 草稿:待下架的默认照片 id
  const GAL_UNHIDE_KEY = "bx-gal-unhide";    // 草稿:待恢复上架的(已发布下架的)默认照片 id
  const GAL_DELETE_KEY = "bx-gal-delete";    // 草稿:待删除的已发布照片 id
  // 随笔用的同类 localStorage 键
  const JOUR_HIDDEN_KEY = "bx-jour-hidden";  // 草稿:待下架的默认随笔 id
  const JOUR_UNHIDE_KEY = "bx-jour-unhide";  // 草稿:待恢复上架的随笔 id
  const JOUR_DELETE_KEY = "bx-jour-delete";  // 草稿:待删除的已发布随笔 id

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(GAL_STORE)) {
          db.createObjectStore(GAL_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(JOUR_STORE)) {
          db.createObjectStore(JOUR_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function txOn(storeName, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const out = fn(store);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  function tx(mode, fn) { return txOn(STORE, mode, fn); }

  function getList(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch (e) { return []; }
  }
  function setList(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }
  function addTo(key, id) { const a = getList(key); if (!a.includes(id)) { a.push(id); setList(key, a); } }
  function removeFrom(key, id) { setList(key, getList(key).filter((x) => x !== id)); }

  function publishedHidden() {
    return Array.isArray(window.SITE_HIDDEN) ? window.SITE_HIDDEN : [];
  }

  // ---- 展示顺序 ----
  // 线上已发布顺序 = window.SITE_ORDER（published.js 维护）
  // 本地草稿顺序   = localStorage[ORDER_KEY]（拖动后暂存，发布前只本机生效）
  function publishedOrder() { return Array.isArray(window.SITE_ORDER) ? window.SITE_ORDER : []; }
  function getDraftOrder() {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : null; }
    catch (e) { return null; }
  }
  // 当前生效顺序：有草稿用草稿，否则用线上
  function effectiveOrder() { return getDraftOrder() || publishedOrder(); }
  // 草稿顺序是否真的改变了线上顺序（用于「未发布改动」计数）
  function orderChanged() {
    const d = getDraftOrder();
    if (!d) return false;
    return JSON.stringify(d) !== JSON.stringify(publishedOrder());
  }
  // 按生效顺序稳定重排：在顺序表里的按表内位置排；不在表里的（新作品）保持原相对位置、排到最后
  function applyOrder(list) {
    const order = effectiveOrder();
    if (!order || !order.length) return list;
    const pos = new Map(order.map((id, i) => [id, i]));
    const BIG = order.length;
    return list
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const pa = pos.has(a.t.id) ? pos.get(a.t.id) : BIG + a.i;
        const pb = pos.has(b.t.id) ? pos.get(b.t.id) : BIG + b.i;
        return pa - pb;
      })
      .map((x) => x.t);
  }

  const objectUrls = new Map();

  window.musicLib = {
    // 所有本地草稿（IndexedDB）—— 含「新增草稿」与「已发布作品的修改草稿」
    async getCustom() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readonly");
        const req = t.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    // 仅「新增草稿」（不含已发布作品的修改草稿）
    async getNewDrafts() {
      return (await this.getCustom()).filter((r) => !r.editOf);
    },
    // 仅「已发布作品的修改草稿」（带 editOf 指向被改的已发布 id）
    async getPublishedEdits() {
      return (await this.getCustom()).filter((r) => r.editOf);
    },

    // 合并后的完整曲库（含来源 / 草稿状态），给管理面板用
    //   source: "builtin" | "published" | "draft"
    //   hidden:        该 builtin 当前是否处于下架状态
    //   pendingHide:   下架是「本地草稿、尚未发布」
    //   pendingUnhide: 恢复上架是「本地草稿、尚未发布」
    //   pendingDelete: 该已发布作品被标记为「待删除、尚未发布」
    async getAllWithHidden() {
      const localHidden = new Set(getList(HIDDEN_KEY));
      const pubHidden = new Set(publishedHidden());
      const pendUnhide = new Set(getList(UNHIDE_KEY));
      const pendDelete = new Set(getList(DELETE_KEY));
      const editList = await this.getPublishedEdits();
      const editMap = new Map(editList.map((e) => [e.editOf, e]));

      const builtins = (window.SITE_TRACKS || []).map((t) => {
        const hiddenNow = (pubHidden.has(t.id) || localHidden.has(t.id)) && !pendUnhide.has(t.id);
        return {
          ...t, source: "builtin",
          hidden: hiddenNow,
          pendingHide: localHidden.has(t.id) && !pubHidden.has(t.id),
          pendingUnhide: pendUnhide.has(t.id)
        };
      });

      const published = (window.SITE_PUBLISHED || []).map((t) => {
        const ed = editMap.get(t.id);
        const view = ed ? this.editPreview(t, ed) : t;
        return {
          ...view, id: t.id, source: "published", builtin: false, hidden: false,
          pendingDelete: pendDelete.has(t.id), pendingEdit: !!ed
        };
      });

      const drafts = (await this.getNewDrafts())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((t) => this.toPlayable(t));

      return applyOrder(builtins.concat(published, drafts));
    },

    // 上架中的曲目（播放器用）：默认(未下架) + 已发布(未待删) + 本地草稿
    async getVisible() {
      const all = await this.getAllWithHidden();
      return all.filter((t) => !t.hidden && !t.pendingDelete);
    },

    // IndexedDB 草稿记录 -> 可播放对象（blob 转 URL）
    toPlayable(rec) {
      if (!objectUrls.has(rec.id + ":cover")) {
        objectUrls.set(rec.id + ":audio", rec.audioBlob ? URL.createObjectURL(rec.audioBlob) : null);
        objectUrls.set(rec.id + ":cover", rec.coverBlob ? URL.createObjectURL(rec.coverBlob) : null);
        objectUrls.set(rec.id + ":video", rec.videoBlob ? URL.createObjectURL(rec.videoBlob) : null);
      }
      return {
        id: rec.id,
        source: "draft",
        category: rec.category || "album",
        title: rec.title,
        en: rec.en || "",
        year: rec.year || "",
        role: rec.role || "",
        desc: rec.desc || "",
        src: objectUrls.get(rec.id + ":audio") || null,
        cover: objectUrls.get(rec.id + ":cover") || "covers/morning-mist.png",
        video: objectUrls.get(rec.id + ":video") || rec.videoUrl || null,
        credits: rec.credits || "",
        lyrics: rec.lyrics || "",
        builtin: false
      };
    },

    // 已发布作品 + 它的「修改草稿」-> 预览字段
    //   新封面/音频用本地 blob 预览；没重新选就沿用线上原文件路径。
    editPreview(t, ed) {
      if (!objectUrls.has(ed.id + ":cover")) {
        objectUrls.set(ed.id + ":audio", ed.audioBlob ? URL.createObjectURL(ed.audioBlob) : null);
        objectUrls.set(ed.id + ":cover", ed.coverBlob ? URL.createObjectURL(ed.coverBlob) : null);
        objectUrls.set(ed.id + ":video", ed.videoBlob ? URL.createObjectURL(ed.videoBlob) : null);
      }
      return {
        category: ed.category || t.category || "album",
        title: ed.title || "",
        en: ed.en || "", year: ed.year || "", role: ed.role || "", desc: ed.desc || "",
        cover: objectUrls.get(ed.id + ":cover") || t.cover || "covers/morning-mist.png",
        src: objectUrls.get(ed.id + ":audio") || t.src || null,
        video: objectUrls.get(ed.id + ":video") || ed.videoUrl || t.video || null,
        credits: ed.credits != null ? ed.credits : (t.credits || ""),
        lyrics: ed.lyrics != null ? ed.lyrics : (t.lyrics || "")
      };
    },

    // 新增一条本地草稿（尚未发布）。video 二选一：videoUrl（站外链接）或 videoFile（上传文件）
    async add({ category, title, en, year, role, desc, credits, lyrics, audioFile, coverFile, videoUrl, videoFile }) {
      const rec = {
        id: "custom-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
        category: category || "album",
        title: title, en: en || "", year: year || "", role: role || "", desc: desc || "",
        credits: credits || "", lyrics: lyrics || "",
        audioBlob: audioFile || null,
        coverBlob: coverFile || null,
        videoBlob: videoFile || null,
        videoUrl: videoFile ? "" : (videoUrl || ""),
        createdAt: Date.now()
      };
      await tx("readwrite", (s) => s.put(rec));
      return rec;
    },

    // 删除一条本地草稿（立即生效，仅本机）
    async remove(id) {
      await tx("readwrite", (s) => s.delete(id));
      ["audio", "cover", "video"].forEach((k) => {
        const u = objectUrls.get(id + ":" + k);
        if (u) URL.revokeObjectURL(u);
        objectUrls.delete(id + ":" + k);
      });
    },

    // 读取单条草稿原始记录（含 blob），编辑时用
    async getOne(id) {
      const all = await this.getCustom();
      return all.find((r) => r.id === id) || null;
    },

    // 修改一条本地草稿；不传新文件则保留原封面/音频/视频
    async update(id, { category, title, en, year, role, desc, credits, lyrics, audioFile, coverFile, videoUrl, videoFile }) {
      const rec = await this.getOne(id);
      if (!rec) throw new Error("草稿不存在（可能已删除）");
      rec.category = category || rec.category || "album";
      rec.title = title;
      rec.en = en || "";
      rec.year = year || "";
      rec.role = role || "";
      rec.desc = desc || "";
      rec.credits = credits || "";
      rec.lyrics = lyrics || "";
      if (audioFile) rec.audioBlob = audioFile;
      if (coverFile) rec.coverBlob = coverFile;
      // 视频：传了新文件→用文件并清掉链接；否则传了链接→用链接并清掉文件；都没传→保持原样
      if (videoFile) { rec.videoBlob = videoFile; rec.videoUrl = ""; }
      else if (videoUrl) { rec.videoUrl = videoUrl; rec.videoBlob = null; }
      await tx("readwrite", (s) => s.put(rec));
      // 失效旧的预览 URL，让新 blob 重新生成
      ["audio", "cover", "video"].forEach((k) => {
        const u = objectUrls.get(id + ":" + k);
        if (u) URL.revokeObjectURL(u);
        objectUrls.delete(id + ":" + k);
      });
      return rec;
    },

    // 下架默认作品（草稿）
    hideBuiltin(id) {
      removeFrom(UNHIDE_KEY, id);   // 取消可能存在的「恢复」草稿
      addTo(HIDDEN_KEY, id);
    },
    // 恢复上架（草稿）：本地下架的直接去掉；已发布下架的记入待恢复
    unhideBuiltin(id) {
      const localHidden = getList(HIDDEN_KEY);
      if (localHidden.includes(id)) { removeFrom(HIDDEN_KEY, id); return; }
      if (publishedHidden().includes(id)) { addTo(UNHIDE_KEY, id); }
    },

    // 删除已发布作品（草稿）/ 撤销删除。删除与「修改」互斥：删除时撤掉未发布的修改草稿
    async deletePublished(id) { addTo(DELETE_KEY, id); await this.cancelPublishedEdit(id); },
    undoDeletePublished(id) { removeFrom(DELETE_KEY, id); },

    // 开始编辑一条已发布作品：建（或复用）一条带 editOf 的修改草稿，返回其 id
    async startEditPublished(pub) {
      const existing = (await this.getPublishedEdits()).find((r) => r.editOf === pub.id);
      if (existing) return existing.id;
      const rec = {
        id: "edit-" + pub.id + "-" + Date.now(),
        editOf: pub.id,
        category: pub.category || "album",
        title: pub.title || "", en: pub.en || "", year: pub.year || "",
        role: pub.role || "", desc: pub.desc || "",
        credits: pub.credits || "", lyrics: pub.lyrics || "",
        origCover: pub.cover || "", origSrc: pub.src || "", origVideo: pub.video || "",
        audioBlob: null, coverBlob: null, videoBlob: null,
        // 站外链接预填回输入框；上传文件类视频无法回填，靠 origVideo 保留
        videoUrl: /^https?:\/\//i.test(pub.video || "") ? pub.video : "",
        createdAt: Date.now()
      };
      await tx("readwrite", (s) => s.put(rec));
      removeFrom(DELETE_KEY, pub.id);   // 编辑与删除互斥
      return rec.id;
    },
    // 撤销对某条已发布作品的修改（删掉对应修改草稿）
    async cancelPublishedEdit(pubId) {
      const ed = (await this.getPublishedEdits()).find((r) => r.editOf === pubId);
      if (ed) await this.remove(ed.id);
    },

    // ---- 展示顺序：给管理面板拖动 / 发布用 ----
    getEffectiveOrder() { return effectiveOrder(); },
    getDraftOrder() { return getDraftOrder(); },
    getPublishedOrder() { return publishedOrder(); },
    // 保存一份新的草稿顺序（完整 id 序列）。与线上一致时自动撤掉草稿。
    setDraftOrder(ids) {
      const arr = Array.isArray(ids) ? ids.slice() : [];
      if (JSON.stringify(arr) === JSON.stringify(publishedOrder())) {
        localStorage.removeItem(ORDER_KEY);
      } else {
        setList(ORDER_KEY, arr);
      }
    },
    clearDraftOrder() { localStorage.removeItem(ORDER_KEY); },
    orderChanged() { return orderChanged(); },

    // ---- 发布相关：给 publish.js 用 ----
    getLocalHidden()  { return getList(HIDDEN_KEY); },
    getPendingUnhide() { return getList(UNHIDE_KEY); },
    getPendingDelete() { return getList(DELETE_KEY); },

    // 是否有未发布的本地改动
    async hasLocalChanges() {
      const drafts = await this.getCustom();
      return drafts.length > 0 ||
        getList(HIDDEN_KEY).length > 0 ||
        getList(UNHIDE_KEY).length > 0 ||
        getList(DELETE_KEY).length > 0 ||
        orderChanged();
    },

    // 发布成功后清空所有本地草稿
    async clearLocalAfterPublish() {
      const drafts = await this.getCustom();
      for (const d of drafts) await this.remove(d.id);
      setList(HIDDEN_KEY, []);
      setList(UNHIDE_KEY, []);
      setList(DELETE_KEY, []);
      localStorage.removeItem(ORDER_KEY);
    }
  };

  // ============================================================
  // 光影图廊 galleryLib —— 与 musicLib 同构，专管「光影」里的照片
  //   1) 默认占位  window.SITE_GALLERY            (js/data.js,手写;可「下架」)
  //   2) 已发布    window.SITE_GALLERY_PUBLISHED  (js/published.js,面板维护;图片在仓库里)
  //   3) 本地草稿  IndexedDB(gallery 存储区)       (面板暂存、尚未发布,只本机可见)
  // ============================================================
  function galHidden() {
    return Array.isArray(window.SITE_GALLERY_HIDDEN) ? window.SITE_GALLERY_HIDDEN : [];
  }
  const galUrls = new Map();

  // ---- 光影展示顺序（与作品 SITE_ORDER 同构）----
  // 线上已发布顺序 = window.SITE_GALLERY_ORDER（published.js 维护）
  // 本地草稿顺序   = localStorage[GAL_ORDER_KEY]（拖动后暂存，发布前只本机生效）
  const GAL_ORDER_KEY = "bx-gal-order-draft";
  function galPublishedOrder() { return Array.isArray(window.SITE_GALLERY_ORDER) ? window.SITE_GALLERY_ORDER : []; }
  function getGalDraftOrder() {
    const raw = localStorage.getItem(GAL_ORDER_KEY);
    if (!raw) return null;
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : null; }
    catch (e) { return null; }
  }
  function effectiveGalOrder() { return getGalDraftOrder() || galPublishedOrder(); }
  function galOrderChanged() {
    const d = getGalDraftOrder();
    if (!d) return false;
    return JSON.stringify(d) !== JSON.stringify(galPublishedOrder());
  }
  // 按生效顺序稳定重排：在顺序表里的按表内位置排；不在表里的（新照片）保持原相对位置、排到最后
  function applyGalOrder(list) {
    const order = effectiveGalOrder();
    if (!order || !order.length) return list;
    const pos = new Map(order.map((id, i) => [id, i]));
    const BIG = order.length;
    return list
      .map((g, i) => ({ g, i }))
      .sort((a, b) => {
        const pa = pos.has(a.g.id) ? pos.get(a.g.id) : BIG + a.i;
        const pb = pos.has(b.g.id) ? pos.get(b.g.id) : BIG + b.i;
        return pa - pb;
      })
      .map((x) => x.g);
  }

  window.galleryLib = {
    // 所有本地草稿照片（IndexedDB）
    async getCustom() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction(GAL_STORE, "readonly");
        const req = t.objectStore(GAL_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    // 合并后的完整照片库（含来源 / 草稿状态），给管理面板用
    async getAllWithHidden() {
      const localHidden = new Set(getList(GAL_HIDDEN_KEY));
      const pubHidden = new Set(galHidden());
      const pendUnhide = new Set(getList(GAL_UNHIDE_KEY));
      const pendDelete = new Set(getList(GAL_DELETE_KEY));

      const builtins = (window.SITE_GALLERY || []).map((g) => {
        const hiddenNow = (pubHidden.has(g.id) || localHidden.has(g.id)) && !pendUnhide.has(g.id);
        return {
          ...g, source: "builtin",
          hidden: hiddenNow,
          pendingHide: localHidden.has(g.id) && !pubHidden.has(g.id),
          pendingUnhide: pendUnhide.has(g.id)
        };
      });

      const published = (window.SITE_GALLERY_PUBLISHED || []).map((g) => ({
        ...g, source: "published", hidden: false,
        pendingDelete: pendDelete.has(g.id)
      }));

      const drafts = (await this.getCustom())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((g) => this.toDisplay(g));

      return applyGalOrder(builtins.concat(published, drafts));
    },

    // 当前展示中的照片（光影区用）：默认(未下架) + 已发布(未待删) + 本地草稿
    async getVisible() {
      const all = await this.getAllWithHidden();
      return all.filter((g) => !g.hidden && !g.pendingDelete);
    },

    // IndexedDB 草稿记录 -> 可显示对象（blob 转 URL）
    toDisplay(rec) {
      if (!galUrls.has(rec.id)) {
        galUrls.set(rec.id, rec.imgBlob ? URL.createObjectURL(rec.imgBlob) : null);
      }
      return {
        id: rec.id,
        source: "draft",
        caption: rec.caption || "",
        src: galUrls.get(rec.id) || ""
      };
    },

    // 新增一条照片草稿（尚未发布）
    async add({ caption, imgFile }) {
      const rec = {
        id: "gcustom-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
        caption: caption || "",
        imgBlob: imgFile || null,
        createdAt: Date.now()
      };
      await txOn(GAL_STORE, "readwrite", (s) => s.put(rec));
      return rec;
    },

    async remove(id) {
      await txOn(GAL_STORE, "readwrite", (s) => s.delete(id));
      const u = galUrls.get(id);
      if (u) URL.revokeObjectURL(u);
      galUrls.delete(id);
    },

    async getOne(id) {
      const all = await this.getCustom();
      return all.find((r) => r.id === id) || null;
    },

    // 修改一条照片草稿；不传新图则保留原图
    async update(id, { caption, imgFile }) {
      const rec = await this.getOne(id);
      if (!rec) throw new Error("草稿不存在（可能已删除）");
      rec.caption = caption || "";
      if (imgFile) rec.imgBlob = imgFile;
      await txOn(GAL_STORE, "readwrite", (s) => s.put(rec));
      const u = galUrls.get(id);
      if (u) URL.revokeObjectURL(u);
      galUrls.delete(id);
      return rec;
    },

    hideBuiltin(id) { removeFrom(GAL_UNHIDE_KEY, id); addTo(GAL_HIDDEN_KEY, id); },
    unhideBuiltin(id) {
      const localHidden = getList(GAL_HIDDEN_KEY);
      if (localHidden.includes(id)) { removeFrom(GAL_HIDDEN_KEY, id); return; }
      if (galHidden().includes(id)) { addTo(GAL_UNHIDE_KEY, id); }
    },
    deletePublished(id) { addTo(GAL_DELETE_KEY, id); },
    undoDeletePublished(id) { removeFrom(GAL_DELETE_KEY, id); },

    getLocalHidden()  { return getList(GAL_HIDDEN_KEY); },
    getPendingUnhide() { return getList(GAL_UNHIDE_KEY); },
    getPendingDelete() { return getList(GAL_DELETE_KEY); },

    // ---- 展示顺序：给管理面板拖动 / 发布用（与 musicLib 同构）----
    getEffectiveOrder() { return effectiveGalOrder(); },
    getDraftOrder() { return getGalDraftOrder(); },
    getPublishedOrder() { return galPublishedOrder(); },
    // 保存一份新的草稿顺序（完整 id 序列）。与线上一致时自动撤掉草稿。
    setDraftOrder(ids) {
      const arr = Array.isArray(ids) ? ids.slice() : [];
      if (JSON.stringify(arr) === JSON.stringify(galPublishedOrder())) {
        localStorage.removeItem(GAL_ORDER_KEY);
      } else {
        setList(GAL_ORDER_KEY, arr);
      }
    },
    clearDraftOrder() { localStorage.removeItem(GAL_ORDER_KEY); },
    orderChanged() { return galOrderChanged(); },

    async hasLocalChanges() {
      const drafts = await this.getCustom();
      return drafts.length > 0 ||
        getList(GAL_HIDDEN_KEY).length > 0 ||
        getList(GAL_UNHIDE_KEY).length > 0 ||
        getList(GAL_DELETE_KEY).length > 0 ||
        galOrderChanged();
    },

    // 未发布的本地照片改动数量（给发布栏计数用）
    async pendingCount() {
      const drafts = await this.getCustom();
      return drafts.length +
        getList(GAL_HIDDEN_KEY).length +
        getList(GAL_UNHIDE_KEY).length +
        getList(GAL_DELETE_KEY).length +
        (galOrderChanged() ? 1 : 0);
    },

    async clearLocalAfterPublish() {
      const drafts = await this.getCustom();
      for (const d of drafts) await this.remove(d.id);
      setList(GAL_HIDDEN_KEY, []);
      setList(GAL_UNHIDE_KEY, []);
      setList(GAL_DELETE_KEY, []);
      localStorage.removeItem(GAL_ORDER_KEY);
    }
  };

  // ============================================================
  // 随笔 journalLib —— 与 galleryLib 同构，但纯文本（无图片/blob）
  //   1) 默认占位  window.SITE_JOURNAL            (js/data.js,手写;可「下架」)
  //   2) 已发布    window.SITE_JOURNAL_PUBLISHED  (js/published.js,面板维护)
  //   3) 本地草稿  IndexedDB(journal 存储区)       (面板暂存、尚未发布,只本机可见)
  // ============================================================
  function jourHidden() {
    return Array.isArray(window.SITE_JOURNAL_HIDDEN) ? window.SITE_JOURNAL_HIDDEN : [];
  }

  window.journalLib = {
    async getCustom() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction(JOUR_STORE, "readonly");
        const req = t.objectStore(JOUR_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    // 合并后的完整随笔列表（含来源 / 草稿状态），给管理面板用
    async getAllWithHidden() {
      const localHidden = new Set(getList(JOUR_HIDDEN_KEY));
      const pubHidden = new Set(jourHidden());
      const pendUnhide = new Set(getList(JOUR_UNHIDE_KEY));
      const pendDelete = new Set(getList(JOUR_DELETE_KEY));

      const builtins = (window.SITE_JOURNAL || []).map((j) => {
        const hiddenNow = (pubHidden.has(j.id) || localHidden.has(j.id)) && !pendUnhide.has(j.id);
        return {
          ...j, source: "builtin",
          hidden: hiddenNow,
          pendingHide: localHidden.has(j.id) && !pubHidden.has(j.id),
          pendingUnhide: pendUnhide.has(j.id)
        };
      });

      const allDrafts = (await this.getCustom())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const editOfSet = new Set(allDrafts.filter((d) => d.editOf).map((d) => d.editOf));

      const published = (window.SITE_JOURNAL_PUBLISHED || []).map((j) => ({
        ...j, source: "published", hidden: false,
        pendingDelete: pendDelete.has(j.id),
        pendingEdit: editOfSet.has(j.id)
      }));

      // 「修改草稿」(editOf) 不作为独立草稿行展示,发布时就地覆盖对应已发布随笔
      const drafts = allDrafts.filter((d) => !d.editOf).map((j) => ({ ...j, source: "draft" }));

      return builtins.concat(published, drafts);
    },

    // 当前展示中的随笔（随笔页用）：默认(未下架) + 已发布(未待删) + 本地草稿
    async getVisible() {
      const all = await this.getAllWithHidden();
      return all.filter((j) => !j.hidden && !j.pendingDelete);
    },

    async add({ date, title, body }) {
      const rec = {
        id: "jcustom-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
        date: date || "", title: title || "", body: body || "",
        createdAt: Date.now()
      };
      await txOn(JOUR_STORE, "readwrite", (s) => s.put(rec));
      return rec;
    },

    async remove(id) { await txOn(JOUR_STORE, "readwrite", (s) => s.delete(id)); },

    async getOne(id) {
      const all = await this.getCustom();
      return all.find((r) => r.id === id) || null;
    },

    async update(id, { date, title, body }) {
      const rec = await this.getOne(id);
      if (!rec) throw new Error("草稿不存在（可能已删除）");
      rec.date = date || ""; rec.title = title || ""; rec.body = body || "";
      await txOn(JOUR_STORE, "readwrite", (s) => s.put(rec));
      return rec;
    },

    // ---- 已发布随笔的「再次编辑」：建/复用带 editOf 的修改草稿(发布时按原 id 覆盖)----
    async getNewDrafts()      { return (await this.getCustom()).filter((r) => !r.editOf); },
    async getPublishedEdits() { return (await this.getCustom()).filter((r) => !!r.editOf); },
    async startEditPublished(pub) {
      const existing = (await this.getPublishedEdits()).find((r) => r.editOf === pub.id);
      if (existing) return existing.id;
      const rec = {
        id: "jedit-" + pub.id + "-" + Date.now(),
        editOf: pub.id,
        date: pub.date || "", title: pub.title || "", body: pub.body || "",
        createdAt: Date.now()
      };
      await txOn(JOUR_STORE, "readwrite", (s) => s.put(rec));
      removeFrom(JOUR_DELETE_KEY, pub.id);   // 编辑与删除互斥
      return rec.id;
    },
    async cancelPublishedEdit(pubId) {
      const ed = (await this.getPublishedEdits()).find((r) => r.editOf === pubId);
      if (ed) await this.remove(ed.id);
    },

    hideBuiltin(id) { removeFrom(JOUR_UNHIDE_KEY, id); addTo(JOUR_HIDDEN_KEY, id); },
    unhideBuiltin(id) {
      const localHidden = getList(JOUR_HIDDEN_KEY);
      if (localHidden.includes(id)) { removeFrom(JOUR_HIDDEN_KEY, id); return; }
      if (jourHidden().includes(id)) { addTo(JOUR_UNHIDE_KEY, id); }
    },
    deletePublished(id) { addTo(JOUR_DELETE_KEY, id); },
    undoDeletePublished(id) { removeFrom(JOUR_DELETE_KEY, id); },

    getLocalHidden()  { return getList(JOUR_HIDDEN_KEY); },
    getPendingUnhide() { return getList(JOUR_UNHIDE_KEY); },
    getPendingDelete() { return getList(JOUR_DELETE_KEY); },

    async pendingCount() {
      const drafts = await this.getCustom();
      return drafts.length +
        getList(JOUR_HIDDEN_KEY).length +
        getList(JOUR_UNHIDE_KEY).length +
        getList(JOUR_DELETE_KEY).length;
    },

    async clearLocalAfterPublish() {
      const drafts = await this.getCustom();
      for (const d of drafts) await this.remove(d.id);
      setList(JOUR_HIDDEN_KEY, []);
      setList(JOUR_UNHIDE_KEY, []);
      setList(JOUR_DELETE_KEY, []);
    }
  };
})();
