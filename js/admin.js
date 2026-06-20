// ============================================================
// 管理模式 —— 页脚「管理」开关
//   · 加作品 / 下架 / 删除 都先存成「本地草稿」(只有你自己看得到)
//   · 点「发布到线上」通过 GitHub 一次性提交,约 1 分钟后所有人可见
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const CAT_LABEL = { album: "专辑", ad: "广告配乐", game: "游戏配乐", sketch: "随手录", film: "电影" };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  // 每行的状态标签 + 操作按钮
  function rowMeta(t) {
    const cat = CAT_LABEL[t.category] || "";
    if (t.source === "draft") {
      return {
        chip: "草稿 · 未发布 · " + cat,
        cls: "is-draft",
        btns: '<button data-act="edit-draft" data-id="' + t.id + '">编辑</button>' +
              '<button data-act="del-draft" data-id="' + t.id + '">删除</button>'
      };
    }
    if (t.source === "published") {
      if (t.pendingDelete) {
        return {
          chip: "待删除 · " + cat, cls: "is-pending",
          btns: '<button data-act="undo-del" data-id="' + t.id + '">撤销删除</button>'
        };
      }
      if (t.pendingEdit) {
        return {
          chip: "已发布 · 待更新 · " + cat, cls: "is-pending",
          btns: '<button data-act="edit-pub" data-id="' + t.id + '">继续编辑</button>' +
                '<button data-act="cancel-edit-pub" data-id="' + t.id + '">撤销修改</button>'
        };
      }
      return {
        chip: "已发布 · " + cat, cls: "",
        btns: '<button data-act="edit-pub" data-id="' + t.id + '">编辑</button>' +
              '<button data-act="del-pub" data-id="' + t.id + '">删除</button>'
      };
    }
    // builtin
    if (t.pendingUnhide) {
      return {
        chip: "默认 · 待恢复上架 · " + cat, cls: "is-pending",
        btns: '<button data-act="hide" data-id="' + t.id + '">撤销恢复</button>'
      };
    }
    if (t.pendingHide) {
      return {
        chip: "默认 · 待下架 · " + cat, cls: "is-pending",
        btns: '<button data-act="unhide" data-id="' + t.id + '">撤销下架</button>'
      };
    }
    if (t.hidden) {
      return {
        chip: "默认 · 已下架 · " + cat, cls: "is-hidden",
        btns: '<button data-act="unhide" data-id="' + t.id + '">恢复上架</button>'
      };
    }
    return {
      chip: "默认 · " + cat, cls: "",
      btns: '<button data-act="hide" data-id="' + t.id + '">删除</button>'
    };
  }

  // ---- 拖动排序：只能在同一分类（分区）内拖动；松手后存成「顺序草稿」，发布后对所有人生效 ----
  let dragEl = null;
  let dragGroup = null;   // 拖动起点所在的分区容器（限制跨分类）

  // 在指定分区容器内，找到光标当前应插入位置：返回应排在其「之前」的那个行（null = 末尾）
  function rowAfterPointer(group, y) {
    const rows = [...group.querySelectorAll(".admin-row:not(.is-dragging)")];
    let closest = { dist: -Infinity, el: null };
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      const offset = y - r.top - r.height / 2;   // <0 表示光标在该行上半部
      if (offset < 0 && offset > closest.dist) closest = { dist: offset, el: row };
    }
    return closest.el;
  }

  async function commitRowOrder(box) {
    // 按各分区在 DOM 中的先后，拼成完整 id 序列（分类内顺序即拖动后的顺序）
    const ids = [...box.querySelectorAll(".admin-row")].map((el) => el.dataset.id);
    window.musicLib.setDraftOrder(ids);
    // 重排会影响公开预览与发布计数；列表本身保持当前 DOM 顺序，避免拖完跳动
    await updatePublishUI();
    if (window.playerApp) await window.playerApp.refresh();
  }

  function wireRowDrag(box) {
    if (box.dataset.dragWired) return;   // 委托在 box 上，绑一次即可（行/分区可反复重建）
    box.dataset.dragWired = "1";
    box.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".admin-row");
      if (!row) return;
      dragEl = row;
      dragGroup = row.closest(".admin-rows");
      row.classList.add("is-dragging");
      if (dragGroup) dragGroup.classList.add("is-droptarget");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", row.dataset.id); } catch (err) {}
    });
    box.addEventListener("dragover", (e) => {
      if (!dragEl || !dragGroup) return;
      const overGroup = e.target.closest(".admin-rows");
      // 只允许在起点分区内移动：光标不在本分区就不接受放置（指针显示禁止）
      if (overGroup !== dragGroup) { e.dataTransfer.dropEffect = "none"; return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const after = rowAfterPointer(dragGroup, e.clientY);
      if (after == null) dragGroup.appendChild(dragEl);
      else if (after !== dragEl) dragGroup.insertBefore(dragEl, after);
    });
    box.addEventListener("drop", (e) => { if (dragEl) e.preventDefault(); });
    box.addEventListener("dragend", async () => {
      if (!dragEl) return;
      dragEl.classList.remove("is-dragging");
      if (dragGroup) dragGroup.classList.remove("is-droptarget");
      dragEl = null; dragGroup = null;
      await commitRowOrder(box);
    });
  }

  // 单行 HTML
  function adminRowHTML(t) {
    const m = rowMeta(t);
    return (
      '<div class="admin-row ' + m.cls + '" draggable="true" data-id="' + esc(t.id) + '" data-cat="' + esc(t.category || "") + '">' +
        '<span class="ar-handle" title="拖动调整展示顺序（仅本分类内）" aria-label="拖动排序">⠿</span>' +
        '<img src="' + (t.cover || "covers/morning-mist.png") + '" alt="">' +
        '<span class="ar-title">' + esc(t.title) + "</span>" +
        '<span class="ar-kind">' + esc(m.chip) + "</span>" +
        m.btns +
      "</div>"
    );
  }

  // 管理列表里分区的先后顺序
  const ADMIN_CAT_ORDER = ["album", "ad", "game", "film", "sketch"];

  async function renderAdminList() {
    const box = $("#admin-tracklist");
    if (!box) return;
    // 已下架的默认作品不再灰显占位 —— 直接从列表移除(用户偏好「下架即删除」)
    const all = (await window.musicLib.getAllWithHidden())
      .filter((t) => !(t.source === "builtin" && t.hidden));

    // 按分类分组（保持各分类内部的现有顺序）；未知分类排到最后
    const cats = ADMIN_CAT_ORDER.slice();
    all.forEach((t) => { if (t.category && !cats.includes(t.category)) cats.push(t.category); });

    box.innerHTML = cats.map((cat) => {
      const items = all.filter((t) => (t.category || "") === cat);
      if (!items.length) return "";
      return (
        '<div class="admin-catgroup" data-cat="' + esc(cat) + '">' +
          '<p class="admin-cathead">' + esc(CAT_LABEL[cat] || cat) +
            '<span class="ach-count">' + items.length + "</span></p>" +
          '<div class="admin-rows" data-cat="' + esc(cat) + '">' +
            items.map(adminRowHTML).join("") +
          "</div>" +
        "</div>"
      );
    }).join("");

    wireRowDrag(box);

    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === "edit-draft") { await startEdit(id); return; }
        if (act === "edit-pub") { await startEditPublished(id); return; }
        if (act === "cancel-edit-pub") {
          if (!confirm("撤销对这条已发布作品的修改吗?(只丢弃未发布的改动,线上不变)")) return;
          await window.musicLib.cancelPublishedEdit(id);
          if (editingId) exitEdit();
          await refreshAll();
          return;
        }
        if (act === "hide") {
          if (!confirm("删除这条默认作品吗?(从你的作品列表移除)")) return;
          window.musicLib.hideBuiltin(id);
        }
        if (act === "unhide") window.musicLib.unhideBuiltin(id);
        if (act === "del-pub") {
          if (!confirm("把这条已发布作品标记为删除?(发布后才真正移除)")) return;
          await window.musicLib.deletePublished(id);
        }
        if (act === "undo-del") window.musicLib.undoDeletePublished(id);
        if (act === "del-draft") {
          if (!confirm("删除这条本地草稿吗?")) return;
          await window.musicLib.remove(id);
        }
        await refreshAll();
      });
    });
  }

  // ---- 光影图廊：行状态标签 + 操作按钮 ----
  function galRowMeta(g) {
    if (g.source === "draft") {
      return {
        chip: "草稿 · 未发布", cls: "is-draft",
        btns: '<button data-gact="edit-draft" data-id="' + g.id + '">编辑</button>' +
              '<button data-gact="del-draft" data-id="' + g.id + '">删除</button>'
      };
    }
    if (g.source === "published") {
      if (g.pendingDelete) {
        return { chip: "待删除", cls: "is-pending",
          btns: '<button data-gact="undo-del" data-id="' + g.id + '">撤销删除</button>' };
      }
      return { chip: "已发布", cls: "",
        btns: '<button data-gact="del-pub" data-id="' + g.id + '">删除</button>' };
    }
    // builtin（data.js 里的默认 6 张）
    if (g.pendingUnhide) {
      return { chip: "默认 · 待恢复上架", cls: "is-pending",
        btns: '<button data-gact="hide" data-id="' + g.id + '">撤销恢复</button>' };
    }
    if (g.pendingHide) {
      return { chip: "默认 · 待下架", cls: "is-pending",
        btns: '<button data-gact="unhide" data-id="' + g.id + '">撤销下架</button>' };
    }
    if (g.hidden) {
      return { chip: "默认 · 已下架", cls: "is-hidden",
        btns: '<button data-gact="unhide" data-id="' + g.id + '">恢复上架</button>' };
    }
    return { chip: "默认", cls: "",
      btns: '<button data-gact="hide" data-id="' + g.id + '">删除</button>' };
  }

  async function renderGalleryList() {
    const box = $("#admin-gallerylist");
    if (!box || !window.galleryLib) return;
    const all = (await window.galleryLib.getAllWithHidden())
      .filter((g) => !(g.source === "builtin" && g.hidden));
    box.innerHTML = all.map((g) => {
      const m = galRowMeta(g);
      return (
        '<div class="admin-row ' + m.cls + '">' +
          '<img src="' + (g.src || "") + '" alt="">' +
          '<span class="ar-title">' + esc(g.caption || "(无文字)") + "</span>" +
          '<span class="ar-kind">' + esc(m.chip) + "</span>" +
          m.btns +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id, act = b.dataset.gact;
        if (act === "edit-draft") { await startGalEdit(id); return; }
        if (act === "hide") {
          if (!confirm("删除这张默认照片吗?(从图廊移除)")) return;
          window.galleryLib.hideBuiltin(id);
        }
        if (act === "unhide") window.galleryLib.unhideBuiltin(id);
        if (act === "del-pub") {
          if (!confirm("把这张已发布的照片标记为删除?(发布后才真正移除)")) return;
          window.galleryLib.deletePublished(id);
        }
        if (act === "undo-del") window.galleryLib.undoDeletePublished(id);
        if (act === "del-draft") {
          if (!confirm("删除这条本地照片草稿吗?")) return;
          await window.galleryLib.remove(id);
        }
        await refreshAll();
      });
    });
  }

  // ---- 随笔（Journal）：行状态标签 + 操作按钮（与光影同构，纯文本）----
  function jourRowMeta(j) {
    if (j.source === "draft") {
      return { chip: "草稿 · 未发布", cls: "is-draft",
        btns: '<button data-jact="edit-draft" data-id="' + j.id + '">编辑</button>' +
              '<button data-jact="del-draft" data-id="' + j.id + '">删除</button>' };
    }
    if (j.source === "published") {
      if (j.pendingDelete) {
        return { chip: "待删除", cls: "is-pending",
          btns: '<button data-jact="undo-del" data-id="' + j.id + '">撤销删除</button>' };
      }
      return { chip: "已发布", cls: "",
        btns: '<button data-jact="del-pub" data-id="' + j.id + '">删除</button>' };
    }
    if (j.pendingUnhide) {
      return { chip: "默认 · 待恢复上架", cls: "is-pending",
        btns: '<button data-jact="hide" data-id="' + j.id + '">撤销恢复</button>' };
    }
    if (j.pendingHide) {
      return { chip: "默认 · 待下架", cls: "is-pending",
        btns: '<button data-jact="unhide" data-id="' + j.id + '">撤销下架</button>' };
    }
    if (j.hidden) {
      return { chip: "默认 · 已下架", cls: "is-hidden",
        btns: '<button data-jact="unhide" data-id="' + j.id + '">恢复上架</button>' };
    }
    return { chip: "默认", cls: "",
      btns: '<button data-jact="hide" data-id="' + j.id + '">删除</button>' };
  }

  async function renderJournalList() {
    const box = $("#admin-journallist");
    if (!box || !window.journalLib) return;
    const all = (await window.journalLib.getAllWithHidden())
      .filter((j) => !(j.source === "builtin" && j.hidden));
    box.innerHTML = all.map((j) => {
      const m = jourRowMeta(j);
      const t = (j.date ? j.date + " · " : "") + (j.title || "(无标题)");
      return (
        '<div class="admin-row ' + m.cls + '">' +
          '<span class="ar-title">' + esc(t) + "</span>" +
          '<span class="ar-kind">' + esc(m.chip) + "</span>" +
          m.btns +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id, act = b.dataset.jact;
        if (act === "edit-draft") { await startJournalEdit(id); return; }
        if (act === "hide") {
          if (!confirm("删除这篇默认随笔吗?(从随笔列表移除)")) return;
          window.journalLib.hideBuiltin(id);
        }
        if (act === "unhide") window.journalLib.unhideBuiltin(id);
        if (act === "del-pub") {
          if (!confirm("把这篇已发布的随笔标记为删除?(发布后才真正移除)")) return;
          window.journalLib.deletePublished(id);
        }
        if (act === "undo-del") window.journalLib.undoDeletePublished(id);
        if (act === "del-draft") {
          if (!confirm("删除这条本地随笔草稿吗?")) return;
          await window.journalLib.remove(id);
        }
        await refreshAll();
      });
    });
  }

  // 当前正在编辑的随笔草稿 id（null = 新增模式）
  let editingJourId = null;

  async function startJournalEdit(id) {
    const rec = await window.journalLib.getOne(id);
    if (!rec) { $("#journal-status").textContent = "草稿不存在（可能已删除）"; return; }
    editingJourId = id;
    $("#jf-date").value = rec.date || "";
    $("#jf-title").value = rec.title || "";
    $("#jf-body").value = rec.body || "";
    setJournalEditMode(rec);
    const form = $("#journal-form");
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  function exitJournalEdit() {
    editingJourId = null;
    $("#journal-form").reset();
    setJournalEditMode(null);
    $("#journal-status").textContent = "";
  }

  function setJournalEditMode(rec) {
    const form = $("#journal-form");
    const submitBtn = form.querySelector('button[type="submit"]');
    let banner = $("#jf-editing");
    if (rec) {
      submitBtn.textContent = "保存修改";
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "jf-editing";
        banner.className = "af-editing";
        form.insertBefore(banner, form.firstChild);
      }
      banner.innerHTML =
        '<span class="afe-label">正在编辑这篇随笔</span>' +
        '<button type="button" id="jf-cancel-edit">取消编辑</button>';
      banner.querySelector("#jf-cancel-edit").addEventListener("click", exitJournalEdit);
    } else {
      submitBtn.textContent = "加入草稿";
      if (banner) banner.remove();
    }
  }

  function wireJournalForm() {
    const form = $("#journal-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#journal-status");
      const date = $("#jf-date").value.trim();
      const title = $("#jf-title").value.trim();
      const body = $("#jf-body").value.trim();
      if (!title && !body) { status.textContent = "至少写个标题或正文"; return; }
      const editing = editingJourId;
      status.textContent = editing ? "正在保存修改…" : "正在保存草稿…";
      try {
        if (editing) {
          await window.journalLib.update(editing, { date, title, body });
          editingJourId = null;
          form.reset();
          setJournalEditMode(null);
          status.textContent = "已保存修改 ✓ —— 确认后点上方「发布到线上」";
        } else {
          await window.journalLib.add({ date, title, body });
          form.reset();
          status.textContent = "已加入草稿 ✓ —— 确认后点上方「发布到线上」";
        }
        setTimeout(() => { status.textContent = ""; }, 4000);
        await refreshAll();
      } catch (err) {
        status.textContent = "保存失败:" + err.message;
      }
    });
  }

  // ---- 传图编辑器接线：选文件后弹「裁切 / 鸣潮风格封面」，产出回填到 input ----
  function setInputFile(input, blob, name) {
    const dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: blob.type || "image/jpeg" }));
    input.files = dt.files;
  }
  function openEditorFor(input, conf) {
    const f = input.files[0];
    if (!f || !/^image\//.test(f.type) || !window.imgEditor) return;
    window.imgEditor.open(Object.assign({
      file: f,
      onDone: (res) => {
        // res 是处理后的 Blob → 回填;若是原 File(点了「用原图」)则保持不变
        if (res && res instanceof Blob && !(res instanceof File)) setInputFile(input, res, conf.name || "image.jpg");
      },
      onCancel: () => { input.value = ""; }
    }, conf.open));
  }
  function wireImageEditor() {
    if (!window.imgEditor) return;
    const cover = $("#af-cover");
    if (cover) cover.addEventListener("change", () => {
      openEditorFor(cover, {
        name: "cover.jpg",
        open: {
          mode: "crop", aspect: 1,
          title: ($("#af-title") ? $("#af-title").value.trim() : ""),
          subtitle: ($("#af-en") ? $("#af-en").value.trim() : "")
        }
      });
    });
    const gimg = $("#gf-img");
    if (gimg) gimg.addEventListener("change", () => {
      openEditorFor(gimg, { name: "photo.jpg", open: { mode: "crop", aspect: null } });
    });
  }

  // ---- 站点文案编辑器 ----
  // 按分组渲染输入框；改一下即存草稿 + 即时预览。值通过 .value 赋（避免属性转义）。
  function renderTextEditor() {
    const box = $("#admin-text-fields");
    if (!box || !window.textLib) return;
    const groups = window.textLib.fieldGroups();
    box.innerHTML = groups.map((g) => {
      const rows = g.fields.map((f) => {
        const ctrl = f.type === "textarea"
          ? '<textarea data-textkey="' + esc(f.key) + '" rows="' + (f.rich ? 3 : 2) + '"></textarea>'
          : '<input type="text" data-textkey="' + esc(f.key) + '">';
        return (
          '<label class="atext-field' + (f.rich ? " is-rich" : "") + '">' +
            '<span class="atf-label">' + esc(f.label) +
              (f.rich ? '<em class="atf-rich">富文本</em>' : "") + "</span>" +
            ctrl +
          "</label>"
        );
      }).join("");
      return (
        '<div class="atext-group">' +
          '<p class="atext-head">' + esc(g.group) + "</p>" +
          '<div class="atext-rows">' + rows + "</div>" +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("[data-textkey]").forEach((el) => {
      el.value = window.textLib.get(el.dataset.textkey);
      el.addEventListener("input", async () => {
        window.textLib.setDraft(el.dataset.textkey, el.value);
        window.textLib.render();
        await updatePublishUI();
      });
    });
  }

  function wireTextEditor() {
    const reset = $("#admin-text-reset");
    if (reset) {
      reset.addEventListener("click", async () => {
        if (!window.textLib || window.textLib.pendingCount() === 0) {
          $("#admin-text-status").textContent = "没有未发布的文案改动。";
          setTimeout(() => { $("#admin-text-status").textContent = ""; }, 2500);
          return;
        }
        if (!confirm("撤销本次所有未发布的文案改动吗?(已发布的不受影响)")) return;
        window.textLib.clearLocalAfterPublish();   // 清掉本地文案草稿
        window.textLib.render();
        renderTextEditor();
        await updatePublishUI();
        $("#admin-text-status").textContent = "已撤销未发布的文案改动 ✓";
        setTimeout(() => { $("#admin-text-status").textContent = ""; }, 3000);
      });
    }
  }

  // 当前正在编辑的照片草稿 id（null = 新增模式）
  let editingGalId = null;

  async function startGalEdit(id) {
    const rec = await window.galleryLib.getOne(id);
    if (!rec) { $("#gallery-status").textContent = "草稿不存在（可能已删除）"; return; }
    editingGalId = id;
    $("#gf-cap").value = rec.caption || "";
    $("#gf-img").value = "";   // 留空＝保留原图
    setGalEditMode(rec);
    const form = $("#gallery-form");
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  function exitGalEdit() {
    editingGalId = null;
    $("#gallery-form").reset();
    setGalEditMode(null);
    $("#gallery-status").textContent = "";
  }

  function setGalEditMode(rec) {
    const form = $("#gallery-form");
    const submitBtn = form.querySelector('button[type="submit"]');
    let banner = $("#gf-editing");
    if (rec) {
      submitBtn.textContent = "保存修改";
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "gf-editing";
        banner.className = "af-editing";
        form.insertBefore(banner, form.firstChild);
      }
      banner.innerHTML =
        '<span class="afe-label">正在编辑这张照片' +
        (rec.imgBlob ? '<em>不重新选图就保留原图</em>' : "") + "</span>" +
        '<button type="button" id="gf-cancel-edit">取消编辑</button>';
      banner.querySelector("#gf-cancel-edit").addEventListener("click", exitGalEdit);
    } else {
      submitBtn.textContent = "加入草稿";
      if (banner) banner.remove();
    }
  }

  function wireGalleryForm() {
    const form = $("#gallery-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#gallery-status");
      const caption = $("#gf-cap").value.trim();
      const imgFile = $("#gf-img").files[0];
      const editing = editingGalId;
      const existing = editing ? await window.galleryLib.getOne(editing) : null;
      const willHaveImg = imgFile || (existing && existing.imgBlob);
      if (!willHaveImg) { status.textContent = "请先选择一张照片"; return; }

      status.textContent = editing ? "正在保存修改…" : "正在保存草稿…";
      try {
        if (editing) {
          await window.galleryLib.update(editing, { caption, imgFile });
          editingGalId = null;
          form.reset();
          setGalEditMode(null);
          status.textContent = "已保存修改 ✓ —— 确认后点上方「发布到线上」";
        } else {
          await window.galleryLib.add({ caption, imgFile });
          form.reset();
          status.textContent = "已加入草稿 ✓ —— 确认后点上方「发布到线上」";
        }
        setTimeout(() => { status.textContent = ""; }, 4000);
        await refreshAll();
      } catch (err) {
        status.textContent = "保存失败:" + err.message;
      }
    });
  }

  // 选电影分类时音频可选;随手录封面可选
  function syncAudioRequirement() {
    const cat = $("#af-cat").value;
    const audioLabel = $("#af-audio-label");
    const coverLabel = $("#af-cover-label");
    const isVideoCat = (cat === "ad" || cat === "game");
    // 视频字段：仅广告/游戏显示
    const vLabel = $("#af-video-label"), vfLabel = $("#af-videofile-label");
    if (vLabel) vLabel.hidden = !isVideoCat;
    if (vfLabel) vfLabel.hidden = !isVideoCat;
    // 音频：电影、广告、游戏都改为「可不填」（广告/游戏以视频为主）
    if (cat === "film") {
      audioLabel.classList.add("is-optional");
      audioLabel.querySelector(".lbl").textContent = "音频文件(电影类可不填)";
    } else if (isVideoCat) {
      audioLabel.classList.add("is-optional");
      audioLabel.querySelector(".lbl").textContent = "音频文件(广告/游戏可不填，视频为主)";
    } else {
      audioLabel.classList.remove("is-optional");
      audioLabel.querySelector(".lbl").textContent = "音频文件 (mp3 / wav / m4a)";
    }
    if (coverLabel) {
      const coverOptional = (cat === "sketch");
      coverLabel.classList.toggle("is-optional", coverOptional);
      coverLabel.querySelector(".lbl").textContent = coverOptional
        ? "封面 (jpg / png · 随手录可不填)"
        : "封面 (jpg / png)";
    }
  }

  // 刷新发布栏:未发布改动数 + 按钮可用性
  async function updatePublishUI() {
    const countEl = $("#admin-changecount");
    const btn = $("#admin-publish-btn");
    if (!countEl || !btn) return;
    const drafts = await window.musicLib.getCustom();
    const galN = window.galleryLib ? await window.galleryLib.pendingCount() : 0;
    const jourN = window.journalLib ? await window.journalLib.pendingCount() : 0;
    const orderN = window.musicLib.orderChanged() ? 1 : 0;
    const textN = window.textLib ? window.textLib.pendingCount() : 0;
    const n = drafts.length +
      window.musicLib.getLocalHidden().length +
      window.musicLib.getPendingUnhide().length +
      window.musicLib.getPendingDelete().length +
      galN + jourN + orderN + textN;
    const hasToken = window.publisher.hasToken();
    countEl.textContent = n === 0 ? "没有未发布的改动" : ("有 " + n + " 项未发布的改动");
    countEl.classList.toggle("has-changes", n > 0);
    btn.disabled = !(n > 0 && hasToken);
    btn.title = !hasToken ? "请先设置 GitHub Token" : (n === 0 ? "暂无改动" : "");
  }

  async function refreshAll() {
    await renderAdminList();
    await renderGalleryList();
    await renderJournalList();
    renderTextEditor();
    await updatePublishUI();
    if (window.playerApp) await window.playerApp.refresh();
    if (window.galleryApp) await window.galleryApp.render();
    if (window.journalApp) await window.journalApp.render();
  }

  function wireToken() {
    $("#admin-token-toggle").addEventListener("click", () => {
      const box = $("#admin-token-box");
      box.hidden = !box.hidden;
      if (!box.hidden && window.publisher.hasToken()) {
        $("#admin-token-status").textContent = "已设置 Token(出于安全不显示原文)。";
      }
    });
    $("#admin-token-save").addEventListener("click", async () => {
      const status = $("#admin-token-status");
      const val = $("#admin-token").value.trim();
      if (!val) { status.textContent = "请先粘贴 Token"; return; }
      window.publisher.setToken(val);
      status.textContent = "正在测试连接…";
      try {
        const repo = await window.publisher.testToken();
        status.textContent = "✓ 连接成功:" + repo;
        $("#admin-token").value = "";
        await updatePublishUI();
      } catch (err) {
        status.textContent = "✗ " + err.message;
      }
    });
    $("#admin-token-clear").addEventListener("click", async () => {
      window.publisher.clearToken();
      $("#admin-token").value = "";
      $("#admin-token-status").textContent = "已清除本机 Token。";
      await updatePublishUI();
    });
  }

  function wirePublish() {
    $("#admin-publish-btn").addEventListener("click", async () => {
      const btn = $("#admin-publish-btn");
      const status = $("#admin-publish-status");
      if (!confirm("确定把当前所有草稿改动发布到线上吗?")) return;
      btn.disabled = true;
      const step = (msg) => { status.textContent = msg; };
      try {
        const res = await window.publisher.publish(step);
        status.textContent = "✓ 已发布!约 1 分钟后线上生效。" +
          (res.added ? ("新增作品 " + res.added + " 项。") : "") +
          (res.edited ? ("更新作品 " + res.edited + " 项。") : "") +
          (res.removed ? ("移除作品 " + res.removed + " 项。") : "") +
          (res.galAdded ? ("新增照片 " + res.galAdded + " 张。") : "") +
          (res.galRemoved ? ("移除照片 " + res.galRemoved + " 张。") : "") +
          (res.jourAdded ? ("新增随笔 " + res.jourAdded + " 篇。") : "") +
          (res.jourRemoved ? ("移除随笔 " + res.jourRemoved + " 篇。") : "") +
          (res.reordered ? "已更新展示顺序。" : "") +
          (res.textChanged ? "已更新站点文案。" : "");
        await refreshAll();
      } catch (err) {
        status.textContent = "✗ 发布失败:" + err.message;
        await updatePublishUI();
      }
    });
  }

  // 当前正在编辑的草稿 id（null = 新增模式）
  let editingId = null;

  // 进入编辑：把草稿内容读回表单
  async function startEdit(id) {
    const rec = await window.musicLib.getOne(id);
    if (!rec) { $("#admin-status").textContent = "草稿不存在（可能已删除）"; return; }
    editingId = id;
    $("#af-cat").value = rec.category || "album";
    $("#af-title").value = rec.title || "";
    $("#af-en").value = rec.en || "";
    $("#af-year").value = rec.year || "";
    $("#af-role").value = rec.role || "";
    $("#af-desc").value = rec.desc || "";
    if ($("#af-credits")) $("#af-credits").value = rec.credits || "";
    if ($("#af-lyrics")) $("#af-lyrics").value = rec.lyrics || "";
    $("#af-audio").value = "";   // 文件框无法预填，留空＝保留原文件
    $("#af-cover").value = "";
    if ($("#af-video")) $("#af-video").value = rec.videoUrl || "";
    if ($("#af-videofile")) $("#af-videofile").value = "";
    syncAudioRequirement();
    setEditMode(rec);
    const form = $("#admin-form");
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  // 编辑一条「已发布」作品：建/复用修改草稿，再把它读回表单
  async function startEditPublished(pubId) {
    const pub = (window.SITE_PUBLISHED || []).find((t) => t.id === pubId);
    if (!pub) { $("#admin-status").textContent = "作品不存在（可能已被删除）"; return; }
    const editId = await window.musicLib.startEditPublished(pub);
    await refreshAll();        // 让该行变成「待更新」
    await startEdit(editId);   // 修改草稿和普通草稿一样能读回表单
  }

  // 退出编辑，回到新增模式
  function exitEdit() {
    editingId = null;
    const form = $("#admin-form");
    form.reset();
    syncAudioRequirement();
    setEditMode(null);
    $("#admin-status").textContent = "";
  }

  // 切换表单外观：编辑横幅 + 提交按钮文案
  function setEditMode(rec) {
    const form = $("#admin-form");
    const submitBtn = form.querySelector('button[type="submit"]');
    let banner = $("#af-editing");
    if (rec) {
      submitBtn.textContent = "保存修改";
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "af-editing";
        banner.className = "af-editing";
        form.insertBefore(banner, form.firstChild);
      }
      const keep = [];
      if (rec.coverBlob || rec.origCover) keep.push("封面");
      if (rec.audioBlob || rec.origSrc) keep.push("音频");
      if (rec.videoBlob || rec.videoUrl || rec.origVideo) keep.push("视频");
      const keepNote = keep.length ? ("原" + keep.join("、") + "不重新选就保留") : "";
      const tag = rec.editOf ? "（已发布作品）" : "";
      banner.innerHTML =
        '<span class="afe-label">正在编辑' + tag + "：<strong>" + esc(rec.title || "") + "</strong>" +
        (keepNote ? '<em>' + keepNote + "</em>" : "") + "</span>" +
        '<button type="button" id="af-cancel-edit">取消编辑</button>';
      banner.querySelector("#af-cancel-edit").addEventListener("click", exitEdit);
    } else {
      submitBtn.textContent = "加入草稿";
      if (banner) banner.remove();
    }
  }

  function wireForm() {
    $("#af-cat").addEventListener("change", syncAudioRequirement);
    syncAudioRequirement();

    const form = $("#admin-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#admin-status");
      const category = $("#af-cat").value;
      const title = $("#af-title").value.trim();
      const en = $("#af-en").value.trim();
      const year = $("#af-year").value.trim();
      const role = $("#af-role").value.trim();
      const desc = $("#af-desc").value.trim();
      const credits = $("#af-credits") ? $("#af-credits").value.trim() : "";
      const lyrics = $("#af-lyrics") ? $("#af-lyrics").value.trim() : "";
      const audioFile = $("#af-audio").files[0];
      const coverFile = $("#af-cover").files[0];
      const videoUrl = $("#af-video") ? $("#af-video").value.trim() : "";
      const videoFile = $("#af-videofile") ? $("#af-videofile").files[0] : null;
      const editing = editingId;
      const isVideoCat = (category === "ad" || category === "game");

      if (!title) { status.textContent = "请填写作品标题"; return; }
      // 编辑时若没重新选文件，沿用草稿里原有的文件
      const existing = editing ? await window.musicLib.getOne(editing) : null;
      const willHaveCover = coverFile || (existing && (existing.coverBlob || existing.origCover));
      const willHaveAudio = audioFile || (existing && (existing.audioBlob || existing.origSrc));
      const willHaveVideo = videoUrl || videoFile ||
        (existing && (existing.videoBlob || existing.videoUrl || existing.origVideo));
      if (category !== "sketch" && !willHaveCover) { status.textContent = "请上传封面(除随手录外每条作品都需要封面)"; return; }
      if (category === "album" || category === "sketch") {
        if (!willHaveAudio) { status.textContent = "这个分类需要音频文件;若只放封面,请把分类改成「电影」"; return; }
      } else if (isVideoCat) {
        if (!willHaveVideo && !willHaveAudio) {
          status.textContent = "广告/游戏请至少填一项:视频链接、上传视频、或音频文件"; return;
        }
      }

      status.textContent = editing ? "正在保存修改…" : "正在保存草稿…";
      try {
        if (editing) {
          await window.musicLib.update(editing, { category, title, en, year, role, desc, credits, lyrics, audioFile, coverFile, videoUrl, videoFile });
          editingId = null;
          form.reset();
          syncAudioRequirement();
          setEditMode(null);
          status.textContent = "已保存修改 ✓ —— 确认后点上方「发布到线上」";
        } else {
          await window.musicLib.add({ category, title, en, year, role, desc, credits, lyrics, audioFile, coverFile, videoUrl, videoFile });
          form.reset();
          syncAudioRequirement();
          status.textContent = "已加入草稿 ✓ —— 确认后点上方「发布到线上」";
        }
        setTimeout(() => { status.textContent = ""; }, 4000);
        await refreshAll();
      } catch (err) {
        status.textContent = "保存失败:" + err.message;
      }
    });
  }

  // 秘密入口:访问 .../#studio（或 #/studio）即解锁「管理」按钮，本机记住。
  const UNLOCK_KEY = "bx-admin-unlocked";
  function checkUnlock() {
    const h = location.hash.replace(/^#\/?/, "").toLowerCase();
    if (h === "studio") {
      localStorage.setItem(UNLOCK_KEY, "1");
      location.hash = "#/";   // 清掉秘密 hash，回首页
    }
    if (localStorage.getItem(UNLOCK_KEY) === "1") {
      const btn = $("#admin-toggle");
      if (btn) btn.hidden = false;
    }
  }

  function wire() {
    checkUnlock();
    window.addEventListener("hashchange", checkUnlock);

    $("#admin-toggle").addEventListener("click", () => {
      document.body.classList.toggle("admin-mode");
      if (document.body.classList.contains("admin-mode")) {
        if (window.siteRouter) window.siteRouter.go("works");
        refreshAll();
        setTimeout(() => {
          const p = document.querySelector("#admin-panel");
          if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
        }, 60);
      }
    });

    wireForm();
    wireGalleryForm();
    wireJournalForm();
    wireTextEditor();
    wireImageEditor();
    wireToken();
    wirePublish();
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
