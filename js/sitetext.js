// ============================================================
// 站点文案 textLib —— 让首页/关于/联系等页面的固定文字可在管理面板编辑
//   数据流与 musicLib / galleryLib 同构（默认 → 线上 → 本地草稿 → 发布）:
//     1) 默认值  下方 TEXT_FIELDS 里的 def           (改默认就改这里)
//     2) 线上    window.SITE_TEXT (js/published.js)   面板发布后写入,只存「与默认不同」的键
//     3) 草稿    localStorage["bx-text-draft"]        面板里改了、尚未发布,只本机可见
//   页面元素用 data-text="键名" 标记,加载时由 render() 注入。
//   富文本(rich)支持极简标记:换行→<br>、*斜体*→<em>、**加粗**→<strong>。
// ============================================================
(function () {
  const DRAFT_KEY = "bx-text-draft";

  // ---- 可编辑文案注册表：key / 分组 / 标签 / 控件类型 / 是否富文本 / 默认值 ----
  // type: "text"(单行) | "textarea"(多行)；rich:true 时支持 * ** 与换行
  const TEXT_FIELDS = [
    // —— 首页 Hero ——
    { key: "home.hero.kicker", group: "首页 · Hero", label: "小标题(kicker)", type: "text", def: "Hello, I make music" },
    { key: "home.hero.title", group: "首页 · Hero", label: "大标题", type: "textarea", rich: true, def: "不用说话。\n坐一会儿，\n*把肩膀慢慢放下来*。" },
    { key: "home.hero.line", group: "首页 · Hero", label: "自我介绍那句", type: "textarea", rich: true, def: "我是 Justin，振钧、百星，都是我。可以随便听听，也可以留句话。*别急*。" },
    { key: "home.hero.roles", group: "首页 · Hero", label: "角色标签(用 / 分隔)", type: "text", def: "Producer / Arranger / Mixing Engineer" },
    { key: "home.hero.cta1", group: "首页 · Hero", label: "主按钮文字", type: "text", def: "听听我的作品" },
    { key: "home.hero.cta2", group: "首页 · Hero", label: "次按钮文字", type: "text", def: "关于我" },
    { key: "home.portrait.caption", group: "首页 · Hero", label: "头像说明", type: "text", def: "张百星 / Justin" },

    // —— 首页三入口 ——
    { key: "home.strip.works", group: "首页 · 三入口", label: "Works 说明", type: "text", def: "专辑、广告与游戏配乐、电影" },
    { key: "home.strip.journal", group: "首页 · 三入口", label: "Journal 说明", type: "text", def: "生活，和一些没写进歌里的话" },
    { key: "home.strip.guestbook", group: "首页 · 三入口", label: "Guestbook 说明", type: "text", def: "音乐树洞 · 说点什么都行" },

    // —— 作品页 ——
    { key: "works.kicker", group: "作品页", label: "小标题", type: "text", def: "Works" },
    { key: "works.title", group: "作品页", label: "标题", type: "text", def: "作品" },
    { key: "works.sub", group: "作品页", label: "副标题", type: "textarea", def: "专辑、广告配乐、游戏配乐可以直接听；电影部分只放海报与一段文字。" },

    // —— 随手录页 ——
    { key: "sketches.kicker", group: "随手录页", label: "小标题", type: "text", def: "Sketchbook" },
    { key: "sketches.title", group: "随手录页", label: "标题", type: "text", def: "灵感草稿" },
    { key: "sketches.intro", group: "随手录页", label: "介绍", type: "textarea", def: "最近的翻唱、路上哼出来的动机、来不及做完的奇思妙想。不是成品,只是不想让它们安静地消失。" },

    // —— 随笔页 / 光影 ——
    { key: "journal.kicker", group: "随笔页 · 光影", label: "随笔小标题", type: "text", def: "Journal" },
    { key: "journal.title", group: "随笔页 · 光影", label: "随笔标题", type: "text", def: "生活，和一些没写进歌里的话" },
    { key: "journal.sub", group: "随笔页 · 光影", label: "随笔副标题", type: "textarea", def: "不定期更新的小随笔。想改、想加,直接编辑这一段的文字就好。" },
    { key: "gallery.kicker", group: "随笔页 · 光影", label: "光影小标题", type: "text", def: "Gallery" },
    { key: "gallery.title", group: "随笔页 · 光影", label: "光影标题", type: "text", def: "光影" },
    { key: "gallery.sub", group: "随笔页 · 光影", label: "光影副标题", type: "textarea", def: "一些我觉得好看的风景和工作照。点开任意一张,有一行字。" },

    // —— 关于页 ——
    { key: "about.kicker", group: "关于页", label: "小标题", type: "text", def: "About" },
    { key: "about.title", group: "关于页", label: "标题", type: "text", def: "关于我" },
    { key: "about.sub", group: "关于页", label: "副标题", type: "text", def: "一个在公司上班的音乐人。" },
    { key: "about.portrait.caption", group: "关于页", label: "照片说明", type: "text", def: "工作室的某个下午" },
    { key: "about.p1", group: "关于页", label: "正文 1", type: "textarea", rich: true, def: "**张百星（Justin）**，音乐人，制作人。白天在公司做音频相关的工作，是同事眼里「管声音的人」；下班以后继续做音乐，是自己。" },
    { key: "about.p2", group: "关于页", label: "正文 2", type: "textarea", rich: true, def: "主要做**编曲、制作和混音**。华语流行、配乐、Ballad——不算固定，也许你可以和我聊聊你喜欢啥？" },
    { key: "about.p3", group: "关于页", label: "正文 3", type: "textarea", rich: true, def: "如果你有一首写到一半的歌、一段不知道怎么处理的旋律，或者只是想找人聊聊音乐，都欢迎来找我。我回消息可能慢，但一定会回。" },
    { key: "about.fact1.dt", group: "关于页 · 信息", label: "第1项 名称", type: "text", def: "角色" },
    { key: "about.fact1.dd", group: "关于页 · 信息", label: "第1项 内容", type: "text", def: "制作人 / 编曲 / 混音工程师" },
    { key: "about.fact2.dt", group: "关于页 · 信息", label: "第2项 名称", type: "text", def: "常驻" },
    { key: "about.fact2.dd", group: "关于页 · 信息", label: "第2项 内容", type: "text", def: "中国 · 深圳" },
    { key: "about.fact3.dt", group: "关于页 · 信息", label: "第3项 名称", type: "text", def: "合作方式" },
    { key: "about.fact3.dd", group: "关于页 · 信息", label: "第3项 内容", type: "text", def: "远程为主,可约线下;先聊歌,再聊别的" },
    { key: "about.fact4.dt", group: "关于页 · 信息", label: "第4项 名称", type: "text", def: "最近在做" },
    { key: "about.fact4.dd", group: "关于页 · 信息", label: "第4项 内容", type: "text", def: "夏日企划" },

    // —— 留言板页 ——
    { key: "guestbook.kicker", group: "留言板页", label: "小标题", type: "text", def: "Guestbook" },
    { key: "guestbook.title", group: "留言板页", label: "标题", type: "text", def: "留言板" },
    { key: "guestbook.sub", group: "留言板页", label: "副标题", type: "text", def: "路过的话，留个名字、说句话吧。" },

    // —— 联系页 ——
    { key: "contact.kicker", group: "联系页", label: "小标题", type: "text", def: "Contact" },
    { key: "contact.title", group: "联系页", label: "标题", type: "text", def: "找到我" },
    { key: "contact.sub", group: "联系页", label: "副标题", type: "text", def: "关于合作、关于歌，或者只是打个招呼。" },
    { key: "contact.email.label", group: "联系页 · Email", label: "卡片标题", type: "text", def: "Email" },
    { key: "contact.email.value", group: "联系页 · Email", label: "邮箱地址(也是点击链接)", type: "text", def: "hello@justinzhang.example" },
    { key: "contact.email.sub", group: "联系页 · Email", label: "小字", type: "text", def: "最稳妥的方式,24–48 小时内回复" },
    { key: "contact.wechat.label", group: "联系页 · 微信", label: "卡片标题", type: "text", def: "微信" },
    { key: "contact.wechat.value", group: "联系页 · 微信", label: "微信号", type: "text", def: "justin_bx(改成你的)" },
    { key: "contact.wechat.sub", group: "联系页 · 微信", label: "小字", type: "text", def: "加好友时备注「音乐」会更快通过" },
    { key: "contact.listen.label", group: "联系页 · 听歌", label: "卡片标题", type: "text", def: "听我的歌" },
    { key: "contact.listen.text", group: "联系页 · 听歌", label: "链接文字", type: "text", def: "网易云音乐 · 待填链接" },
    { key: "contact.listen.url", group: "联系页 · 听歌", label: "链接地址(URL)", type: "text", def: "#/works" },
    { key: "contact.listen.sub", group: "联系页 · 听歌", label: "小字", type: "text", def: "也可以换成 QQ 音乐 / B 站 / 小红书" },

    // —— 页脚 ——
    { key: "footer.copy", group: "页脚", label: "版权那行", type: "text", def: "© 2026 张百星 Justin · 谢谢你听到这里" }
  ];

  const FIELD_MAP = new Map(TEXT_FIELDS.map((f) => [f.key, f]));

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  // 富文本极简标记 -> 安全 HTML（先整体转义，再放行 * ** 与换行）
  function renderRich(s) {
    let h = esc(s);
    h = h.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
    h = h.replace(/\n/g, "<br>");
    return h;
  }

  function defOf(key) {
    const f = FIELD_MAP.get(key);
    return f ? (f.def || "") : "";
  }
  // 线上生效值：已发布覆盖 > 默认
  function liveOf(key) {
    const pub = window.SITE_TEXT;
    if (pub && Object.prototype.hasOwnProperty.call(pub, key)) return pub[key];
    return defOf(key);
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveDraft(obj) {
    if (obj && Object.keys(obj).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
    else localStorage.removeItem(DRAFT_KEY);
  }

  // 当前生效值：草稿 > 线上 > 默认
  function get(key) {
    const d = loadDraft();
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return liveOf(key);
  }

  // 写一条草稿；与线上一致时自动撤掉（草稿只保留「真的改了」的键）
  function setDraft(key, val) {
    const d = loadDraft();
    if (String(val) === String(liveOf(key))) delete d[key];
    else d[key] = String(val);
    saveDraft(d);
  }

  // 把页面里所有 data-text / data-text-list / data-href-key 注入成当前值
  function render() {
    document.querySelectorAll("[data-text]").forEach((el) => {
      const key = el.getAttribute("data-text");
      const f = FIELD_MAP.get(key);
      const val = get(key);
      if (f && f.rich) el.innerHTML = renderRich(val);
      else el.textContent = val;
    });
    document.querySelectorAll("[data-text-list]").forEach((el) => {
      const val = get(el.getAttribute("data-text-list"));
      el.innerHTML = val.split("/").map((s) => "<span>" + esc(s.trim()) + "</span>").join("");
    });
    document.querySelectorAll("[data-href-key]").forEach((el) => {
      const prefix = el.getAttribute("data-href-prefix") || "";
      el.setAttribute("href", prefix + (get(el.getAttribute("data-href-key")) || ""));
    });
  }

  window.textLib = {
    // 给管理面板：分组后的字段列表
    fieldGroups() {
      const order = [];
      const map = new Map();
      for (const f of TEXT_FIELDS) {
        if (!map.has(f.group)) { map.set(f.group, []); order.push(f.group); }
        map.get(f.group).push(f);
      }
      return order.map((g) => ({ group: g, fields: map.get(g) }));
    },
    get, setDraft, render,
    getDrafts() { return loadDraft(); },
    // 未发布的文案改动条数
    pendingCount() { return Object.keys(loadDraft()).length; },
    hasLocalChanges() { return this.pendingCount() > 0; },
    // 发布时写进 published.js 的对象：线上覆盖 ⊕ 草稿，去掉与默认相同的键（保持文件精简）
    getMergedForPublish() {
      const cur = (window.SITE_TEXT && typeof window.SITE_TEXT === "object") ? window.SITE_TEXT : {};
      const merged = Object.assign({}, cur, loadDraft());
      const out = {};
      Object.keys(merged).forEach((k) => {
        if (String(merged[k]) !== String(defOf(k))) out[k] = merged[k];
      });
      return out;
    },
    clearLocalAfterPublish() { localStorage.removeItem(DRAFT_KEY); }
  };

  document.addEventListener("DOMContentLoaded", render);
})();
