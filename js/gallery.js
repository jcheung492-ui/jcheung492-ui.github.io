// ============================================================
// 光影图廊 —— Journal 里的子模块
// 网格铺开,点任意一张弹出大图 + 一行介绍;← → 切换,Esc 关闭
// 想换图/加图:改 js/data.js 里的 SITE_GALLERY
// ============================================================
(function () {
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  const items = () => window.SITE_GALLERY || [];
  let cur = -1;
  let box, boxImg, boxCap, boxIdx;

  function buildLightbox() {
    box = document.createElement("div");
    box.className = "lightbox";
    box.id = "lightbox";
    box.hidden = true;
    box.innerHTML =
      '<button class="lb-close" type="button" aria-label="关闭">✕</button>' +
      '<button class="lb-nav lb-prev" type="button" aria-label="上一张">‹</button>' +
      '<button class="lb-nav lb-next" type="button" aria-label="下一张">›</button>' +
      '<figure class="lb-figure">' +
        '<img class="lb-img" id="lb-img" alt="">' +
        '<figcaption class="lb-cap">' +
          '<span class="lb-idx" id="lb-idx"></span>' +
          '<span class="lb-text" id="lb-cap"></span>' +
        "</figcaption>" +
      "</figure>";
    document.body.appendChild(box);
    boxImg = box.querySelector("#lb-img");
    boxCap = box.querySelector("#lb-cap");
    boxIdx = box.querySelector("#lb-idx");

    box.querySelector(".lb-close").addEventListener("click", close);
    box.querySelector(".lb-prev").addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    box.querySelector(".lb-next").addEventListener("click", (e) => { e.stopPropagation(); step(1); });
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  function open(i) {
    const list = items();
    if (!list[i]) return;
    cur = i;
    const it = list[i];
    boxImg.src = it.src;
    boxCap.textContent = it.caption || "";
    boxIdx.textContent = String(i + 1).padStart(2, "0") + " / " + String(list.length).padStart(2, "0");
    box.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function close() {
    box.hidden = true;
    document.body.style.overflow = "";
  }
  function step(d) {
    const list = items();
    open((cur + d + list.length) % list.length);
  }

  function render() {
    const grid = document.getElementById("gallery-grid");
    if (!grid) return;
    const list = items();
    if (!list.length) {
      grid.innerHTML = '<p class="gallery-empty">还没有照片 —— 在 js/data.js 的 SITE_GALLERY 里添加。</p>';
      return;
    }
    grid.innerHTML = list.map((it, i) =>
      '<button class="gallery-cell" type="button" data-i="' + i + '" aria-label="查看大图">' +
        '<img src="' + it.src + '" alt="" loading="lazy">' +
        '<span class="gallery-zoom">＋</span>' +
      "</button>"
    ).join("");
    grid.querySelectorAll(".gallery-cell").forEach((b) => {
      b.addEventListener("click", () => open(Number(b.dataset.i)));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildLightbox();
    render();
  });
  window.galleryApp = { render };
})();
