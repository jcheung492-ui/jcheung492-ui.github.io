// ============================================================
// Tweaks 面板 —— 中文字体 / 点缀色 / 纸色 / 纸纹
// 改动写进 :root 的 CSS 变量,刷新后仍保留
// ============================================================
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "cjkFont": "思源宋体",
  "accent": "#a96a3c",
  "paper": "#f7f3ec",
  "texture": true,
  "dark": false,
  "sketchName": "灵感草稿 · Sketchbook",
  "sketchBtnStyle": "淡色填充"
}/*EDITMODE-END*/;

// 「灵感草稿」板块的名字备选 —— 中文显在页面标题,英文显在导航按钮
const SKETCH_NAMES = {
  "灵感草稿 · Sketchbook": { cn: "灵感草稿", en: "Sketchbook" },
  "信手集 · Offhand": { cn: "信手集", en: "Offhand" },
  "随手录 · Sketches": { cn: "随手录", en: "Sketches" },
  "灵感簿 · Sparks": { cn: "灵感簿", en: "Sparks" },
  "哼唱集 · Hums": { cn: "哼唱集", en: "Hums" },
  "草稿箱 · Drafts": { cn: "草稿箱", en: "Drafts" }
};

// 导航按钮的几套样式 —— 对应 css 里的 class
const BTN_STYLES = {
  "淡色填充": "cta-soft",
  "描边药丸": "cta-outline",
  "下划线": "cta-underline",
  "方括号": "cta-bracket"
};

const ACCENTS = ["#a96a3c", "#7c8a6a", "#6c7f96", "#9a6b74"]; // 落日橘 / 苔绿 / 雾蓝 / 干玫瑰
const PAPERS = ["#f7f3ec", "#f3f2ee", "#f6f0e4"];             // 暖米白 / 雾白 / 旧信纸

// 三款中文字体,都偏文艺、适合阅读
const CJK_FONTS = {
  "霞鹜文楷": '"LXGW WenKai", "Noto Serif SC", serif',   // 温润书卷感,推荐
  "思源宋体": '"Noto Serif SC", "Songti SC", serif',     // 经典宋体
  "站酷小薇": '"ZCOOL XiaoWei", "Noto Serif SC", serif'  // 清瘦秀气
};

function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent", t.accent);
    r.setProperty("--accent-soft", t.accent + "1f");
    if (window.setStudioTheme) {
      window.setStudioTheme(!!t.dark, { paper: t.paper, persist: false });
    } else {
      document.body.classList.toggle("theme-dark", !!t.dark);
      r.setProperty("--paper", t.dark ? "#1a1714" : t.paper);
    }
    const cjk = CJK_FONTS[t.cjkFont] || CJK_FONTS["霞鹜文楷"];
    r.setProperty("--font-cjk", cjk);
    document.body.classList.toggle("texture-on", !!t.texture);

    // 灵感草稿板块名字:导航按钮(英) + 页面标题(中) + kicker(英)
    const pair = SKETCH_NAMES[t.sketchName] || SKETCH_NAMES["灵感草稿 · Sketchbook"];
    const navEl = document.getElementById("nav-sketches");
    const kickEl = document.getElementById("sketches-kicker");
    const titleEl = document.getElementById("sketches-title");
    if (navEl) navEl.textContent = pair.en;
    if (kickEl) kickEl.textContent = pair.en;
    if (titleEl) titleEl.textContent = pair.cn;

    // 导航按钮样式
    const style = BTN_STYLES[t.sketchBtnStyle] || "cta-soft";
    if (navEl) {
      navEl.classList.remove("cta-soft", "cta-outline", "cta-underline", "cta-bracket");
      navEl.classList.add(style);
    }
  }, [t]);

  return (
    <TweaksPanel>
      <TweakSection label="中文字体"></TweakSection>
      <TweakRadio label="正文字体" value={t.cjkFont}
                  options={["霞鹜文楷", "思源宋体", "站酷小薇"]}
                  onChange={(v) => setTweak("cjkFont", v)}></TweakRadio>
      <TweakSection label="颜色"></TweakSection>
      <TweakColor label="点缀色" value={t.accent} options={ACCENTS}
                  onChange={(v) => setTweak("accent", v)}></TweakColor>
      <TweakColor label="纸色" value={t.paper} options={PAPERS}
                  onChange={(v) => setTweak("paper", v)}></TweakColor>
      <TweakSection label="质感"></TweakSection>
      <TweakToggle label="纸纹颗粒" value={t.texture}
                   onChange={(v) => setTweak("texture", v)}></TweakToggle>
      <TweakToggle label="暗色 Studio" value={t.dark}
                   onChange={(v) => setTweak("dark", v)}></TweakToggle>
      <TweakSection label="「灵感草稿」入口"></TweakSection>
      <TweakSelect label="板块名字" value={t.sketchName}
                   options={Object.keys(SKETCH_NAMES)}
                   onChange={(v) => setTweak("sketchName", v)}></TweakSelect>
      <TweakRadio label="按钮样式" value={t.sketchBtnStyle}
                  options={Object.keys(BTN_STYLES)}
                  onChange={(v) => setTweak("sketchBtnStyle", v)}></TweakRadio>
    </TweaksPanel>
  );
}

(function mountTweaks() {
  const host = document.createElement("div");
  host.id = "tweaks-root";
  document.body.appendChild(host);
  ReactDOM.createRoot(host).render(<TweaksApp></TweaksApp>);
})();
