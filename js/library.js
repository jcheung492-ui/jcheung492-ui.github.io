// ============================================================
// 音源库 musicLib —— 上传的 mp3 + 封面存在浏览器 IndexedDB 里
// 默认曲目的「下架」状态存在 localStorage
// ============================================================
(function () {
  const DB_NAME = "bx-music";
  const STORE = "tracks";
  const HIDDEN_KEY = "bx-hidden-builtins";

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

  function getHidden() {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function setHidden(arr) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(arr));
  }

  const objectUrls = new Map();

  window.musicLib = {
    // 所有自定义曲目(IndexedDB)
    async getCustom() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readonly");
        const req = t.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    // 合并后的完整曲库(含隐藏标记),给管理面板用
    async getAllWithHidden() {
      const hidden = new Set(getHidden());
      const custom = await this.getCustom();
      const builtins = (window.SITE_TRACKS || []).map((t) => ({
        ...t, hidden: hidden.has(t.id)
      }));
      const customViews = custom
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((t) => this.toPlayable(t));
      return builtins.concat(customViews);
    },

    // 上架中的曲目(播放器用)
    async getVisible() {
      const all = await this.getAllWithHidden();
      return all.filter((t) => !t.hidden);
    },

    // IndexedDB 记录 -> 可播放对象(blob 转 URL)
    toPlayable(rec) {
      if (!objectUrls.has(rec.id + ":cover")) {
        objectUrls.set(rec.id + ":audio", rec.audioBlob ? URL.createObjectURL(rec.audioBlob) : null);
        objectUrls.set(rec.id + ":cover", rec.coverBlob ? URL.createObjectURL(rec.coverBlob) : null);
      }
      return {
        id: rec.id,
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

    async add({ category, title, en, year, role, desc, audioFile, coverFile }) {
      const rec = {
        id: "custom-" + Date.now() + "-" + Math.floor(Math.random() * 1e4),
        category: category || "album",
        title: title,
        en: en || "",
        year: year || "",
        role: role || "",
        desc: desc || "",
        audioBlob: audioFile || null,
        coverBlob: coverFile || null,
        createdAt: Date.now()
      };
      await tx("readwrite", (s) => s.put(rec));
      return rec;
    },

    async remove(id) {
      await tx("readwrite", (s) => s.delete(id));
      const a = objectUrls.get(id + ":audio");
      const c = objectUrls.get(id + ":cover");
      if (a) URL.revokeObjectURL(a);
      if (c) URL.revokeObjectURL(c);
      objectUrls.delete(id + ":audio");
      objectUrls.delete(id + ":cover");
    },

    hideBuiltin(id) {
      const h = getHidden();
      if (!h.includes(id)) { h.push(id); setHidden(h); }
    },
    unhideBuiltin(id) {
      setHidden(getHidden().filter((x) => x !== id));
    }
  };
})();
