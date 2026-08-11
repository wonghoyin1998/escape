# 警務資訊系統 — PWA App 模式 Patch

將以下 4 個檔案放入 GitHub repo 的 `public/`：

- `app.webmanifest`
- `sw.js`
- `icon-192.svg`
- `icon-512.svg`

然後修改 `public/index.html`。

## 在 `<head>` 內加入

```html
<!-- PWA -->
<link rel="manifest" href="/app.webmanifest">
<meta name="theme-color" content="#06101a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="警務系統">
```

## 在 `</body>` 前加入

```html
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
</script>
```

Commit 後，Render 重新 deploy。

Service worker 特別排除 `/api/`，所以囚犯查詢與後台資料仍會讀取 Render / PostgreSQL 最新資料，不會因 PWA cache 而停留在舊資料。
