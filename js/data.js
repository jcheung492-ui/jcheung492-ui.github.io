// ============================================================
// 默认作品清单 —— 想换默认内容,直接改这里
//   category: 'album'(专辑) | 'ad'(广告配乐) | 'game'(游戏配乐)
//             | 'film'(电影,只放封面) | 'sketch'(随手录/demo,首页小区域)
//   可听类(album/ad/game/sketch)需要 src(音源);film 类只要封面
//   sketch 类封面可选(不填 cover 就用个简单的图标位)
//   builtin: true 的来自项目文件;管理模式里可「下架/恢复」
// ============================================================
window.SITE_TRACKS = [
  // ---------- 专辑 ----------
  {
    id: "builtin-morning-mist", category: "album",
    title: "晨雾", en: "Morning Mist", year: "2026", role: "制作 / 编曲 / 混音",
    desc: "写在一个起得很早的清晨。整首歌几乎没有鼓,只想留住窗帘被风吹起的那几秒。占位曲目,请在管理里换成你的作品。",
    src: "audio/morning-mist.wav", cover: "covers/morning-mist.png", builtin: true
  },
  {
    id: "builtin-after-rain", category: "album",
    title: "雨后", en: "After Rain", year: "2025", role: "制作 / 混音",
    desc: "一段安静的铺底,留给雨停之后、还没决定去哪的那段时间。占位曲目。",
    src: "audio/after-rain.wav", cover: "covers/after-rain.png", builtin: true
  },
  {
    id: "builtin-album-seaside", category: "album",
    title: "海边的车站", en: "Seaside Stop", year: "2024", role: "制作 / 编曲",
    desc: "占位曲目。一个没什么人的小站台,火车迟迟不来,反而不想它来。",
    src: "audio/morning-mist.wav", cover: "covers/morning-mist.png", builtin: true
  },
  {
    id: "builtin-album-tenyears", category: "album",
    title: "给十年后的你", en: "To You, Ten Years On", year: "2024", role: "词曲 / 制作",
    desc: "占位曲目。写给还没出现的人的一封信。",
    src: "audio/after-rain.wav", cover: "covers/after-rain.png", builtin: true
  },
  {
    id: "builtin-album-spring", category: "album",
    title: "未命名的春天", en: "An Unnamed Spring", year: "2023", role: "制作 / 混音",
    desc: "占位曲目。还没取好名字,但已经是最喜欢的一首。",
    src: "audio/late-bus-home.wav", cover: "covers/late-bus-home.png", builtin: true
  },
  // ---------- 广告配乐 ----------
  {
    id: "builtin-late-bus-home", category: "ad",
    title: "末班车", en: "Late Bus Home", year: "2025", role: "广告配乐 / 30s",
    desc: "为一支夜归主题的短片写的配乐,温暖、克制,不抢画面。占位曲目。",
    src: "audio/late-bus-home.wav", cover: "covers/late-bus-home.png", builtin: true
  },
  {
    id: "builtin-ad-summer", category: "ad",
    title: "盛夏汽水", en: "Midsummer Soda", year: "2025", role: "广告配乐 / 15s",
    desc: "占位曲目。一支气泡水 TVC,要的就是那口凉。",
    src: "audio/morning-mist.wav", cover: "covers/morning-mist.png", builtin: true
  },
  {
    id: "builtin-ad-run", category: "ad",
    title: "城市夜跑", en: "City Night Run", year: "2024", role: "广告配乐 / 30s",
    desc: "占位曲目。运动品牌短片,节奏跟着脚步走。",
    src: "audio/late-bus-home.wav", cover: "covers/late-bus-home.png", builtin: true
  },
  {
    id: "builtin-ad-home", category: "ad",
    title: "回家的路", en: "The Way Home", year: "2023", role: "广告配乐 / 60s",
    desc: "占位曲目。节日品牌片,温暖为主。",
    src: "audio/after-rain.wav", cover: "covers/after-rain.png", builtin: true
  },
  // ---------- 游戏配乐 ----------
  {
    id: "builtin-pixel-dawn", category: "game",
    title: "像素拂晓", en: "Pixel Dawn", year: "2024", role: "游戏配乐 / 循环",
    desc: "一段可无缝循环的探索场景 BGM,像素风小游戏的清晨地图。占位曲目。",
    src: "audio/morning-mist.wav", cover: "covers/morning-mist.png", builtin: true
  },
  {
    id: "builtin-game-forest", category: "game",
    title: "迷雾森林", en: "Misty Woods", year: "2024", role: "游戏配乐 / 场景",
    desc: "占位曲目。解谜游戏的森林关,有点神秘但不吓人。",
    src: "audio/after-rain.wav", cover: "covers/after-rain.png", builtin: true
  },
  {
    id: "builtin-game-star", category: "game",
    title: "星海", en: "Sea of Stars", year: "2023", role: "游戏配乐 / 主题",
    desc: "占位曲目。太空题材独立游戏的主题曲。",
    src: "audio/late-bus-home.wav", cover: "covers/late-bus-home.png", builtin: true
  },
  {
    id: "builtin-game-dusk", category: "game",
    title: "像素黄昏", en: "Pixel Dusk", year: "2022", role: "游戏配乐 / 循环",
    desc: "占位曲目。《像素拂晓》的黄昏版本。",
    src: "audio/morning-mist.wav", cover: "covers/morning-mist.png", builtin: true
  },
  // ---------- 电影(只放封面) ----------
  {
    id: "builtin-old-town", category: "film",
    title: "旧城纪事", en: "Old Town, A Diary", year: "2025", role: "原创配乐 / 文艺片",
    desc: "一部讲述老城拆迁前最后一个夏天的独立电影。我为它写了主题与全片配乐——这里只放海报,完整版权在片方,暂不外放音源。",
    cover: "covers/old-town.png", builtin: true
  },
  {
    id: "builtin-last-summer", category: "film",
    title: "夏天的尾巴", en: "The Tail of Summer", year: "2023", role: "配乐 / 短片",
    desc: "毕业季短片。用了很多真实环境声和一把跑调的吉他,想留住那种「明明还在,却已经在告别」的感觉。",
    cover: "covers/last-summer.png", builtin: true
  },
  {
    id: "builtin-film-confession", category: "film",
    title: "无声告白", en: "A Quiet Confession", year: "2024", role: "配乐 / 剧情长片",
    desc: "占位作品。一部关于沉默与误解的家庭片,配乐几乎不出声,只在最需要的地方响一下。",
    cover: "covers/old-town.png", builtin: true
  },
  {
    id: "builtin-film-migrant", category: "film",
    title: "候鸟", en: "Migrant Birds", year: "2022", role: "原创配乐 / 纪录片",
    desc: "占位作品。跟拍一群候鸟与一座城市的纪录片,配乐里有很多风声与远处的人声。",
    cover: "covers/last-summer.png", builtin: true
  },
  // ---------- 随手录 / demo(首页小区域,封面可选) ----------
  {
    id: "builtin-sketch-late-cover", category: "sketch",
    title: "深夜翻唱", en: "Late Cover",
    desc: "凌晨两点,用一把吉他翻了首老歌,只录了一条就舍不得删。",
    src: "audio/after-rain.wav", builtin: true
  },
  {
    id: "builtin-sketch-three-chords", category: "sketch",
    title: "三个和弦的下午", en: "Three Chords",
    desc: "午休时哼出来的动机,可能哪天会变成某首歌的副歌。",
    src: "audio/morning-mist.wav", builtin: true
  },
  {
    id: "builtin-sketch-subway", category: "sketch",
    title: "地铁里的旋律", en: "Subway Tune",
    desc: "在地铁上突然想到的一段,赶紧哼进了手机备忘录。",
    src: "audio/late-bus-home.wav", builtin: true
  }
];

// 分类的展示信息(标题 / 英文) —— 每个分区的「介绍语」改到管理面板「站点文案」里(键 cat.*.intro,默认值在 js/sitetext.js)
window.SITE_CATEGORIES = [
  { key: "album", label: "专辑", en: "Albums" },
  { key: "ad", label: "广告配乐", en: "Advertising" },
  { key: "game", label: "游戏配乐", en: "Game Scores" },
  { key: "film", label: "电影", en: "Film" }
];

// 随笔(Journal)默认 3 篇 —— 管理面板可增删改;发布后存进 SITE_JOURNAL_PUBLISHED
//   date: 显示日期(随便写,如 2026.05.28);title: 小标题;body: 正文
window.SITE_JOURNAL = [
  { id: "j-ears", date: "2026.05.28", title: "关于加班后的耳朵",
    body: "混了一整天别人的歌，下班路上反而什么都不想听。可走到楼下，听见有人在练萨克斯，跑调跑得很认真——突然觉得，这才是我最开始喜欢音乐的样子。" },
  { id: "j-rain", date: "2026.04.13", title: "雨天适合写桥段",
    body: "不知道为什么，主歌和副歌都可以在晴天写，但桥段一定要等下雨。可能桥段本来就是歌里那段「说真话」的部分吧。" },
  { id: "j-newyear", date: "2026.02.07", title: "新年第一首 demo",
    body: "每年的第一首 demo 都会写得特别小心，像在新本子的第一页写字。今年的第一首还没有名字，但我知道它是写给去年没说出口的那些「谢谢」的。" }
];

// 图廊(Journal 里的「光影」子模块)—— 风景 / 工作照
//   src: 图片路径(放进 gallery/ 文件夹);caption: 点开后显示的一行介绍
window.SITE_GALLERY = [
  { id: "g1", src: "gallery/g1.png", caption: "清晨的城郊,雾还没散。这种灰绿色后来变成了《晨雾》的底色。" },
  { id: "g2", src: "gallery/g2.png", caption: "录音间歇,夕阳正好打在调音台上。那天什么都没录成,但舍不得走。" },
  { id: "g3", src: "gallery/g3.png", caption: "出差路上的一片海。耳机里在放自己还没混完的 demo。" },
  { id: "g4", src: "gallery/g4.png", caption: "工作室窗台的下午。一杯凉掉的咖啡,和一段循环了五十遍的副歌。" },
  { id: "g5", src: "gallery/g5.png", caption: "山里的民宿,没有信号,只有一把吉他。写了三首歌。" },
  { id: "g6", src: "gallery/g6.png", caption: "黄昏的天台。城市的噪音其实也有它的节奏。" }
];
