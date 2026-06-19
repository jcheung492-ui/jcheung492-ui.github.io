// ============================================================
// 发布客户端 publisher —— 把本地草稿一次性提交到 GitHub 仓库
//   · 用 Git Data API,把「封面 + 音频 + published.js」合成「一次提交」
//   · token 存在浏览器 localStorage(只授权这一个仓库的内容读写)
//   · 发布成功后同步内存状态,无需刷新即可看到效果
// ============================================================
(function () {
  const TOKEN_KEY = "bx-gh-token";
  const REPO_KEY = "bx-gh-repo";
  const DEFAULT_REPO = { owner: "jcheung492-ui", repo: "jcheung492-ui.github.io", branch: "master" };

  function getToken() { return (localStorage.getItem(TOKEN_KEY) || "").trim(); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, (t || "").trim()); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }
  function hasToken() { return !!getToken(); }

  function getRepo() {
    try { return Object.assign({}, DEFAULT_REPO, JSON.parse(localStorage.getItem(REPO_KEY) || "{}")); }
    catch (e) { return Object.assign({}, DEFAULT_REPO); }
  }
  function setRepo(cfg) { localStorage.setItem(REPO_KEY, JSON.stringify(cfg || {})); }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---- GitHub REST 单次请求（带超时）----
  async function ghOnce(path, method, body, timeoutMs) {
    const r = getRepo();
    const url = "https://api.github.com/repos/" + r.owner + "/" + r.repo + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
    let res;
    try {
      res = await fetch(url, {
        method: method || "GET",
        headers: {
          "Authorization": "Bearer " + getToken(),
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
    } catch (e) {
      // 网络中断 / 超时（abort）→ 可重试
      const err = new Error(e && e.name === "AbortError" ? "上传超时（网络太慢或文件过大）" : "网络连接中断");
      err.retryable = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) {}
      if (res.status === 401) msg = "Token 无效或已过期(401)。请重新填写 Token。";
      else if (res.status === 403) msg = "权限不足(403)。请确认 Token 勾了这个仓库的 Contents: Read and write。";
      else if (res.status === 404) msg = "找不到仓库(404)。请确认仓库名和 Token 的仓库授权。";
      const err = new Error(msg);
      // 5xx / 408 / 429 是服务端临时问题，可重试；4xx 权限类不重试
      err.retryable = (res.status >= 500 || res.status === 408 || res.status === 429);
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---- GitHub REST 封装（失败自动重试）----
  async function gh(path, method, body, opts) {
    opts = opts || {};
    const retries = opts.retries != null ? opts.retries : 2;
    const timeoutMs = opts.timeout || 60000;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await ghOnce(path, method, body, timeoutMs);
      } catch (e) {
        lastErr = e;
        if (!e.retryable || attempt === retries) throw e;
        if (opts.onRetry) opts.onRetry(attempt + 1, retries);
        await sleep(1500 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  // 测试 token 是否可用（读仓库基本信息）
  async function testToken() {
    const info = await gh("", "GET");
    return info && info.full_name;
  }

  // File/Blob -> base64（去掉 dataURL 前缀）
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  function extOf(file, fallback) {
    const m = (file && file.name || "").match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    const t = (file && file.type) || "";
    if (t.includes("png")) return "png";
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    if (t.includes("webp")) return "webp";
    if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
    if (t.includes("wav")) return "wav";
    if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
    return fallback || "bin";
  }

  // 生成 published.js 文件内容
  function buildPublishedJs(published, hidden, galPublished, galHidden, order) {
    return "// 此文件由「管理面板」自动生成,请勿手改。\n" +
      "// 作品:window.SITE_PUBLISHED / window.SITE_HIDDEN\n" +
      "// 光影:window.SITE_GALLERY_PUBLISHED / window.SITE_GALLERY_HIDDEN\n" +
      "// 顺序:window.SITE_ORDER（作品自定义展示顺序的 id 序列）\n" +
      "window.SITE_PUBLISHED = " + JSON.stringify(published, null, 2) + ";\n" +
      "window.SITE_HIDDEN = " + JSON.stringify(hidden, null, 2) + ";\n" +
      "window.SITE_GALLERY_PUBLISHED = " + JSON.stringify(galPublished || [], null, 2) + ";\n" +
      "window.SITE_GALLERY_HIDDEN = " + JSON.stringify(galHidden || [], null, 2) + ";\n" +
      "window.SITE_ORDER = " + JSON.stringify(order || [], null, 2) + ";\n";
  }

  function uniq(arr) { return Array.from(new Set(arr)); }

  // ---- 发布主流程 ----
  async function publish(onStep) {
    const step = onStep || function () {};
    if (!hasToken()) throw new Error("还没有设置 GitHub Token。请先在面板里填好并保存。");
    const r = getRepo();

    // 1. 收集本地草稿状态
    step("读取本地改动…");
    const newDrafts = await window.musicLib.getNewDrafts();
    const edits = await window.musicLib.getPublishedEdits();
    const localHidden = window.musicLib.getLocalHidden();
    const pendingUnhide = window.musicLib.getPendingUnhide();
    const pendingDelete = window.musicLib.getPendingDelete();

    const curPublished = Array.isArray(window.SITE_PUBLISHED) ? window.SITE_PUBLISHED : [];
    const curHidden = Array.isArray(window.SITE_HIDDEN) ? window.SITE_HIDDEN : [];

    const editMap = new Map(edits.map((e) => [e.editOf, e]));
    // 目标下架集合 = (现有 ∪ 本地下架) − 待恢复
    const finalHidden = uniq(curHidden.concat(localHidden)).filter((id) => !pendingUnhide.includes(id));

    // ---- 光影图廊：同样收集草稿 / 下架 / 删除 ----
    const gallery = window.galleryLib;
    const galDrafts = gallery ? await gallery.getCustom() : [];
    const galLocalHidden = gallery ? gallery.getLocalHidden() : [];
    const galPendingUnhide = gallery ? gallery.getPendingUnhide() : [];
    const galPendingDelete = gallery ? gallery.getPendingDelete() : [];
    const curGalPublished = Array.isArray(window.SITE_GALLERY_PUBLISHED) ? window.SITE_GALLERY_PUBLISHED : [];
    const curGalHidden = Array.isArray(window.SITE_GALLERY_HIDDEN) ? window.SITE_GALLERY_HIDDEN : [];
    const keptGalPublished = curGalPublished.filter((g) => !galPendingDelete.includes(g.id));
    const finalGalHidden = uniq(curGalHidden.concat(galLocalHidden)).filter((id) => !galPendingUnhide.includes(id));

    const treeFiles = [];   // {path, base64, size}
    const newEntries = [];
    const newGalEntries = [];

    // 把一个本地 blob 收进「待提交文件」,返回它在仓库里的路径
    async function blobToTree(blob, kind, base) {
      const folder = kind === "cover" ? "covers/" : kind === "video" ? "videos/" : "audio/";
      const def = kind === "cover" ? "png" : kind === "video" ? "mp4" : "mp3";
      const ext = extOf(blob, def);
      const path = folder + base + "." + ext;
      treeFiles.push({ path: path, base64: await fileToBase64(blob), size: blob.size || 0 });
      return path;
    }

    // 2a. 新增草稿：封面/音频转文件 + 生成新条目
    let i = 0;
    for (const d of newDrafts) {
      i++;
      step("处理草稿 " + i + "/" + newDrafts.length + "：" + (d.title || ""));
      const entry = {
        id: d.id, category: d.category || "album",
        title: d.title || "", en: d.en || "", year: d.year || "",
        role: d.role || "", desc: d.desc || ""
      };
      if (d.credits) entry.credits = d.credits;
      if (d.lyrics) entry.lyrics = d.lyrics;
      const base = d.id.replace(/^custom-/, "up-");
      if (d.coverBlob) entry.cover = await blobToTree(d.coverBlob, "cover", base);
      if (d.audioBlob) entry.src = await blobToTree(d.audioBlob, "audio", base);
      if (d.videoBlob) entry.video = await blobToTree(d.videoBlob, "video", base);
      else if (d.videoUrl) entry.video = d.videoUrl;
      newEntries.push(entry);
    }

    // 2b. 已发布作品：去掉待删除；有「修改草稿」的就地套用新内容（保持原 id）
    const keptPublished = [];
    let ei = 0;
    for (const t of curPublished) {
      if (pendingDelete.includes(t.id)) continue;
      const ed = editMap.get(t.id);
      if (!ed) { keptPublished.push(t); continue; }
      ei++;
      step("处理修改 " + ei + "：" + (ed.title || t.title || ""));
      const entry = {
        id: t.id, category: ed.category || t.category || "album",
        title: ed.title || "", en: ed.en || "", year: ed.year || "",
        role: ed.role || "", desc: ed.desc || "",
        cover: t.cover, src: t.src   // 默认保留线上原文件
      };
      const edCredits = ed.credits != null ? ed.credits : (t.credits || "");
      const edLyrics = ed.lyrics != null ? ed.lyrics : (t.lyrics || "");
      if (edCredits) entry.credits = edCredits;
      if (edLyrics) entry.lyrics = edLyrics;
      const base = ed.id.replace(/^edit-/, "up-edit-");
      if (ed.coverBlob) entry.cover = await blobToTree(ed.coverBlob, "cover", base);
      if (ed.audioBlob) entry.src = await blobToTree(ed.audioBlob, "audio", base);
      // 视频：传了新文件→上传；填了新链接→用链接；都没动→保留线上原视频
      let video = t.video || "";
      if (ed.videoBlob) video = await blobToTree(ed.videoBlob, "video", base);
      else if (ed.videoUrl) video = ed.videoUrl;
      if (video) entry.video = video;
      keptPublished.push(entry);
    }

    // 2c. 光影草稿的图片转成待提交文件
    let gi = 0;
    for (const g of galDrafts) {
      gi++;
      step("处理照片 " + gi + "/" + galDrafts.length + "…");
      const entry = { id: g.id, caption: g.caption || "" };
      if (g.imgBlob) {
        const ext = extOf(g.imgBlob, "jpg");
        const base = g.id.replace(/^gcustom-/, "gup-");
        const path = "gallery/" + base + "." + ext;
        treeFiles.push({ path: path, base64: await fileToBase64(g.imgBlob), size: g.imgBlob.size || 0 });
        entry.src = path;
      }
      newGalEntries.push(entry);
    }

    const finalPublished = keptPublished.concat(newEntries);
    const finalGalPublished = keptGalPublished.concat(newGalEntries);

    // 展示顺序：草稿顺序优先，否则沿用线上；只保留仍然存在的 id（默认作品 + 发布后留存的作品）
    const draftOrder = window.musicLib.getDraftOrder();
    const baseOrder = (draftOrder && draftOrder.length)
      ? draftOrder
      : (Array.isArray(window.SITE_ORDER) ? window.SITE_ORDER : []);
    const validIds = new Set(
      (window.SITE_TRACKS || []).map((t) => t.id).concat(finalPublished.map((t) => t.id))
    );
    const finalOrder = uniq(baseOrder.filter((id) => validIds.has(id)));

    const publishedJs = buildPublishedJs(finalPublished, finalHidden, finalGalPublished, finalGalHidden, finalOrder);

    // 3. Git Data API:base ref -> blobs -> tree -> commit -> 移动 ref
    step("读取仓库当前状态…");
    const ref = await gh("/git/ref/heads/" + r.branch, "GET");
    const baseSha = ref.object.sha;
    const baseCommit = await gh("/git/commits/" + baseSha, "GET");
    const baseTree = baseCommit.tree.sha;

    const tree = [];
    let n = 0;
    for (const f of treeFiles) {
      n++;
      const mb = (f.size / 1048576);
      const sizeLabel = mb >= 0.1 ? "，" + mb.toFixed(1) + "MB" : "";
      const label = "上传文件 " + n + "/" + treeFiles.length + sizeLabel;
      step(label + "…");
      // 大文件上传慢，给足超时；失败自动重试，并在界面提示「重试中」
      const timeout = Math.max(60000, Math.ceil(mb) * 20000);  // 每 MB 给 20s，至少 60s
      const blob = await gh("/git/blobs", "POST", { content: f.base64, encoding: "base64" }, {
        retries: 3, timeout: timeout,
        onRetry: (a, t) => step(label + " · 网络不稳，正在重试 " + a + "/" + t + "…")
      });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    // published.js 用内联文本,GitHub 自动建 blob
    tree.push({ path: "js/published.js", mode: "100644", type: "blob", content: publishedJs });

    step("生成提交…");
    const newTree = await gh("/git/trees", "POST", { base_tree: baseTree, tree: tree });
    const reordered = JSON.stringify(finalOrder) !== JSON.stringify(Array.isArray(window.SITE_ORDER) ? window.SITE_ORDER : []);
    const msg = "内容更新:" +
      (newEntries.length ? ("+" + newEntries.length + " 作品 ") : "") +
      (ei ? ("~" + ei + " 修改 ") : "") +
      (pendingDelete.length ? ("-" + pendingDelete.length + " 作品 ") : "") +
      (newGalEntries.length ? ("+" + newGalEntries.length + " 照片 ") : "") +
      (galPendingDelete.length ? ("-" + galPendingDelete.length + " 照片 ") : "") +
      (reordered ? "↕ 调整展示顺序 " : "") +
      "（管理面板发布）";
    const commit = await gh("/git/commits", "POST", {
      message: msg.trim(), tree: newTree.sha, parents: [baseSha]
    });
    step("发布中…");
    await gh("/git/refs/heads/" + r.branch, "PATCH", { sha: commit.sha, force: false });

    // 4. 同步内存 + 清空本地草稿
    window.SITE_PUBLISHED = finalPublished;
    window.SITE_HIDDEN = finalHidden;
    window.SITE_GALLERY_PUBLISHED = finalGalPublished;
    window.SITE_GALLERY_HIDDEN = finalGalHidden;
    window.SITE_ORDER = finalOrder;
    await window.musicLib.clearLocalAfterPublish();
    if (gallery) await gallery.clearLocalAfterPublish();

    return {
      commit: commit.sha,
      added: newEntries.length, edited: ei, removed: pendingDelete.length,
      galAdded: newGalEntries.length, galRemoved: galPendingDelete.length,
      reordered: reordered
    };
  }

  window.publisher = {
    hasToken, getToken, setToken, clearToken,
    getRepo, setRepo, testToken, publish
  };
})();
