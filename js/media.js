// ============================================================
// 媒体地址解析 —— 把仓库相对路径(audio/、videos/) 指向 Cloudflare R2
// ============================================================
// 设计：published.js / data.js 里仍存相对路径(如 "audio/up-xxx.mp3")；
// 渲染时由 resolveMedia() 拼成 R2 完整 URL。封面(covers/)、图廊(gallery/)
// 本阶段仍留仓库，不改写。
//
// 回退：把 MEDIA_BASE 置为空字符串 ""，所有媒体立刻退回「从仓库读」，
//       发布也会改回把音频塞进 git（见 publish.js 的 blobToTree）。
(function () {
  // R2 公开读取地址（Public Development URL），结尾不带斜杠。
  window.MEDIA_BASE = "https://pub-22e48f3da3c74cabbfdd79aec53da6ad.r2.dev";

  // 上传中转 Worker 地址（管理面板发布音频时 POST 到这里），结尾不带斜杠。
  window.MEDIA_UPLOAD_URL = "https://justin-upload.justin-baixing.workers.dev";

  // 只把 audio/ videos/ 开头的相对路径搬到 R2；其余(covers/ 等)留原样。
  window.resolveMedia = function (path) {
    if (!path) return path;
    const s = String(path).trim();
    // 已是绝对地址 / blob / data，原样返回
    if (/^(https?:)?\/\//i.test(s) || s.startsWith("blob:") || s.startsWith("data:")) return s;
    if (!window.MEDIA_BASE) return s; // 回退：空 base 即从仓库读
    const rel = s.replace(/^\/+/, "");
    if (/^(audio|videos)\//i.test(rel)) {
      return window.MEDIA_BASE.replace(/\/+$/, "") + "/" + rel;
    }
    return s;
  };
})();
