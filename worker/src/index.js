// 音频上传中转 Worker —— 浏览器(管理面板) → 这里(校验密码) → R2 桶
//
// 设计：
//   - R2 写密钥永远不进浏览器；浏览器只持有上传密码 UPLOAD_TOKEN（存 localStorage）。
//   - 读取走 r2.dev 公开地址，不经过这个 Worker。
//   - 路径(key)由前端 publish.js 生成（形如 audio/up-xxx.mp3），Worker 只校验前缀白名单。
//
// 接口：
//   GET  /            -> 健康检查 {ok:true}
//   POST /upload      -> 上传一个文件
//        Header  Authorization: Bearer <UPLOAD_TOKEN>
//        Header  X-Upload-Key:   audio/up-xxx.mp3   （目标 key，必须在白名单前缀下）
//        Body    文件原始字节（Content-Type 为该文件的 MIME）
//        返回    {ok:true, key, url, size}
//   OPTIONS /upload   -> CORS 预检
//
// 绑定（见 wrangler.toml）：
//   env.MEDIA        -> R2 桶 justin-media
//   env.UPLOAD_TOKEN -> secret，上传密码
//   env.PUBLIC_BASE  -> var，r2.dev 公开地址（用于回传完整 URL，结尾不带斜杠）

const ALLOWED_PREFIXES = ["audio/", "videos/"];
const MAX_SIZE = 80 * 1024 * 1024; // 80MB 上限，音频远小于此，留余量挡异常大文件

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    // 上传靠 Bearer 密码鉴权、不依赖 cookie，回显来源即可（不带 credentials）
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Upload-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// key 合法性：必须落在白名单前缀下，禁止穿越/反斜杠，字符集受限
function validateKey(key) {
  if (!key) return "缺少 X-Upload-Key";
  if (key.length > 256) return "key 过长";
  if (key.includes("..") || key.includes("\\")) return "key 含非法路径";
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return "key 必须以 " + ALLOWED_PREFIXES.join(" 或 ") + " 开头";
  }
  // 允许：字母数字 . _ - / ；其余拒绝
  if (!/^[a-zA-Z0-9._\-/]+$/.test(key)) return "key 含非法字符";
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method === "GET" && url.pathname === "/") {
      return json(req, 200, { ok: true, service: "justin-media-upload" });
    }

    if (req.method === "POST" && url.pathname === "/upload") {
      // 1. 鉴权
      const auth = req.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!env.UPLOAD_TOKEN) return json(req, 500, { ok: false, error: "服务端未配置 UPLOAD_TOKEN" });
      if (!token || token !== env.UPLOAD_TOKEN) {
        return json(req, 401, { ok: false, error: "上传密码错误或缺失" });
      }

      // 2. 校验 key
      const key = req.headers.get("X-Upload-Key") || "";
      const keyErr = validateKey(key);
      if (keyErr) return json(req, 400, { ok: false, error: keyErr });

      // 3. 大小限制（优先看声明的长度，省得读完才发现超限）
      const declared = Number(req.headers.get("Content-Length") || 0);
      if (declared && declared > MAX_SIZE) {
        return json(req, 413, { ok: false, error: "文件过大（上限 80MB）" });
      }
      if (!req.body) return json(req, 400, { ok: false, error: "请求没有文件内容" });

      // 4. 写入 R2
      const contentType = req.headers.get("Content-Type") || "application/octet-stream";
      const buf = await req.arrayBuffer();
      if (buf.byteLength === 0) return json(req, 400, { ok: false, error: "文件为空" });
      if (buf.byteLength > MAX_SIZE) return json(req, 413, { ok: false, error: "文件过大（上限 80MB）" });

      await env.MEDIA.put(key, buf, {
        httpMetadata: { contentType },
      });

      const base = (env.PUBLIC_BASE || "").replace(/\/+$/, "");
      return json(req, 200, {
        ok: true,
        key,
        size: buf.byteLength,
        url: base ? base + "/" + key : null,
      });
    }

    return json(req, 404, { ok: false, error: "未知路径" });
  },
};
