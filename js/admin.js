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
        btns: '<button data-act="del-draft" data-id="' + t.id + '">删除</button>'
      };
    }
    if (t.source === "published") {
      if (t.pendingDelete) {
        return {
          chip: "待删除 · " + cat, cls: "is-pending",
          btns: '<button data-act="undo-del" data-id="' + t.id + '">撤销删除</button>'
        };
      }
      return {
        chip: "已发布 · " + cat, cls: "",
        btns: '<button data-act="del-pub" data-id="' + t.id + '">删除</button>'
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
      btns: '<button data-act="hide" data-id="' + t.id + '">下架</button>'
    };
  }

  async function renderAdminList() {
    const box = $("#admin-tracklist");
    if (!box) return;
    const all = await window.musicLib.getAllWithHidden();
    box.innerHTML = all.map((t) => {
      const m = rowMeta(t);
      return (
        '<div class="admin-row ' + m.cls + '">' +
          '<img src="' + (t.cover || "covers/morning-mist.png") + '" alt="">' +
          '<span class="ar-title">' + esc(t.title) + "</span>" +
          '<span class="ar-kind">' + esc(m.chip) + "</span>" +
          m.btns +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === "hide") window.musicLib.hideBuiltin(id);
        if (act === "unhide") window.musicLib.unhideBuiltin(id);
        if (act === "del-pub") {
          if (!confirm("把这条已发布作品标记为删除?(发布后才真正移除)")) return;
          window.musicLib.deletePublished(id);
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

  // 选电影分类时音频可选;随手录封面可选
  function syncAudioRequirement() {
    const cat = $("#af-cat").value;
    const audioLabel = $("#af-audio-label");
    const coverLabel = $("#af-cover-label");
    if (cat === "film") {
      audioLabel.classList.add("is-optional");
      audioLabel.querySelector(".lbl").textContent = "音频文件(电影类可不填)";
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
    const n = drafts.length +
      window.musicLib.getLocalHidden().length +
      window.musicLib.getPendingUnhide().length +
      window.musicLib.getPendingDelete().length;
    const hasToken = window.publisher.hasToken();
    countEl.textContent = n === 0 ? "没有未发布的改动" : ("有 " + n + " 项未发布的改动");
    countEl.classList.toggle("has-changes", n > 0);
    btn.disabled = !(n > 0 && hasToken);
    btn.title = !hasToken ? "请先设置 GitHub Token" : (n === 0 ? "暂无改动" : "");
  }

  async function refreshAll() {
    await renderAdminList();
    await updatePublishUI();
    if (window.playerApp) await window.playerApp.refresh();
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
          (res.added ? ("新增 " + res.added + " 项。") : "") +
          (res.removed ? ("移除 " + res.removed + " 项。") : "");
        await refreshAll();
      } catch (err) {
        status.textContent = "✗ 发布失败:" + err.message;
        await updatePublishUI();
      }
    });
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
      const audioFile = $("#af-audio").files[0];
      const coverFile = $("#af-cover").files[0];
      if (!title) { status.textContent = "请填写作品标题"; return; }
      if (category !== "sketch" && !coverFile) { status.textContent = "请上传封面(除随手录外每条作品都需要封面)"; return; }
      if (category !== "film" && !audioFile) {
        status.textContent = "这个分类需要音频文件;若只放封面,请把分类改成「电影」"; return;
      }
      status.textContent = "正在保存草稿…";
      try {
        await window.musicLib.add({ category, title, en, year, role, desc, audioFile, coverFile });
        form.reset();
        syncAudioRequirement();
        status.textContent = "已加入草稿 ✓ —— 确认后点上方「发布到线上」";
        setTimeout(() => { status.textContent = ""; }, 4000);
        await refreshAll();
      } catch (err) {
        status.textContent = "保存失败:" + err.message;
      }
    });
  }

  function wire() {
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
    wireToken();
    wirePublish();
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
