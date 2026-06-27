/* ============================================================
   侧边时钟 · 按页面切换形态 + 全局明暗换色
   北京时间 · 只到分。直接替换原 js/clock.js 即可。
   依赖：页面里有 <aside id="side-clock"></aside>
        以及已加载 Cormorant Garamond 字体（你 head 里已有）。

   形态分配：
     Home   light = 发丝指针        dark = 暖光分钟弧（studio）
     About  light = 实物挂钟        dark = 深色实物挂钟（克制，无霓虹辉光）
     Works  声波时间条（赭石实时流过这一小时，明暗同形）
     Journal斜体时间戳（明暗同形，暗色去辉光）
   ============================================================ */
(function () {
  var TZ = 'Asia/Shanghai';
  var host = document.getElementById('side-clock');
  if (!host) return;
  host.setAttribute('aria-hidden', 'true');

  /* ---------- 北京时间（只到分） ---------- */
  function bjTime() {
    var p = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit'
    }).format(new Date());
    var a = p.split(':');
    return { hh: a[0], mm: a[1], h: parseInt(a[0], 10) % 12, m: parseInt(a[1], 10) };
  }

  /* ---------- 这一小时已走过的比例（0..1，含秒/毫秒，用于实时流动） ----------
     分取北京时区；秒与毫秒与时区无关，直接读本地 Date 即可。 */
  function hourFrac() {
    var d = new Date();
    var mm = parseInt(new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour12: false, minute: '2-digit'
    }).format(d), 10);
    var sec = d.getSeconds() + d.getMilliseconds() / 1000;
    return (mm * 60 + sec) / 3600;
  }

  /* ---------- 当前路由 → 形态 ---------- */
  function routeKind() {
    var h = (location.hash || '').toLowerCase();
    if (h.indexOf('#/works') === 0 || h.indexOf('#/sketches') === 0 || h.indexOf('#/catdetail') === 0) return 'works';
    if (h.indexOf('#/journal') === 0) return 'journal';
    if (h.indexOf('#/about') === 0 || h.indexOf('#/guestbook') === 0 || h.indexOf('#/contact') === 0) return 'about';
    return 'home';
  }

  /* ---------- 主题：靠背景亮度自动判断，不依赖 class 名 ---------- */
  function bgL(el) {
    var bg = getComputedStyle(el).backgroundColor || '';
    var m = bg.match(/[\d.]+/g);
    if (!m) return null;
    if (m.length >= 4 && parseFloat(m[3]) === 0) return null; // 透明
    return 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2];
  }
  function isDark() {
    var cl = (document.body.className + ' ' + document.documentElement.className).toLowerCase();
    if (/\b(studio|dark|night)\b/.test(cl)) return true;
    if (/\b(light|day)\b/.test(cl)) return false;
    var tg = document.getElementById('theme-toggle');
    if (tg && tg.getAttribute('aria-pressed') === 'true') return true;
    if (tg && tg.getAttribute('aria-pressed') === 'false') return false;
    var L = bgL(document.body);
    if (L == null) L = bgL(document.documentElement);
    return L != null && L < 110;
  }

  /* ---------- 调色板 ----------
     同一套赭石暖调与衬线字。暗色辉光（studio 质感）只给 home，
     其它模块暗色 = 自身亮色方案的克制深色版（glow / textGlow 关闭）。 */
  function pal(dark, kind) {
    if (!dark) {
      return { ink: '#2b2723', accent: '#a96a3c',
        faint: function (a) { return 'rgba(43,39,35,' + a + ')'; },
        accentFaint: 'rgba(169,106,60,.28)',
        faceA: '#fefbf5', faceB: '#f5edda', faceC: '#e6dac3', bevel: '#e7d9c0',
        glow: 'none', textGlow: 'none' };
    }
    var p = { ink: '#ece3d4', accent: '#d59a5f',
      faint: function (a) { return 'rgba(236,227,212,' + a + ')'; },
      accentFaint: 'rgba(213,154,95,.3)',
      faceA: '#2c261d', faceB: '#231e16', faceC: '#17130d', bevel: '#39301f',
      glow: 'none', textGlow: 'none' };
    if (kind === 'home') {                       // 仅首页保留暖光辉光
      p.glow = 'drop-shadow(0 0 4px rgba(213,154,95,.5))';
      p.textGlow = '0 0 12px rgba(213,154,95,.4)';
    }
    return p;
  }

  var seq = 0;
  var WAVE = '0,14 10,14 18,8 26,20 34,14 46,14 54,6 64,22 74,14 86,14 94,9 104,19 112,14 124,14 132,7 142,21 150,14 160,14';
  var WAVE_W = 160;
  // 解析波形点，供进度点贴着折线起伏
  var WAVE_PTS = WAVE.split(' ').map(function (p) { var a = p.split(','); return [+a[0], +a[1]]; });
  function waveY(x) {
    for (var i = 0; i < WAVE_PTS.length - 1; i++) {
      var a = WAVE_PTS[i], b = WAVE_PTS[i + 1];
      if (x >= a[0] && x <= b[0]) {
        var r = (b[0] - a[0]) ? (x - a[0]) / (b[0] - a[0]) : 0;
        return a[1] + (b[1] - a[1]) * r;
      }
    }
    return WAVE_PTS[WAVE_PTS.length - 1][1];
  }

  /* ---------- 实物挂钟（现给 About） ---------- */
  function homeSVG(c, t) {
    var id = 'cg' + (++seq), ha = t.h * 30 + t.m * 0.5, ma = t.m * 6, s = '', i;
    for (i = 0; i < 12; i++)
      s += '<line x1="50" y1="9.6" x2="50" y2="12.4" stroke="' + c.faint(.28) + '" stroke-width="0.55" stroke-linecap="round" transform="rotate(' + (i * 30) + ' 50 50)"></line>';
    [0, 90, 180, 270].forEach(function (a) {
      s += '<line x1="50" y1="9" x2="50" y2="15.4" stroke="' + c.faint(.5) + '" stroke-width="1.3" stroke-linecap="round" transform="rotate(' + a + ' 50 50)"></line>';
    });
    return '<svg viewBox="0 0 100 100" width="78" height="78" style="display:block;overflow:visible">'
      + '<defs><radialGradient id="f' + id + '" cx="40%" cy="33%" r="74%"><stop offset="0%" stop-color="' + c.faceA + '"></stop><stop offset="60%" stop-color="' + c.faceB + '"></stop><stop offset="100%" stop-color="' + c.faceC + '"></stop></radialGradient>'
      + '<linearGradient id="r' + id + '" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0%" stop-color="#e3c197"></stop><stop offset="28%" stop-color="#b88a57"></stop><stop offset="52%" stop-color="#946a40"></stop><stop offset="74%" stop-color="#c39c6b"></stop><stop offset="100%" stop-color="#ddbb8c"></stop></linearGradient></defs>'
      + '<g style="filter:drop-shadow(0 5px 10px rgba(40,26,8,.32))"><circle cx="50" cy="50" r="48" fill="url(#r' + id + ')"></circle><circle cx="50" cy="50" r="43.6" fill="' + c.bevel + '"></circle><circle cx="50" cy="50" r="42.4" fill="url(#f' + id + ')"></circle></g>'
      + '<circle cx="50" cy="50" r="38.4" fill="none" stroke="' + c.faint(.08) + '" stroke-width="0.4"></circle>'
      + s
      + '<circle cx="50" cy="12.4" r="1.5" fill="' + c.accent + '"></circle>'
      + '<line x1="50" y1="59" x2="50" y2="31.5" stroke="' + c.ink + '" stroke-width="2.4" stroke-linecap="round" transform="rotate(' + ha + ' 50 50)" style="filter:' + c.glow + '"></line>'
      + '<line x1="50" y1="61" x2="50" y2="17" stroke="' + c.ink + '" stroke-width="1.35" stroke-linecap="round" transform="rotate(' + ma + ' 50 50)" style="filter:' + c.glow + '"></line>'
      + '<circle cx="50" cy="50" r="3" fill="url(#r' + id + ')"></circle><circle cx="50" cy="50" r="1.2" fill="' + c.ink + '"></circle></svg>';
  }

  /* ---------- Home：发光分钟弧（明暗共用的轮廓） ----------
     同一套几何：底环 + 暖光分钟弧（按这一小时进度推进）。
     light = 弧 + 发丝指针；dark/studio = 弧 + 较大的数字。
     .arc-fill / .arc-dot 由动画帧实时更新。轮廓尺寸两版一致。 */
  var HOME_W = 76, HOME_R = 40;
  function homeRing(c, dark) {
    var ag = dark ? 'drop-shadow(0 0 5px rgba(213,154,95,.6))'  : 'drop-shadow(0 0 4px rgba(169,106,60,.45))';
    var dg = dark ? 'drop-shadow(0 0 6px rgba(213,154,95,.85))' : 'drop-shadow(0 0 5px rgba(169,106,60,.6))';
    return '<circle cx="50" cy="50" r="' + HOME_R + '" fill="none" stroke="' + c.faint(.16) + '" stroke-width="2"></circle>'
      + '<circle class="arc-fill" cx="50" cy="50" r="' + HOME_R + '" pathLength="1" fill="none" stroke="' + c.accent + '" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0 1" transform="rotate(-90 50 50)" style="filter:' + ag + '"></circle>'
      + '<circle class="arc-dot" cx="50" cy="' + (50 - HOME_R) + '" r="2.2" fill="' + c.accent + '" style="filter:' + dg + '"></circle>';
  }

  /* Home 亮色：弧 + 发丝指针 */
  function homeLightSVG(c, t) {
    var ha = t.h * 30 + t.m * 0.5, ma = t.m * 6;
    return '<svg viewBox="0 0 100 100" width="' + HOME_W + '" height="' + HOME_W + '" style="display:block;overflow:visible">'
      + homeRing(c, false)
      + '<line x1="50" y1="52" x2="50" y2="31" stroke="' + c.ink + '" stroke-width="1.5" stroke-linecap="round" transform="rotate(' + ha + ' 50 50)"></line>'
      + '<line x1="50" y1="53" x2="50" y2="18" stroke="' + c.ink + '" stroke-width="1" stroke-linecap="round" transform="rotate(' + ma + ' 50 50)"></line>'
      + '<circle cx="50" cy="50" r="1.7" fill="' + c.accent + '"></circle></svg>';
  }

  /* Home 暗色 / studio：弧 + 数字 */
  function homeDarkSVG(c, t) {
    return '<svg viewBox="0 0 100 100" width="' + HOME_W + '" height="' + HOME_W + '" style="display:block;overflow:visible">'
      + homeRing(c, true)
      + '<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="Cormorant Garamond,Georgia,serif" font-weight="300" font-size="26" letter-spacing="0.5" fill="' + c.ink + '" style="text-shadow:' + c.textGlow + '">' + t.hh + '<tspan fill="' + c.accent + '">:</tspan>' + t.mm + '</text>'
      + '</svg>';
  }

  /* ---------- Works：声波时间条（赭石实时流过这一小时） ----------
     .wk-fill（裁切宽度）与 .wk-dot（进度点）由动画帧逐帧推进。 */
  function worksHTML(c, t) {
    var id = 'wk' + (++seq), prog = (hourFrac() * WAVE_W).toFixed(1), progY = waveY(+prog).toFixed(1);
    return '<div style="display:flex;align-items:center;gap:11px">'
      + '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-weight:300;font-size:27px;line-height:1;color:' + c.ink + ';white-space:nowrap;text-shadow:' + c.textGlow + '">' + t.hh + '<span style="color:' + c.accent + '">:</span>' + t.mm + '</div>'
      + '<svg viewBox="0 0 160 28" width="132" height="26" preserveAspectRatio="none" style="overflow:visible">'
      + '<defs><clipPath id="' + id + '"><rect class="wk-fill" x="0" y="0" width="' + prog + '" height="28"></rect></clipPath></defs>'
      + '<polyline points="' + WAVE + '" fill="none" stroke="' + c.accentFaint + '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></polyline>'
      + '<polyline points="' + WAVE + '" fill="none" stroke="' + c.accent + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#' + id + ')" style="filter:' + c.glow + '"></polyline>'
      + '<circle class="wk-dot" cx="' + prog + '" cy="' + progY + '" r="2.6" fill="' + c.accent + '"></circle></svg></div>';
  }

  /* ---------- Journal：斜体时间戳 ---------- */
  function journalHTML(c, t) {
    return '<div style="text-align:center">'
      + '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-style:italic;font-weight:400;font-size:42px;line-height:1;color:' + c.ink + ';text-shadow:' + c.textGlow + '">' + t.hh + '<span style="color:' + c.accent + '">:</span>' + t.mm + '</div>'
      + '<svg viewBox="0 0 130 10" width="104" height="9" style="display:block;margin:8px auto 0"><path d="M2 6 Q 22 2 42 5 T 82 5 T 126 5" fill="none" stroke="' + c.accent + '" stroke-width="1" stroke-linecap="round" opacity="0.7" style="filter:' + c.glow + '"></path></svg></div>';
  }

  /* ---------- 渲染（结构层：路由 / 明暗 / 分钟变化时重建） ---------- */
  var lastSig = '';
  function render(force) {
    var dark = isDark(), k = routeKind(), c = pal(dark, k), t = bjTime();
    var sig = k + '|' + dark + '|' + t.hh + t.mm;
    if (!force && sig === lastSig) return;
    lastSig = sig;
    host.setAttribute('data-kind', k);
    host.setAttribute('data-theme', dark ? 'studio' : 'light');
    host.innerHTML =
        k === 'home'  ? (dark ? homeDarkSVG(c, t) : homeLightSVG(c, t))
      : k === 'about' ? homeSVG(c, t)
      : k === 'works' ? worksHTML(c, t)
      :                 journalHTML(c, t);
  }

  /* ---------- 动画层（逐帧：让赭石进度实时流动，不重建结构） ---------- */
  function animate() {
    var k = host.getAttribute('data-kind');
    if (k === 'works') {
      var w = (hourFrac() * WAVE_W).toFixed(2);
      var fill = host.querySelector('.wk-fill');
      var dot = host.querySelector('.wk-dot');
      if (fill) fill.setAttribute('width', w);
      if (dot) { dot.setAttribute('cx', w); dot.setAttribute('cy', waveY(+w).toFixed(2)); }
    } else if (k === 'home') {                   // 明暗两版都有弧，都要推进
      var f = hourFrac();
      var arc = host.querySelector('.arc-fill');
      var adot = host.querySelector('.arc-dot');
      if (arc) arc.setAttribute('stroke-dasharray', f.toFixed(4) + ' 1');
      if (adot) {
        var th = f * 2 * Math.PI;
        adot.setAttribute('cx', (50 + HOME_R * Math.sin(th)).toFixed(2));
        adot.setAttribute('cy', (50 - HOME_R * Math.cos(th)).toFixed(2));
      }
    }
    requestAnimationFrame(animate);
  }

  render(true);
  requestAnimationFrame(animate);
  setInterval(render, 1000);                       // 分钟变化 / 时间到点重建结构
  window.addEventListener('hashchange', function () { render(true); });

  var tg = document.getElementById('theme-toggle');
  if (tg) tg.addEventListener('click', function () { setTimeout(function () { render(true); }, 40); });
  new MutationObserver(function () { render(true); })
    .observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
})();
