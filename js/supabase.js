// ============================================================
// Supabase 配置 + 极简 REST 客户端
//   评论(comments)和留言板(guestbook)的数据存这里,所有访客共享。
//   URL 和 publishable key 都是「可公开」的浏览器密钥,数据安全靠 Supabase 的
//   行级安全(RLS)规则保证:任何人可读、可发,但不能改/删别人的。
// ============================================================
(function () {
  const URL = "https://tycsoiozxncmoizlpeom.supabase.co";
  const KEY = "sb_publishable_gP8Oi0brLvWGiasqyHfxUQ_33a8RcQF";

  const base = URL.replace(/\/+$/, "") + "/rest/v1/";
  function headers(extra) {
    return Object.assign({ "apikey": KEY, "Authorization": "Bearer " + KEY }, extra || {});
  }

  window.supa = {
    ok: !!(URL && KEY),

    // GET /rest/v1/<table><query>   query 形如 "?select=*&order=created_at.asc"
    async select(table, query) {
      const res = await fetch(base + table + (query || ""), { headers: headers() });
      if (!res.ok) throw new Error("读取失败(" + res.status + ")");
      return res.json();
    },

    // POST 插入一行,返回插入后的记录
    async insert(table, row) {
      const res = await fetch(base + table, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json", "Prefer": "return=representation" }),
        body: JSON.stringify(row)
      });
      if (!res.ok) {
        let m = String(res.status);
        try { const j = await res.json(); if (j.message) m = j.message; } catch (e) {}
        throw new Error(m);
      }
      return res.json();
    }
  };
})();
