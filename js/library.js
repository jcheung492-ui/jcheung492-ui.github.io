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
  const HIDDEN_KEY = "bx-hidden-builtins";   // 草稿:待下架的默认作品 id
  const UNHIDE_KEY = "bx-pending-unhide";    // 草稿:待恢复上架的(已发布下架的)默认作品 id
  const DELETE_KEY = "bx-pending-delete";    // 草稿:待删除的已发布作品 id

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const out = fn(store);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

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

      return builtins.concat(published, drafts);
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
        builtin: false
      };
    },

    // 已发布作品 + 它的「修改草稿」-> 预览字段
    //   新封面/音频用本地 blob 预览；没重新选就沿用线上原文件路径。
    editPreview(t, ed) {
      if (!objectUrls.has(ed.id + ":cover")) {
        objectUrls.set(ed.id + ":audio", ed.audioBlob ? URL.createObjectURL(ed.audioBlob) : null);
        objectUrls.set(ed.id + ":cover", ed.coverBlob ? URL.createObjectURL(ed.coverBlob) : null);
      }
      return {
        category: ed.category || t.category || "album",
        title: ed.title || "",
        en: ed.en || "", year: ed.year || "", role: ed.role || "", desc: ed.desc || "",
        cover: objectUrls.get(ed.id + ":cover") || t.cover || "covers/morning-mist.png",
        src: objectUrls.get(ed.id + ":audio") || t.src || null
      };
    },

    // 新增一条本地草稿（尚未发布）
    async add({ category, title, en, year, role, desc, audioFile, coverFile }) {
      const rec = {
        id: "custom-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
        category: category || "album",
        title: title, en: en || "", year: year || "", role: role || "", desc: desc || "",
        audioBlob: audioFile || null,
        coverBlob: coverFile || null,
        createdAt: Date.now()
      };
      await tx("readwrite", (s) => s.put(rec));
      return rec;
    },

    // 删除一条本地草稿（立即生效，仅本机）
    async remove(id) {
      await tx("readwrite", (s) => s.delete(id));
      const a = objectUrls.get(id + ":audio");
      const c = objectUrls.get(id + ":cover");
      if (a) URL.revokeObjectURL(a);
      if (c) URL.revokeObjectURL(c);
      objectUrls.delete(id + ":audio");
      objectUrls.delete(id + ":cover");
    },

    // 读取单条草稿原始记录（含 blob），编辑时用
    async getOne(id) {
      const all = await this.getCustom();
      return all.find((r) => r.id === id) || null;
    },

    // 修改一条本地草稿；不传新文件则保留原封面/音频
    async update(id, { category, title, en, year, role, desc, audioFile, coverFile }) {
      const rec = await this.getOne(id);
      if (!rec) throw new Error("草稿不存在（可能已删除）");
      rec.category = category || rec.category || "album";
      rec.title = title;
      rec.en = en || "";
      rec.year = year || "";
      rec.role = role || "";
      rec.desc = desc || "";
      if (audioFile) rec.audioBlob = audioFile;
      if (coverFile) rec.coverBlob = coverFile;
      await tx("readwrite", (s) => s.put(rec));
      // 失效旧的预览 URL，让新 blob 重新生成
      const a = objectUrls.get(id + ":audio");
      const c = objectUrls.get(id + ":cover");
      if (a) URL.revokeObjectURL(a);
      if (c) URL.revokeObjectURL(c);
      objectUrls.delete(id + ":audio");
      objectUrls.delete(id + ":cover");
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
        origCover: pub.cover || "", origSrc: pub.src || "",
        audioBlob: null, coverBlob: null,
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
        getList(DELETE_KEY).length > 0;
    },

    // 发布成功后清空所有本地草稿
    async clearLocalAfterPublish() {
      const drafts = await this.getCustom();
      for (const d of drafts) await this.remove(d.id);
      setList(HIDDEN_KEY, []);
      setList(UNHIDE_KEY, []);
      setList(DELETE_KEY, []);
    }
  };
})();
