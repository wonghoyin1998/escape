# 警務資訊系統｜Render 同步版 v3

## 登入
- 玩家：`130`
- 後台：`1357924680`
- 同一個登入欄；不設 SYS-ADMIN 按鈕。

## 同步
後台資料不再存於 localStorage，而是 Render PostgreSQL。
任何裝置使用同一個 Render 網址，都會讀取同一份囚犯資料。

## 部署
1. 將整個資料夾放入 GitHub repository 根目錄。
2. Render Dashboard → New → Blueprint。
3. 連接該 GitHub repository。
4. Render 會讀取 `render.yaml`，建立 Web Service + PostgreSQL。
5. Deploy 完成後使用 `https://你的服務名.onrender.com`。

## 注意
Render Free Postgres 目前建立後 30 日會到期。如活動需要長期保存資料，請升級資料庫或改用長期 PostgreSQL。
