// ============================================================
// 极简前端路由 —— 像独立页面一样切换,顶部 banner 与播放器常驻
// 用 hash(#/works 等),浏览器前进/后退都正常,播放不中断
// ============================================================
(function () {
  const PAGES = ["home", "works", "sketches", "journal", "about", "guestbook", "contact", "catdetail"];
  const TITLES = {
    home: "Justin’s Space",
    works: "Works · Justin’s Space",
    sketches: "Sketches · Justin’s Space",
    journal: "Journal · Justin’s Space",
    about: "About · Justin’s Space",
    guestbook: "Guestbook · Justin’s Space",
    contact: "Contact · Justin’s Space"
  };

  function show(name, active) {
    if (!PAGES.includes(name)) name = "home";
    document.querySelectorAll(".page").forEach((p) => {
      p.hidden = p.id !== "page-" + name;
    });
    const navKey = active || name;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.nav === navKey);
    });
    document.title = TITLES[name] || TITLES.home;
    window.scrollTo({ top: 0, behavior: "auto" });
    if (name === "works" && window.playerApp) window.playerApp.refresh();
    if (name === "sketches" && window.playerApp) window.playerApp.refresh();
    if (name === "guestbook" && window.guestbookApp) window.guestbookApp.render();
  }

  function route() {
    const raw = location.hash.replace(/^#\/?/, "");
    const parts = raw.split("/");
    if (parts[0] === "cat" && parts[1]) {
      // 分类详情页:先确保曲库已加载,再渲染该分类
      show("catdetail", "works");
      if (window.playerApp) {
        Promise.resolve(window.playerApp.refresh()).then(function () {
          window.playerApp.renderCategoryPage(parts[1]);
        });
      }
      return;
    }
    show(parts[0] || "home");
  }

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", route);
  window.siteRouter = { go: (n) => { location.hash = "#/" + n; } };
})();
