// ============================================================
// 管理模式 —— 页脚「管理」开关;上传作品 / 下架 / 删除
// 支持分类:专辑/广告/游戏(需音源) + 电影(只需封面)
// 数据保存在你自己的浏览器里(IndexedDB)
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const CAT_LABEL = { album: "专辑", ad: "广告配乐", game: "游戏配乐", sketch: "随手录", film: "电影" };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  async function renderAdminList() {
    const box = $("#admin-tracklist");
    if (!box) return;
    const all = await window.musicLib.getAllWithHidden();
    box.innerHTML = all.map((t) => {
      const kind = (t.builtin ? "默认" : "上传") + " · " + (CAT_LABEL[t.category] || "");
      let btns;
      if (t.builtin) {
        btns = t.hidden
          ? '<button data-act="unhide" data-id="' + t.id + '">恢复上架</button>'
          : '<button data-act="hide" data-id="' + t.id + '">下架</button>';
      } else {
        btns = '<button data-act="delete" data-id="' + t.id + '">删除</button>';
      }
      return (
        '<div class="admin-row' + (t.hidden ? " is-hidden" : "") + '">' +
          '<img src="' + t.cover + '" alt="">' +
          '<span class="ar-title">' + esc(t.title) + "</span>" +
          '<span class="ar-kind">' + esc(kind) + (t.hidden ? " · 已下架" : "") + "</span>" +
          btns +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === "hide") window.musicLib.hideBuiltin(id);
        if (act === "unhide") window.musicLib.unhideBuiltin(id);
        if (act === "delete") {
          if (!confirm("确定删除这条作品吗?")) return;
          await window.musicLib.remove(id);
        }
        await renderAdminList();
        await window.playerApp.refresh();
      });
    });
  }

  // 选电影分类时,音频变成可选;电影/随手录类封面可选
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

  function wire() {
    $("#admin-toggle").addEventListener("click", () => {
      document.body.classList.toggle("admin-mode");
      if (document.body.classList.contains("admin-mode")) {
        if (window.siteRouter) window.siteRouter.go("works");
        renderAdminList();
        setTimeout(() => {
          const p = document.querySelector("#admin-panel");
          if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
        }, 60);
      }
    });

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
      status.textContent = "正在保存…";
      try {
        await window.musicLib.add({ category, title, en, year, role, desc, audioFile, coverFile });
        form.reset();
        syncAudioRequirement();
        status.textContent = "已上架 ✓";
        setTimeout(() => { status.textContent = ""; }, 2500);
        await renderAdminList();
        await window.playerApp.refresh();
      } catch (err) {
        status.textContent = "保存失败:" + err.message;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
