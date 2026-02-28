# Mobile01 Thread AI Summary (Edge Extension)

這個擴充功能可在 `www.mobile01.com` 討論串頁面，抓取整串多頁貼文，並使用 OpenAI 產生摘要。

## 功能
- 輸入並儲存 OpenAI API Key
- 內建 OpenAI model 下拉清單（也可自訂 model ID）
- 內建可編輯 Prompt 區塊（可自訂摘要規則）
- 針對目前 Mobile01 討論串抓取多頁內容（上限 50 頁）
- 呼叫 OpenAI 產生繁體中文總結

## 安裝（Edge）
1. 打開 Edge，進入 `edge://extensions`
2. 開啟右上角「開發人員模式」
3. 點選「載入解壓縮」
4. 選擇本資料夾：
   - `/Users/liming/DATA/github/01Con`

## 使用
1. 打開任一 Mobile01 討論串頁面（網址需為 `https://www.mobile01.com/...`）
2. 點擊工具列的擴充功能圖示
3. 輸入 OpenAI API Key（`sk-...`），從下拉清單選模型（預設 `gpt-4.1-mini`，或選自訂）
4. 依需要調整 Prompt（可用變數：`{{title}}`、`{{scannedPages}}`、`{{totalPages}}`、`{{postCount}}`、`{{posts}}`）
5. 點擊「總結本討論串」
6. 等待抓取 + AI 回覆完成

## 注意事項
- API Key 會儲存在瀏覽器本機 `chrome.storage.local`
- 若 Mobile01 頁面結構改版，可能需要調整 `popup.js` 的文章 selector
- 長討論串會做截斷，避免 token 過大
