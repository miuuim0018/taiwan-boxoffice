# 爛片現形鏡 — 電影真實評價分析與雷區預警

**課程**：網路資料擷取與分析（自選題）  
**痛點**：預告片好看，進戲院卻踩雷 → 用 PTT 鄉民真實評價幫你避雷

## 專題做什麼

1. **擷取**：PTT 電影版（台灣在地輿情）+ TMDB 國際電影資料庫（公信力較高）
2. **分析**：Jieba 斷詞、詞頻統計、推/噓情緒分析
3. **視覺化**：WordCloud 文字雲（整體／好評／負評）
4. **AI**：Gemini 產生 50 字內「一句話避雷／推薦」總結

## 資料來源

| 來源 | 特色 | 說明 |
|------|------|------|
| **PTT 電影版** | 台灣在地、即時輿情 | Requests + BeautifulSoup 爬蟲 |
| **TMDB** | 國際電影資料庫、較有公信力 | 官方 API，需免費申請金鑰 |

- PTT：[Movie 版](https://www.ptt.cc/bbs/Movie/index.html)
- TMDB：https://www.themoviedb.org/settings/api（Settings → API → 申請 API Key）

## 使用方式

```bash
pip install -r requirements.txt
python main.py
```

瀏覽器開啟 **`output/index.html`**，下拉選單切換電影即可看圖表與 AI 總結。

### Bar Chart Race（台灣票房排行榜動畫）

```bash
python -m scripts.build_bar_race_data
```

開啟 **`bar_chart_race/index.html`** — 橫向排行榜動畫，可播放／暫停／調速度。若 `.env` 已設定 `TMDB_API_KEY`，會自動從 TMDB 抓取海報顯示在排行榜上（快取於 `data/bar_race_posters.json`）。

### API 金鑰（選用，建議設定 TMDB）

複製 `.env.example` 為 `.env`：

```env
TMDB_API_KEY=你的金鑰    # 建議！公信力資料來源
GEMINI_API_KEY=你的金鑰  # AI 摘要用，未設定則用規則式摘要
```

未設定 TMDB 時僅使用 PTT 資料，專題仍可執行。

## 專案結構

```
爛片現形鏡/
├── main.py
├── scripts/
│   ├── scrape_ptt.py      # PTT 爬蟲
│   ├── analyze.py         # 斷詞、情緒、文字雲
│   ├── ai_summary.py      # Gemini 摘要
│   └── build_dashboard.py # 網頁儀表板
├── data/
│   ├── reviews/           # 原始留言 JSON
│   └── analysis/          # 分析結果
└── output/
    ├── index.html         # ★ 從這裡開啟
    └── wordclouds/        # 文字雲圖片
```

## 新增想分析的電影

編輯 `scripts/config.py` 的 `MOVIES` 列表，加入 `id`、`name`、`keywords` 後重新執行 `python main.py`。

## 簡報建議

1. 研究動機（踩雷痛點）
2. 擷取方式（Requests + BeautifulSoup）
3. 分析流程（Jieba → 詞頻 → 推噓比 → 文字雲）
4. AI 一句話總結示範
5. 現場 Demo：開啟 `index.html` 切換電影
6. 限制：樣本來自 PTT、不代表全體觀眾
