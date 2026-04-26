# 五子棋連線小遊戲（房間號碼）

## 功能

- 建立房間：產生 6 位數房間號碼
- 搜尋房間：查看是否存在、目前幾位玩家
- 加入房間：同一房間最多 2 人，滿 2 人自動開始新對局
- 落子同步：伺服器驗證回合與落子合法性

## 開始使用

```bash
npm.cmd install
npm.cmd start
```

瀏覽器開啟 `http://localhost:3000`。

## 部署到網路上

### 推薦：Render / Fly.io / Railway（可直接跑 socket.io）

這個專案是 Node 伺服器 + Socket.IO（WebSocket 長連線）。最簡單是用能跑常駐 Node 的平台部署。

- 已包含 `Dockerfile`（適合 Fly.io / Railway 等）
- 已包含 `render.yaml`（Render Blueprint 可直接吃）

#### Render（Blueprint）快速步驟

1. 把這個資料夾推到 GitHub（記得不要提交 `node_modules`，已提供 `.gitignore`）
2. Render 後台選 New > Blueprint
3. 選你的 repo，Render 會讀取 `render.yaml` 建立 Web Service
4. 等待 Build/Deploy 完成後，用 Render 給你的網址開啟即可

### 關於 Vercel

Vercel 的 Serverless Functions 不適合長連線 WebSocket，因此 Socket.IO 伺服器通常無法在 Vercel 上穩定運作。
如果你一定要用 Vercel：

- 前端（`public/`）可以放 Vercel
- 後端（`server.js`）建議放 Render/Fly/Railway
- 然後我可以幫你把前端改成連到後端的公開網址（並加上 CORS 設定）

## 玩法

1. A 玩家按「建立房間」，把房間號碼傳給 B 玩家
2. B 玩家輸入房間號碼按「加入」
3. 黑棋先手，先連成五子者獲勝
