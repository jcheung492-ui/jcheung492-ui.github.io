// ============================================================
// 图片编辑器 imgEditor —— 上传前的「裁切」与「鸣潮风格封面生成」弹窗（纯前端 Canvas）
//   imgEditor.open({ file, mode:'crop'|'cover', aspect, title, subtitle, onDone(blob), onCancel })
//   · 裁切:拖动平移 + 滑块缩放,选比例(1:1 / 4:3 / 16:9 / 自由),输出裁好的图
//   · 封面:1:1 方形,中间原图、上下同图放大模糊填满,叠加大标题+英文副标题(可选左/中/右)
//   产出一个 Blob(jpeg),交回调用方塞进对应的 <input type=file>
// ============================================================
(function () {
  let root, stage, canvas, ctx, ctrlBox, tabCrop, tabCover, titleHint;
  let cur = null;   // 当前会话状态

  const OUT = 1080;            // 封面输出边长
  const STAGE = 380;          // 预览画布显示边长(正方形舞台)
  const ASPECTS = [
    { key: "1", label: "1:1", v: 1 },
    { key: "4:3", label: "4:3", v: 4 / 3 },
    { key: "16:9", label: "16:9", v: 16 / 9 },
    { key: "free", label: "自由", v: null }
  ];

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ img, url }); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读取失败")); };
      img.src = url;
    });
  }

  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        document.fonts.load("700 130px 'Noto Serif SC'"),
        document.fonts.load("500 30px 'Cormorant Garamond'")
      ]);
    } catch (e) {}
  }

  // ---- 弹窗 DOM（一次性构建，复用）----
  function build() {
    if (root) return;
    root = document.createElement("div");
    root.className = "ie-overlay";
    root.hidden = true;
    root.innerHTML =
      '<div class="ie-modal" role="dialog" aria-label="图片编辑">' +
        '<div class="ie-tabs">' +
          '<button type="button" class="ie-tab" data-tab="crop">裁切</button>' +
          '<button type="button" class="ie-tab" data-tab="cover">鸣潮风格封面</button>' +
          '<button type="button" class="ie-x" aria-label="关闭">✕</button>' +
        "</div>" +
        '<div class="ie-stage" id="ie-stage"><canvas id="ie-canvas"></canvas></div>' +
        '<div class="ie-controls" id="ie-controls"></div>' +
        '<p class="ie-hint" id="ie-hint"></p>' +
        '<div class="ie-foot">' +
          '<button type="button" class="ie-btn ghost" data-act="cancel">取消</button>' +
          '<button type="button" class="ie-btn ghost" data-act="orig">用原图</button>' +
          '<button type="button" class="ie-btn" data-act="done">完成并使用</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(root);
    stage = root.querySelector("#ie-stage");
    canvas = root.querySelector("#ie-canvas");
    ctx = canvas.getContext("2d");
    ctrlBox = root.querySelector("#ie-controls");
    titleHint = root.querySelector("#ie-hint");
    tabCrop = root.querySelector('.ie-tab[data-tab="crop"]');
    tabCover = root.querySelector('.ie-tab[data-tab="cover"]');

    canvas.width = STAGE; canvas.height = STAGE;

    root.querySelector(".ie-x").addEventListener("click", () => finish(null, true));
    root.addEventListener("click", (e) => { if (e.target === root) finish(null, true); });
    tabCrop.addEventListener("click", () => switchMode("crop"));
    tabCover.addEventListener("click", () => switchMode("cover"));
    root.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(null, true));
    root.querySelector('[data-act="orig"]').addEventListener("click", () => finish(cur.file, false));
    root.querySelector('[data-act="done"]').addEventListener("click", onDone);

    wireCropPointer();
  }

  // ---- 裁切：交互(平移/缩放)状态 ----
  let cropAspect = 1;     // 当前裁切框比例(数值);自由模式动态用图片比例
  let frame = { x: 0, y: 0, w: 0, h: 0 };   // 裁切框(画布像素)
  let view = { s: 1, ox: 0, oy: 0 };         // 图片在画布里的缩放与左上偏移
  let baseScale = 1;

  function computeFrame() {
    const pad = 20, max = STAGE - pad * 2;
    let asp = cropAspect;
    if (asp == null) asp = cur.iw / cur.ih;     // 自由：用原图比例
    let w = max, h = max / asp;
    if (h > max) { h = max; w = max * asp; }
    frame = { x: (STAGE - w) / 2, y: (STAGE - h) / 2, w: w, h: h };
  }
  function clampView() {
    const minS = Math.max(frame.w / cur.iw, frame.h / cur.ih);
    if (view.s < minS) view.s = minS;
    const iw = cur.iw * view.s, ih = cur.ih * view.s;
    if (view.ox > frame.x) view.ox = frame.x;
    if (view.oy > frame.y) view.oy = frame.y;
    if (view.ox < frame.x + frame.w - iw) view.ox = frame.x + frame.w - iw;
    if (view.oy < frame.y + frame.h - ih) view.oy = frame.y + frame.h - ih;
  }
  function resetView() {
    computeFrame();
    baseScale = Math.max(frame.w / cur.iw, frame.h / cur.ih);
    view.s = baseScale;
    view.ox = frame.x + (frame.w - cur.iw * view.s) / 2;
    view.oy = frame.y + (frame.h - cur.ih * view.s) / 2;
    clampView();
  }
  function drawCrop() {
    ctx.clearRect(0, 0, STAGE, STAGE);
    ctx.fillStyle = "#1b1714";
    ctx.fillRect(0, 0, STAGE, STAGE);
    ctx.drawImage(cur.img, view.ox, view.oy, cur.iw * view.s, cur.ih * view.s);
    // 框外压暗
    ctx.fillStyle = "rgba(20,16,14,.62)";
    ctx.beginPath();
    ctx.rect(0, 0, STAGE, STAGE);
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.fill("evenodd");
    // 框线
    ctx.strokeStyle = "rgba(255,255,255,.92)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.w - 1, frame.h - 1);
    // 三分线
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = frame.x + frame.w * i / 3, gy = frame.y + frame.h * i / 3;
      ctx.beginPath(); ctx.moveTo(gx, frame.y); ctx.lineTo(gx, frame.y + frame.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(frame.x, gy); ctx.lineTo(frame.x + frame.w, gy); ctx.stroke();
    }
  }
  function wireCropPointer() {
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", (e) => {
      if (cur.mode !== "crop") return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || cur.mode !== "crop") return;
      const r = canvas.getBoundingClientRect();
      const sx = STAGE / r.width;   // 显示尺寸→画布像素
      view.ox += (e.clientX - lx) * sx;
      view.oy += (e.clientY - ly) * sx;
      lx = e.clientX; ly = e.clientY;
      clampView(); drawCrop();
    });
    const stop = () => { dragging = false; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("wheel", (e) => {
      if (cur.mode !== "crop") return;
      e.preventDefault();
      zoomTo(view.s * (e.deltaY < 0 ? 1.08 : 0.93));
    }, { passive: false });
  }
  function zoomTo(newS) {
    // 以裁切框中心为锚点缩放
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    const k = newS / view.s;
    view.ox = cx - (cx - view.ox) * k;
    view.oy = cy - (cy - view.oy) * k;
    view.s = newS;
    clampView(); drawCrop();
    const zr = root.querySelector("#ie-zoom");
    if (zr) zr.value = String(Math.min(4, Math.max(1, view.s / baseScale)));
  }

  function cropControls() {
    ctrlBox.innerHTML =
      '<div class="ie-row"><span class="ie-lab">比例</span><span class="ie-seg" id="ie-aspect">' +
        ASPECTS.map((a) => '<button type="button" data-a="' + a.key + '">' + a.label + "</button>").join("") +
      "</span></div>" +
      '<div class="ie-row"><span class="ie-lab">缩放</span>' +
        '<input type="range" id="ie-zoom" min="1" max="4" step="0.01" value="1"></div>';
    const seg = ctrlBox.querySelector("#ie-aspect");
    function markAspect(key) {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.a === key));
    }
    seg.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        const a = ASPECTS.find((x) => x.key === b.dataset.a);
        cropAspect = a.v;
        markAspect(b.dataset.a);
        resetView(); drawCrop();
        root.querySelector("#ie-zoom").value = "1";
      });
    });
    markAspect(ASPECTS.find((a) => a.v === cropAspect || (a.v == null && cropAspect == null)).key);
    ctrlBox.querySelector("#ie-zoom").addEventListener("input", (e) => {
      zoomTo(baseScale * parseFloat(e.target.value));
    });
  }

  // ---- 封面：参数 ----
  let cover = { title: "", subtitle: "", pos: "left", dark: 0.32 };
  function drawCover() {
    const S = STAGE;
    ctx.clearRect(0, 0, S, S);
    // 1) 背景：同图 cover 填满 + 模糊 + 压暗
    const bg = fitCover(cur.iw, cur.ih, S, S);
    ctx.save();
    ctx.filter = "blur(14px)";
    ctx.drawImage(cur.img, bg.x - 8, bg.y - 8, bg.w + 16, bg.h + 16);
    ctx.restore();
    ctx.fillStyle = "rgba(18,14,12," + cover.dark + ")";
    ctx.fillRect(0, 0, S, S);
    // 2) 前景：同图 contain 居中(宽优先) → 宽图上下露出模糊带
    const fg = fitContain(cur.iw, cur.ih, S, S);
    ctx.drawImage(cur.img, fg.x, fg.y, fg.w, fg.h);
    // 3) 标题叠加
    drawTitle(ctx, S, S / OUT);
  }
  function fitCover(iw, ih, W, H) {
    const s = Math.max(W / iw, H / ih);
    const w = iw * s, h = ih * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function fitContain(iw, ih, W, H) {
    const s = Math.min(W / iw, H / ih);
    const w = iw * s, h = ih * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function drawTitle(c, S, k) {
    const title = (cover.title || "").trim();
    const sub = (cover.subtitle || "").trim();
    if (!title && !sub) return;
    const padX = 70 * k;
    let align = "left", x = padX;
    if (cover.pos === "center") { align = "center"; x = S / 2; }
    else if (cover.pos === "right") { align = "right"; x = S - padX; }
    c.textAlign = align;
    c.textBaseline = "alphabetic";
    const cy = S * 0.5;
    c.save();
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 18 * k;
    // 主标题
    c.fillStyle = "rgba(255,255,255,.96)";
    const tSize = 132 * k;
    c.font = '700 ' + tSize + "px 'Noto Serif SC', serif";
    if (title) c.fillText(title, x, cy);
    // 副标题(字距拉开)
    if (sub) {
      c.shadowBlur = 8 * k;
      c.fillStyle = "rgba(255,255,255,.82)";
      const sSize = 30 * k;
      c.font = '500 ' + sSize + "px 'Cormorant Garamond', serif";
      drawSpaced(c, sub.toUpperCase(), x, cy + 44 * k, 9 * k, align);
    }
    c.restore();
  }
  // 手动字距(兼容性比 ctx.letterSpacing 好)
  function drawSpaced(c, text, x, y, gap, align) {
    const chars = [...text];
    const widths = chars.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    let sx = x;
    if (align === "center") sx = x - total / 2;
    else if (align === "right") sx = x - total;
    const save = c.textAlign;
    c.textAlign = "left";
    chars.forEach((ch, i) => { c.fillText(ch, sx, y); sx += widths[i] + gap; });
    c.textAlign = save;
  }

  function coverControls() {
    ctrlBox.innerHTML =
      '<div class="ie-row"><span class="ie-lab">主标题</span><input type="text" id="ie-ct" placeholder="如:鸣潮"></div>' +
      '<div class="ie-row"><span class="ie-lab">副标题</span><input type="text" id="ie-cs" placeholder="如:WUTHERING WAVES"></div>' +
      '<div class="ie-row"><span class="ie-lab">位置</span><span class="ie-seg" id="ie-pos">' +
        '<button type="button" data-p="left">左</button>' +
        '<button type="button" data-p="center">中</button>' +
        '<button type="button" data-p="right">右</button>' +
      "</span></div>" +
      '<div class="ie-row"><span class="ie-lab">压暗</span>' +
        '<input type="range" id="ie-dark" min="0" max="0.7" step="0.02" value="' + cover.dark + '"></div>';
    const ct = ctrlBox.querySelector("#ie-ct"), cs = ctrlBox.querySelector("#ie-cs");
    ct.value = cover.title; cs.value = cover.subtitle;
    ct.addEventListener("input", () => { cover.title = ct.value; drawCover(); });
    cs.addEventListener("input", () => { cover.subtitle = cs.value; drawCover(); });
    const pos = ctrlBox.querySelector("#ie-pos");
    function markPos() { pos.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === cover.pos)); }
    pos.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => { cover.pos = b.dataset.p; markPos(); drawCover(); });
    });
    markPos();
    ctrlBox.querySelector("#ie-dark").addEventListener("input", (e) => {
      cover.dark = parseFloat(e.target.value); drawCover();
    });
  }

  function switchMode(mode) {
    cur.mode = mode;
    tabCrop.classList.toggle("on", mode === "crop");
    tabCover.classList.toggle("on", mode === "cover");
    if (mode === "crop") {
      titleHint.textContent = "拖动图片调整位置，滑块或滚轮缩放；框内即最终裁切范围。";
      cropControls();
      resetView();
      const zr = root.querySelector("#ie-zoom"); if (zr) zr.value = "1";
      drawCrop();
    } else {
      titleHint.textContent = "1:1 方形封面：中间原图，上下同图模糊填满，可叠加标题（仿《鸣潮》排版）。";
      coverControls();
      drawCover();
    }
  }

  // ---- 产出 ----
  function exportCrop() {
    const sx = (frame.x - view.ox) / view.s;
    const sy = (frame.y - view.oy) / view.s;
    const sw = frame.w / view.s, sh = frame.h / view.s;
    const cap = 1400;
    let ow = sw, oh = sh;
    if (Math.max(ow, oh) > cap) { const r = cap / Math.max(ow, oh); ow *= r; oh *= r; }
    const out = document.createElement("canvas");
    out.width = Math.round(ow); out.height = Math.round(oh);
    out.getContext("2d").drawImage(cur.img, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out;
  }
  function exportCover() {
    const out = document.createElement("canvas");
    out.width = OUT; out.height = OUT;
    const c = out.getContext("2d");
    const bg = fitCover(cur.iw, cur.ih, OUT, OUT);
    c.save(); c.filter = "blur(40px)";
    c.drawImage(cur.img, bg.x - 24, bg.y - 24, bg.w + 48, bg.h + 48);
    c.restore();
    c.fillStyle = "rgba(18,14,12," + cover.dark + ")";
    c.fillRect(0, 0, OUT, OUT);
    const fg = fitContain(cur.iw, cur.ih, OUT, OUT);
    c.drawImage(cur.img, fg.x, fg.y, fg.w, fg.h);
    drawTitle(c, OUT, 1);
    return out;
  }
  function onDone() {
    const out = cur.mode === "crop" ? exportCrop() : exportCover();
    out.toBlob((blob) => { finish(blob, false); }, "image/jpeg", 0.92);
  }

  function finish(result, cancelled) {
    root.hidden = true;
    document.body.style.overflow = "";
    const c = cur; cur = null;
    if (c && c.url) URL.revokeObjectURL(c.url);
    if (cancelled) { if (c && c.onCancel) c.onCancel(); return; }
    if (c && c.onDone) c.onDone(result);   // result 可能是 Blob 或原 File
  }

  async function open(opts) {
    build();
    const { img, url } = await loadImage(opts.file);
    cur = {
      file: opts.file, img, url, iw: img.naturalWidth, ih: img.naturalHeight,
      mode: opts.mode === "cover" ? "cover" : "crop",
      onDone: opts.onDone, onCancel: opts.onCancel
    };
    // 裁切默认比例：传了 aspect 用之，否则封面/作品 1:1
    cropAspect = (opts.aspect === null) ? null : (opts.aspect || 1);
    cover.title = opts.title || "";
    cover.subtitle = opts.subtitle || "";
    await ensureFonts();
    root.hidden = false;
    document.body.style.overflow = "hidden";
    switchMode(cur.mode);
  }

  window.imgEditor = { open };
})();
