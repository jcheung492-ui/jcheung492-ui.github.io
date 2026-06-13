# 张百星 Justin · 个人音乐主页

一个纯静态、可开源的个人音乐人落地页。无需构建工具，浏览器直接打开 `index.html` 即可。

## 文件结构

```
index.html        单页外壳 + 各页面内容(文案都在这里,直接改文字即可)
css/site.css      全部样式;颜色字体集中在文件顶部 :root 变量
js/data.js        默认作品清单 + 分类定义(标题/介绍/分类/音源/封面)
js/library.js     音源库:上传的作品存在浏览器 IndexedDB
js/player.js      作品渲染(分类) + 常驻播放器
js/router.js      页面切换(Works/Journal/About/Guestbook/Contact)
js/admin.js       管理模式(上架/下架/删除,支持分类)
js/guestbook.js   留言板(存访客自己的 localStorage)
js/gallery.js     光影图廊(Journal 子模块) + 大图灯箱
js/comments.js    作品评论区(专辑/广告/游戏 每首一个,存 localStorage)
js/tweaks.jsx     Tweaks 面板(中文字体/点缀色/纸色/纸纹)
audio/            音源文件(目前是占位音频,可换成 mp3)
covers/           封面(与音源配套)
gallery/          光影图廊的图片(可换成你的风景/工作照)
```

## 页面与作品分类

- 顶部 banner 与底部播放器**常驻**，点导航在 Works / Journal / About / Guestbook / Contact 间切换，**切页不打断播放**（基于 URL hash，前进后退正常）。
- 作品分四类：**专辑 / 广告配乐 / 游戏配乐**（可直接试听）+ **电影**（只放海报与文字介绍）。分类的标题与介绍语在 `js/data.js` 的 `SITE_CATEGORIES` 里改。
- **每类只显 Top 3**，超过 3 件时右下角出现「查看全部」，点进去是该分类的完整页面（路由 `#/cat/<分类>`，排版与作品页一致）。
- **Journal 里有一个「光影」图廊子模块**：网格铺开风景/工作照，点任意一张弹出大图 + 一行文字（← → 切换、Esc 关闭）。图片与文字在 `js/data.js` 的 `SITE_GALLERY` 里改。
- 导航栏最右侧有一个独立的「**随手录**」页面（按钮比其它导航项稍显眼一点，但不过分强调），放翻唱和 demo。这个分类叫 `sketch`，**封面可选**（不填就显示一个音符图标），不带评论区。板块名字可在右上 Tweaks 面板的「『随手录』板块名字」里换（信手集 / 随手录 / 灵感簿 / 哼唱集 / 草稿箱 / 余音），换名会同时改导航按钮和页面标题。

## 中文字体

右上 Tweaks 面板可在三款字体间切换：**思源宋体**（默认）/ **霞鹜文楷**（温润书卷感）/ **站酷小薇**。想换默认字体改 `js/tweaks.jsx` 顶部的 `TWEAK_DEFAULTS.cjkFont` 即可。

## 作品评论区

可听的三类（专辑 / 广告配乐 / 游戏配乐）每首作品下面都有一个可展开的「评论」区。访客**第一次**留言时会被引导给自己起个名字，之后同一位访客再评论会**自动沿用**这个名字（可随时点「改名」修改）。同样是本地版，接后端时改 `js/comments.js` 的 `load()/save()` 即可。

## 怎么改内容

- **改文字**：直接编辑 `index.html`，所有文案都是普通 HTML。
- **改颜色/字体**：编辑 `css/site.css` 顶部的 `:root` 变量，或用页面的 Tweaks 面板。
- **永久上架一条作品**：把 mp3 放进 `audio/`、封面放进 `covers/`，然后在 `js/data.js` 的 `SITE_TRACKS` 里照格式加一条（注意填 `category`：album / ad / game / film / sketch）。
- **临时上架（只在自己浏览器里）**：页脚点「⚙ 管理」，选分类、填信息、上传封面（专辑/广告/游戏还需音频；电影类可只放封面）。
- **下架 / 删除**：管理面板里每条作品后面都有按钮。

## 注意

- 管理模式上传的作品和留言板的留言都保存在**当前浏览器**里；公开发布时请用 `js/data.js` 的方式上架正式作品。
- 留言板目前是本地版，接入真实后端（如 Supabase / LeanCloud / 自建接口）时，改 `js/guestbook.js` 的 `load()/save()` 两个函数即可。
- 部署：任何静态托管都可以（GitHub Pages / Vercel / Netlify），整个文件夹原样上传。

## 许可

MIT —— 欢迎自由使用与修改。
