# justin-upload —— 音频上传中转 Worker

把管理面板里上传的音频写进 R2 桶 `justin-media`。R2 密钥不进浏览器，浏览器只持有上传密码（`UPLOAD_TOKEN`）。

## 部署步骤

```bash
# 1. 安装工具（全局，一次即可）
npm install -g wrangler

# 2. 登录（弹浏览器授权你的 Cloudflare 账号）
wrangler login

# 3. 进入本目录
cd worker

# 4. 设置上传密码（提示时输入一个你自己定的长密码，自己记住）
wrangler secret put UPLOAD_TOKEN

# 5. 部署
wrangler deploy
```

部署成功后会打印一条地址，形如：

```
https://justin-upload.<你的子域>.workers.dev
```

**把这条地址给我** —— 它要填进前端（`publish.js` 的上传接口）。
上传密码**不用给我**，你在管理面板里填一次（存浏览器 localStorage，和 GitHub Token 同一种存法）。

## 自测（可选）

```bash
# 健康检查，应返回 {"ok":true,...}
curl https://justin-upload.<你的子域>.workers.dev/

# 试传一个文件（把 TOKEN 换成你设的密码）
curl -X POST https://justin-upload.<你的子域>.workers.dev/upload \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Upload-Key: audio/test-upload.mp3" \
  -H "Content-Type: audio/mpeg" \
  --data-binary @某个文件.mp3
# 应返回 {"ok":true,"key":"audio/test-upload.mp3","url":"https://pub-...r2.dev/audio/test-upload.mp3",...}
```

## 接口约定（给前端对接用）

| 项 | 值 |
|---|---|
| 上传 | `POST /upload` |
| 鉴权 | `Authorization: Bearer <UPLOAD_TOKEN>` |
| 目标路径 | `X-Upload-Key: audio/up-xxx.mp3`（前端 publish.js 生成，须以 `audio/` 或 `videos/` 开头） |
| 文件 | 请求 body 原始字节，`Content-Type` = 文件 MIME |
| 返回 | `{ ok, key, url, size }` |
| 上限 | 80MB |

回退：前端 `MEDIA_BASE` 置空即恢复成「从 GitHub 仓库读」，与本 Worker 无关。
